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
// 2. PARKING SLOT DATABASE (Matches your new direct X/Y setup)
// =========================================================
struct SlotRange {
  const char* id;
  int floor;
  long xMin; long xMax; // Vertical Lift (Floor Height)
  long yMin; long yMax; // Horizontal Movement (Slot Position)
  long zExtend;         // Z-Axis Actuator Extension
};

// --- ALIGNED TO YOUR NEW DIAGONAL POINT-TO-POINT SYSTEM ---
SlotRange database[] = {
  // FLOOR 1 SLOTS (X is ~20,000 for Floor 1)
  {"A1", 1, 18000, 22000, 10000, 12000, 5000},
  {"A2", 1, 18000, 22000, 20000, 22000, 5000},
  {"A3", 1, 18000, 22000, 30000, 32000, 5000},
  {"A4", 1, 18000, 22000, 40000, 42000, 5000},

  // FLOOR 2 SLOTS (X is ~40,000 for Floor 2)
  {"B1", 2, 38000, 42000, 10000, 12000, 5000},
  {"B2", 2, 38000, 42000, 20000, 22000, 5000},
  {"B3", 2, 38000, 42000, 30000, 32000, 5000},
  {"B4", 2, 38000, 42000, 40000, 42000, 5000}
};

WiFiClient espClient;
PubSubClient mqttClient(espClient);

#define RXp2 16
#define TXp2 17

void setup_wifi() {
  delay(10);
  Serial.print("\nConnecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500); Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
  String message = "";
  for (int i = 0; i < length; i++) { message += (char)payload[i]; }
  
  Serial.print("-> [MQTT] Command Received: ");
  Serial.println(message);

  StaticJsonDocument<200> doc;
  deserializeJson(doc, message);
  
  if (doc["action"] == "EMERGENCY_STOP") {
    Serial.println("-> [NANO] Sending Serial2 Command: HALT");
    Serial2.println("HALT"); 
    return;
  }

  const char* action = doc["action"];
  const char* requestedSlot = doc["slot_id"];

  if (strcmp(action, "park") == 0 || strcmp(action, "retrieve") == 0) {
    bool found = false;

    // Search Database
    for (int i = 0; i < sizeof(database)/sizeof(database[0]); i++) {
      if (strcmp(database[i].id, requestedSlot) == 0) {
        
        Serial.print("-> [DATABASE] Slot ");
        Serial.print(requestedSlot);
        Serial.print(" Found. Target: X=");
        Serial.print(database[i].xMin);
        Serial.print(", Y=");
        Serial.println(database[i].yMin);

        // Dispatches the full 3-part sequence command to the Nano: SEQ:X,Y,Z
        String nanoCmd = "SEQ:" + String(database[i].xMin) + "," + String(database[i].yMin) + "," + String(database[i].zExtend);
        Serial2.println(nanoCmd); 
        
        Serial.print("-> [NANO] Sending Serial2 Command: ");
        Serial.println(nanoCmd);

        found = true;
        break;
      }
    }

    if (!found) {
      Serial.print("-> [ERROR] Slot ID '");
      Serial.print(requestedSlot);
      Serial.println("' not found in ESP32 Database!");
    }
  } 
  else if (strcmp(action, "home") == 0) {
    Serial.println("-> [DATABASE] Returning to Home / Ground 0");
    // FIXED: Must include X, Y, and Z so the Nano parser doesn't crash!
    Serial2.println("SEQ:0,0,0"); 
  }
}

void reconnect() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting to MQTT Broker...");
    if (mqttClient.connect("ESP32_Gateway_Node")) {
      Serial.println("CONNECTED!");
      mqttClient.subscribe("hardware/commands");
    } else {
      Serial.println("FAILED -> retrying in 5 seconds");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  Serial2.begin(9600, SERIAL_8N1, RXp2, TXp2); 
  Serial2.setTimeout(20); 
  setup_wifi();
  mqttClient.setServer(mqtt_server, 1883);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  if (!mqttClient.connected()) reconnect();
  mqttClient.loop(); 

  if (Serial2.available()) {
    String incoming = Serial2.readStringUntil('\n');
    incoming.trim();

    if (incoming.startsWith("POS:")) {
      String data = incoming.substring(4);
      int firstComma = data.indexOf(',');
      int secondComma = data.lastIndexOf(',');

      long curX = data.substring(0, firstComma).toInt();
      long curY = data.substring(firstComma + 1, secondComma).toInt();
      String status = data.substring(secondComma + 1);

      static long lastX = -999;
      static long lastY = -999;
      static String lastStatus = "";

      if (curX != lastX || curY != lastY || status != lastStatus) {
        lastX = curX;
        lastY = curY;
        lastStatus = status;

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

        // FIXED: Estimate floor by X height (Vertical Lift) instead of Y (Horizontal)
        if (activeFloor == 0) {
          if (curX < 300) activeFloor = 0; // Ground
          else if (curX > 18000 && curX < 22000) activeFloor = 1;
          else if (curX > 38000) activeFloor = 2;
        }

        StaticJsonDocument<200> outDoc;
        outDoc["actual_floor"] = activeFloor;
        
        // FIXED: X is vertical! We must map curX to React's raw_y variable
        outDoc["raw_y"] = curX; 
        
        outDoc["motor_status"] = (status == "HALTED") ? "halted" : (status == "idle" ? "idle" : "moving");
        outDoc["current_slot"] = activeSlot; 

        char buffer[256];
        serializeJson(outDoc, buffer);
        mqttClient.publish("hardware/sensors", buffer);
        
        Serial.print("Update Sent: "); Serial.println(buffer);
      } 
    }
  }
}