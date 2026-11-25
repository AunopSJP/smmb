// เฟิร์มแวร์ตู้ SMMB (ESP32-CAM) — ลำดับการทำงานตาม docs/HARDWARE_FIRMWARE_GUIDE.md §4
//
// เปิดเครื่อง → (ไม่มี Wi-Fi / ไม่ได้ตั้งตู้ → โหมดตั้งค่า) → ต่อ Wi-Fi → POST boot
// → ลูป: อยู่ใน awake_s หลัง boot หรือในเวลาตรวจ → ถือ long-poll รองาน
//        ไม่ใช่ → ถึงเวลารายงาน → report · แล้วหลับลึกจนถึงเหตุการณ์ถัดไป
//
// คำสั่งทาง Serial (115200): พิมพ์ help

#include <Arduino.h>
#include <ArduinoJson.h>
#include <Preferences.h>
#include <WebServer.h>
#include <WiFi.h>
#include <driver/rtc_io.h>
#include <esp_sleep.h>

#include <SmmbLink.h> // ทุกอย่างที่คุยกับเซิร์ฟเวอร์ (lib/smmb_link) — ไฟล์นี้เหลือแค่ฮาร์ดแวร์ + ลำดับเปิด/หลับ
#include "board.h"
#include "buzzer.h"
#include "camera_qr.h"
#include "debugview.h"
#include "portal.h"
#include "settings.h"
#include <esp_task_wdt.h>

// stack ของ loop: TLS + JSON + ถอด QR ต้องการมากกว่าค่าเริ่มต้น 8 KB
SET_LOOP_TASK_STACK_SIZE(16 * 1024);

// ── ค่าที่อยู่รอดตอนหลับลึก ───────────────────────────────────────────────
// (awakeUntil + ตัวนับ อยู่ใน linkRtc ของไลบรารี)
RTC_DATA_ATTR static uint32_t lastReportDay = 0; // วันที่ (เวลาไทย นับจาก epoch) ที่รายงานแล้ว

// ── เวลา ───────────────────────────────────────────────────────────────
static uint32_t localDay(uint32_t utc) { return (utc + TZ_OFFSET_S) / 86400; }
static uint16_t localMinute(uint32_t utc) { return ((utc + TZ_OFFSET_S) % 86400) / 60; }

static bool inWindow(uint32_t utc)
{
  uint16_t m = localMinute(utc);
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    if (m >= boxConfig.winStart[i] && m < boxConfig.winEnd[i])
      return true;
  return false;
}

/**
 * ตู้นี้ "หลับตามเวลาตรวจ" ไหม — เปิดจาก serial (`sleep on`) หรือจากแอดมิน (config sleep_outside_window)
 * ปิด = ถือ long-poll ตลอด (ค่าเริ่มต้น) · เปิด = นอกเวลาตรวจหลับลึก ตื่นก่อนต้นช่วงตรวจ WAKE_BEFORE_WINDOW_S (shouldListen / secondsToNextEvent)
 */
static bool scheduleSleepEnabled() { return (settings.sleep || boxConfig.sleepOutsideWindow) && !settings.debugCam; }

/**
 * อยู่ในช่วงที่ต้องตื่นไหม = ตั้งแต่ WAKE_BEFORE_WINDOW_S ก่อนต้นช่วงตรวจ จนจบช่วง
 * (ตู้ตื่นจากหลับลึกก่อนต้นช่วง — ถ้าเช็กแค่ inWindow ตู้จะเห็นว่ายังไม่ถึงเวลาแล้วหลับต่อข้ามไปวันรุ่งขึ้น)
 */
static bool inListenTime(uint32_t utc)
{
  const uint32_t sec = (utc + TZ_OFFSET_S) % 86400;
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
  {
    const uint32_t st = (uint32_t)boxConfig.winStart[i] * 60, en = (uint32_t)boxConfig.winEnd[i] * 60;
    if (sec < en && sec + WAKE_BEFORE_WINDOW_S >= st)
      return true;
    if (st < WAKE_BEFORE_WINDOW_S && sec + WAKE_BEFORE_WINDOW_S >= 86400 + st)
      return true; // ช่วงที่เริ่มใกล้เที่ยงคืน: ส่วนก่อนเริ่มอยู่ท้ายของวันก่อนหน้า
  }
  return false;
}

// ตรวจผ่านแล้วพักถึงเมื่อไร (UTC · 0 = ไม่พัก) — ✅ ผู้ใช้สั่ง 2026-11-17: ตรวจผ่านแล้วตู้กลับไปหลับลึกทันที ไม่ถือสายรอจนหมดช่วง
// ตรวจไม่ผ่านไม่ตั้งค่านี้ → ตู้ตื่นรอให้เจ้าหน้าที่สแกนซ้ำได้ (หลับลึกแล้วปลุกไม่ได้)
RTC_DATA_ATTR static uint32_t quietUntil = 0;

static bool shouldListen()
{
  // ไม่ได้ตั้งให้หลับตามตาราง (หรือกำลังเปิดหน้าดูกล้อง) → ถือสายตลอด เพื่อให้สแกนแล้วตู้ตอบทันที
  if (!scheduleSleepEnabled())
    return true;
  uint32_t now = nowUtc();
  if (!now)
    return false;
  if (now < quietUntil)
    return false; // เพิ่งตรวจผ่านในช่วงนี้ → พัก
  return now < linkRtc.awakeUntil || inListenTime(now);
}

/**
 * อีกกี่วินาทีจะพ้นช่วงที่ต้องถือสาย (จบช่วงตรวจ หรือ ตัวนับตื่นค้างหมด — เอาอันที่จบทีหลัง) · 0 = พ้นแล้ว
 * ใช้ตัด long-poll รอบสุดท้ายให้จบพอดีเวลา: เดิมถามค้าง 25 วิ ข้ามเวลาจบช่วง ตู้จึงตื่นเกินเวลาตรวจไปราวครึ่งนาทีทุกวัน
 */
static uint32_t secondsLeftToListen(uint32_t now)
{
  uint32_t left = now < linkRtc.awakeUntil ? linkRtc.awakeUntil - now : 0;
  const uint32_t sec = (now + TZ_OFFSET_S) % 86400;
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
  {
    const uint32_t st = (uint32_t)boxConfig.winStart[i] * 60, en = (uint32_t)boxConfig.winEnd[i] * 60;
    if (sec < en && sec + WAKE_BEFORE_WINDOW_S >= st)
      left = max<uint32_t>(left, en - sec);
    else if (st < WAKE_BEFORE_WINDOW_S && sec + WAKE_BEFORE_WINDOW_S >= 86400 + st)
      left = max<uint32_t>(left, 86400 - sec + en); // ช่วงที่เริ่มใกล้เที่ยงคืน: ตอนนี้ยังอยู่ท้ายวันก่อนหน้า
  }
  return left;
}

/**
 * ตรวจผ่านแล้ว: พักจนสิ้นสุดช่วงตรวจนี้ (แต่ไม่เกินเวลาตื่นของช่วงถัดไป กรณีสองช่วงติดกัน) · ยกเลิกตัวนับตื่นค้างหลังเปิดเครื่องด้วย
 */
static void restAfterPass(uint32_t now)
{
  linkRtc.awakeUntil = 0;
  uint32_t left = secondsLeftToListen(now);
  const uint32_t sec = (now + TZ_OFFSET_S) % 86400;
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
  {
    const int32_t wakeAt = (int32_t)boxConfig.winStart[i] * 60 - (int32_t)WAKE_BEFORE_WINDOW_S;
    if (wakeAt > (int32_t)sec && (uint32_t)(wakeAt - (int32_t)sec) < left)
      left = (uint32_t)(wakeAt - (int32_t)sec);
  }
  quietUntil = now + left;
  Serial.printf("[sleep] inspection passed — resting %u s (until this window ends)\n", (unsigned)left);
}

