# How to Run the Automated Parking System

This guide explains how to set up and run the entire Automated Parking System on a new computer.

## Prerequisites
Before you begin, ensure you have the following installed on your new computer:
1. **Git** (to download the repository)
2. **Node.js** (required for the backend and frontend)
3. **Python 3** (required for the AI module)
4. **VS Code** with the **PlatformIO** extension (required for the hardware nodes)

---

## 1. Download the Code (Clone)
Open a terminal on your new computer and clone the repository:
```powershell
git clone https://github.com/ChamiruGajasinghe/Automated_Parking_System.git
cd Automated_Parking_System
```

---

## 2. Start the Backend (Node.js)
The backend acts as the central hub for data.
1. Open a terminal inside the downloaded project.
2. Navigate to the backend folder:
```powershell
cd Sensor_Project_Dashboard/backend
```
3. Install the required Node dependencies:
```powershell
npm install
```
4. Start the backend server:
```powershell
node index.js
```

---

## 3. Start the Frontend (React & Vite)
The frontend displays the dashboard UI.
1. Open a **new** terminal window.
2. Navigate to the frontend folder:
```powershell
cd Automated_Parking_System/Sensor_Project_Dashboard/frontend
```
3. Install the required React dependencies:
```powershell
npm install
```
4. Run the development server:
```powershell
npm run dev
```

---

## 4. Start the AI Module (Python)
The AI module runs the YOLOv8 model for camera detection. 
*(Note: The `yolov8n.pt` model file was ignored in Git to save space. When you run this script for the first time, the `ultralytics` package will automatically download the correct model file from the internet.)*

1. Open a **new** terminal window.
2. Navigate to the AI module folder:
```powershell
cd Automated_Parking_System/Sensor_Project_Dashboard/ai_module
```
3. Install the required Python libraries:
```powershell
pip install ultralytics opencv-python
```
4. Run the Python stream script:
```powershell
python yolo_stream.py
```

---

## 5. Flash the Hardware (Arduino & PlatformIO)
To upload the C++ code to your physical microcontrollers:
1. Open **VS Code**.
2. Go to `File > Open Folder` and select either the `automated_parking_com_node` or `Arduino_Nano` folder from inside the `Automated_Parking_System` directory.
3. Once opened, the **PlatformIO** extension will automatically detect the `platformio.ini` file and download the required C++ board libraries.
4. Plug your microcontroller into your computer via USB.
5. Click the **Upload** button (the right-pointing arrow `→`) on the bottom PlatformIO toolbar to compile and flash the code.
 

## 6. To run the mqtt Connection
PS C:\Users\chami\OneDrive\Desktop\SEM 4\Sensor Project\Automated_Parking_System> cd .\Sensor_Project_Dashboard\
PS C:\Users\chami\OneDrive\Desktop\SEM 4\Sensor Project\Automated_Parking_System\Sensor_Project_Dashboard> cd .\backend\
PS C:\Users\chami\OneDrive\Desktop\SEM 4\Sensor Project\Automated_Parking_System\Sensor_Project_Dashboard\backend> & "C:\Program Files\mosquitto\mosquitto.exe" -c mqtt.conf -v