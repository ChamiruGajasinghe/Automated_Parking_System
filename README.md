# Automated Parking System 🚗🤖

Welcome to the **Automated Parking System** project! This repository contains the complete ecosystem for a smart parking solution, integrating embedded hardware, real-time web dashboards, and artificial intelligence for vehicle detection.

## 📋 Overview

This project aims to automate and streamline parking management using a combination of sensor nodes for slot detection, a central communication node, an AI-powered camera feed for vehicle verification, and a live web dashboard to monitor the entire parking lot.

## 🏗️ System Architecture

The ecosystem is divided into four main components:
1. **Embedded Sensor Nodes (`Arduino_Nano`)**: Low-level microcontrollers that interface directly with physical sensors (e.g., ultrasonic or IR sensors) placed in parking slots to detect occupancy.
2. **Communication Node (`automated_parking_com_node`)**: The central gateway (ESP32/ESP8266 or similar) that securely aggregates data from the sensor nodes and transmits it to the backend server in real time.
3. **Web Dashboard (`Sensor_Project_Dashboard`)**: 
   - **Frontend (React + Vite + Tailwind CSS)**: A fast, modern user interface displaying live parking slots, stats, and real-time statuses.
   - **Backend (Node.js + Express)**: A RESTful API and WebSocket server that handles incoming sensor data, processes AI outputs, and feeds information to the frontend interface.
4. **AI Module (`ai_module`)**: A Python-based computer vision script using **YOLOv8** to monitor security cameras, detect vehicles entering or leaving the premises, and cross-validate sensor data.

## 📁 Repository Structure

```text
Automated_Parking_System/
├── Arduino_Nano/                  # C++ code for Individual Parking Slot Sensor Nodes
├── automated_parking_com_node/    # C++ code for the Central Gateway/Communication Hub
├── Sensor_Project_Dashboard/      # Full-stack Application
│   ├── ai_module/                 # Python YOLOv8 stream for vehicle detection
│   ├── backend/                   # Node.js Data Processing API
│   └── frontend/                  # React & Vite based UI Dashboard
├── HOW_TO_RUN.md                  # Comprehensive setup and launch guide
└── README.md                      # This file
```

## 🚀 Getting Started

If you are setting this project up on a new computer, please refer to the detailed **[HOW_TO_RUN.md](HOW_TO_RUN.md)** guide. It covers:
- Prerequisites (Node.js, Git, Python, VS Code PlatformIO)
- Instructions for launching the Backend
- Instructions for launching the Frontend GUI
- Instructions for initializing and starting the YOLO AI script
- Steps to flash the C++ firmware onto the physical microcontrollers

## 🛠️ Tech Stack

- **Hardware**: C++, PlatformIO, Arduino framework
- **Frontend**: HTML5, CSS3, JavaScript, React.js, Vite, Tailwind CSS
- **Backend**: JavaScript, Node.js
- **AI/Vision**: Python 3, OpenCV, Ultralytics YOLOv8

## 📝 Documentation

- **[How to Run the System](HOW_TO_RUN.md)**: Master deployment guide.
- Check the respective `README.md` files inside the `frontend` and dashboard subfolders for specific configurations.

---
*Developed for the Semester 4 Sensor Project.*