/** วินาทีถึงเหตุการณ์ถัดไป (ต้นช่วงเวลาตรวจ − WAKE_BEFORE_WINDOW_S หรือ เวลารายงาน) */
static uint32_t secondsToNextEvent(uint32_t now)
{
  uint16_t m = localMinute(now);
  uint32_t secOfDay = (now + TZ_OFFSET_S) % 86400;
  uint32_t best = 24 * 1800;
  auto consider = [&](uint16_t targetMin, int32_t earlyS)
  {
    int32_t target = (int32_t)targetMin * 60 - earlyS;
    int32_t diff = target - (int32_t)secOfDay;
    if (diff <= 0)
      diff += 86400;
    if ((uint32_t)diff < best)
      best = diff;
  };
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    consider(boxConfig.winStart[i], WAKE_BEFORE_WINDOW_S);
  consider(boxConfig.reportAt, 0);
  (void)m;
  return max<uint32_t>(best, 30);
}

// ── บันทึกการตัดสินใจของรอบตื่น (0.2.22) ───────────────────────────────────
// ไว้ตามหาว่า "ทำไมพ้นเวลาตรวจแล้วตู้ยังไม่หลับ" โดยไม่ต้องต่อ serial: จดเหตุการณ์สำคัญลง RTC memory (รอดการหลับลึก · หายเมื่อไฟดับ)
// แล้วส่งเป็น event `awake_trace` ก่อนหลับในรอบตื่นที่เคยถือ long-poll (หรือทันทีที่ตู้ตื่นค้างด้วยเหตุผลที่ไม่ใช่ช่วงตรวจ)
// เปิดดูที่เว็บแอดมิน D04 "รายงานจากตู้ล่าสุด" · ทุกบรรทัดมีเวลาในตู้ (เวลาไทย) กำกับ — เทียบกับนาฬิกาจริงก็รู้ว่าตู้เพี้ยนเท่าไร
// ปิดทั้งหมดได้ด้วย SMMB_TRACE 0 ใน board.h
#if SMMB_TRACE
#define TRACE_MAX 40
struct TraceEntry
{
  uint32_t utc; // เวลาในตู้ตอนจด (0 = ยังไม่ได้ตั้งนาฬิกา)
  char tag;     // ชนิดเหตุการณ์: W ตื่น · L สถานะ "ต้องถือสายไหม" เปลี่ยน · P long-poll ผิดปกติ · S ซิงก์นาฬิกา · D หลับลึก · E ข้อผิดพลาด
  int16_t a, b, c, d;
};
RTC_DATA_ATTR static TraceEntry traceBuf[TRACE_MAX];
RTC_DATA_ATTR static uint16_t traceHead = 0;   // ช่องที่จะเขียนถัดไป (วนทับของเก่าสุด)
RTC_DATA_ATTR static uint16_t traceCount = 0;  // รายการที่ยังไม่ได้ส่ง (≤ TRACE_MAX)
RTC_DATA_ATTR static bool traceNeedSend = false; // มีรอบตื่นที่ถือสายแล้ว ควรส่งก่อนหลับ
static bool listenedThisWake = false;
static int lastListenKey = -1;           // (ถือสายไหม, เหตุผล) ครั้งล่าสุดที่จด — จดเมื่อเปลี่ยนเท่านั้น
static uint16_t pollsThisWake = 0;       // long-poll ที่ทำไปในรอบตื่นนี้
static unsigned long lastPollEndMs = 0;  // millis() ตอนถามเซิร์ฟเวอร์ครั้งล่าสุดจบ (0 = ยังไม่เคยในรอบนี้)

static int16_t c16(long v) { return (int16_t)constrain(v, -32000L, 32000L); }

/** วินาทีนับจากถามเซิร์ฟเวอร์ครั้งล่าสุดจบ (-1 = ยังไม่เคยในรอบตื่นนี้) */
static long lastPollAgeS() { return lastPollEndMs ? (long)((millis() - lastPollEndMs) / 1000) : -1; }

/** ทำไมตู้ต้องถือสาย (บิต): 1 ปิดโหมดหลับ · 2 ตัวนับตื่นค้าง (awakeUntil) ยังไม่หมด · 4 อยู่ในช่วงตื่น (ก่อนต้นช่วง–จบช่วง) · 8 ยังไม่มีนาฬิกา */
static uint8_t listenWhy(uint32_t now)
{
  uint8_t w = 0;
  if (!scheduleSleepEnabled())
    w |= 1;
  if (!now)
    w |= 8;
  else
  {
    if (now < linkRtc.awakeUntil)
      w |= 2;
    if (inListenTime(now))
      w |= 4;
  }
  return w;
}

/** แปลงรายการเป็นข้อความอ่านง่าย (ใช้ทั้งพิมพ์ serial และส่งขึ้นเซิร์ฟเวอร์ · มีแต่ a-z 0-9 = : . - ช่องว่าง → ใส่ใน JSON ได้ไม่ต้อง escape) */
static void traceRender(const TraceEntry &e, char *out, size_t n)
{
  char ts[10] = "--:--:--";
  if (e.utc)
  {
    const uint32_t s = (e.utc + TZ_OFFSET_S) % 86400;
    snprintf(ts, sizeof ts, "%02u:%02u:%02u", (unsigned)(s / 3600), (unsigned)((s / 60) % 60), (unsigned)(s % 60));
  }
  switch (e.tag)
  {
  case 'W': // a=เหตุผลรีเซ็ต (ESP_RST_*: 1 ไฟเข้า · 5 หลับลึก…) b=ตัวนับตื่นค้างเหลือ (วิ) c=บิต: 1 อยู่ในเวลาตรวจ 2 อยู่ในช่วงตื่น 4 โหมดหลับเปิด 8 มีนาฬิกา · d=จำนวนครั้งที่ตื่น
    snprintf(out, n, "%s wake rst=%d awake=%ds win=%d lis=%d sleepon=%d clk=%d n=%d", ts, e.a, e.b, e.c & 1, (e.c >> 1) & 1, (e.c >> 2) & 1, (e.c >> 3) & 1, e.d);
    break;
  case 'L': // a=ถือสายไหม b=เหตุผล (บิตตาม listenWhy) c=วินาทีนับจากถามครั้งล่าสุด d=จำนวน poll ในรอบนี้
  {
    char why[8] = "";
    size_t k = 0;
    if (e.b & 1) why[k++] = 's'; // sleep off
    if (e.b & 2) why[k++] = 'a'; // awakeUntil
    if (e.b & 4) why[k++] = 'l'; // listen time
    if (e.b & 8) why[k++] = 'c'; // no clock
    why[k] = 0;
    snprintf(out, n, "%s listen=%d why=%s lastpoll=%ds polls=%d", ts, e.a, k ? why : "none", e.c, e.d);
    break;
  }
  case 'P': // a=ผล (0 ไม่มีงาน 1 ได้งาน 2 401 3 ต่อไม่ได้) b=ใช้เวลา (หน่วย 0.1 วิ)
    snprintf(out, n, "%s poll res=%d took=%d.%ds", ts, e.a, e.b / 10, e.b % 10);
    break;
  case 'S': // a=ผลต่างนาฬิกา (วิ · + = ตู้ช้ากว่าเซิร์ฟเวอร์) b=มีค่าเทียบไหม c=ผล poll d=ใช้เวลา (0.1 วิ)
    snprintf(out, n, "%s sync delta=%ds ref=%d res=%d took=%d.%ds", ts, e.a, e.b, e.c, e.d / 10, e.d % 10);
    break;
  case 'D': // a=หลับกี่วิ b=อีกกี่วิถึงเหตุการณ์ถัดไป c=วินาทีนับจากถามครั้งล่าสุด d=จำนวน poll ในรอบนี้
    snprintf(out, n, "%s sleep s=%d next=%ds lastpoll=%ds polls=%d", ts, e.a, e.b, e.c, e.d);
    break;
  default: // E: a=รหัส (1 Wi-Fi หลุดและต่อใหม่ไม่ได้) b=WiFi.status()
    snprintf(out, n, "%s err code=%d wifi=%d", ts, e.a, e.b);
    break;
  }
}

