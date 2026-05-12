**Project Flow — User Side & Control Panel**

This document explains how the Automated Parking System works from two perspectives:
- **User Side** — the physical system, sensors, and vehicle journeys.
- **Control Panel (Admin) Side** — the backend, dashboard, and admin operations.

**High-level components**
- Hardware gateway (ESP32 / Arduino Nano): reads sensors, controls steppers/servos, publishes MQTT messages and subscribes to commands.
- MQTT broker: lightweight message transport between hardware and backend.
- Backend (Node.js): subscribes to hardware MQTT topics, persists canonical state in PostgreSQL, exposes REST APIs and Socket.IO for real-time UI updates.
- Database (PostgreSQL): stores `parking_slots`, `customers`, and `parking_events`.
- Frontend dashboard (Vite + React): shows live system state, provides manual commands and admin controls.
- AI module (YOLO): optional human detection feed that can pause/clear the lift movement.

===============================================================================
**USER SIDE (Physical + Edge Behavior)**
===============================================================================

1) Arrival & Authorization
- A vehicle approaches the gate and (optionally) a user is authorized via RFID/registration.
- The physical RFID reader or gate camera either triggers a local device event or sends an authorization message to the backend (via MQTT or REST depending on deployment).

2) Lift / Robot Movement
- Manual dispatch (from admin UI) or automated workflow causes the backend to publish a command to the MQTT topic `hardware/commands` with JSON payload: { action, target_floor, slot_id }.
- The ESP32 gateway subscribes to `hardware/commands`, maps `slot_id` to a coordinate (see `automated_parking_com_node/src/main.cpp` `database[]`) and sends a Serial command to the Nano that drives motors/servos.
- The Nano reports position updates back over Serial; the gateway converts them into MQTT messages on `hardware/sensors` (payload contains `actual_floor`, `raw_y`, `motor_status`, `current_slot`).

3) Feedback & Completion
- Backend receives `hardware/sensors` messages and updates `liftState` and slot occupancy in PostgreSQL when sequences finish.
- The backend emits periodic Socket.IO broadcasts `dashboard_update` so connected dashboards see near-real-time lift position and slot status.
- When the procedure completes, the backend writes a `parking_events` row (optional) and marks the slot `occupied=true` or `false` depending on action.

4) Safety: Human Detection
- The AI module sends YOLO detections to the backend (Socket.IO `yolo_feed`) which sets a `HALTED_HUMAN` status if a person is detected near the lift.
- When halted, the backend publishes an emergency stop over MQTT (`{ action: 'EMERGENCY_STOP' }`) and prevents dispatches until cleared.

===============================================================================
**CONTROL PANEL / ADMIN SIDE (Backend & Dashboard)**
===============================================================================

1) Real-time bridge
- The Node backend connects to MQTT (configurable via `MQTT_URL`) and subscribes to `hardware/sensors`.
- The backend runs a Socket.IO server on port 3001 and emits `dashboard_update` every 100ms containing:
  - `lift` (currentFloor, raw_y, status)
  - `slots` (array from Postgres)
  - `recentRFID` (latest customer / authorization entry if present)

2) Persistence & canonical state
- On startup the backend runs `initializeDatabase()` then `ensureParkingSlots(defaultSlots)` and hydrates `parkingSlots` from Postgres.
- Bookkeeping functions are implemented in `backend/db.js`:
  - `parking_slots(id, floor, occupied, label)`
  - `customers(...)`
  - `parking_events(...)`

3) Admin actions
- Manual dispatch: Dashboard emits Socket.IO `manual_command` with `{ slotId }` when an admin dispatches a slot. Backend checks `systemMode === 'MANUAL'` and translates to MQTT `hardware/commands`.
- Slot management: REST `GET /api/slots` and `PATCH /api/slots/:slotId` let admins read and update slot metadata and mark occupancy.
- Customer management: REST `GET /api/customers` and `POST /api/customers` to create and list customers.

4) How authorization is surfaced
- Dashboard shows `Latest Authorization` using the most recent `customers` row (vehicle number, phone, name). This can be replaced by live RFID events if hardware publishes a dedicated MQTT topic.

5) Safety and mode toggles
- `toggle_mode` Socket.IO message switches between `AUTO` and `MANUAL`.
- In `AUTO`, hardware/cloud external systems are expected to trigger operations; in `MANUAL` the web dashboard can dispatch specific slots.

===============================================================================
**Data & Message Map (summary)**
- MQTT topics:
  - `hardware/commands` — from backend -> gateway; payloads: { action:'park'|'retrieve'|'home'|'EMERGENCY_STOP', target_floor, slot_id }
  - `hardware/sensors` — from gateway -> backend; payloads: { actual_floor, raw_y, motor_status, current_slot }
- Socket.IO events (server <-> dashboard):
  - server -> client: `dashboard_update` (state snapshot), `yolo_update`, `mode_update`
  - client -> server: `manual_command`, `toggle_mode`, `yolo_feed`, `clear_human_halt`
- REST endpoints (backend):
  - GET `/api/slots`, PATCH `/api/slots/:slotId`
  - GET `/api/customers`, POST `/api/customers`

===============================================================================
**Run & Deploy notes (developer quick-start)**
- Backend environment variables (backend/.env):
  - `DATABASE_URL` — PostgreSQL connection string (e.g. `postgresql://postgres:pass@127.0.0.1:5432/automated_parking`)
  - `MQTT_URL` — MQTT broker URL
- Common commands (in `Sensor_Project_Dashboard/backend`):
  - `npm run migrate` — create schema + seed default slots
  - `npm start` — start backend (Socket.IO + MQTT bridge)
- Frontend (in `Sensor_Project_Dashboard/frontend`):
  - `npm install` then `npm run dev` to run the dashboard.

===============================================================================
**Extending / Customizing**
- Replace `recentRFID` emission: wire your RFID reader to publish to an MQTT topic (e.g. `hardware/rfid`) and update `index.js` to subscribe and broadcast the latest scan.
- Add audit trails: insert `parking_events` records whenever dispatches start/finish and when manual overrides or emergency stops occur.
- Add authentication to REST endpoints and Socket.IO for production deployments.

===============================================================================
**Contact & Reference**
- Key files to inspect for behavior and mapping:
  - backend entrypoint: `backend/index.js`
  - backend DB helpers: `backend/db.js`
  - frontend dashboard: `frontend/src/App.jsx`
  - ESP32 gateway mapping: `automated_parking_com_node/src/main.cpp`

Keep this doc updated as you change topics, add new MQTT messages, or expand the database schema.
