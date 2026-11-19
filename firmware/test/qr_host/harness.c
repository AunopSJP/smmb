/* ตัวทดสอบบนคอมของ qr_scan.h — เรียก qrScanGray ตัวเดียวกับที่รันในตู้
 * ใช้: harness <manifest> <full|nowork>
 *   manifest แต่ละบรรทัด "path w h" (ไฟล์ภาพเทาดิบ w×h ไบต์)
 *   ผลต่อภาพ: idx|OK|ข้อความ|pass|path|grids|capstones|width   หรือ   idx|NO|grids|capstones|width
 *   nowork = ไม่ทำรอบสอง (ลับขอบ) ไว้เทียบ */
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "qr_scan.h"
#include "quirc/quirc.h"

int main(int argc, char **argv) {
  if (argc < 3) return 2;
  FILE *manifest = fopen(argv[1], "r");
  if (!manifest) return 3;
  const int useWork = strcmp(argv[2], "nowork") != 0;
  char path[1024];
  int w, h, idx = 0;
  static struct quirc_code code, spare;
  static struct quirc_data data;
  static QrScanInfo info;
  while (fscanf(manifest, "%1023s %d %d", path, &w, &h) == 3) {
    FILE *f = fopen(path, "rb");
    uint8_t *img = malloc((size_t)w * h);
    const size_t got = f ? fread(img, 1, (size_t)w * h, f) : 0;
    if (f) fclose(f);
    if (got != (size_t)w * h) {
      free(img);
      printf("%d|ERR\n", idx++);
      continue;
    }
    struct quirc *q = quirc_new();
    uint8_t *work = useWork ? malloc((size_t)w * h) : NULL;
    const int p = qrScanGray(q, img, w, w, h, work, &code, &spare, &data, &info);
    if (p) {
      data.payload[data.payload_len] = 0;
      printf("%d|OK|%s|%d|%d|%d|%d|%d\n", idx, data.payload, info.pass, info.path, info.grids, info.capstones, info.widestPx);
    } else {
      printf("%d|NO|%d|%d|%d\n", idx, info.grids, info.capstones, info.widestPx);
    }
    quirc_destroy(q);
    free(img);
    free(work);
    ++idx;
  }
  fclose(manifest);
  return 0;
}
