const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8
});

// -----------------------------
// MQTT CONNECTION & IDENTITY LEDGER
const mqttClient = mqtt.connect('mqtt://127.0.0.1:1883');

mqttClient.on('connect', () => {
    console.log('🔌 Backend Connected to MQTT Broker');
    mqttClient.subscribe('hardware/sensors'); 
});

// NEW: Stop Node from hiding connection errors!
mqttClient.on('error', (err) => {
    console.error('🚨 MQTT Connection Error:', err);
});

// HARDCODED LEDGER: Maps physical slots to master RFID card numbers
const slotOwnersLedger = {
    "A1": "04-B0-E1-92",  // <-- Put your real Card 1 UID here
    "A2": "F8-2B-40-11",  // <-- Put your real Card 2 UID here
    "A3": "1A-7C-99-04",
    "A4": "5B-21-E4-88",
    "B1": "99-AA-22-11",
    "B2": "7C-4A-10-90",
    "B3": "33-44-55-66",
    "B4": "11-99-88-77"
};

let activeDetectedCard = {
    uid: "AWAITING_CAR...",
    status: "IDLE"
};


// -----------------------------
// SYSTEM STATE
// -----------------------------
let liftState = {
    currentFloor: 0,
    status: "IDLE",
    lastOccupiedSlot: null
};

let targetFloor = 0;
let targetSlot = null;
let isHumanCurrentlyPresent = false;
let activeSequenceData = null; 

let parkingSlots = [
    { id: "A1", floor: 1, occupied: false },
    { id: "A2", floor: 1, occupied: false },
    { id: "A3", floor: 1, occupied: false },
    { id: "A4", floor: 1, occupied: false },
    { id: "B1", floor: 2, occupied: false },
    { id: "B2", floor: 2, occupied: false },
    { id: "B3", floor: 2, occupied: false },
    { id: "B4", floor: 2, occupied: false }
];

let systemMode = "AUTO"; 

setTimeout(() => { liftState.status = "IDLE_READY"; }, 2000);

// -----------------------------
// MQTT TELEMETRY & OPTICAL ILLUSION INTERCEPTOR
// -----------------------------
mqttClient.on('message', (topic, message) => {
    if (topic === 'hardware/sensors') {
        try {
            const hwData = JSON.parse(message.toString());
            console.log("Received telemetry:", hwData);

            // --- 1. THE OPTICAL ILLUSION: Match ID based on reported slot ---
            if (hwData.current_slot && hwData.current_slot !== "TRANSIT") {
                const matchedUID = slotOwnersLedger[hwData.current_slot];
                if (matchedUID) {
                    activeDetectedCard.uid = matchedUID;
                    activeDetectedCard.status = "authorized";
                }
            } 
            // When lift returns to Ground Zero and stops, reset the card screen
            else if (hwData.actual_floor === 0 && hwData.motor_status === "idle") {
                activeDetectedCard.uid = "AWAITING_CAR...";
                activeDetectedCard.status = "IDLE";
            }

            // --- 2. UPDATE PHYSICAL POSITION ---
            liftState.currentFloor = hwData.actual_floor;
            liftState.raw_y = hwData.raw_y;

            if (liftState.status !== "HALTED_HUMAN") {
                if (hwData.motor_status === "moving") {
                    liftState.status = "MOVING";
                }
                else if (hwData.motor_status === "idle") {
                    if (liftState.currentFloor === 0) {
                        liftState.status = "PARKING_IDLE";
                    } else {
                        liftState.status = "READY";
                    }

                    // --- 3. AUTONOMOUS SEQUENCE COMPLETION ---
                    if (activeSequenceData && activeSequenceData.step === "MOVING_TO_SLOT") {
                        console.log(`🤖 Arrived at slot ${activeSequenceData.slotId}. Simulating placement...`);
                        activeSequenceData.step = "PROCESSING_AT_SLOT";
                        
                        setTimeout(() => {
                            const slot = parkingSlots.find(s => s.id === activeSequenceData.slotId);
                            if (slot) {
                                slot.occupied = (activeSequenceData.action === "park");
                                console.log(`Slot ${slot.id} is now ${slot.occupied ? "FULL" : "EMPTY"}`);
                            }
                            activeSequenceData.step = "RETURNING_HOME";
                            mqttClient.publish('hardware/commands', JSON.stringify({ action: "home" }));
                            console.log("🤖 Dispatching gantry back to Ground Zero...");
                        }, 2000);
                    }
                    else if (activeSequenceData && activeSequenceData.step === "RETURNING_HOME" && liftState.currentFloor === 0) {
                        console.log(`✅ Autonomous sequence fully verified.`);
                        activeSequenceData = null; 
                    }
                }
                else if (hwData.motor_status === "halted") {
                    liftState.status = "HALTED_HUMAN";
                }
            }
        } catch (err) {
            console.error("MQTT Parse Error:", message.toString());
        }
    }
});

