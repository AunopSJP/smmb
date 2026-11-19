#pragma once
// กระบวนการอ่าน QR จากภาพเทา 1 เฟรม ครบวงจร — ไฟล์เดียวกันคอมไพล์ทั้งในเฟิร์มแวร์ (C++) และตัวทดสอบบนคอม (C) ห้ามใช้ฟีเจอร์เฉพาะ C++
// (ทดสอบบนคอมด้วย quirc ซอร์สเดียวกับในตู้: firmware/test/qr_host · ผลวัดอยู่ใน CHANGELOG)
//
// ปัญหาที่ quirc (ในไลบรารี ESP32QRCodeReader) จัดการไม่ได้:
//  1) ภาพจากกล้องตู้เป็น "ภาพกระจก" (QR ถูกสลับแถว-คอลัมน์) — quirc เจอรูปทรงครบแต่ถอดไม่ผ่านเลย: ตรวจจากภาพจริง 2026-11-19 เทียบกับ QR ที่ถูกต้อง
//     ผิดแค่ 5.6% เมื่อกลับด้าน (ผิด 40% เมื่อไม่กลับ) · จำลองภาพกระจก: quirc เดิมอ่านได้ 0% ค่ากลับภาพของเซนเซอร์ (vflip+hmirror) หมุนภาพ 180° แต่ไม่แก้ภาพกระจก
//  2) ภาพเบลอ: อ่านแต่ละโมดูลจากพิกเซลขาวดำจุดเดียวหลัง threshold → หลายโมดูลผิดเกินที่รหัสแก้ได้
//
// ลำดับ: ลงภาพให้ quirc → ถอดทุกกริดด้วย (ภาพขาวดำ · กลับด้าน · สุ่มภาพเทา · สุ่มเทา+กลับด้าน) → ถ้าเจอโครงสร้าง QR แต่ถอดไม่ได้
// ทำรอบสองบนภาพลับขอบ (unsharp 3×3) · ขั้นหลังรอบแรกเบามาก (มิลลิวินาที) และทำเฉพาะเมื่อเจอ QR/ตาของ QR เท่านั้น ไม่เพิ่มภาระตอนไม่มี QR
#include <math.h>
#include <stdint.h>
#include <string.h>

#include "quirc/quirc_internal.h"

#define QR_RESAMPLE_MAX_SIZE 61  // QR เวอร์ชัน ≤ 11 (61×61 โมดูล) — QR ประจำตัวและลิงก์หน้าตู้เล็กกว่านี้มาก
#define QR_SCAN_MAX_BOXES 4

// เส้นทางที่ถอดสำเร็จ (ไว้ log/วินิจฉัย)
#define QR_PATH_PLAIN 1        // ภาพขาวดำของ quirc ตรง ๆ
#define QR_PATH_MIRROR 2       // ภาพขาวดำ + กลับด้าน
#define QR_PATH_GRAY 3         // สุ่มจากภาพเทา
#define QR_PATH_GRAY_MIRROR 4  // สุ่มจากภาพเทา + กลับด้าน

typedef struct {
  int grids;      // จำนวนกริด (QR) ที่ quirc เจอในรอบแรก
  int capstones;  // จำนวนตา QR ที่เจอในรอบแรก
  int widestPx;   // ความกว้างรูปทรง QR ที่ใหญ่สุด (px)
  int pass;       // 1 = ถอดได้รอบแรก · 2 = ถอดได้รอบสอง (ลับขอบ) · 0 = ถอดไม่ได้
  int path;       // QR_PATH_*
  int boxCount;   // กรอบล้อมที่บันทึกไว้ (มุม 4 จุดของแต่ละกริด)
  struct quirc_point box[QR_SCAN_MAX_BOXES][4];
  uint8_t boxDecoded[QR_SCAN_MAX_BOXES];
} QrScanInfo;