static void traceAdd(char tag, long a = 0, long b = 0, long c = 0, long d = 0)
{
  TraceEntry &e = traceBuf[traceHead];
  e.utc = nowUtc();
  e.tag = tag;
  e.a = c16(a);
  e.b = c16(b);
  e.c = c16(c);
  e.d = c16(d);
  traceHead = (traceHead + 1) % TRACE_MAX;
  if (traceCount < TRACE_MAX)
    traceCount++;
  char line[96];
  traceRender(e, line, sizeof line);
  Serial.printf("[tr] %s\n", line);
}

/** ส่งรายการที่ค้างเป็น event awake_trace (ต้องต่อ Wi-Fi อยู่) · ส่งสำเร็จแล้วล้างทิ้ง · ไม่ได้ก็เก็บไว้ส่งรอบหน้า */
static bool traceFlush()
{
  if (!traceNeedSend || !traceCount || WiFi.status() != WL_CONNECTED)
    return false;
  String body = String("{\"type\":\"awake_trace\",\"fw\":\"") + FW_VERSION + "\",\"now\":" + String(nowUtc()) + ",\"trace\":[";
  const uint16_t start = (traceHead + TRACE_MAX - traceCount) % TRACE_MAX;
  for (uint16_t i = 0; i < traceCount; i++)
  {
    char line[96];
    traceRender(traceBuf[(start + i) % TRACE_MAX], line, sizeof line);
    if (i)
      body += ',';
    body += '"';
    body += line;
    body += '"';
  }
  body += "]}";
  if (!linkEventRaw(body, 4000))
    return false;
  traceCount = 0;
  traceNeedSend = false;
  return true;
}

/** เรียกทุกรอบของ loop(): จดเมื่อ "ต้องถือสายไหม + เพราะอะไร" เปลี่ยน · ตื่นค้างด้วยเหตุผลที่ไม่ใช่ช่วงตื่น = ส่งขึ้นเซิร์ฟเวอร์ทันที (เผื่อตู้ไม่หลับเลย) */
static void traceListenState(uint32_t now)
{
  const bool listen = shouldListen();
  const uint8_t why = listenWhy(now);
  const int key = (listen ? 16 : 0) | why;
  if (key == lastListenKey)
    return;
  lastListenKey = key;
  traceAdd('L', listen, why, lastPollAgeS(), pollsThisWake);
  if (listen)
  {
    listenedThisWake = true;
    traceNeedSend = true;
    if (!(why & 4))
      traceFlush();
  }
}

/** จบ long-poll 1 รอบ (res = LinkPoll) — จดเฉพาะผลผิดปกติ หรือรอนานเกินปกติ (ปกติ 25 วิ + จับมือ TLS) */
static void tracePollDone(int res, unsigned long ms)
{
  pollsThisWake++;
  lastPollEndMs = millis();
  if (res != 0 || ms > 40000UL)
    traceAdd('P', res, ms / 100);
}
#endif

// ── ประหยัดไฟ (0.2.16) ───────────────────────────────────────────────────
// ตู้ที่รอ long-poll เฉย ๆ เคยกิน ~0.2–0.5 A: วิทยุ Wi-Fi เปิดรับตลอด + CPU 240 MHz ตลอด
// 1) CPU: รอที่ 160 MHz (Wi-Fi ต้อง ≥ 80) · เปิดกล้อง/สแกน QR ใช้ 240 MHz แล้วกลับมา 160 (APB 80 MHz เท่ากัน → Serial ไม่เพี้ยน)
// 2) Wi-Fi modem sleep แบบอัตโนมัติ: เปิดเมื่อสัญญาณแรงพอ · ปิดเองเมื่อสัญญาณอ่อน หรือถาม long-poll ล้มเหลวติดกัน
#define CPU_IDLE_MHZ 160
#define CPU_BUSY_MHZ 160 // 0.2.33: ไม่ขึ้น 240 ตอนเปิดกล้อง — ลดกระแสพุ่งตอนปลุกตู้ (QVGA ถอดได้ ~5 ภาพ/วิ ที่ 160 เท่าเดิม)
#define PS_ON_RSSI -70                       // สัญญาณแรงกว่านี้ → เปิด modem sleep
#define PS_OFF_RSSI -76                      // อ่อนกว่านี้ → ปิด (ห่างจากค่าเปิด 6 dB กันสลับไปมา)
#define PS_FAIL_LIMIT 2                      // long-poll ล้มเหลวติดกันกี่ครั้งถึงถือว่า modem sleep ใช้ไม่ได้บน Wi-Fi นี้
#define PS_PENALTY_MS 1800000UL              // ปิด modem sleep 30 นาทีหลังล้มเหลว แล้วลองใหม่
#define LAN_OTA_WINDOW_MS (15UL * 60 * 1000) // แฟลชผ่าน LAN ได้ใน 15 นาทีแรกหลังเปิดเครื่อง
#define TX_LOW_ON_RSSI -58                   // สัญญาณแรงกว่านี้ → ลดกำลังส่งเหลือ 11 dBm (กระแสพุ่งตอนส่งต่ำลง)
#define TX_LOW_OFF_RSSI -66                  // อ่อนกว่านี้ → กลับไป 19.5 dBm

static bool lanOtaForced = false;   // `ota on` ทาง serial
static bool syncedThisWake = false; // ซิงก์นาฬิกาแล้วในรอบตื่นนี้ (รีเซ็ตทุกครั้งที่ตื่นจากหลับลึก)
static bool reportFailedThisWake = false; // ส่งรายงานรายวันไม่ผ่านในรอบตื่นนี้ → ไม่วนส่งซ้ำ ลองใหม่รอบตื่นถัดไป
static bool txLow = false;
static unsigned long txBlockUntil = 0; // millis() · ห้ามลดกำลังส่งจนถึงเวลานี้ (เพิ่งมีปัญหา)

static bool psApplied = false;
static uint8_t psFails = 0;
static unsigned long psPenaltyUntil = 0; // millis() · 0 = ไม่มีโทษ

static const char *psModeName() { return settings.psMode == 0 ? "auto" : settings.psMode == 1 ? "on"
                                                                                              : "off"; }

/** ควรเปิด Wi-Fi modem sleep ไหมตอนนี้ */
static bool psWanted()
{
  if (boxConfig.wifiPowerSave || settings.psMode == 1)
    return true; // เซิร์ฟเวอร์สั่งเปิด (ต่อตู้) หรือ ตั้ง ps on ทาง serial = บังคับเปิด
  if (settings.psMode == 2)
    return false;
  if (psPenaltyUntil && (long)(millis() - psPenaltyUntil) < 0)
    return false; // โหมดอัตโนมัติ: เพิ่งล้มเหลว → ปิดไว้ก่อน
  psPenaltyUntil = 0;
  if (WiFi.status() != WL_CONNECTED)
    return psApplied;
  const int rssi = WiFi.RSSI();
  return psApplied ? rssi >= PS_OFF_RSSI : rssi >= PS_ON_RSSI;
}

/** ตั้ง Wi-Fi modem sleep ตามที่ psWanted() ตัดสิน (force = ตั้งใหม่แม้ไม่เปลี่ยน เช่นหลังต่อ Wi-Fi ใหม่) */
/** ลด/เพิ่มกำลังส่ง Wi-Fi ตามสัญญาณ (ลดได้เฉพาะตอนสัญญาณแรงมาก) */
static void tuneTxPower()
{
  if (WiFi.status() != WL_CONNECTED)
    return;
  const int rssi = WiFi.RSSI();
  const bool blocked = txBlockUntil && (long)(millis() - txBlockUntil) < 0;
  if (!txLow && !blocked && rssi >= TX_LOW_ON_RSSI)
  {
    WiFi.setTxPower(WIFI_POWER_11dBm);
    txLow = true;
    Serial.printf("[power] tx power 11 dBm (rssi %d)\n", rssi);
  }
  else if (txLow && rssi < TX_LOW_OFF_RSSI)
  {
    WiFi.setTxPower(WIFI_POWER_19_5dBm);
    txLow = false;
    Serial.printf("[power] tx power 19.5 dBm (rssi %d)\n", rssi);
  }
}

