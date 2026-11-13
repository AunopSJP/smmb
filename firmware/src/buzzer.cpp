#include "buzzer.h"

#include <Arduino.h>
#include <driver/rtc_io.h>
#include <string.h>

#include "board.h"

// BUZZER_ACTIVE: เปิด/ปิดขา (MOSFET → ไซเรน) · ไม่งั้นใช้ PWM (LEDC) สำหรับ buzzer แบบ passive
static const int CH = 7;
static const int SHORT_MS = 120, LONG_MS = 600, GAP_MS = 120;

void buzzerInit()
{
#if BUZZER_ACTIVE
  rtc_gpio_hold_dis((gpio_num_t)PIN_BUZZER); // ปลดล็อกจากตอนหลับลึก
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
#else
  rtc_gpio_hold_dis((gpio_num_t)PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW); // ให้ MOSFET ดับทันทีตอนบูต ก่อนผูก PWM
  ledcSetup(CH, BUZZER_FREQ_HZ, 8);
  ledcAttachPin(PIN_BUZZER, CH);
  ledcWrite(CH, 0);
#endif
}

void buzzerOff()
{
#if BUZZER_ACTIVE
  digitalWrite(PIN_BUZZER, LOW);
#else
  ledcWrite(CH, 0);
#endif
}

void buzzerHoldOffForSleep()
{
  buzzerOff();
#if !BUZZER_ACTIVE
  ledcDetachPin(PIN_BUZZER);
  pinMode(PIN_BUZZER, OUTPUT);
  digitalWrite(PIN_BUZZER, LOW);
#endif
  {
    rtc_gpio_hold_en((gpio_num_t)PIN_BUZZER); // ขาลอยตอนหลับ → MOSFET อาจติด ไซเรนดังทั้งคืน
  }
}

static void tone(int ms)
{
#if BUZZER_ACTIVE
  digitalWrite(PIN_BUZZER, HIGH);
#else
  ledcWriteTone(CH, BUZZER_FREQ_HZ);
#endif
  delay(ms);
  buzzerOff();
  delay(GAP_MS);
}

void beepReady()
{
  Serial.println("[beep] short x1");
  tone(SHORT_MS);
}
void beepPass()
{
  Serial.println("[beep] short x2 (pass)");
  tone(SHORT_MS);
  tone(SHORT_MS);
}
void beepRetry()
{
  Serial.println("[beep] long x1 (retry)");
  tone(LONG_MS);
}
void beepFail()
{
  Serial.println("[beep] long x3 (fail)");
  tone(LONG_MS);
  tone(LONG_MS);
  tone(LONG_MS);
}
void beepWifiReset()
{
  Serial.println("[beep] short x3 (wifi reset)");
  tone(SHORT_MS);
  tone(SHORT_MS);
  tone(SHORT_MS);
}

bool beepByName(const char *name)
{
  if (!name)
    return false;
  if (!strcmp(name, "ready"))
    beepReady();
  else if (!strcmp(name, "pass"))
    beepPass();
  else if (!strcmp(name, "retry"))
    beepRetry();
  else if (!strcmp(name, "fail"))
    beepFail();
  else if (!strcmp(name, "error"))
    beepError();
  else if (!strcmp(name, "wifi"))
    beepWifiReset();
  else
    return false;
  return true;
}

void beepError()
{
  Serial.println("[beep] long + short x2 (error)");
  tone(LONG_MS);
  tone(SHORT_MS);
  tone(SHORT_MS);
}