// กลับด้านกริด (สลับแถว-คอลัมน์) — QR ที่ถ่ายเป็นภาพกระจกจะถอดได้หลังขั้นนี้
static inline void qrFlipCode(const struct quirc_code *in, struct quirc_code *out) {
  *out = *in;
  memset(out->cell_bitmap, 0, sizeof(out->cell_bitmap));
  const int size = in->size;
  for (int y = 0; y < size; ++y) {
    for (int x = 0; x < size; ++x) {
      const int from = y * size + x;
      if (!((in->cell_bitmap[from >> 3] >> (from & 7)) & 1)) continue;
      const int to = x * size + y;
      out->cell_bitmap[to >> 3] |= (uint8_t)(1 << (to & 7));
    }
  }
}

// ค่าเทาที่จุด (x,y) แบบ bilinear · gray ชี้ที่มุมซ้ายบนของกรอบ · stride = ความกว้างทั้งบรรทัดของภาพ
static inline float qrResampleAt(const uint8_t *gray, int stride, int w, int h, float x, float y) {
  if (x < 0.0f) x = 0.0f;
  if (y < 0.0f) y = 0.0f;
  if (x > (float)(w - 1) - 0.001f) x = (float)(w - 1) - 0.001f;
  if (y > (float)(h - 1) - 0.001f) y = (float)(h - 1) - 0.001f;
  const int x0 = (int)x;
  const int y0 = (int)y;
  const float fx = x - (float)x0;
  const float fy = y - (float)y0;
  const uint8_t *p = gray + (size_t)y0 * stride + x0;
  const float top = (float)p[0] * (1.0f - fx) + (float)p[1] * fx;
  const float bottom = (float)p[stride] * (1.0f - fx) + (float)p[stride + 1] * fx;
  return top * (1.0f - fy) + bottom * fy;
}

// หน่วยโมดูล (u,v) → พิกเซลภาพ ด้วยสัมประสิทธิ์ perspective ของ quirc (เหมือน perspective_map ใน identify.c แต่ไม่ปัดเศษ)
static inline void qrResampleMap(const float *c, float u, float v, float *x, float *y) {
  const float den = c[6] * u + c[7] * v + 1.0f;
  *x = (c[0] * u + c[1] * v + c[2]) / den;
  *y = (c[3] * u + c[4] * v + c[5]) / den;
}

/**
 * สุ่มค่าเทากลางโมดูลของกริด index แล้วตัดสินขาว/ดำด้วยระดับกลาง (เปอร์เซ็นไทล์ 10 และ 90 ของทั้ง QR) → ใส่ตารางโมดูลลง code
 * คืน 1 = สำเร็จ · 0 = กริดใหญ่เกินที่รองรับ หรือคอนทราสต์ต่ำเกินไป
 */
static inline int qrResampleGrid(const struct quirc *q, int index, const uint8_t *gray, int stride, int w, int h, struct quirc_code *code) {
  const struct quirc_grid *grid = &q->grids[index];
  const int size = grid->grid_size;
  if (size < 21 || size > QR_RESAMPLE_MAX_SIZE) return 0;

  // จุดกลาง + เลื่อน ±0.25 โมดูลตามแกน u และ v รวม 5 จุด เฉลี่ยกันลดสัญญาณรบกวน
  static const float OFFSET[5][2] = {{0.0f, 0.0f}, {0.25f, 0.0f}, {-0.25f, 0.0f}, {0.0f, 0.25f}, {0.0f, -0.25f}};
  static uint8_t level[QR_RESAMPLE_MAX_SIZE * QR_RESAMPLE_MAX_SIZE];  // static: ไม่กิน stack ของลูปหลัก (8 KB)
  int hist[256];
  memset(hist, 0, sizeof(hist));
  for (int y = 0; y < size; ++y) {
    for (int x = 0; x < size; ++x) {
      float sum = 0.0f;
      for (int k = 0; k < 5; ++k) {
        float px, py;
        qrResampleMap(grid->c, (float)x + 0.5f + OFFSET[k][0], (float)y + 0.5f + OFFSET[k][1], &px, &py);
        sum += qrResampleAt(gray, stride, w, h, px, py);
      }
      const uint8_t v = (uint8_t)(sum * 0.2f + 0.5f);
      level[y * size + x] = v;
      ++hist[v];
    }
  }

  const int total = size * size;
  int low = 0, high = 255, acc = 0;
  for (int v = 0; v < 256; ++v) {
    acc += hist[v];
    if (acc * 10 >= total) {
      low = v;
      break;
    }
  }
  acc = 0;
  for (int v = 255; v >= 0; --v) {
    acc += hist[v];
    if (acc * 10 >= total) {
      high = v;
      break;
    }
  }
  if (high - low < 24) return 0;  // คอนทราสต์ต่ำเกินไป ไม่ใช่ QR จริง
  const int threshold = (low + high) / 2;

  quirc_extract(q, index, code);  // มุม + ขนาดกริด (ตารางโมดูลเดิมถูกแทนด้านล่าง)
  memset(code->cell_bitmap, 0, sizeof(code->cell_bitmap));
  for (int i = 0; i < total; ++i) {
    if ((int)level[i] < threshold) code->cell_bitmap[i >> 3] |= (uint8_t)(1 << (i & 7));
  }
  return 1;
}