static void applyWifiPs(bool force = false)
{
  tuneTxPower();
  const bool want = psWanted();
  if (!force && want == psApplied)
    return;
  WiFi.setSleep(want);
  psApplied = want;
  Serial.printf("[power] wifi modem sleep %s · mode %s%s · rssi %d\n", want ? "ON" : "off", psModeName(),
                boxConfig.wifiPowerSave ? " (server)" : "", WiFi.RSSI());
}

/** ผล long-poll แต่ละรอบ — โหมดอัตโนมัติ: ล้มเหลวติดกันขณะ modem sleep เปิด = ปิดไว้ 30 นาที */
static void psNotePoll(bool ok)
{
  if (!ok && txLow)
  {
    // ลดกำลังส่งแล้วถามไม่ผ่าน → คืนกำลังส่งเต็มและไม่ลดอีก 30 นาที
    WiFi.setTxPower(WIFI_POWER_19_5dBm);
    txLow = false;
    txBlockUntil = millis() + PS_PENALTY_MS;
    Serial.println("[power] poll failed at low tx power — back to 19.5 dBm for 30 min");
  }
  if (ok || !psApplied || settings.psMode != 0 || boxConfig.wifiPowerSave)
  {
    psFails = 0;
    return;
  }
  if (++psFails >= PS_FAIL_LIMIT)
  {
    psFails = 0;
    psPenaltyUntil = millis() + PS_PENALTY_MS;
    Serial.println("[power] polls failing with modem sleep — turning it off for 30 min");
    applyWifiPs();
  }
}

// ── Wi-Fi ──────────────────────────────────────────────────────────────
static bool wifiConnect()
{
  if (WiFi.status() == WL_CONNECTED)
    return true;
  if (!settingsHasWifi())
    return false;
  WiFi.mode(WIFI_STA);
  // modem sleep (0.2.16 โหมดอัตโนมัติ): บน Wi-Fi อ่อนโหมดประหยัดไฟเคยทำให้แพ็กเก็ตหายจน TLS ค้าง (ตู้หลุดออนไลน์)
  // จึงเปิดเฉพาะเมื่อสัญญาณแรง และปิดเองถ้าล้มเหลว · เซิร์ฟเวอร์บังคับเปิดได้ (config `wifi_power_save`) · ตู้ยังตื่นทันทีเมื่อสแกน
  // ต่อใหม่ → คืนกำลังส่งเต็มจริง ๆ (ค่าที่ลดไว้ค้างอยู่ในวิทยุข้ามการหลุด/ต่อใหม่ — ถ้าแค่ล้างตัวแปร ตู้จะส่งเบาต่อโดยไม่มีทางกู้คืน)
  WiFi.setTxPower(WIFI_POWER_19_5dBm);
  txLow = false;
  applyWifiPs(true);
  if (wifiJoin(nullptr))
  {
    Serial.printf("[wifi] connected \"%s\" IP %s RSSI %d ch %d\n", settings.wifiSsid.c_str(), WiFi.localIP().toString().c_str(),
                  WiFi.RSSI(), WiFi.channel());
    return true;
  }
  linkRtc.wifiFail++;
  Serial.printf("[wifi] connect failed (status %d)\n", (int)WiFi.status());
  return false;
}

// ── ต่อฮาร์ดแวร์เข้ากับไลบรารี (LinkHooks) ─────────────────────────────────
static LinkCredentials hookCredentials() { return {settings.url, settings.boxId, settings.secret}; }

static LinkScan hookScanQr(uint32_t timeoutMs)
{
  const QrRead q = cameraScanQr(timeoutMs);
  LinkScan r;
  r.ok = q.ok;
  r.text = q.text;
  r.ms = q.ms;
  r.frames = q.frames;
  r.qrShapes = q.qrShapes;
  r.widestPx = q.widestPx;
  r.brightness = q.brightness;
  r.err = q.err;
  return r;
}

/** กล้องทำงาน = ต้องการแรงเต็มที่ (ถอดรหัส QR) · เสร็จแล้วกลับไปความเร็วประหยัดไฟ */
static bool hookCameraStart()
{
  setCpuFrequencyMhz(CPU_BUSY_MHZ);
  const bool ok = cameraStart();
  if (!ok && !cameraRunning())
    setCpuFrequencyMhz(CPU_IDLE_MHZ);
  return ok;
}

/** 0.2.27: จดสถานะพลังงานหลังปิดกล้อง — ไว้ไล่เหตุกระแสค้าง (กล้องดับจริงไหม · CPU กลับ 160 ไหม · modem sleep เปิดไหม) */
static void logPowerAfterCamera()
{
  Serial.printf("[power] camera %s · cpu %u MHz · modem sleep %s · rssi %d\n", cameraRunning() ? "STILL ON" : "off", getCpuFrequencyMhz(),
                psApplied ? "ON" : "off", WiFi.RSSI());
}

static void hookCameraStop()
{
  cameraStop();
  if (!cameraRunning())
    setCpuFrequencyMhz(CPU_IDLE_MHZ);
  logPowerAfterCamera();
}

static void hookPowerSaveChanged()
{
  if (WiFi.status() == WL_CONNECTED)
    applyWifiPs();
}

static void hookWifiReset()
{
  settingsStashWifi(); // เก็บ Wi-Fi เดิมไว้ ตั้งใหม่ไม่ทันในเวลา → กลับไปใช้ของเดิม
  delay(300);
  ESP.restart(); // เปิดใหม่ → ไม่มี Wi-Fi → โหมดตั้งค่า (ปล่อย MAILBOX-xxxxxx)
}

static void hookStandby()
{
  settings.sleep = false;
  settingsSave();
  quietUntil = 0; // สั่งสแตนบายจากแอดมิน = ยกเลิกการพักหลังตรวจผ่าน
  // ถ้าแอดมินตั้ง sleep_outside_window ไว้ → ตื่นค้าง 2 ชม. ให้ทดสอบ แล้วกลับไปหลับตามตาราง
  const uint32_t now = nowUtc();
  if (now)
    linkRtc.awakeUntil = max<uint32_t>(linkRtc.awakeUntil, now + 2 * 3600);
  beepReady();
}

static void linkSetup()
{
  LinkHooks h;
  h.credentials = hookCredentials;
  h.cameraStart = hookCameraStart;
  h.cameraStop = hookCameraStop;
  h.wifiPowerSaveChanged = hookPowerSaveChanged;
  h.scanQr = hookScanQr;
  h.cameraAutoFlash = cameraAutoFlash;
  h.setPreviewSink = cameraSetPreviewSink;
  // 0.2.41: ไม่สลับกล้องเป็น XGA ตอนถ่าย Snapface แล้ว — ตู้รีเซ็ตหลังตรวจผ่าน ~10 วิ (ไม่มี /photo เข้าเซิร์ฟเวอร์) ตรงกับขั้น deinit/init กล้องบนถ่าน
  // ใช้กล้องที่เปิดอยู่ตอนสแกน (JPEG ฮาร์ดแวร์) ถ่ายเลย · cameraPreparePhoto ยังอยู่ใน camera_qr.cpp เผื่อกลับมาใช้เมื่อแหล่งจ่ายไฟแรงพอ
  h.preparePhoto = nullptr;
  h.snapshotJpeg = cameraSnapshotJpeg; // Snapface หลังตรวจผ่าน
  h.beep = beepByName;
  h.saveConfig = settingsSaveConfig;
  h.wifiReset = hookWifiReset;
  h.standby = hookStandby;
  linkBegin(h, FW_VERSION);
}

static bool sendBoot() { return linkBoot(); }

static bool sendReport()
{
  if (!linkReport())
    return false;
  lastReportDay = localDay(nowUtc());
  return true;
}

void cliPoll(); // ประกาศล่วงหน้า (นิยามด้านล่าง)
static void waitWithCli(unsigned long ms);

