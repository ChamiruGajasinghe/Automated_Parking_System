const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/automated_parking'
});

async function initializeDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS parking_slots (
            id TEXT PRIMARY KEY,
            floor INTEGER NOT NULL,
            occupied BOOLEAN NOT NULL DEFAULT FALSE,
            label TEXT NOT NULL DEFAULT ''
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS customers (
            id BIGSERIAL PRIMARY KEY,
            full_name TEXT NOT NULL,
            phone TEXT,
            vehicle_number TEXT,
            email TEXT,
            slot_id TEXT REFERENCES parking_slots(id) ON UPDATE CASCADE ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS parking_events (
            id BIGSERIAL PRIMARY KEY,
            slot_id TEXT REFERENCES parking_slots(id) ON UPDATE CASCADE ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
    `);
}

async function ensureParkingSlots(defaultSlots) {
    for (const slot of defaultSlots) {
        await pool.query(
            `
            INSERT INTO parking_slots (id, floor, occupied, label)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (id) DO NOTHING
            `,
            [slot.id, slot.floor, slot.occupied, slot.label || slot.id]
        );
    }
}

async function getParkingSlots() {
    const result = await pool.query(`
        SELECT id, floor, occupied, COALESCE(label, id) AS label
        FROM parking_slots
        ORDER BY floor ASC, id ASC
    `);

    return result.rows.map((row) => ({
        id: row.id,
        floor: Number(row.floor),
        occupied: row.occupied,
        label: row.label
    }));
}

async function updateSlotOccupancy(slotId, occupied) {
    await pool.query('UPDATE parking_slots SET occupied = $2 WHERE id = $1', [slotId, occupied]);
}

async function updateSlotFloor(slotId, floor) {
    await pool.query('UPDATE parking_slots SET floor = $2 WHERE id = $1', [slotId, floor]);
}

async function updateSlotLabel(slotId, label) {
    await pool.query('UPDATE parking_slots SET label = $2 WHERE id = $1', [slotId, label]);
}

async function getCustomers() {
    const result = await pool.query(`
        SELECT id, full_name, phone, vehicle_number, email, slot_id, created_at
        FROM customers
        ORDER BY created_at DESC, id DESC
    `);

    return result.rows;
}

async function createCustomer(customer) {
    const result = await pool.query(
        `
        INSERT INTO customers (full_name, phone, vehicle_number, email, slot_id)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, full_name, phone, vehicle_number, email, slot_id, created_at
        `,
        [
            customer.full_name.trim(),
            customer.phone || null,
            customer.vehicle_number || null,
            customer.email || null,
            customer.slot_id || null
        ]
    );

    return result.rows[0];
}

module.exports = {
    pool,
    initializeDatabase,
    ensureParkingSlots,
    getParkingSlots,
    updateSlotOccupancy,
    updateSlotFloor,
    updateSlotLabel,
    getCustomers,
    createCustomer
};