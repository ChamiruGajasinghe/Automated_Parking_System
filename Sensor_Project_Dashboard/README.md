# Sensor Project Dashboard

## Project Overview
The Sensor Project Dashboard is a comprehensive application combining an AI-powered computer vision module, a fast Node.js backend, a modern React dashboard, and embedded hardware for an automated parking system. The hardware consists of an ESP32 gateway node for MQTT communication and an Arduino Nano for precision stepper motor and sensor control. 

## Conclusion of Completed Work
Here is the summary of what has been accomplished so far:

1. **AI Module (`/ai_module`)**: 
   - Set up the Python environment for AI processing.
   - Integrated YOLOv8 (`yolov8n.pt`).
   - Implemented real-time object detection stream via `yolo_stream.py`.

2. **Backend (`/backend`)**:
   - Initialized a Node.js project.
   - Created the core server entry point (`index.js`) to handle network requests, act as an API gateway, and communicate with the frontend/AI services.

3. **Frontend (`/frontend`)**:
   - Bootstrapped a React application using Vite for lightning-fast HMR.
   - Styled the dashboard layout using Tailwind CSS.
   - Established the core UI components in `App.jsx`.

4. **Hardware Nodes (`automated_parking_com_node` & `Arduino_Nano`)**:
   - Programmed the Arduino Nano to orchestrate `AccelStepper` movements, lift servos, and color/capacitive touch sensors.
   - Configured the ESP32 (`automated_parking`) as an overarching MQTT gateway that intercepts backend commands (`park`, `retrieve`, `home`, `EMERGENCY_STOP`), calculates DB layout mapping, and commands the Nano.

---

## First Time Setup & How to Run

To run this project on a new device, follow these steps. You will need to open **three separate terminal windows**—one for each part of the stack.

### Prerequisites
- **Node.js** (v18 or higher recommended)
- **Python** (v3.8 or higher)
- **Git** (optional, for version control)

### 1. Start the AI Module
Open your first terminal window:
```bash
# Navigate to the ai_module directory
cd ai_module

# Install the required Python packages
pip install ultralytics opencv-python

# Run the stream output script
python yolo_stream.py
```

### 2. Start the Backend Server
Open your second terminal window:
```bash
# Navigate to the backend directory
cd backend

# Install Node.js dependencies
npm install

# Start the backend server
node index.js
```
*(Check the terminal output to see which port the backend is running on, usually port 3000, 5000, or 8000).*

### 3. Start the Frontend Dashboard
Open your third terminal window:
```bash
# Navigate to the frontend directory
cd frontend

# Install frontend dependencies
npm install

# Start the Vite development server
npm run dev
```
*(Once running, your terminal will provide a local link, typically `http://localhost:5173`. Open this URL in your browser to view the dashboard).*
