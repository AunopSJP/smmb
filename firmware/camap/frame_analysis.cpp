#include "frame_analysis.h"

#include <Arduino.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include <freertos/task.h>
#include <human_face_detect_msr01.hpp>
#include <img_converters.h>
#include <quirc/quirc.h>
#include "qr_scan.h"
#include <memory>

// การวิเคราะห์ภาพ (QR / ใบหน้า) ทำใน "งานเบื้องหลัง" บนแกน 1 — ตัวส่งภาพสด (inspect) แค่ก๊อปเฟรมให้แล้วไปต่อทันที
// เดิมวิเคราะห์ในลูปส่งภาพเอง (ถือล็อกกล้องไว้) ทุกรอบสแกนภาพจึงค้างหลายร้อย ms แล้วกระตุกเป็นจังหวะ
namespace {
constexpr uint32_t INTERVAL_MS = 600;
constexpr uint32_t RESULT_TTL_MS = 4000;
#ifdef CAMTEST
// camtest: วิเคราะห์ที่ความละเอียดเต็มของภาพที่เลือก (ไม่ลดครึ่ง) — เลือก 320×240 = เทียบกับตู้จริง · 640×480 = ดูว่าละเอียดขึ้นช่วยไหม
constexpr int DECIMATION = 1;
constexpr jpg_scale_t JPEG_SCALE = JPG_SCALE_NONE;
constexpr size_t MAX_PIXELS = 640 * 480;
#else
constexpr int DECIMATION = 2;
constexpr jpg_scale_t JPEG_SCALE = JPG_SCALE_2X;
constexpr size_t MAX_PIXELS = 320 * 240;
#endif
constexpr size_t QR_TEXT_LIMIT = 512;
constexpr size_t FACE_LIMIT = 4;
constexpr size_t QR_BOX_LIMIT = 4;
constexpr uint32_t QR_BOX_TTL_MS = 2000;
constexpr uint32_t WORKER_STACK_BYTES = 12288;
constexpr UBaseType_t WORKER_PRIORITY = 1;  // ต่ำกว่า Wi-Fi และเซิร์ฟเวอร์ภาพ — ไม่แย่งเวลาส่งภาพ
constexpr BaseType_t WORKER_CORE = 1;       // แกน 1 (ลูปหลักของ Arduino ว่างอยู่) · Wi-Fi/เซิร์ฟเวอร์ทำงานแกน 0

struct FaceBox {
  float x, y, width, height;
};

// กรอบล้อม QR: มุม 4 จุด (พิกเซลของภาพที่วิเคราะห์) ของทุกรูปทรงที่เจอ แม้ถอดรหัสไม่ได้ · เห็นเฉพาะรอบสแกนล่าสุด
struct QrBox {
  int16_t x[4];
  int16_t y[4];
  bool decoded;
};

// ผลการสแกน QR หนึ่งรอบ (คำนวณในตัวแปรของงานเบื้องหลังก่อน แล้วค่อยส่งเข้าผลรวมครั้งเดียวใต้ล็อก)
struct QrResult {
  QrBox boxes[QR_BOX_LIMIT];
  size_t count = 0;
  int width = 0;
  int height = 0;
  bool hasText = false;
  int path = 0;  // QR_PATH_* ที่ถอดได้ (2/4 = ภาพกระจก)
  int pass = 0;  // 1 = รอบแรก · 2 = รอบสอง (ลับขอบ)
  char text[QR_TEXT_LIMIT + 1] = {};
};

template <typename T>
using PsramBuffer = std::unique_ptr<T, decltype(&free)>;

// ── ส่วนที่เรียกจากเธรดเซิร์ฟเวอร์ (ทุกทางเข้าอยู่ใต้ cameraMutex ใน main.cpp จึงไม่ชนกันเอง) ──
#ifdef CAMTEST
bool enabled = true;  // camtest: วิเคราะห์ QR ตั้งแต่เปิดหน้า (ไม่ตรวจใบหน้า — เบาลง)
#else
bool enabled = false;
#endif
bool scanQrNext = true;
uint32_t lastScan = 0;
uint32_t generation = 0;  // เพิ่มทุกครั้งที่ล้างผล (เปิด/ปิดวิเคราะห์) — งานที่ค้างอยู่ตอนนั้นทิ้งผลของตัวเอง
uint32_t jobGeneration = 0;
TaskHandle_t worker = nullptr;
uint8_t *jpegCopy = nullptr;  // สำเนา JPEG ของเฟรมที่รอวิเคราะห์ (งานเบื้องหลังอ่านต่อได้แม้เฟรมจริงถูกคืนกล้องไปแล้ว)
size_t jpegCap = 0;
size_t jpegLen = 0;
int jpegWidth = 0;
int jpegHeight = 0;
volatile bool jobPending = false;  // true = มีเฟรมรอ/กำลังวิเคราะห์ (ระหว่างนี้ไม่รับเฟรมใหม่)

// ── ผลลัพธ์: งานเบื้องหลังเขียน เธรดเซิร์ฟเวอร์อ่าน — ครอบด้วย resultLock ──
SemaphoreHandle_t resultLock = nullptr;
uint32_t lastQr = 0;
uint32_t lastFace = 0;
char qrText[QR_TEXT_LIMIT + 1] = {};
FaceBox faces[FACE_LIMIT];
size_t faceCount = 0;
QrBox qrBoxes[QR_BOX_LIMIT];
size_t qrBoxCount = 0;
int qrBoxWidth = 0;
int qrBoxHeight = 0;
uint32_t lastBoxScan = 0;
int lastPath = 0;        // เส้นทางที่ถอดได้ล่าสุด (QR_PATH_*)
int lastPass = 0;
uint32_t runs = 0;       // จำนวนรอบวิเคราะห์ที่เสร็จ (ไว้ดูว่างานเบื้องหลังยังทำงาน)
uint32_t lastJobMs = 0;  // เวลาวิเคราะห์จริงของรอบล่าสุด — ใช้ยืดอายุกรอบไม่ให้กะพริบหายระหว่างรอ

// ── ใช้ในงานเบื้องหลังเท่านั้น ──
uint16_t *pixelBuf = nullptr;  // จองครั้งเดียวใน PSRAM (เดิมจอง+ล้างศูนย์ทุกรอบ)

// ล็อกสร้างครั้งแรกที่ถูกเรียก — ทุกทางเข้าอยู่ใต้ cameraMutex อยู่แล้ว จึงไม่มีสองเธรดสร้างพร้อมกัน
void ensureLock() {
  if (!resultLock) resultLock = xSemaphoreCreateMutex();
}

struct ResultGuard {
  ResultGuard() {
    if (resultLock) xSemaphoreTake(resultLock, portMAX_DELAY);
  }
  ~ResultGuard() {
    if (resultLock) xSemaphoreGive(resultLock);
  }
};

// แปลงพิกเซล RGB565 เป็นภาพเทา: 2·(R5+B5) + 2·G6
void rgb565ToGray(uint8_t *gray, const uint16_t *pixels, int count) {
  for (int index = 0; index < count; ++index) {
    const uint16_t pixel = pixels[index];
    const uint16_t green = (pixel >> 5) & 63;
    const uint16_t redAndBlue = ((pixel >> 11) & 31) + (pixel & 31);
    gray[index] = static_cast<uint8_t>(2 * redAndBlue + 2 * green);
  }
}

// สแกน QR: กระบวนการทั้งหมดอยู่ใน qr_scan.h (กลับด้านเอง · สุ่มภาพเทา · รอบสองลับขอบ) — ตัวเดียวกับเฟิร์มแวร์ตู้ ทดสอบบนคอมแล้ว
void scanQrInto(QrResult &out, const uint16_t *pixels, int width, int height) {
  const size_t count = static_cast<size_t>(width) * height;
  PsramBuffer<uint8_t> gray(static_cast<uint8_t *>(ps_malloc(count)), free);
  PsramBuffer<uint8_t> work(static_cast<uint8_t *>(ps_malloc(count)), free);
  PsramBuffer<quirc_code> code(static_cast<quirc_code *>(ps_malloc(sizeof(quirc_code))), free);
  PsramBuffer<quirc_code> spare(static_cast<quirc_code *>(ps_malloc(sizeof(quirc_code))), free);
  PsramBuffer<quirc_data> data(static_cast<quirc_data *>(ps_malloc(sizeof(quirc_data))), free);
  std::unique_ptr<quirc, decltype(&quirc_destroy)> scanner(quirc_new(), quirc_destroy);
  if (!gray || !work || !code || !spare || !data || !scanner) return;

  rgb565ToGray(gray.get(), pixels, static_cast<int>(count));
  QrScanInfo info;
  const int path =
      qrScanGray(scanner.get(), gray.get(), width, width, height, work.get(), code.get(), spare.get(), data.get(), &info);
  for (int index = 0; index < info.boxCount && out.count < QR_BOX_LIMIT; ++index) {
    QrBox &box = out.boxes[out.count++];
    for (int corner = 0; corner < 4; ++corner) {
      box.x[corner] = static_cast<int16_t>(info.box[index][corner].x);
      box.y[corner] = static_cast<int16_t>(info.box[index][corner].y);
    }
    box.decoded = info.boxDecoded[index] != 0;
  }
  if (path) {
    const size_t length = min(static_cast<size_t>(data->payload_len), QR_TEXT_LIMIT);
    memcpy(out.text, data->payload, length);
    out.text[length] = '\0';
    out.hasText = true;
    out.path = info.path;
    out.pass = info.pass;
  }
}

// สแกน QR หนึ่งรอบ แล้วส่งผลเข้าผลรวมครั้งเดียว (ไม่เจอ QR = ล้างกรอบเดิม)
void scanQr(const uint16_t *pixels, int width, int height) {
  QrResult result;
  result.width = width;
  result.height = height;
  scanQrInto(result, pixels, width, height);

  ResultGuard guard;
  if (jobGeneration != generation) return;  // ระหว่างวิเคราะห์ มีการเปิด/ปิดวิเคราะห์ — ผลนี้เก่าแล้ว
  qrBoxCount = result.count;
  for (size_t index = 0; index < result.count; ++index) qrBoxes[index] = result.boxes[index];
  qrBoxWidth = result.width;
  qrBoxHeight = result.height;
  lastBoxScan = millis();
  lastJobMs = lastBoxScan >= lastScan ? lastBoxScan - lastScan : 0;
  ++runs;
  if (result.hasText) {
    memcpy(qrText, result.text, sizeof(qrText));
    lastQr = millis();
    lastPath = result.path;
    lastPass = result.pass;
  }
}

void detectFaces(uint16_t *pixels, int width, int height) {
  HumanFaceDetectMSR01 detector(0.3f, 0.5f, FACE_LIMIT, 0.3f);
  FaceBox found[FACE_LIMIT];
  size_t count = 0;
  for (const auto &item : detector.infer(pixels, {height, width, 3})) {
    if (count == FACE_LIMIT) break;
    const int left = constrain(item.box[0], 0, width - 1);
    const int top = constrain(item.box[1], 0, height - 1);
    const int right = constrain(item.box[2], left, width - 1);
    const int bottom = constrain(item.box[3], top, height - 1);
    found[count++] = {left / float(width), top / float(height),
                      (right - left + 1) / float(width), (bottom - top + 1) / float(height)};
  }

  ResultGuard guard;
  if (jobGeneration != generation) return;
  faceCount = count;
  for (size_t index = 0; index < count; ++index) faces[index] = found[index];
  lastFace = millis();
}

// วิเคราะห์เฟรมที่ก๊อปไว้ (รันในงานเบื้องหลัง)
void analyzeJob() {
  const int width = jpegWidth / DECIMATION;
  const int height = jpegHeight / DECIMATION;
  if (!pixelBuf) pixelBuf = static_cast<uint16_t *>(ps_calloc(MAX_PIXELS, sizeof(uint16_t)));
  if (!pixelBuf) return;
  if (!jpg2rgb565(jpegCopy, jpegLen, reinterpret_cast<uint8_t *>(pixelBuf), JPEG_SCALE)) return;
#ifdef CAMTEST
  scanQr(pixelBuf, width, height);  // camtest: QR ทุกรอบ ไม่ตรวจใบหน้า (หนักและไม่เกี่ยวกับการหาสาเหตุ)
#else
  if (scanQrNext) scanQr(pixelBuf, width, height);
  else detectFaces(pixelBuf, width, height);
  scanQrNext = !scanQrNext;
#endif
}

void analysisTask(void *) {
  for (;;) {
    ulTaskNotifyTake(pdTRUE, portMAX_DELAY);
    analyzeJob();
    jobPending = false;  // ท้ายสุด: ตอนนี้ jpegCopy ปลอดภัยให้เฟรมถัดไปเขียนทับ
  }
}

bool startWorker() {
  if (worker) return true;
  return xTaskCreatePinnedToCore(analysisTask, "analysis", WORKER_STACK_BYTES, nullptr, WORKER_PRIORITY, &worker, WORKER_CORE) == pdPASS;
}
}  // namespace

