require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mqtt = require('mqtt');
const {
    initializeDatabase,
    ensureParkingSlots,
    getParkingSlots,
    getCustomers,
    createCustomer,
    updateSlotOccupancy,
    updateSlotFloor,
    updateSlotLabel
} = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*'
    },
    transports: ['websocket'],
    maxHttpBufferSize: 1e8
});

const mqttClient = mqtt.connect(process.env.MQTT_URL || 'mqtt://192.168.8.153:1883');

let parkingSlots = [];
let liftState = {
    currentFloor: 0,
    status: 'IDLE',
    lastOccupiedSlot: null
};
let targetFloor = 0;
let targetSlot = null;
let isHumanCurrentlyPresent = false;
let activeSequenceData = null;
let systemMode = 'AUTO';

const defaultSlots = [
    { id: 'A1', floor: 1, occupied: false, label: 'Slot A1' },
    { id: 'A2', floor: 1, occupied: false, label: 'Slot A2' },
    { id: 'A3', floor: 1, occupied: false, label: 'Slot A3' },
    { id: 'A4', floor: 1, occupied: false, label: 'Slot A4' },
    { id: 'B1', floor: 2, occupied: false, label: 'Slot B1' },
    { id: 'B2', floor: 2, occupied: false, label: 'Slot B2' },
    { id: 'B3', floor: 2, occupied: false, label: 'Slot B3' },
    { id: 'B4', floor: 2, occupied: false, label: 'Slot B4' }
];

function snapshotSlots() {
    return parkingSlots.map((slot) => ({
        id: slot.id,
        floor: slot.floor,
        occupied: slot.occupied,
        label: slot.label || slot.id
    }));
}

async function hydrateSlots() {
    await ensureParkingSlots(defaultSlots);
    parkingSlots = await getParkingSlots();
}

app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'backend', database: 'postgres' });
});

app.get('/api/slots', (_req, res) => {
    res.json({ slots: snapshotSlots() });
});

app.patch('/api/slots/:slotId', async (req, res) => {
    const { slotId } = req.params;
    const { occupied, floor, label } = req.body || {};
    const slot = parkingSlots.find((entry) => entry.id === slotId);

    if (!slot) {
        return res.status(404).json({ error: 'Slot not found' });
    }

    const nextOccupied = typeof occupied === 'boolean' ? occupied : slot.occupied;
    const parsedFloor = Number(floor);
    const nextFloor = Number.isInteger(parsedFloor) ? parsedFloor : slot.floor;
    const nextLabel = typeof label === 'string' && label.trim() ? label.trim() : (slot.label || slot.id);

    await updateSlotOccupancy(slotId, nextOccupied);
    await updateSlotFloor(slotId, nextFloor);
    await updateSlotLabel(slotId, nextLabel);

    parkingSlots = await getParkingSlots();
    res.json({ slot: parkingSlots.find((entry) => entry.id === slotId) });
});

app.get('/api/customers', async (_req, res) => {
    const customers = await getCustomers();
    res.json({ customers });
});

app.post('/api/customers', async (req, res) => {
    const { full_name } = req.body || {};

    if (!full_name || typeof full_name !== 'string' || !full_name.trim()) {
        return res.status(400).json({ error: 'full_name is required' });
    }

    const customer = await createCustomer(req.body);
    res.status(201).json({ customer });
});

setTimeout(() => {
    liftState.status = 'IDLE_READY';
}, 2000);

mqttClient.on('connect', () => {
    console.log('🔌 Backend Connected to MQTT Broker');
    mqttClient.subscribe('hardware/sensors');
});

mqttClient.on('message', (topic, message) => {
    if (topic !== 'hardware/sensors') {
        return;
    }

    try {
        const hwData = JSON.parse(message.toString());
        console.log('Received from Nano:', hwData);

        liftState.currentFloor = hwData.actual_floor;
        liftState.raw_y = hwData.raw_y;

        if (liftState.status !== 'HALTED_HUMAN') {
            if (hwData.motor_status === 'moving') {
                liftState.status = 'MOVING';
            } else if (hwData.motor_status === 'idle') {
                if (liftState.currentFloor === 0) {
                    liftState.status = 'PARKING_IDLE';
                } else {
                    liftState.status = 'READY';
                }

                if (activeSequenceData && activeSequenceData.step === 'MOVING_TO_SLOT') {
                    console.log(`🤖 Arrived at slot ${activeSequenceData.slotId}. Processing servo/action...`);
                    activeSequenceData.step = 'PROCESSING_AT_SLOT';

                    setTimeout(() => {
                        const slot = parkingSlots.find((entry) => entry.id === activeSequenceData.slotId);
                        if (slot) {
                            slot.occupied = activeSequenceData.action === 'park';
                            updateSlotOccupancy(slot.id, slot.occupied).catch((error) => {
                                console.error(`Failed to persist slot ${slot.id}:`, error);
                            });
                            console.log(`Slot ${slot.id} is now ${slot.occupied ? 'FULL' : 'EMPTY'}`);
                        }

                        activeSequenceData.step = 'RETURNING_HOME';
                        mqttClient.publish('hardware/commands', JSON.stringify({ action: 'home' }));
                        console.log('🤖 Sending robot back to HOME position...');
                    }, 2000);
                } else if (activeSequenceData && activeSequenceData.step === 'RETURNING_HOME' && liftState.currentFloor === 0) {
                    console.log('✅ Sequence fully completed. Robot is home.');
                    activeSequenceData = null;
                }
            } else if (hwData.motor_status === 'halted') {
                liftState.status = 'HALTED_HUMAN';
            }
        }
    } catch (error) {
        console.error('MQTT Parse Error:', message.toString());
    }
});