/**
 * ถอดกริด index ด้วยทุกวิธีตามลำดับ · คืน QR_PATH_* ที่สำเร็จ หรือ 0 = ถอดไม่ได้ · ผลอยู่ใน data · มุมของกริดอยู่ใน code->corners เสมอ
 * code/spare = ที่เก็บชั่วคราว 2 ชุด (struct ใหญ่ ผู้เรียกจองแบบ static ไว้ ห้ามอยู่บน stack)
 */
static inline int qrDecodeGrid(const struct quirc *q, int index, const uint8_t *gray, int stride, int w, int h,
                               struct quirc_code *code, struct quirc_code *spare, struct quirc_data *data) {
  quirc_extract(q, index, code);
  if (quirc_decode(code, data) == QUIRC_SUCCESS) return QR_PATH_PLAIN;
  qrFlipCode(code, spare);
  if (quirc_decode(spare, data) == QUIRC_SUCCESS) return QR_PATH_MIRROR;
  if (!qrResampleGrid(q, index, gray, stride, w, h, code)) return 0;
  if (quirc_decode(code, data) == QUIRC_SUCCESS) return QR_PATH_GRAY;
  qrFlipCode(code, spare);
  if (quirc_decode(spare, data) == QUIRC_SUCCESS) return QR_PATH_GRAY_MIRROR;
  return 0;
}

// ถอดทุกกริดที่ quirc เจอ · บันทึกกรอบล้อม + ความกว้างใหญ่สุดลง info · คืน QR_PATH_* ของกริดแรกที่ถอดได้ (0 = ไม่มี)
static inline int qrDecodeAll(const struct quirc *q, const uint8_t *gray, int stride, int w, int h, struct quirc_code *code,
                              struct quirc_code *spare, struct quirc_data *data, QrScanInfo *info) {
  const int n = quirc_count(q);
  for (int i = 0; i < n; ++i) {
    const int path = qrDecodeGrid(q, i, gray, stride, w, h, code, spare, data);
    int minX = code->corners[0].x, maxX = minX;
    for (int k = 1; k < 4; ++k) {
      if (code->corners[k].x < minX) minX = code->corners[k].x;
      if (code->corners[k].x > maxX) maxX = code->corners[k].x;
    }
    if (maxX - minX > info->widestPx) info->widestPx = maxX - minX;
    if (info->boxCount < QR_SCAN_MAX_BOXES) {
      for (int k = 0; k < 4; ++k) info->box[info->boxCount][k] = code->corners[k];
      info->boxDecoded[info->boxCount] = path ? 1 : 0;
      ++info->boxCount;
    }
    if (path) return path;
  }
  return 0;
}

// ก๊อปกรอบภาพเทาเข้า buffer ของ quirc แล้วให้ quirc หา QR (quirc_end ทำภาพเป็นขาวดำในที่เดิม จึงต้องก๊อปใหม่ทุกครั้งที่จะอ่านซ้ำ)
static inline void qrFillQuirc(struct quirc *q, const uint8_t *gray, int stride, int w, int h) {
  int bw, bh;
  uint8_t *image = quirc_begin(q, &bw, &bh);
  for (int y = 0; y < h; ++y) memcpy(image + (size_t)y * w, gray + (size_t)y * stride, (size_t)w);
  quirc_end(q);
}

