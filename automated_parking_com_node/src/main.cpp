#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// =========================================================
// 1. NETWORK CONFIGURATION
// =========================================================
const char* ssid = "Dialog 4G 858";
const char* password = "04588A9D";
const char* mqtt_server = "192.168.8.153"; 

// =========================================================
// 2. PARKING SLOT DATABASE (Matches Node.js Slots)
// =========================================================
struct SlotRange {
  const char* id;
  int floor;
  long xMin; long xMax;
  long yMin; long yMax;
};

// --- UPDATE THESE STEP RANGES BASED ON YOUR PHYSICAL LIFT CALIBRATION ---
SlotRange database[] = {
  // FLOOR 1 SLOTS
  {"A1", 1, 10000, 12000, 20000, 22000},
  {"A2", 1, 20000, 22000, 20000, 22000},
  {"A3", 1, 30000, 32000, 20000, 22000},
  {"A4", 1, 40000, 42000, 20000, 22000},

  // FLOOR 2 SLOTS
  {"B1", 2, 10000, 12000, 40000, 42000},
  {"B2", 2, 20000, 22000, 40000, 42000},
  {"B3", 2, 30000, 32000, 40000, 42000},
  {"B4", 2, 40000, 42000, 40000, 42000}
};

// =========================================================

WiFiClient espClient;
PubSubClient mqttClient(espClient);

#define RXp2 16
#define TXp2 17

void setup_wifi() {
  delay(10);
  Serial.print("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // 1. Convert and Print the raw JSON
  String message = "";
  for (int i = 0; i < length; i++) { message += (char)payload[i]; }
  
  Serial.print("22:15:02 -> [MQTT] Command Received: ");
  Serial.println(message);

  StaticJsonDocument<200> doc;
  deserializeJson(doc, message);
  
  if (doc["action"] == "EMERGENCY_STOP") {
    Serial.println("22:15:02 -> [NANO] Sending Serial2 Command: HALT");
    Serial2.println("HALT"); 
    return;
  }

  const char* action = doc["action"];
  const char* requestedSlot = doc["slot_id"];

  // 2. Process the Manual Command
  if (strcmp(action, "park") == 0 || strcmp(action, "retrieve") == 0) {
    bool found = false;

    // Search Database
    for (int i = 0; i < sizeof(database)/sizeof(database[0]); i++) {
      if (strcmp(database[i].id, requestedSlot) == 0) {
        
        // Print the Database match
        Serial.print("22:15:02 -> [DATABASE] Slot ");
        Serial.print(requestedSlot);
        Serial.print(" Found. Target: X=");
        Serial.print(database[i].xMin);
        Serial.print(", Y=");
        Serial.println(database[i].yMin);

        // 3. Send and Print the Nano command
        String nanoCmd = "X" + String(database[i].xMin) + ",Y" + String(database[i].yMin);
        Serial2.println(nanoCmd); 
        
        Serial.print("22:15:02 -> [NANO] Sending Serial2 Command: ");
        Serial.println(nanoCmd);

        found = true;
        break;
      }
    }

    if (!found) {
      Serial.print("22:15:02 -> [ERROR] Slot ID '");
      Serial.print(requestedSlot);
      Serial.println("' not found in ESP32 Database!");
    }
  } 
  else if (strcmp(action, "home") == 0) {
    // Backend wants to send the robot back to 0,0
    Serial.println("22:15:02 -> [DATABASE] Returning to Home / Ground 0");
    Serial2.println("X0,Y0"); 
  }
}

void reconnect() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT Broker (");
    Serial.print(mqtt_server);
    Serial.print(")... ");
    
    if (mqttClient.connect("ESP32_Gateway_Node")) {
      Serial.println("CONNECTED!");
      mqttClient.subscribe("hardware/commands");
      Serial.println("Subscribed to: hardware/commands");
    } else {
      Serial.print("FAILED, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" -> retrying in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXp2, TXp2); 
  Serial2.setTimeout(20); // <--- CRITICAL FIX: Stop readStringUntil from freezing the ESP32!
  setup_wifi();
  mqttClient.setServer(mqtt_server, 1883);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (!mqttClient.connected()) reconnect();
  mqttClient.loop(); // <-- This MUST run frequently to process incoming messages!

  if (Serial2.available()) {
    String incoming = Serial2.readStringUntil('\n');
    incoming.trim();

    if (incoming.startsWith("POS:")) {
      // 1. Parse raw coordinates from Nano "POS:X,Y,Status"
      String data = incoming.substring(4);
      int firstComma = data.indexOf(',');
      int secondComma = data.lastIndexOf(',');

      long curX = data.substring(0, firstComma).toInt();
      long curY = data.substring(firstComma + 1, secondComma).toInt();
      String status = data.substring(secondComma + 1);

      // STATE TRACKER: Only print and send to MQTT if the values actually changed!
      static long lastX = -999;
      static long lastY = -999;
      static String lastStatus = "";

      if (curX != lastX || curY != lastY || status != lastStatus) {
        // Update the trackers with the new values
        lastX = curX;
        lastY = curY;
        lastStatus = status;

        // 2. Cross-reference with our Data Set
        String activeSlot = "TRANSIT";
        int activeFloor = 0;

      for (int i = 0; i < sizeof(database)/sizeof(database[0]); i++) {
        if (curX >= database[i].xMin && curX <= database[i].xMax &&
            curY >= database[i].yMin && curY <= database[i].yMax) {
          activeSlot = database[i].id;
          activeFloor = database[i].floor;
          break;
        }
      }

      // 3. Fallback: If not in a specific slot, estimate floor by Y height
      if (activeFloor == 0) {
        if (curY < 300) activeFloor = 0; // Ground
        else if (curY > 18000 && curY < 22000) activeFloor = 1;
        else if (curY > 38000) activeFloor = 2;
      }

      // 4. Send JSON to Node.js
      // actual_floor: moves the CSS lift carriage (approximate)
      // raw_y: exact millimeter tracking for the frontend animation
      // motor_status: sets the UI status text
      StaticJsonDocument<200> outDoc;
      outDoc["actual_floor"] = activeFloor;
      outDoc["raw_y"] = curY;
      outDoc["motor_status"] = (status == "HALTED") ? "halted" : (status == "idle" ? "idle" : "moving");
      
      // Optional: if your UI needs to highlight the slot, this ID is now available
      outDoc["current_slot"] = activeSlot; 

      char buffer[256];
      serializeJson(outDoc, buffer);
      mqttClient.publish("hardware/sensors", buffer);
      
      Serial.print("Update Sent: "); Serial.println(buffer);
      } // <-- Closes the IF tracking statement
    }
  }
}