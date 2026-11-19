#include <Arduino.h>
#include <WiFi.h>
#include <esp_camera.h>
#include <esp_http_server.h>
#include <esp_wifi.h>
#include <freertos/semphr.h>

#include "board.h"
#include "frame_analysis.h"
#include "viewer.h"

#ifdef CAMTEST
#include <ArduinoOTA.h>
#include <Preferences.h>
#endif

namespace {
#ifdef CAMTEST
// รุ่นทดสอบกล้อง: Wi-Fi ชื่อ CAMTEST-xxxxxx รหัสคงที่ (ใช้ทดสอบหน้างานเท่านั้น · รับได้ 1 เครื่อง · อย่าติดตั้งค้างในตู้จริง)
constexpr char AP_PREFIX[] = "CAMTEST";
constexpr char CAMTEST_PASSWORD[] = "camtest1234";
#else
constexpr char AP_PREFIX[] = "ESP32-CAM";
#endif
constexpr uint32_t SERIAL_BAUD = 115200;
constexpr uint32_t CPU_CLOCK_MHZ = 80;
constexpr uint32_t CAMERA_CLOCK_HZ = 10000000;
constexpr int8_t WIFI_TX_POWER_QUARTER_DBM = 8;
constexpr uint32_t WIFI_START_TIMEOUT_MS = 1000;
constexpr uint32_t WIFI_START_POLL_MS = 10;
constexpr char STREAM_TYPE[] = "multipart/x-mixed-replace; boundary=esp32frame";
constexpr char FRAME_BOUNDARY[] = "\r\n--esp32frame\r\n";
constexpr char FRAME_HEADER[] = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";
bool cameraReady = false;
#ifdef CAMTEST
// camtest: เพิ่ม XGA/SXGA ไว้ดูว่าภาพชัดขึ้นไหมเมื่อละเอียดขึ้น (วิเคราะห์ QR ทำถึง VGA เท่านั้น)
constexpr framesize_t RESOLUTIONS[] = {FRAMESIZE_QQVGA, FRAMESIZE_QVGA, FRAMESIZE_VGA, FRAMESIZE_XGA, FRAMESIZE_SXGA};
#else
constexpr framesize_t RESOLUTIONS[] = {FRAMESIZE_QQVGA, FRAMESIZE_QVGA, FRAMESIZE_VGA};
#endif
constexpr int JPEG_QUALITIES[] = {10, 14, 22};
#ifdef CAMTEST
constexpr size_t VGA_INDEX = 4;  // ชื่อเดิม = ดัชนีความละเอียดสูงสุดเมื่อมี PSRAM (camtest: SXGA)
#else
constexpr size_t VGA_INDEX = 2;
#endif
constexpr size_t DEFAULT_QUALITY = 0;
constexpr int SENSOR_CONTRAST = 1;
constexpr int AUTO_CONTROL_ENABLED = 1;
constexpr uint32_t CAMERA_LOCK_TIMEOUT_MS = 5000;
size_t maxResolution = VGA_INDEX;
SemaphoreHandle_t cameraMutex = nullptr;

esp_err_t showViewer(httpd_req_t *request) {
  httpd_resp_set_type(request, "text/html; charset=utf-8");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  return httpd_resp_sendstr(request, VIEWER_HTML);
}

esp_err_t cameraUnavailable(httpd_req_t *request) {
  httpd_resp_set_status(request, "503 Service Unavailable");
  return httpd_resp_sendstr(request, "Camera unavailable");
}

esp_err_t analysisSettings(httpd_req_t *request) {
  if (!cameraReady || !psramFound()) return cameraUnavailable(request);
  char enabled = '0';
  if (request->method == HTTP_PUT &&
      (request->content_len != 1 || httpd_req_recv(request, &enabled, 1) != 1 ||
       (enabled != '0' && enabled != '1'))) {
    return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Expected 0 or 1");
  }
  if (xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(CAMERA_LOCK_TIMEOUT_MS)) != pdTRUE) {
    return cameraUnavailable(request);
  }
  if (request->method == HTTP_PUT) frameAnalysis::setEnabled(enabled == '1');
  JsonDocument document;
  frameAnalysis::writeResult(document);
  String response;
  serializeJson(document, response);
  xSemaphoreGive(cameraMutex);
  httpd_resp_set_type(request, "application/json");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  return httpd_resp_send(request, response.c_str(), response.length());
}

