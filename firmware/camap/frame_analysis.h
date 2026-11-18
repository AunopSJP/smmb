#pragma once

#include <ArduinoJson.h>
#include <esp_camera.h>

namespace frameAnalysis {
void setEnabled(bool enabled);
void inspect(const camera_fb_t &frame);
void writeResult(JsonDocument &result);
}