// ลับขอบ (unsharp mask 3×3): dst = p + 1.5·(p − เฉลี่ย 3×3) · ขอบภาพก๊อปตามเดิม · dst เป็นภาพต่อเนื่อง (stride = w)
static inline void qrSharpen(uint8_t *dst, const uint8_t *src, int srcStride, int w, int h) {
  for (int y = 0; y < h; ++y) {
    const uint8_t *row = src + (size_t)y * srcStride;
    uint8_t *out = dst + (size_t)y * w;
    if (y == 0 || y == h - 1) {
      memcpy(out, row, (size_t)w);
      continue;
    }
    out[0] = row[0];
    out[w - 1] = row[w - 1];
    for (int x = 1; x < w - 1; ++x) {
      const uint8_t *p = row + x;
      const int blur = (p[-srcStride - 1] + p[-srcStride] + p[-srcStride + 1] + p[-1] + p[0] + p[1] + p[srcStride - 1] + p[srcStride] +
                        p[srcStride + 1]) / 9;
      const int value = p[0] + ((p[0] - blur) * 3) / 2;
      out[x] = (uint8_t)(value < 0 ? 0 : value > 255 ? 255 : value);
    }
  }
}

/**
 * อ่าน QR จากกรอบภาพเทา 1 กรอบ ครบวงจร · คืน QR_PATH_* (>0) เมื่อถอดได้ (ข้อความอยู่ใน data) · 0 = ไม่ได้
 * gray = มุมซ้ายบนของกรอบ · stride = ความกว้างทั้งบรรทัดของภาพ · w,h = ขนาดกรอบ
 * work = buffer ขนาด w×h สำหรับภาพลับขอบ (ผู้เรียกจอง) · NULL = ไม่ทำรอบสอง
 * code/spare/data = ที่เก็บชั่วคราว (struct ใหญ่ ผู้เรียกจองแบบ static) · info = สถิติ + กรอบล้อม (ใส่ได้เสมอ)
 */
static inline int qrScanGray(struct quirc *q, const uint8_t *gray, int stride, int w, int h, uint8_t *work, struct quirc_code *code,
                             struct quirc_code *spare, struct quirc_data *data, QrScanInfo *info) {
  memset(info, 0, sizeof(*info));
  if (q->w != w || q->h != h) {  // ขนาดเดิม = ใช้ buffer เดิม (quirc_resize จองหน่วยความจำใหม่ทุกครั้ง)
    if (quirc_resize(q, w, h) < 0) return 0;
  }
  qrFillQuirc(q, gray, stride, w, h);
  info->grids = quirc_count(q);
  info->capstones = q->num_capstones;
  int path = qrDecodeAll(q, gray, stride, w, h, code, spare, data, info);
  if (path) {
    info->pass = 1;
    info->path = path;
    return path;
  }
  // รอบสอง: เจอ QR หรืออย่างน้อย 2 ตาแต่ถอดไม่ได้ → ลับขอบแล้วอ่านใหม่ (ไม่เจออะไรเลย = ข้าม ไม่เปลืองเวลา)
  if (work && (info->grids > 0 || info->capstones >= 2)) {
    qrSharpen(work, gray, stride, w, h);
    qrFillQuirc(q, work, w, w, h);
    QrScanInfo second;
    memset(&second, 0, sizeof(second));
    path = qrDecodeAll(q, work, w, w, h, code, spare, data, &second);
    if (second.widestPx > info->widestPx) info->widestPx = second.widestPx;
    if (path) {
      info->boxCount = second.boxCount;
      memcpy(info->box, second.box, sizeof(info->box));
      memcpy(info->boxDecoded, second.boxDecoded, sizeof(info->boxDecoded));
      info->pass = 2;
      info->path = path;
      return path;
    }
  }
  return 0;
}