/** ถือ long-poll 1 รอบ · ต่อไม่ได้ / 401 → รอ 30 วิ (ระหว่างนั้นพิมพ์คำสั่ง serial ได้) */
static void pollOnce()
{
  // เปิดหน้าดูกล้องอยู่ → ถือ long-poll สั้น ๆ เพื่อให้เว็บเซิร์ฟเวอร์ของตู้ตอบทัน
#if SMMB_TRACE
  const unsigned long pollStartMs = millis();
#endif
  // โหมดหลับตามเวลาตรวจ: รอบสุดท้ายถามสั้นลงให้จบพอดีเวลาสิ้นสุดช่วง แล้วไปหลับทันที (ไม่ค้างถามข้ามเวลาจบ)
  uint8_t waitS = settings.debugCam ? 3 : 25;
  const uint32_t nowS = nowUtc();
  if (scheduleSleepEnabled() && nowS)
    waitS = (uint8_t)constrain((long)secondsLeftToListen(nowS), 1L, (long)waitS);
  const LinkPoll pollRes = linkPollOnce(waitS);
#if SMMB_TRACE
  tracePollDone((int)pollRes, millis() - pollStartMs);
#endif
  switch (pollRes)
  {
  case LinkPoll::Idle:
    psNotePoll(true);
    return;
  case LinkPoll::Handled:
    psNotePoll(true);
    if (linkTakeInspectPass() && scheduleSleepEnabled() && nowUtc())
      restAfterPass(nowUtc()); // loop() รอบถัดไปจะเห็น shouldListen() = false แล้วหลับเอง
    return;
  case LinkPoll::AuthFailed:
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  case LinkPoll::Offline:
    psNotePoll(false);
    if (WiFi.status() != WL_CONNECTED)
      wifiConnect();
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
}

// ── หลับลึก ────────────────────────────────────────────────────────────
static void sleepUntilNextEvent();

/**
 * ติดปัญหาเชื่อมต่อ (Wi-Fi หลุด / boot ไม่ผ่าน) แล้ว "ควรเลิกรอแล้วไปหลับ" ไหม — true = หลับไปแล้ว (ไม่กลับมา)
 * เดิมตู้วนลองใหม่ทุก 30 วิ ไปตลอดแม้พ้นเวลาตรวจ = กินไฟ ~0.15 A ไม่จบจนแบตหมด
 * - มีนาฬิกา: พ้นช่วงที่ต้องถือสายแล้ว → หลับตามตาราง (ตื่นรอบถัดไป ≤ 30 นาที แล้วลองต่อใหม่เอง)
 * - ยังไม่มีนาฬิกา (เพิ่งเปิดเครื่อง): ให้เวลา GIVE_UP_AWAKE_MS ก่อน เผื่อคนกำลังตั้งค่าอยู่หน้าตู้
 */
static bool sleepIfNoReasonToStayAwake()
{
  if (!scheduleSleepEnabled())
    return false;
  const uint32_t t = nowUtc();
  if (t ? shouldListen() : millis() < GIVE_UP_AWAKE_MS)
    return false;
  Serial.println("[sleep] link problem and nothing to wait for — sleep and retry next wake");
  sleepUntilNextEvent();
  return true;
}

static void sleepUntilNextEvent()
{
  uint32_t now = nowUtc();
  uint32_t s = secondsToNextEvent(now);
  if (!scheduleSleepEnabled())
  {
    static unsigned long lastMsg = 0;
    if (millis() - lastMsg > 60000)
    {
      Serial.printf("[sleep] (sleep off) next event in %u s — staying awake\n", s);
      lastMsg = millis();
    }
    unsigned long t = millis();
    while (millis() - t < 1000)
    {
      debugViewPoll();
      delay(10);
    }
    return;
  }
  // นาฬิกาภายในของ ESP32 (RC ~150 kHz ไม่มีแบตนาฬิกา) เพี้ยนได้ ~1–3% ตอนหลับนาน (หลับ 14 ชม. เพี้ยนได้ 8–25 นาที > เผื่อ 3 นาที)
  // เพดาน 30 นาทีต่อรอบ: ถ้าหลับครึ่งทางยาวหลายชั่วโมง ตู้จะไม่รู้เลยว่าหัวหน้าเพิ่งเปลี่ยนเวลาตรวจ (รับ config ได้ตอนตื่นซิงก์เท่านั้น)
  // จึงหลับ "ครึ่งทาง": ตื่นมาซิงก์เวลากับเซิร์ฟเวอร์ (X-Server-Time) แล้วคำนวณใหม่ · รอบสุดท้ายเหลือ ≤ 10 นาที เพี้ยนได้ไม่เกินราวครึ่งนาที
  uint32_t sleepS = s;
  if (s > SLEEP_HOP_FINAL_S)
    sleepS = min<uint32_t>(max<uint32_t>(s / 2, SLEEP_HOP_FINAL_S / 2), SLEEP_HOP_MAX_S);
  Serial.printf("[sleep] deep sleep %u s (next event in %u s)\n", sleepS, s);
#if SMMB_TRACE
  // จดการตัดสินใจหลับ + ส่งบันทึกของรอบตื่นนี้ขึ้นเซิร์ฟเวอร์ (ขณะ Wi-Fi ยังเปิด · เสียเวลา ~1–3 วิ ก่อนไฟตก)
  traceAdd('D', sleepS, s, lastPollAgeS(), pollsThisWake);
  traceFlush();
#endif
  linkEvent("sleeping"); // แจ้งเซิร์ฟเวอร์ว่าตู้หลับแล้ว (ปลุกด้วยสแกนไม่ได้) ก่อนปิด Wi-Fi · 0.2.40
  Serial.flush();
  cameraStop();
  buzzerHoldOffForSleep();
  WiFi.disconnect(true);
  WiFi.mode(WIFI_OFF);
  // ไฟแฟลช GPIO4 ลอยตอนหลับ → ล็อกให้ดับ
  digitalWrite(PIN_FLASH_LED, LOW);
  rtc_gpio_hold_en((gpio_num_t)PIN_FLASH_LED);
  cameraSensorSleep();
  rtc_gpio_hold_en((gpio_num_t)CAM_PIN_PWDN); // เซนเซอร์กล้องหลับตลอดช่วงหลับลึก
  esp_sleep_enable_timer_wakeup((uint64_t)sleepS * 1000000ULL);
  esp_deep_sleep_start();
}

// ── คำสั่งทาง Serial ─────────────────────────────────────────────────────
static String cliLine;

static void printStatus()
{
  uint32_t now = nowUtc();
  Serial.printf("fw %s · box %s · url %s · secret %s · wifi \"%s\" (%s)\n", FW_VERSION, settings.boxId.c_str(), settings.url.c_str(),
                settings.secret.length() == 64 ? "set" : "MISSING", settings.wifiSsid.c_str(),
                WiFi.status() == WL_CONNECTED ? WiFi.localIP().toString().c_str() : "offline");
  Serial.printf("clock %s · local %02u:%02u · config v%u windows %u · in window %s · awake left %d s · sleep %s\n",
                now ? "set" : "NOT SET", now ? localMinute(now) / 60 : 0, now ? localMinute(now) % 60 : 0, boxConfig.ver,
                boxConfig.windowCount, now && inWindow(now) ? "yes" : "no", (int)(linkRtc.awakeUntil > now ? linkRtc.awakeUntil - now : 0),
                settings.sleep ? "on" : "off");
  Serial.printf("schedule sleep %s (serial %s · server %s) · next wake in %u s\n", scheduleSleepEnabled() ? "ON" : "off", settings.sleep ? "on" : "off",
                boxConfig.sleepOutsideWindow ? "on" : "off", now ? secondsToNextEvent(now) : 0);
  Serial.printf("power · cpu %u MHz · wifi modem sleep %s · mode %s%s\n", getCpuFrequencyMhz(), psApplied ? "ON" : "off", psModeName(),
                boxConfig.wifiPowerSave ? " (server forces on)" : "");
  for (uint8_t i = 0; i < boxConfig.windowCount; i++)
    Serial.printf("  window %02u:%02u-%02u:%02u\n", boxConfig.winStart[i] / 60, boxConfig.winStart[i] % 60, boxConfig.winEnd[i] / 60,
                  boxConfig.winEnd[i] % 60);
}

static void runCommand(String line)
{
  line.trim();
  if (!line.length())
    return;
  int sp = line.indexOf(' ');
  String cmd = sp < 0 ? line : line.substring(0, sp);
  String arg = sp < 0 ? "" : line.substring(sp + 1);
  arg.trim();
  cmd.toLowerCase();

  if (cmd == "help")
  {
    Serial.println(
        "commands:\n"
        "  status                 show settings / clock / config\n"
        "  wifi <ssid> <pass>     set home Wi-Fi (ssid without spaces; use the portal for others)\n"
        "  url <https://...>      server base URL, e.g. https://hub.sjp-dev.net/smmb-api\n"
        "  box <BX-00003>         box id\n"
        "  secret <64 hex>        device secret (not echoed)\n"
        "  sleep on|off           off (default) = always long-poll so a scan wakes the box at once; on = scheduled deep sleep (saves power, cannot be woken)\n"
        "  ota on|off             LAN firmware flashing (ArduinoOTA): on for the first 15 min after boot; `ota on` keeps it on until reboot\n"
        "  ps auto|on|off         Wi-Fi modem sleep: auto (default) = on when signal is strong, off by itself if polls fail · on/off = fixed (server wifi_power_save=true always forces on)\n"
        "  selftest               check request signing against the guide's test vectors\n"
        "  boot                   send POST /v1/box/boot now\n"
        "  report                 send POST /v1/box/report now\n"
        "  beep [ready|pass|retry|fail|error|wifi]  play a buzzer pattern (default ready)\n"
        "  siren                  show siren timing (LTE-5061J ticks on its own rhythm)\n"
        "  siren hold <ms>        power the siren for <ms> — count the ticks: period = ms / ticks\n"
        "  siren period <ms>      time between ticks (200..3000, saved)\n"
        "  siren lead <ms>        delay from power-on to the first tick (0..2000, saved)\n"
        "  siren test <n>         play exactly n ticks with the saved timing\n"
        "  identify               blink the flash LED (find this board)\n"
        "  scan [sec]             open the camera and try to read a QR (no server)\n"
        "  photo                  test the face-photo mode: prints the JPEG size only (nothing is sent or kept)\n"
        "  debugcam on|off        live camera page http://<box ip>/?k=<key> (test only, off by default)\n"
        "  camweb [sec]           the same page, temporarily (default 120 s)\n"
        "  portal                 start the Wi-Fi setup portal\n"
        "  forget                 forget Wi-Fi and restart\n"
        "  factory                erase ALL saved settings (Wi-Fi, url, box, secret, camera, config) and restart as a new board\n"
        "  reboot");
  }
  else if (cmd == "status")
  {
    printStatus();
  }
  else if (cmd == "wifi")
  {
    int s2 = arg.indexOf(' ');
    settings.wifiSsid = s2 < 0 ? arg : arg.substring(0, s2);
    settings.wifiPass = s2 < 0 ? "" : arg.substring(s2 + 1);
    settingsSave();
    Serial.printf("wifi set to \"%s\" — reboot to apply\n", settings.wifiSsid.c_str());
  }
  else if (cmd == "url")
  {
    while (arg.endsWith("/"))
      arg.remove(arg.length() - 1);
    settings.url = arg;
    settingsSave();
    Serial.printf("url = %s\n", settings.url.c_str());
  }
  else if (cmd == "box")
  {
    arg.toUpperCase();
    settings.boxId = arg;
    settingsSave();
    Serial.printf("box = %s\n", settings.boxId.c_str());
  }
  else if (cmd == "secret")
  {
    arg.toLowerCase();
    if (arg.length() != 64)
    {
      Serial.println("secret must be 64 hex characters");
      return;
    }
    settings.secret = arg;
    settingsSave();
    Serial.println("secret saved");
  }
  else if (cmd == "sleep")
  {
    settings.sleep = arg != "off";
    settingsSave();
    Serial.printf("sleep %s\n", settings.sleep ? "on" : "off");
  }
  else if (cmd == "ota")
  {
    lanOtaForced = arg != "off";
    Serial.printf("lan ota %s\n", lanOtaForced ? "on (until reboot)" : "off (first 15 min after boot only)");
  }
  else if (cmd == "ps")
  {
    if (arg == "auto" || arg == "on" || arg == "off")
    {
      settings.psMode = arg == "auto" ? 0 : arg == "on" ? 1
                                                        : 2;
      settingsSave();
      psPenaltyUntil = 0;
      psFails = 0;
      if (WiFi.status() == WL_CONNECTED)
        applyWifiPs();
    }
    Serial.printf("ps %s · modem sleep now %s\n", psModeName(), psApplied ? "ON" : "off");
  }
  else if (cmd == "selftest")
  {
    Serial.println(linkSelfTest(true) ? "selftest PASS" : "selftest FAIL");
  }
  else if (cmd == "boot")
  {
    if (wifiConnect())
      sendBoot();
  }
  else if (cmd == "report")
  {
    if (wifiConnect())
      sendReport();
  }
  else if (cmd == "scan")
  {
    uint32_t sec = arg.length() ? arg.toInt() : 20;
    if (hookCameraStart())
    {
      cameraAutoFlash(boxConfig.flashWhenDark);
      QrRead q = cameraScanQr(sec * 1000);
      Serial.printf("scan: %s\n", q.ok ? q.text.c_str() : "(nothing)");
      hookCameraStop();
    }
  }
  else if (cmd == "photo")
  {
    // ทดสอบโหมดถ่ายใบหน้าตามลำดับงานจริง · รายงานแค่ขนาดไฟล์ ไม่ส่งและไม่เก็บภาพ
    if (hookCameraStart())
    {
      cameraAutoFlash(boxConfig.flashWhenDark);
      const uint32_t startedAt = millis();
      const bool prepared = cameraPreparePhoto();
      const uint32_t preparedMs = millis() - startedAt;
      uint8_t *jpeg = nullptr;
      size_t len = 0;
      const bool ok = cameraSnapshotJpeg(&jpeg, &len) && jpeg;
      Serial.printf("photo: prepared %s in %u ms · captured %s · %u B · total %u ms\n", prepared ? "yes" : "no", preparedMs, ok ? "yes" : "no", (unsigned)len,
                    millis() - startedAt);
      free(jpeg);
      hookCameraStop();
    }
  }
  else if (cmd == "debugcam")
  {
    // หน้าเว็บดูภาพกล้องตอนทดสอบ — ปิดเป็นค่าเริ่มต้น (กล้องตู้มองถนน) · เก็บค่าถาวร
    if (arg == "on" || arg == "off")
    {
      settings.debugCam = arg == "on";
      settingsSave();
      if (settings.debugCam)
      {
        if (WiFi.status() == WL_CONNECTED)
          debugViewStart();
        else
          Serial.println("debugcam on — จะเปิดเมื่อต่อ Wi-Fi ได้");
      }
      else
      {
        debugViewStop();
        Serial.println("debugcam off");
      }
    }
    else
    {
      Serial.printf("debugcam %s%s\n", settings.debugCam ? "on" : "off", debugViewRunning() ? (String(" · ") + debugViewUrl()).c_str() : "");
    }
  }
  else if (cmd == "camweb")
  {
    // ทางลัด: เปิดหน้าดูกล้องชั่วคราว N วินาที (ไม่เก็บค่า) — ปิดเองเมื่อครบเวลา
    // camweb [วินาที] [scan] — ค่าเริ่มต้น "ดูภาพอย่างเดียว": ไม่ถอดรหัส QR ไม่คุยกับเซิร์ฟเวอร์ · ใส่ scan = ให้หาและถอดรหัส QR ด้วย
    uint32_t sec = arg.toInt() > 0 ? arg.toInt() : 120;
    cameraPreviewDecode(arg.indexOf("scan") >= 0);
    if (WiFi.status() != WL_CONNECTED)
    {
      Serial.println("camweb: ยังไม่ต่อ Wi-Fi");
    }
    else
    {
      const bool wasRunning = debugViewRunning();
      debugViewStart();
      Serial.printf("camweb: เปิด %s (%u วิ)\n", debugViewUrl().c_str(), sec);
      unsigned long t = millis();
      while (millis() - t < sec * 1000UL)
      {
        debugViewPoll();
        debugViewIdleCheck();
        cliPoll();
        delay(5);
      }
      if (!wasRunning && !settings.debugCam)
        debugViewStop();
      cameraPreviewDecode(true);
      Serial.println("camweb: ปิดแล้ว");
    }
  }
  else if (cmd == "camraw")
  {
    rawViewRun(arg.toInt() > 0 ? arg.toInt() : 300); // ภาพสดดิบ MJPEG ไม่ผ่านตัวกรอง/ถอดรหัส
  }
  else if (cmd == "snap")
  {
    cameraDumpFrame(); // ดูภาพที่กล้องเห็น (python แปลง hex เป็นรูป)
  }
  else if (cmd == "portal")
  {
    debugViewStop();
    if (runSetupPortal(PORTAL_TIMEOUT_MS))
      ESP.restart();
  }
  else if (cmd == "forget")
  {
    settingsForgetWifi();
    ESP.restart();
  }
  else if (cmd == "factory")
  {
    // คืนเป็นบอร์ดใหม่: ลบทุกอย่างที่จำไว้ (Wi-Fi · url · box · secret · ค่ากล้อง · config) แล้วเข้าโหมดตั้งค่า
    Preferences wipe;
    wipe.begin("smmb", false);
    wipe.clear();
    wipe.end();
    Serial.println("[factory] all saved settings erased - restarting into setup mode");
    delay(300);
    ESP.restart();
  }
  else if (cmd == "cam")
  {
    // cam size qvga|vga|svga|xga · cam xclk 10|20 · cam ae -2..2 — ปรับกล้องโดยไม่ต้องแฟลชใหม่ (มีผลหลังรีบูต)
    int sp2 = arg.indexOf(' ');
    String what = sp2 < 0 ? arg : arg.substring(0, sp2);
    String val = sp2 < 0 ? "" : arg.substring(sp2 + 1);
    val.trim();
    if (what == "size" && (val == "qvga" || val == "vga" || val == "svga" || val == "xga"))
      settings.camSize = val;
    else if (what == "xclk" && (val == "10" || val == "20"))
      settings.camXclk = val.toInt();
    else if (what == "bench")
      cameraBench();
    else if (what == "q" && val.toInt() >= 4 && val.toInt() <= 30)
      settings.camQ = val.toInt();
    else if (what == "sharp" && val.toInt() >= -3 && val.toInt() <= 3)
      settings.camSharp = val.toInt();
    else if (what == "flip" && val.toInt() >= 0 && val.toInt() <= 3)
      settings.camFlip = val.toInt(); // 0 ไม่กลับ · 1 บน-ล่าง · 2 ซ้าย-ขวา · 3 หมุน 180°
    else if (what == "fmt" && (val == "jpeg" || val == "gray"))
      settings.camJpeg = val == "jpeg";
    else if (what == "ae" && val.toInt() >= -2 && val.toInt() <= 2)
      settings.camAe = val.toInt();
    else
      Serial.println("usage: cam size qvga|vga|svga|xga · cam xclk 10|20 · cam fmt jpeg|gray · cam q 4..30 · cam sharp -2..2 · cam ae -2..2");
    settingsSave();
    Serial.printf("cam size=%s xclk=%uMHz fmt=%s q=%u sharp=%d ae=%d — applies on next camera start\n", settings.camSize.c_str(), settings.camXclk, settings.camJpeg ? "jpeg" : "gray", settings.camQ, settings.camSharp, settings.camAe);
  }
  else if (cmd == "beep")
  {
    String name = arg.length() ? arg : "ready";
    name.toLowerCase();
    if (!beepByName(name.c_str()))
      Serial.println("usage: beep [ready|pass|retry|fail|error|wifi]");
  }
  else if (cmd == "siren")
  {
    // 0.2.45: ปรับจังหวะให้ตรงกับตัวส่งเสียงจริง — ดูวิธีวัดใน docs/HARDWARE_FIRMWARE_GUIDE.md §9
    int sp2 = arg.indexOf(' ');
    String what = sp2 < 0 ? arg : arg.substring(0, sp2);
    const long val = sp2 < 0 ? -1 : arg.substring(sp2 + 1).toInt();
    if (what == "hold" && val > 0 && val <= 20000)
    {
      Serial.printf("siren: power on for %ld ms — count the ticks\n", val);
      sirenHold((uint32_t)val);
    }
    else if (what == "period" && val >= 200 && val <= 3000)
    {
      settings.sirenPeriodMs = (uint16_t)val;
      settingsSave();
    }
    else if (what == "lead" && val >= 0 && val <= 2000)
    {
      settings.sirenLeadMs = (uint16_t)val;
      settingsSave();
    }
    else if (what == "test" && val >= 1 && val <= 9)
    {
      sirenTicks((uint8_t)val);
    }
    else if (what.length())
    {
      Serial.println("usage: siren · siren hold <ms> · siren period <ms> · siren lead <ms> · siren test <n>");
    }
    Serial.printf("siren period %u ms · lead %u ms · 1 tick = %u ms on · 2 ticks = %u ms on\n", settings.sirenPeriodMs, settings.sirenLeadMs,
                  settings.sirenLeadMs + settings.sirenPeriodMs / 2, settings.sirenLeadMs + settings.sirenPeriodMs + settings.sirenPeriodMs / 2);
  }
  else if (cmd == "identify")
  {
    Serial.println("[identify] blink flash LED");
    for (int i = 0; i < 6; i++)
    {
      digitalWrite(PIN_FLASH_LED, HIGH);
      delay(120);
      digitalWrite(PIN_FLASH_LED, LOW);
      delay(120);
    }
  }
  else if (cmd == "reboot")
  {
    ESP.restart();
  }
  else
  {
    Serial.println("unknown command — type help");
  }
}

void cliPoll()
{
  while (Serial.available())
  {
    char c = (char)Serial.read();
    if (c == '\r')
      continue;
    if (c == '\n')
    {
      String line = cliLine;
      cliLine = "";
      runCommand(line);
    }
    else if (cliLine.length() < 200)
    {
      cliLine += c;
    }
  }
}

/** รอคำสั่ง Serial ระหว่าง delay (ให้พิมพ์คำสั่งได้ตลอด) */
static void waitWithCli(unsigned long ms)
{
  unsigned long t = millis();
  while (millis() - t < ms)
  {
    esp_task_wdt_reset();
    cliPoll();
    debugViewPoll();
    delay(20);
  }
}

// ── setup / loop ───────────────────────────────────────────────────────
void setup()
{
  setCpuFrequencyMhz(CPU_IDLE_MHZ);            // ประหยัดไฟ: รอที่ 160 MHz (กล้อง/สแกนเปลี่ยนเป็น 240 เอง)
  rtc_gpio_hold_dis((gpio_num_t)CAM_PIN_PWDN); // ปลดล็อกจากตอนหลับลึก
  cameraSensorSleep();                         // เซนเซอร์กล้องกินไฟแม้ไม่ได้ใช้ ถ้าขา PWDN ลอย — สั่งให้หลับตั้งแต่เปิดเครื่อง
  buzzerInit();                                // ตั้งขา 13 ให้ LOW เร็วที่สุด — ช่วงรีเซ็ตขาลอย ไซเรนอาจดังแว้บ
  Serial.begin(115200);
  rtc_gpio_hold_dis((gpio_num_t)PIN_FLASH_LED);
  pinMode(PIN_FLASH_LED, OUTPUT);
  digitalWrite(PIN_FLASH_LED, LOW);
  linkRtc.wakeCount++;
  delay(200);
  Serial.printf("\n\nSMMB box firmware %s · reset %s · type 'help'\n", FW_VERSION, linkResetReason());

  settingsLoad();
  linkSetup();
  wifiDiagInit();
  if (!linkSelfTest(false))
    Serial.println("!! signer self-test FAILED — requests will be rejected");

  const bool fromSleep = esp_reset_reason() == ESP_RST_DEEPSLEEP;

#if SMMB_TRACE
  {
    // จดสภาพตอนตื่น: เหตุผลรีเซ็ต · ตัวนับตื่นค้างเหลือ · อยู่ในเวลาตรวจ/ช่วงตื่นไหม · โหมดหลับเปิดไหม · มีนาฬิกาไหม
    const uint32_t t = nowUtc();
    traceAdd('W', (int)esp_reset_reason(), (t && linkRtc.awakeUntil > t) ? (long)(linkRtc.awakeUntil - t) : 0,
             (t && inWindow(t) ? 1 : 0) | (t && inListenTime(t) ? 2 : 0) | (scheduleSleepEnabled() ? 4 : 0) | (t ? 8 : 0), linkRtc.wakeCount);
  }
#endif

  // ให้เวลาพิมพ์คำสั่งตั้งค่าตอนเปิดเครื่อง (เช่น url / box / secret) ก่อนเริ่มทำงาน
  if (!fromSleep)
    waitWithCli(1500);

  // ยังไม่ได้ตั้ง → โหมดตั้งค่า (รอจนตั้งสำเร็จ)
  while (!settingsHasWifi() || !settingsProvisioned())
  {
    if (!settingsProvisioned())
      Serial.println("[setup] box not provisioned (url / box / secret) — use the portal or serial commands");
    if (runSetupPortal(PORTAL_TIMEOUT_MS) && settingsProvisioned())
    {
      settingsClearStashedWifi();
      break;
    }
    // เจ้าของสั่งเปลี่ยน Wi-Fi แต่ตั้งใหม่ไม่ทันในเวลา → กลับไปใช้ Wi-Fi เดิม (กันตู้หลุดออนไลน์ถาวร)
    if (settingsRestoreWifi())
    {
      Serial.println("[setup] no new Wi-Fi in time — back to the previous Wi-Fi");
      break;
    }
  }

  if (!wifiConnect())
  {
    // ตื่นจากหลับลึกแล้วต่อไม่ได้ → ไม่ร้อง: ตัวจำ "เว้น 10 นาที" หายทุกครั้งที่หลับลึก Wi-Fi บ้านล่มทั้งคืนไซเรนจะดังทุกรอบตื่น
    // (ถ้าอยู่ในช่วงที่ต้องตื่น loop() จะร้องให้เองครั้งเดียวตอนลองต่อใหม่)
    if (!fromSleep)
      linkBeepErrorQuiet();
    if (fromSleep)
    {
      // ตื่นมาแล้วต่อไม่ได้ → หลับแล้วลองรอบถัดไป · แต่ถ้าอยู่ในช่วงที่ต้องตื่นแล้ว (ก่อนต้นช่วง 2 นาที–จบช่วง) ห้ามหลับ:
      // เดิมหลับต่อ ~30 นาทีจนข้ามช่วงตรวจทั้งช่วง → ปล่อยให้ loop() ลองต่อใหม่ทุก 30 วิ
      const uint32_t t = nowUtc();
      if (!(t && inListenTime(t)))
      {
        sleepUntilNextEvent();
        return;
      }
      Serial.println("[wifi] still in listen time — staying awake and retrying every 30 s");
    }
    else
      // เปิดเครื่องแล้วต่อ Wi-Fi เดิมไม่ได้ → โหมดตั้งค่า (ระหว่างนั้นยังลองต่อ Wi-Fi เดิมได้จากหน้าเว็บ)
      if (!runSetupPortal(PORTAL_TIMEOUT_MS))
        ESP.restart();
  }

  if (!fromSleep || !clockSet())
    sendBoot();

  // กันค้างเงียบ: ถ้าลูปหลักไม่ขยับเกิน 180 วิ (เช่น TLS/Wi-Fi ค้าง) ให้รีเซ็ตตัวเอง แทนที่จะรอคนถอดไฟ
  // (รอบเดียวของลูปที่นานที่สุด = long-poll 55 วิ หรือสแกน 3 × 20 วิ จึงเผื่อไว้)
  esp_task_wdt_init(180, true);
  esp_task_wdt_add(nullptr);
}

void loop()
{
  esp_task_wdt_reset();
  cliPoll();
  if (linkLanOtaBusy())
  {
    delay(50);
    return;
  }
  // แฟลชผ่าน LAN เปิดแค่ 15 นาทีแรกหลังเปิดเครื่อง (ArduinoOTA + mDNS ตื่นทุก 20 ms กินไฟตลอด) · ภาคสนามอัปเดตผ่านเซิร์ฟเวอร์ · ต้องการใหม่ = รีบูต หรือพิมพ์ `ota on`
  if (lanOtaForced || millis() < LAN_OTA_WINDOW_MS)
    linkLanOtaStart(apName());
  else
    linkLanOtaStop();
  if (settings.debugCam && WiFi.status() == WL_CONNECTED)
  {
    debugViewStart();
    debugViewPoll();
    debugViewIdleCheck();
  }
  if (WiFi.status() != WL_CONNECTED && !wifiConnect())
  {
#if SMMB_TRACE
    traceAdd('E', 1, (int)WiFi.status()); // Wi-Fi หลุดและต่อใหม่ไม่ได้ (ตื่นค้างรอลองใหม่ ไม่ได้หลับ)
#endif
    if (sleepIfNoReasonToStayAwake()) // พ้นเวลาตรวจแล้ว ไม่ต้องตื่นรอ Wi-Fi — หลับแล้วลองใหม่รอบถัดไป
      return;
    linkBeepErrorQuiet(); // Wi-Fi บ้านล่มทั้งคืน → ไม่ร้องทุกครึ่งนาที
    waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
  if (!linkBooted() && !clockSet())
  {
    if (!sendBoot() && !sleepIfNoReasonToStayAwake())
      waitWithCli(RETRY_IN_WINDOW_MS);
    return;
  }
  applyWifiPs(); // ตรวจสัญญาณซ้ำทุกรอบ (เปิด/ปิด modem sleep อัตโนมัติ · ไม่เปลี่ยน = ไม่ทำอะไร)
  uint32_t now = nowUtc();
  // รายงานรายวัน: ถึงเวลาแล้ววันนี้ยังไม่ได้รายงาน
  // ส่งไม่ผ่าน → ไม่วนส่งซ้ำในรอบตื่นนี้ (เดิมวนไม่หยุดจนไม่ได้หลับ) ปล่อยให้ไปต่อ/หลับ แล้วลองใหม่รอบตื่นถัดไป
  if (now && !reportFailedThisWake && localMinute(now) >= boxConfig.reportAt && lastReportDay != localDay(now))
  {
    if (!sendReport())
      reportFailedThisWake = true;
    return;
  }
#if SMMB_TRACE
  traceListenState(now); // จดเมื่อสถานะ "ต้องถือสายไหม + เพราะอะไร" เปลี่ยน
#endif
  const bool listen = shouldListen();
  // ซิงก์นาฬิกา + รับ config/คำสั่งแอดมิน 1 รอบ (คำขอสั้น wait=1 → ตั้งเวลาจาก X-Server-Time) รอบตื่นละครั้ง:
  // - ตื่นจากหลับลึก → ซิงก์ก่อนถือ long-poll เสมอ (นาฬิกาตอนหลับเพี้ยนได้ 1–3% · long-poll ไม่ตั้งนาฬิกา ถ้าไม่ซิงก์ตรงนี้จะเพี้ยนค้างทั้งช่วงตรวจ)
  // - จะหลับต่อ → ซิงก์ก่อนคำนวณเวลาหลับรอบถัดไป
  if (!syncedThisWake && (esp_reset_reason() == ESP_RST_DEEPSLEEP || (!listen && scheduleSleepEnabled())))
  {
    syncedThisWake = true;
    Serial.println("[clock] sync with server (once per wake)");
#if SMMB_TRACE
    const unsigned long syncStartMs = millis();
    linkLastClockDeltaValid = false; // ให้รู้ว่ารอบนี้ได้ค่าเทียบนาฬิกาใหม่จริงไหม
    const LinkPoll syncRes = linkPollOnce(1);
    const unsigned long syncMs = millis() - syncStartMs;
    lastPollEndMs = millis();
    traceAdd('S', linkLastClockDeltaValid ? linkLastClockDeltaS : 0, linkLastClockDeltaValid, (int)syncRes, syncMs / 100);
#else
    linkPollOnce(1);
#endif
    return;
  }
  if (listen)
  {
    pollOnce();
    return;
  }
  sleepUntilNextEvent();
}
