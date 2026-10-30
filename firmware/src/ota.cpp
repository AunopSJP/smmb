#include "ota.h"

#include <ArduinoOTA.h>
#include <WiFi.h>

#include "settings.h"

#ifndef OTA_PASS
#define OTA_PASS ""
#endif

static volatile bool busy = false;
static bool started = false;

// long-poll ถือสายได้นานกว่า 10 วิ (เวลารอคำเชิญของ espota) → รับ OTA ในงานแยก ไม่ผูกกับลูปหลัก
static void otaTask(void*) {
  for (;;) {
    ArduinoOTA.handle();
    vTaskDelay(pdMS_TO_TICKS(20));
  }
}

void otaStart() {
  if (started || sizeof(OTA_PASS) <= 1 || WiFi.status() != WL_CONNECTED) return;
  String host = apName();
  host.toLowerCase();
  ArduinoOTA.setHostname(host.c_str());
  ArduinoOTA.setPassword(OTA_PASS);
  ArduinoOTA.onStart([]() {
    busy = true;
    Serial.println("[ota] start");
  });
  ArduinoOTA.onEnd([]() { Serial.println("\n[ota] done — rebooting"); });
  ArduinoOTA.onProgress([](unsigned int done, unsigned int total) {
    static uint8_t last = 255;
    uint8_t pct = total ? done * 100 / total : 0;
    if (pct / 10 != last / 10) Serial.printf("[ota] %u%%\n", pct);
    last = pct;
  });
  ArduinoOTA.onError([](ota_error_t e) {
    busy = false;
    Serial.printf("[ota] error %u\n", (unsigned)e);
  });
  ArduinoOTA.begin();
  xTaskCreate(otaTask, "ota", 4096, nullptr, 1, nullptr);
  started = true;
  Serial.printf("[ota] ready · host %s.local · IP %s\n", host.c_str(), WiFi.localIP().toString().c_str());
}

bool otaBusy() { return busy; }
