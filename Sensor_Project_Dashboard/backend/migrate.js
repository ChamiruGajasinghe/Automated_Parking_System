require('dotenv').config();
const { initializeDatabase, ensureParkingSlots } = require('./db');

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

async function run() {
  try {
    await initializeDatabase();
    await ensureParkingSlots(defaultSlots);
    console.log('Migration/seed completed. Parking slots ensured.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

run();