esp_err_t cameraSettings(httpd_req_t *request) {
  if (!cameraReady) return cameraUnavailable(request);

  char selection[2];
  if (request->method == HTTP_PUT) {
    if (request->content_len != sizeof(selection)) {
      return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Invalid settings");
    }
    size_t received = 0;
    while (received < sizeof(selection)) {
      const int count = httpd_req_recv(request, selection + received, sizeof(selection) - received);
      if (count <= 0) return ESP_FAIL;
      received += count;
    }
    if (selection[0] < '0' || selection[0] > '0' + maxResolution ||
        selection[1] < '0' || selection[1] >= '0' + sizeof(JPEG_QUALITIES) / sizeof(JPEG_QUALITIES[0])) {
      return httpd_resp_send_err(request, HTTPD_400_BAD_REQUEST, "Unsupported settings");
    }
  }

  if (xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(CAMERA_LOCK_TIMEOUT_MS)) != pdTRUE) {
    return cameraUnavailable(request);
  }
  sensor_t *sensor = esp_camera_sensor_get();
  bool applied = true;
  if (request->method == HTTP_PUT) {
    const framesize_t resolution = RESOLUTIONS[selection[0] - '0'];
    const int quality = JPEG_QUALITIES[selection[1] - '0'];
    const framesize_t previousResolution = sensor->status.framesize;
    if (previousResolution != resolution && sensor->set_framesize(sensor, resolution) != 0) {
      applied = false;
    } else if (sensor->status.quality != quality && sensor->set_quality(sensor, quality) != 0) {
      if (previousResolution != resolution) sensor->set_framesize(sensor, previousResolution);
      applied = false;
    }
  }
  size_t resolutionIndex = 0;
  while (resolutionIndex < maxResolution && RESOLUTIONS[resolutionIndex] != sensor->status.framesize) {
    ++resolutionIndex;
  }
  size_t qualityIndex = 0;
  while (qualityIndex + 1 < sizeof(JPEG_QUALITIES) / sizeof(JPEG_QUALITIES[0]) &&
         JPEG_QUALITIES[qualityIndex] != sensor->status.quality) {
    ++qualityIndex;
  }
  xSemaphoreGive(cameraMutex);
  if (!applied) {
    Serial.println("Could not apply camera settings");
    return httpd_resp_send_err(request, HTTPD_500_INTERNAL_SERVER_ERROR, "Could not apply settings");
  }
  char response[80];
  snprintf(response, sizeof(response), "{\"resolution\":%u,\"quality\":%u,\"maxResolution\":%u}",
           static_cast<unsigned>(resolutionIndex), static_cast<unsigned>(qualityIndex),
           static_cast<unsigned>(maxResolution));
  httpd_resp_set_type(request, "application/json");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  return httpd_resp_sendstr(request, response);
}

esp_err_t streamCamera(httpd_req_t *request) {
  if (!cameraReady) return cameraUnavailable(request);

  esp_err_t result = httpd_resp_set_type(request, STREAM_TYPE);
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  while (result == ESP_OK) {
    if (xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(CAMERA_LOCK_TIMEOUT_MS)) != pdTRUE) return ESP_FAIL;
    camera_fb_t *frame = esp_camera_fb_get();
    if (!frame) {
      xSemaphoreGive(cameraMutex);
      Serial.println("Camera capture failed");
      return ESP_FAIL;
    }

    frameAnalysis::inspect(*frame);
    char header[64];
    const int length = snprintf(header, sizeof(header), FRAME_HEADER, static_cast<unsigned>(frame->len));
    result = httpd_resp_send_chunk(request, FRAME_BOUNDARY, sizeof(FRAME_BOUNDARY) - 1);
    if (result == ESP_OK) result = httpd_resp_send_chunk(request, header, length);
    if (result == ESP_OK) {
      result = httpd_resp_send_chunk(request, reinterpret_cast<const char *>(frame->buf), frame->len);
    }
    esp_camera_fb_return(frame);
    xSemaphoreGive(cameraMutex);
  }
  return result;
}

#ifdef CAMTEST
// ── ความคมของภาพ (sharpness ของเซนเซอร์) ──
int sharpLevel = 2;  // -3..+3 (ค่าเริ่มต้นของ camtest +2 — ภาพ QR ต้องการขอบคม)