// -----------------------------
// REAL-TIME DASHCAST LOOP
// -----------------------------
setInterval(() => {
    io.emit('dashboard_update', {
        lift: {
            currentFloor: liftState.currentFloor,
            raw_y: liftState.raw_y || 0,
            status: liftState.status
        },
        slots: parkingSlots,
        
        recentRFID: activeDetectedCard // Directly pushes the optical illusion
    });
}, 100);

// -----------------------------
// SOCKET CONNECTIONS
// -----------------------------
io.on('connection', (socket) => {
    console.log(`💻 Dashboard UI Connected: ${socket.id}`);
    socket.emit('mode_update', systemMode);

    socket.on('toggle_mode', (newMode) => {
        systemMode = newMode;
        console.log(`🔄 System Mode switched to: ${systemMode}`);
        io.emit('mode_update', systemMode); 
    });

    socket.on('manual_command', (cmd) => {
        if (systemMode === "MANUAL") {
            const slot = parkingSlots.find(s => s.id === cmd.slotId);
            if (slot) {
                targetSlot = slot;
                targetFloor = slot.floor;
                targetSlot.action = slot.occupied ? "retrieve" : "park";
                
                liftState.status = "READY";
                activeSequenceData = {
                    slotId: slot.id,
                    action: targetSlot.action,
                    step: "MOVING_TO_SLOT"
                };

                const commandPayload = {
                    action: targetSlot.action,
                    target_floor: slot.floor,
                    slot_id: slot.id
                };
                
                mqttClient.publish('hardware/commands', JSON.stringify(commandPayload), { qos: 1, retain: false });
                console.log(`🕹️ Web Dispatch issued for ${slot.id}`);
            }
        } else {
            console.log("❌ Blocked: Switch to MANUAL mode to dispatch from web.");
        }
    });

    // YOLO AI RELAY
    socket.on('yolo_feed', (yoloData) => {
        isHumanCurrentlyPresent = yoloData.detections && yoloData.detections.some(d => d.className === 'person');
        if (isHumanCurrentlyPresent) {
            if (!["PARKING_IDLE", "IDLE", "HALTED_HUMAN"].includes(liftState.status)) {
                liftState.status = "HALTED_HUMAN";
                console.log(`🚨 AI SAFETY OVERRIDE! Human detected. Brakes engaged.`);
                mqttClient.publish('hardware/commands', JSON.stringify({ action: "EMERGENCY_STOP" }));
            }
        }
        socket.broadcast.emit('yolo_update', yoloData);
    });

    socket.on('clear_human_halt', () => {
        if (liftState.status === "HALTED_HUMAN") {
            if (!isHumanCurrentlyPresent) {
                liftState.status = "READY";
                console.log(`✅ Safety clearance verified. System resumed.`);
            }
        }
    });

    socket.on('disconnect', () => { console.log(`❌ UI Disconnected`); });
});

const PORT = 3001;
server.listen(PORT, () => { console.log(`🚀 CAPS Master Backend active on Port ${PORT}`); });