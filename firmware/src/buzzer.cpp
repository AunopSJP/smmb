#include "buzzer.h"

#include <Arduino.h>

#include "board.h"

// ใช้ PWM (LEDC) — ดังทั้ง buzzer แบบ passive และ active
static const int CH = 7;
static const int SHORT_MS = 120, LONG_MS = 600, GAP_MS = 120;

void buzzerInit() {
  ledcSetup(CH, BUZZER_FREQ_HZ, 8);
  ledcAttachPin(PIN_BUZZER, CH);
  ledcWrite(CH, 0);
}

static void tone(int ms) {
  ledcWriteTone(CH, BUZZER_FREQ_HZ);
  delay(ms);
  ledcWrite(CH, 0);
  delay(GAP_MS);
}

void beepReady() {
  Serial.println("[beep] short x1");
  tone(SHORT_MS);
}
void beepPass() {
  Serial.println("[beep] short x2 (pass)");
  tone(SHORT_MS);
  tone(SHORT_MS);
}
void beepRetry() {
  Serial.println("[beep] long x1 (retry)");
  tone(LONG_MS);
}
void beepFail() {
  Serial.println("[beep] long x3 (fail)");
  tone(LONG_MS);
  tone(LONG_MS);
  tone(LONG_MS);
}
void beepError() {
  Serial.println("[beep] long + short x2 (error)");
  tone(LONG_MS);
  tone(SHORT_MS);
  tone(SHORT_MS);
}