// GET /tune?sharp=-3..3 → ตั้งความคม แล้วตอบสถานะ JSON · ไม่มี query = อ่านสถานะเฉย ๆ
esp_err_t tuneHandler(httpd_req_t *request) {
  if (!cameraReady) return cameraUnavailable(request);
  char query[32] = {};
  char value[8] = {};
  const bool hasQuery = httpd_req_get_url_query_str(request, query, sizeof(query)) == ESP_OK;
  if (xSemaphoreTake(cameraMutex, pdMS_TO_TICKS(CAMERA_LOCK_TIMEOUT_MS)) != pdTRUE) return cameraUnavailable(request);
  sensor_t *sensor = esp_camera_sensor_get();
  if (hasQuery && httpd_query_key_value(query, "sharp", value, sizeof(value)) == ESP_OK) {
    const int level = atoi(value);
    if (level >= -3 && level <= 3 && sensor->set_sharpness && sensor->set_sharpness(sensor, level) == 0) sharpLevel = level;
  }
  const int pid = sensor->id.PID;
  xSemaphoreGive(cameraMutex);
  char response[48];
  snprintf(response, sizeof(response), "{\"pid\":%d,\"sharp\":%d}", pid, sharpLevel);
  httpd_resp_set_type(request, "application/json");
  httpd_resp_set_hdr(request, "Cache-Control", "no-store");
  return httpd_resp_sendstr(request, response);
}
#endif

esp_err_t startServer(httpd_config_t config, const httpd_uri_t *routes, size_t routeCount) {
  httpd_handle_t server = nullptr;
  const esp_err_t started = httpd_start(&server, &config);
  if (started != ESP_OK) return started;
  for (size_t index = 0; index < routeCount; ++index) {
    const esp_err_t registered = httpd_register_uri_handler(server, &routes[index]);
    if (registered != ESP_OK) {
      httpd_stop(server);
      return registered;
    }
  }
  return ESP_OK;
}

esp_err_t initCamera() {
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAM_PIN_D0;
  config.pin_d1 = CAM_PIN_D1;
  config.pin_d2 = CAM_PIN_D2;
  config.pin_d3 = CAM_PIN_D3;
  config.pin_d4 = CAM_PIN_D4;
  config.pin_d5 = CAM_PIN_D5;
  config.pin_d6 = CAM_PIN_D6;
  config.pin_d7 = CAM_PIN_D7;
  config.pin_xclk = CAM_PIN_XCLK;
  config.pin_pclk = CAM_PIN_PCLK;
  config.pin_vsync = CAM_PIN_VSYNC;
  config.pin_href = CAM_PIN_HREF;
  config.pin_sccb_sda = CAM_PIN_SIOD;
  config.pin_sccb_scl = CAM_PIN_SIOC;
  config.pin_pwdn = CAM_PIN_PWDN;
  config.pin_reset = CAM_PIN_RESET;
  config.xclk_freq_hz = CAMERA_CLOCK_HZ;
  config.pixel_format = PIXFORMAT_JPEG;
  const bool hasPsram = psramFound();
  maxResolution = hasPsram ? VGA_INDEX : VGA_INDEX - 1;
  config.frame_size = RESOLUTIONS[maxResolution];
  config.jpeg_quality = JPEG_QUALITIES[DEFAULT_QUALITY];
  config.fb_count = hasPsram ? 2 : 1;
  config.fb_location = hasPsram ? CAMERA_FB_IN_PSRAM : CAMERA_FB_IN_DRAM;
  config.grab_mode = hasPsram ? CAMERA_GRAB_LATEST : CAMERA_GRAB_WHEN_EMPTY;
  const esp_err_t result = esp_camera_init(&config);
  if (result != ESP_OK) return result;
  sensor_t *sensor = esp_camera_sensor_get();
  Serial.printf("Sensor PID: 0x%04X, PSRAM: %s\n", static_cast<unsigned>(sensor->id.PID),
                hasPsram ? "yes" : "no");
  const int contrast = sensor->set_contrast(sensor, SENSOR_CONTRAST);
  const int gain = sensor->set_gainceiling(sensor, GAINCEILING_2X);
  const int whiteBalance = sensor->set_whitebal(sensor, AUTO_CONTROL_ENABLED);
  const int exposure = sensor->set_exposure_ctrl(sensor, AUTO_CONTROL_ENABLED);
  if (contrast || gain || whiteBalance || exposure) {
    Serial.printf("Sensor tuning return codes: contrast=%d gain=%d AWB=%d AE=%d\n",
                  contrast, gain, whiteBalance, exposure);
  }
#ifdef CAMTEST
  // camtest: init จองบัฟเฟอร์ตามขนาดสูงสุด (SXGA) แล้วเริ่มที่ VGA · ตั้งความคมให้ OV5640
  sensor->set_framesize(sensor, FRAMESIZE_VGA);
  if (sensor->id.PID == OV5640_PID) sensor->set_sharpness(sensor, sharpLevel);
#endif
  return ESP_OK;
}

void limitWifiPower() {
  const uint32_t startedAt = millis();
  esp_err_t result;
  do {
    result = esp_wifi_set_max_tx_power(WIFI_TX_POWER_QUARTER_DBM);
    if (result == ESP_OK) return;
    delay(WIFI_START_POLL_MS);
  } while (millis() - startedAt < WIFI_START_TIMEOUT_MS);
  Serial.printf("Wi-Fi transmit power: %s\n", esp_err_to_name(result));
}
}

