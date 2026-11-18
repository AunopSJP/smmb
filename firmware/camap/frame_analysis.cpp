#include "frame_analysis.h"

#include <Arduino.h>
#include <human_face_detect_msr01.hpp>
#include <img_converters.h>
#include <quirc/quirc.h>
#include <memory>

namespace {
constexpr uint32_t INTERVAL_MS = 600;
constexpr uint32_t RESULT_TTL_MS = 4000;
constexpr int DECIMATION = 2;
constexpr size_t MAX_PIXELS = 320 * 240;
constexpr size_t QR_TEXT_LIMIT = 512;
constexpr size_t FACE_LIMIT = 4;

struct FaceBox {
  float x, y, width, height;
};

template <typename T>
using PsramBuffer = std::unique_ptr<T, decltype(&free)>;

bool enabled = false;
bool scanQrNext = true;
uint32_t lastScan = 0;
uint32_t lastQr = 0;
uint32_t lastFace = 0;
char qrText[QR_TEXT_LIMIT + 1] = {};
FaceBox faces[FACE_LIMIT];
size_t faceCount = 0;

void scanQr(const uint16_t *pixels, int width, int height) {
  std::unique_ptr<quirc, decltype(&quirc_destroy)> scanner(quirc_new(), quirc_destroy);
  if (!scanner || quirc_resize(scanner.get(), width, height) != 0) return;

  uint8_t *gray = quirc_begin(scanner.get(), nullptr, nullptr);
  for (int index = 0; index < width * height; ++index) {
    const uint16_t pixel = pixels[index];
    const uint16_t green = (pixel >> 5) & 63;
    const uint16_t redAndBlue = ((pixel >> 11) & 31) + (pixel & 31);
    gray[index] = static_cast<uint8_t>(2 * redAndBlue + 2 * green);
  }
  quirc_end(scanner.get());
  if (quirc_count(scanner.get()) == 0) return;

  PsramBuffer<quirc_code> code(static_cast<quirc_code *>(ps_malloc(sizeof(quirc_code))), free);
  PsramBuffer<quirc_data> data(static_cast<quirc_data *>(ps_malloc(sizeof(quirc_data))), free);
  if (!code || !data) return;
  for (int index = 0; index < quirc_count(scanner.get()); ++index) {
    quirc_extract(scanner.get(), index, code.get());
    if (quirc_decode(code.get(), data.get()) != QUIRC_SUCCESS || data->payload_len <= 0) continue;
    const size_t length = min(static_cast<size_t>(data->payload_len), QR_TEXT_LIMIT);
    memcpy(qrText, data->payload, length);
    qrText[length] = '\0';
    lastQr = millis();
    break;
  }
}

void detectFaces(uint16_t *pixels, int width, int height) {
  HumanFaceDetectMSR01 detector(0.3f, 0.5f, FACE_LIMIT, 0.3f);
  faceCount = 0;
  for (const auto &item : detector.infer(pixels, {height, width, 3})) {
    if (faceCount == FACE_LIMIT) break;
    const int left = constrain(item.box[0], 0, width - 1);
    const int top = constrain(item.box[1], 0, height - 1);
    const int right = constrain(item.box[2], left, width - 1);
    const int bottom = constrain(item.box[3], top, height - 1);
    faces[faceCount++] = {left / float(width), top / float(height),
                         (right - left + 1) / float(width), (bottom - top + 1) / float(height)};
  }
  lastFace = millis();
}
}

void frameAnalysis::setEnabled(bool next) {
  if (enabled == next) return;
  enabled = next;
  lastScan = lastQr = lastFace = 0;
  qrText[0] = '\0';
  faceCount = 0;
  scanQrNext = true;
}

void frameAnalysis::inspect(const camera_fb_t &frame) {
  if (!enabled || frame.format != PIXFORMAT_JPEG || millis() - lastScan < INTERVAL_MS) return;
  const int width = frame.width / DECIMATION;
  const int height = frame.height / DECIMATION;
  if (!width || !height || static_cast<size_t>(width) * height > MAX_PIXELS) return;

  // Always allow room for the largest JPEG the camera can produce.
  PsramBuffer<uint16_t> pixels(static_cast<uint16_t *>(ps_calloc(MAX_PIXELS, sizeof(uint16_t))), free);
  if (!pixels || !jpg2rgb565(frame.buf, frame.len, reinterpret_cast<uint8_t *>(pixels.get()), JPG_SCALE_2X)) {
    lastScan = millis();
    return;
  }
  if (scanQrNext) scanQr(pixels.get(), width, height);
  else detectFaces(pixels.get(), width, height);
  scanQrNext = !scanQrNext;
  lastScan = millis();
}

void frameAnalysis::writeResult(JsonDocument &result) {
  const uint32_t now = millis();
  result["enabled"] = enabled;
  result["qr"] = lastQr && now - lastQr < RESULT_TTL_MS ? qrText : "";
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
