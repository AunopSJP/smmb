#include "buzzer.h"

#include <Arduino.h>
#include <driver/rtc_io.h>
#include <esp_task_wdt.h>
#include <string.h>

#include "board.h"
#include "settings.h"

// 0.2.45: ตัวส่งเสียงจริงคือ LTE-5061J 12V DC (ไฟกระพริบ+เสียงในตัว) — จ่ายไฟค้างแล้วมัน "ติ๊ด" ตามจังหวะของมันเองไปเรื่อย ๆ
// สั่งเสียงสั้น/ยาวแบบ buzzer ไม่ได้ (จ่าย 120 ms วงจรข้างในยังไม่ทันดัง · เว้น 120 ms ยังไม่ทันดับ เสียงกลืนกัน)
// → ทุกรูปแบบนับเป็น "จำนวนติ๊ด": จ่ายไฟค้างนานพอให้ดังครบ N ครั้งแล้วตัดก่อนครั้งถัดไป · กลุ่มเสียงคั่นด้วยการตัดไฟนานพอให้ดับสนิท
// ความยาวจังหวะต่างกันตามล็อตของอุปกรณ์ → ตั้งได้ทาง serial (`siren period/lead`) เก็บใน NVS ไม่ต้องแฟลชใหม่
// BUZZER_ACTIVE 0 (buzzer แบบ passive ต่อตรง) ยังใช้ PWM ได้ — จังหวะเดียวกัน
static const int CH = 7;
static const uint16_t GROUP_GAP_MS = 700; // ตัดไฟระหว่างกลุ่มเสียง (เช่น เสียงผิดพลาด 1 · 2) — ให้วงจรในตัวดับและเริ่มนับใหม่

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

static void powerOn()
{
#if BUZZER_ACTIVE
  digitalWrite(PIN_BUZZER, HIGH);
#else
  ledcWriteTone(CH, BUZZER_FREQ_HZ);
#endif
}

void sirenHold(uint32_t ms)
{
  powerOn();
  const uint32_t start = millis();
  while (millis() - start < ms)
  {
    esp_task_wdt_reset();
    delay(10);
  }
  buzzerOff();
}

/** จ่ายไฟให้ดังครบ n ติ๊ด: ถึงติ๊ดแรก (lead) + (n−1) จังหวะ + ครึ่งจังหวะ (ตัดก่อนติ๊ดถัดไป) · แล้วตัดไฟให้ดับสนิท */
void sirenTicks(uint8_t n)
{
  if (!n)
    return;
  const uint32_t period = settings.sirenPeriodMs;
  sirenHold(settings.sirenLeadMs + (uint32_t)(n - 1) * period + period / 2);
  delay(GROUP_GAP_MS);
}

void beepReady()
{
  Serial.println("[beep] 1 tick (ready)");
  sirenTicks(1);
}
void beepPass()
{
  Serial.println("[beep] 2 ticks (pass)");
  sirenTicks(2);
}
void beepRetry()
{
  Serial.println("[beep] 1 tick (retry)");
  sirenTicks(1);
}
void beepFail()
{
  Serial.println("[beep] 4 ticks (fail)");
  sirenTicks(4);
}
void beepWifiReset()
{
  Serial.println("[beep] 3 ticks (wifi reset)");
  sirenTicks(3);
}
void beepError()
{
  Serial.println("[beep] 1 tick · pause · 2 ticks (error)");
  sirenTicks(1);
  sirenTicks(2);
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
