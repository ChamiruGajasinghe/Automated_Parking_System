@echo off
title Smart Parking System Launcher
color 0A
echo ===================================================
echo     STARTING AUTOMATED PARKING SYSTEM...
echo ===================================================
echo.

:: Define the main project directory based on your paths
set BASE_DIR="C:\Users\chami\OneDrive\Desktop\SEM 4\Sensor Project\Automated_Parking_System\Sensor_Project_Dashboard"

echo [1/4] Launching Mosquitto MQTT Broker...
start "MQTT Broker" cmd /k cd /d %BASE_DIR%\backend ^&^& "C:\Program Files\mosquitto\mosquitto.exe" -c mqtt.conf -v

:: Add a tiny 2-second delay so the broker has time to start before the backend tries to connect
timeout /t 2 /nobreak >nul

echo [2/4] Launching Node.js Backend...
start "Node Backend" cmd /k cd /d %BASE_DIR%\backend ^&^& node index.js

echo [3/4] Launching React Frontend...
start "React Frontend" cmd /k cd /d %BASE_DIR%\frontend ^&^& npm run dev

echo [4/4] Launching YOLO AI Module...
start "YOLO AI" cmd /k cd /d %BASE_DIR%\ai_module ^&^& python yolo_stream.py

echo.
echo ===================================================
echo     ALL SYSTEMS DEPLOYED SUCCESSFULLY!
echo ===================================================
echo You can close this main window. The 4 system windows will remain open.
pause