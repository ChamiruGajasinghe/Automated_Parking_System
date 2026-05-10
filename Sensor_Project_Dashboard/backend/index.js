const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt'); // NEW: Require MQTT

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*"
    },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8
});

// -----------------------------
// MQTT CONNECTION (THE BRIDGE TO HARDWARE)
// -----------------------------
// Use the EXACT SAME IP as the ESP32 to ensure they talk to the exact same broker interface!
const mqttClient = mqtt.connect('mqtt://192.168.8.153:1883');

mqttClient.on('connect', () => {
    console.log('🔌 Backend Connected to MQTT Broker');
    mqttClient.subscribe('hardware/sensors'); // Listen to ESP32
});

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

// Sequence Tracker for Manual Commands
let activeSequenceData = null; // Stores { slotId, action, step }

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

let systemMode = "AUTO"; // Default mode

setTimeout(() => {
    liftState.status = "IDLE_READY"; 
}, 2000);

// -----------------------------
// LISTEN TO REAL HARDWARE TELEMETRY
// -----------------------------
mqttClient.on('message', (topic, message) => {
    if (topic === 'hardware/sensors') {
        try {
            const hwData = JSON.parse(message.toString());
            
            // ADD THIS LINE TO SEE THE DATA:
            console.log("Received from Nano:", hwData);

            // 1. Update physical floor and exact raw position from Nano
            liftState.currentFloor = hwData.actual_floor;
            liftState.raw_y = hwData.raw_y;

            // 2. Map Nano's motor status to your UI's status, unless a human halted it
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

                    // --- SEQUENCE LOGIC: We arrived somewhere and are IDLE ! ---
                    if (activeSequenceData && activeSequenceData.step === "MOVING_TO_SLOT") {
                        console.log(`🤖 Arrived at slot ${activeSequenceData.slotId}. Processing servo/action...`);
                        activeSequenceData.step = "PROCESSING_AT_SLOT";
                        
                        // Fake wait for 2 seconds (simulating grabbing/dropping the car)
                        setTimeout(() => {
                            // 1. Update the slot occupancy!
                            const slot = parkingSlots.find(s => s.id === activeSequenceData.slotId);
                            if (slot) {
                                slot.occupied = (activeSequenceData.action === "park");
                                console.log(`Slot ${slot.id} is now ${slot.occupied ? "FULL" : "EMPTY"}`);
                            }

                            // 2. Tell the robot to go back home!
                            activeSequenceData.step = "RETURNING_HOME";
                            mqttClient.publish('hardware/commands', JSON.stringify({ action: "home" }));
                            console.log("🤖 Sending robot back to HOME position...");
                        }, 2000);
                    }
                    else if (activeSequenceData && activeSequenceData.step === "RETURNING_HOME" && liftState.currentFloor === 0) {
                        console.log(`✅ Sequence fully completed. Robot is home.`);
                        activeSequenceData = null; // Clear the sequence!
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
// MAIN BROADCAST LOOP (Hardware-Only)
// -----------------------------
setInterval(() => {
    io.emit('dashboard_update', {
        lift: {
            currentFloor: liftState.currentFloor,
            raw_y: liftState.raw_y || 0,
            status: liftState.status
        },
        slots: parkingSlots,
        recentRFID: {
            uid: `88-AF-${Math.floor(Math.random() * 90 + 10)}-01`,
            status: liftState.currentFloor === 0 ? "authorized" : "secured"
        }
    });
}, 100);

// -----------------------------
// SOCKET CONNECTIONS
// -----------------------------
io.on('connection', (socket) => {
    console.log(`💻 Dashboard Connected: ${socket.id}`);

    // Send current mode to newly connected dashboard
    socket.emit('mode_update', systemMode);

    // Toggle Mode Listener
    socket.on('toggle_mode', (newMode) => {
        systemMode = newMode;
        console.log(`🔄 System Mode changed to: ${systemMode}`);
        io.emit('mode_update', systemMode); // Broadcast to all clients
    });

    socket.on('manual_command', (cmd) => {
        // ONLY allow dispatch if in MANUAL mode
        if (systemMode === "MANUAL") {
            const slot = parkingSlots.find(s => s.id === cmd.slotId);
            if (slot) {
                targetSlot = slot;
                targetFloor = slot.floor;
                targetSlot.action = slot.occupied ? "retrieve" : "park";
                
                // IMPORTANT: Let backend keep state to tell frontend we are READY
                liftState.status = "READY";

                // Initialize the Sequence Tracker for Auto-Homing
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
                
                // FORCE RETAIN & QoS to ensure ESP32 gets it even if loop() is busy
                mqttClient.publish('hardware/commands', JSON.stringify(commandPayload), { qos: 1, retain: false });
                console.log(`🕹️ Web Dispatch sent for ${slot.id} over MQTT`);
            }
        } else {
            console.log("❌ Blocked: Switch to MANUAL mode to dispatch from web.");
        }
    });

    // YOLO STREAM BRIDGE
    socket.on('yolo_feed', (yoloData) => {
        isHumanCurrentlyPresent = yoloData.detections && yoloData.detections.some(d => d.className === 'person');
        
        if (isHumanCurrentlyPresent) {
            if (liftState.status !== "PARKING_IDLE" && liftState.status !== "IDLE" && liftState.status !== "HALTED_HUMAN") {
                liftState.status = "HALTED_HUMAN";
                console.log(`🚨 EMERGENCY HALT! Human detected. Stopping motors.`);
                
                // NEW: Tell the Nano to hit the brakes!
                mqttClient.publish('hardware/commands', JSON.stringify({ action: "EMERGENCY_STOP" }));
            }
        }

        socket.broadcast.emit('yolo_update', yoloData);
    });

    // MANUAL CLEAR HUMAN COMMAND
    socket.on('clear_human_halt', () => {
        if (liftState.status === "HALTED_HUMAN") {
            if (!isHumanCurrentlyPresent) {
                liftState.status = "READY";
                console.log(`✅ Human clear confirmed! Awaiting next command.`);
            } else {
                console.log(`❌ Cannot clear halt! Human is still visible on camera.`);
            }
        }
    });

    socket.on('disconnect', () => {
        console.log(`❌ Device Disconnected`);
    });
});

// -----------------------------
// SERVER START
// -----------------------------
const PORT = 3001;

server.listen(PORT, () => {
    console.log(`🚀 CAPS Backend Running on Port ${PORT}`);
});