#ifdef CAMTEST
// แฟลชกลับเป็นเฟิร์มแวร์ตู้ผ่าน Wi-Fi ของบอร์ดนี้ (ต่อ CAMTEST-xxxxxx แล้วอัปโหลดไปที่ 192.168.4.1) · ต้องมีรหัสใน ota.local.ini
void startOta() {
  if (sizeof(OTA_PASS) <= 1) {
    Serial.println("OTA off: set the password in ota.local.ini and rebuild");
    return;
  }
  Preferences prefs;
  prefs.begin("smmb", true);
  const String box = prefs.getString("box", "");
  prefs.end();
  String digits;
  for (char ch : box)
    if (isdigit(ch)) digits += ch;
  const String host = "camtest-" + (digits.length() ? digits : String(static_cast<uint32_t>(ESP.getEfuseMac() & 0xffffff), HEX));
  ArduinoOTA.setHostname(host.c_str());
  ArduinoOTA.setPassword(OTA_PASS);
  ArduinoOTA.begin();
  Serial.printf("OTA ready: %s.local (192.168.4.1)\n", host.c_str());
}
#endif

void setup() {
  setCpuFrequencyMhz(CPU_CLOCK_MHZ);
  Serial.begin(SERIAL_BAUD);
  // Keep the sensor asleep while the radio starts and calibrates.
  pinMode(CAM_PIN_PWDN, OUTPUT);
  digitalWrite(CAM_PIN_PWDN, HIGH);

  char ssid[sizeof(AP_PREFIX) + 7];
  char password[17];
  const uint64_t chip = ESP.getEfuseMac();
  snprintf(ssid, sizeof(ssid), "%s-%06lX", AP_PREFIX, static_cast<unsigned long>(chip & 0xffffff));
  WiFi.persistent(false);
  if (!WiFi.mode(WIFI_AP)) {
    Serial.println("Wi-Fi AP mode failed");
    return;
  }
  limitWifiPower();
#ifdef CAMTEST
  snprintf(password, sizeof(password), "%s", CAMTEST_PASSWORD);
  const bool apStarted = WiFi.softAP(ssid, password, 6, 0, 1);  // ช่อง 6 · ไม่ซ่อน · รับ 1 เครื่องเท่านั้น
#else
  snprintf(password, sizeof(password), "%08lX%08lX",
           static_cast<unsigned long>(esp_random()), static_cast<unsigned long>(esp_random()));
  const bool apStarted = WiFi.softAP(ssid, password);
#endif
  if (!apStarted) {
    Serial.println("Wi-Fi access point failed");
    return;
  }
  Serial.printf("Wi-Fi: %s\nPassword: %s\nURL: http://%s/\n",
                ssid, password, WiFi.softAPIP().toString().c_str());

  const esp_err_t cameraResult = initCamera();
  cameraMutex = xSemaphoreCreateMutex();
  cameraReady = cameraResult == ESP_OK && cameraMutex;
  Serial.printf("Camera: %s\n", esp_err_to_name(cameraResult));
  if (!cameraMutex) Serial.println("Camera mutex allocation failed");

  // Keep the viewer responsive while the stream server services one long-running request.
  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  const httpd_uri_t viewer[] = {
    {"/", HTTP_GET, showViewer, nullptr},
    {"/settings", HTTP_GET, cameraSettings, nullptr},
    {"/settings", HTTP_PUT, cameraSettings, nullptr},
    {"/analysis", HTTP_GET, analysisSettings, nullptr},
    {"/analysis", HTTP_PUT, analysisSettings, nullptr},
#ifdef CAMTEST
    {"/tune", HTTP_GET, tuneHandler, nullptr},
#endif
  };
  esp_err_t result = startServer(config, viewer, sizeof(viewer) / sizeof(viewer[0]));
  if (result != ESP_OK) {
    Serial.printf("Viewer server: %s\n", esp_err_to_name(result));
    return;
  }
  config.server_port = STREAM_PORT;
  config.stack_size = 12288;
  ++config.ctrl_port;
  config.send_wait_timeout = 3;
  const httpd_uri_t stream = {"/stream", HTTP_GET, streamCamera, nullptr};
  result = startServer(config, &stream, 1);
  Serial.printf("Stream server: %s\n", esp_err_to_name(result));
#ifdef CAMTEST
  startOta();
#endif
}

void loop() {
#ifdef CAMTEST
  ArduinoOTA.handle();
  delay(10);
#else
  delay(1000);
#endif
}