void frameAnalysis::setEnabled(bool next) {
  if (enabled == next) return;
  enabled = next;
  ensureLock();
  ResultGuard guard;
  ++generation;
  lastScan = lastQr = lastFace = 0;
  qrText[0] = '\0';
  faceCount = 0;
  qrBoxCount = 0;
  lastBoxScan = 0;
  scanQrNext = true;
}

void frameAnalysis::inspect(const camera_fb_t &frame) {
  if (!enabled || jobPending || frame.format != PIXFORMAT_JPEG || millis() - lastScan < INTERVAL_MS) return;
  const int width = frame.width / DECIMATION;
  const int height = frame.height / DECIMATION;
  if (!width || !height || static_cast<size_t>(width) * height > MAX_PIXELS) return;
  ensureLock();
  if (!resultLock || !startWorker()) return;

  // ก๊อป JPEG ให้งานเบื้องหลัง (ไม่กี่ ms) แล้วปล่อยตัวส่งภาพไปต่อทันที — เฟรมจริงถูกคืนกล้องหลังฟังก์ชันนี้
  if (jpegCap < frame.len) {
    free(jpegCopy);
    jpegCopy = static_cast<uint8_t *>(ps_malloc(frame.len));
    jpegCap = jpegCopy ? frame.len : 0;
  }
  if (!jpegCap) return;
  memcpy(jpegCopy, frame.buf, frame.len);
  jpegLen = frame.len;
  jpegWidth = frame.width;
  jpegHeight = frame.height;
  jobGeneration = generation;
  lastScan = millis();
  jobPending = true;
  xTaskNotifyGive(worker);
}