setInterval(() => {
    (async () => {
        let recent = null;
        try {
            const customers = await getCustomers();
            if (customers && customers.length) {
                const c = customers[0];
                recent = {
                    uid: c.vehicle_number || c.phone || c.full_name,
                    status: 'authorized',
                    customer: {
                        id: c.id,
                        full_name: c.full_name,
                        vehicle_number: c.vehicle_number || null,
                        phone: c.phone || null
                    }
                };
            }
        } catch (err) {
            console.error('Failed to fetch recent customer for dashboard:', err);
        }

        io.emit('dashboard_update', {
            lift: {
                currentFloor: liftState.currentFloor,
                raw_y: liftState.raw_y || 0,
                status: liftState.status
            },
            slots: snapshotSlots(),
            recentRFID: recent
        });
    })();
}, 100);

io.on('connection', (socket) => {
    console.log(`💻 Dashboard Connected: ${socket.id}`);

    socket.emit('mode_update', systemMode);

    socket.on('toggle_mode', (newMode) => {
        systemMode = newMode;
        console.log(`🔄 System Mode changed to: ${systemMode}`);
        io.emit('mode_update', systemMode);
    });

    socket.on('manual_command', (cmd) => {
        if (systemMode === 'MANUAL') {
            const slot = parkingSlots.find((entry) => entry.id === cmd.slotId);
            if (slot) {
                targetSlot = slot;
                targetFloor = slot.floor;
                targetSlot.action = slot.occupied ? 'retrieve' : 'park';
                liftState.status = 'READY';

                activeSequenceData = {
                    slotId: slot.id,
                    action: targetSlot.action,
                    step: 'MOVING_TO_SLOT'
                };

                const commandPayload = {
                    action: targetSlot.action,
                    target_floor: slot.floor,
                    slot_id: slot.id
                };

                mqttClient.publish('hardware/commands', JSON.stringify(commandPayload), { qos: 1, retain: false });
                console.log(`🕹️ Web Dispatch sent for ${slot.id} over MQTT`);
            }
        } else {
            console.log('❌ Blocked: Switch to MANUAL mode to dispatch from web.');
        }
    });

    socket.on('yolo_feed', (yoloData) => {
        isHumanCurrentlyPresent = yoloData.detections && yoloData.detections.some((d) => d.className === 'person');

        if (isHumanCurrentlyPresent) {
            // Only issue an emergency halt if the lift is currently moving
            const isMoving = liftState.status === 'MOVING' || (activeSequenceData && activeSequenceData.step === 'MOVING_TO_SLOT');
            if (isMoving) {
                if (liftState.status !== 'HALTED_HUMAN') {
                    liftState.status = 'HALTED_HUMAN';
                    console.log('🚨 EMERGENCY HALT! Human detected while moving. Stopping motors.');
                    mqttClient.publish('hardware/commands', JSON.stringify({ action: 'EMERGENCY_STOP' }));
                }
            } else {
                // If lift is not moving, log detection but do not trigger a halt
                console.log('Human detected, but lift is not moving — no emergency stop issued.');
            }
        }

        socket.broadcast.emit('yolo_update', yoloData);
    });

    socket.on('clear_human_halt', () => {
        if (liftState.status === 'HALTED_HUMAN') {
            if (!isHumanCurrentlyPresent) {
                liftState.status = 'READY';
                console.log('✅ Human clear confirmed! Awaiting next command.');
            } else {
                console.log('❌ Cannot clear halt! Human is still visible on camera.');
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Device Disconnected');
    });
});

async function bootstrap() {
    await initializeDatabase();
    await hydrateSlots();

    const PORT = 3001;
    server.listen(PORT, () => {
        console.log(`🚀 CAPS Backend Running on Port ${PORT}`);
        console.log(`🗄️ PostgreSQL ready with ${parkingSlots.length} parking slots`);
    });
}

bootstrap().catch((error) => {
    console.error('Failed to initialize PostgreSQL:', error);
    process.exit(1);
});