void frameAnalysis::writeResult(JsonDocument &result) {
  ensureLock();
  ResultGuard guard;
  const uint32_t now = millis();
  result["enabled"] = enabled;
  result["qr"] = lastQr && now - lastQr < RESULT_TTL_MS ? qrText : "";
  result["runs"] = runs;
  result["path"] = lastPath;
  result["pass"] = lastPass;
  result["ms"] = lastJobMs;
#ifdef CAMTEST
  result["face_off"] = true;
#endif
  // กรอบล้อม QR: [x1,y1,x2,y2,x3,y3,x4,y4,ถอดได้ 1/0] เป็นพิกเซลของภาพกว้าง aw สูง ah — หน้าเว็บหารเป็นสัดส่วนเอง
  JsonArray qrBoxesJson = result["qrboxes"].to<JsonArray>();
  const uint32_t boxTtl = max<uint32_t>(QR_BOX_TTL_MS, lastJobMs * 2 + INTERVAL_MS);
  if (lastBoxScan && now - lastBoxScan < boxTtl && qrBoxWidth > 0) {
    result["aw"] = qrBoxWidth;
    result["ah"] = qrBoxHeight;
    for (size_t index = 0; index < qrBoxCount; ++index) {
      JsonArray box = qrBoxesJson.add<JsonArray>();
      for (int corner = 0; corner < 4; ++corner) {
        box.add(qrBoxes[index].x[corner]);
        box.add(qrBoxes[index].y[corner]);
      }
      box.add(qrBoxes[index].decoded ? 1 : 0);
    }
  }
  JsonArray boxes = result["faces"].to<JsonArray>();
  if (!lastFace || now - lastFace >= RESULT_TTL_MS) return;
  for (size_t index = 0; index < faceCount; ++index) {
    JsonArray box = boxes.add<JsonArray>();
    box.add(faces[index].x);
    box.add(faces[index].y);
    box.add(faces[index].width);
    box.add(faces[index].height);
  }
}
