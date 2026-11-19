"""
แก้ตัวอ่าน QR (quirc ในไลบรารี ESP32QRCodeReader) ตอนบิลด์ — 3 จุด (ไฟล์ที่ดาวน์โหลดมาใน .pio/libdeps ไม่อยู่ใน git จึงต้องแก้ทุกครั้งที่บิลด์)

1) openmv/collections.c — สแตก flood fill 31 ช่อง → 4096 ช่อง
   ไลบรารีจองสแตกระบายสีพื้นที่ไว้แค่ 255 ไบต์ (31 ช่อง) ตา QR (finder) ที่โมดูลกว้างเกิน ~4 px หรือเอียง ระบายไม่ครบ → ตู้ "ไม่พบ QR" ทั้งที่ QR ชัด
   (จำลอง flood fill เดียวกัน: โมดูล 5–6 px + เอียง → ระบายครบ 0% · สแตก 4096 → 100%)
2) openmv/fmath.h — fast_roundf ปัดเศษถูกต้อง (เดิม (int)x = ตัดทศนิยม ทำให้จุดสุ่มอ่านแต่ละโมดูลเลื่อนราว 0.5 px)
3) quirc/identify.c — หน้าต่าง threshold THRESHOLD_S_DEN 8 → 24 (หน้าต่างเฉลี่ย = กว้างภาพ/24 แทน /8)
   เลือกจากการวัด: ภาพจำลองบัตรเจ้าหน้าที่ผ่านกล้องแบบกระจก 24 ค่า (DEN 8–64 × T 3–12) ค่า DEN24/T5 ได้สูงสุด (93%) และเป็นค่าเดียวที่อ่านภาพจริงจากตู้ได้ครบทุกขนาด

แก้ซ้ำได้ (ตรวจจากเครื่องหมาย SMMB_*) · ถ้าเวอร์ชันไลบรารีเปลี่ยนจนหาข้อความเดิมไม่เจอ จะหยุดบิลด์ ไม่ปล่อยให้เฟิร์มแวร์ออกไปโดยไม่ได้แก้
ชุดทดสอบบนคอม (test/qr_host) สร้างตัวอ่านจากไฟล์ที่แก้แล้วเหล่านี้ จึงทดสอบโค้ดเดียวกับที่ลงบอร์ด
"""
Import("env")  # noqa: F821  (ตัวแปรของ PlatformIO/SCons)

import os

LIFO_BYTES = 32768  # 4096 ช่อง × 8 ไบต์ (xylf_t)
THRESHOLD_DEN = 24

PATCHES = [
    (
        os.path.join("src", "openmv", "collections.c"),
        "SMMB_LIFO_BYTES",
        [
            ("  ptr->data = (char *)ps_malloc(255);\n", "  ptr->data = (char *)ps_malloc(SMMB_LIFO_BYTES);\n"),
            ("  ptr->size = 255 / data_len;\n", "  ptr->size = SMMB_LIFO_BYTES / data_len;\n"),
            (
                '#include "collections.h"\n',
                '#include "collections.h"\n'
                "// SMMB: สแตก flood fill ของ quirc เดิม 255 ไบต์ (31 ช่อง) เล็กเกินไป → ระบายตา QR ไม่ครบ · ดู firmware/patch_quirc.py\n"
                "#define SMMB_LIFO_BYTES %d\n" % LIFO_BYTES,
            ),
        ],
    ),
    (
        os.path.join("src", "openmv", "fmath.h"),
        "SMMB_ROUND",
        [
            (
                "static inline int fast_roundf(float x)\n{\n  return (int)(x);\n}\n",
                "static inline int fast_roundf(float x)\n{\n  /* SMMB_ROUND: ปัดเศษถูกต้อง (เดิมตัดทศนิยม) · ดู firmware/patch_quirc.py */\n  return (int)(x + (x < 0.0f ? -0.5f : 0.5f));\n}\n",
            ),
        ],
    ),
    (
        os.path.join("src", "quirc", "identify.c"),
        "SMMB_THRESHOLD",
        [
            (
                "#define THRESHOLD_S_DEN 8\n",
                "/* SMMB_THRESHOLD: หน้าต่างเฉลี่ย = กว้างภาพ/%d (เดิม /8) เลือกจากการวัดกับภาพจำลอง+ภาพจริง · ดู firmware/patch_quirc.py */\n"
                "#define THRESHOLD_S_DEN %d\n" % (THRESHOLD_DEN, THRESHOLD_DEN),
            ),
        ],
    ),
]


def patch_file(path, marker, edits):
    with open(path, "rb") as f:
        raw = f.read().decode("utf-8")
    if marker in raw:
        return False
    eol = "\r\n" if "\r\n" in raw else "\n"
    text = raw.replace("\r\n", "\n")
    for before, after in edits:
        if text.count(before) != 1:
            print("[patch_quirc] ERROR: หาข้อความเดิมไม่เจอใน %s (ไลบรารีเปลี่ยนเวอร์ชัน?) — หยุดบิลด์" % path)
            env.Exit(1)  # noqa: F821
        text = text.replace(before, after)
    with open(path, "wb") as f:
        f.write(text.replace("\n", eol).encode("utf-8"))
    return True


def patch_quirc():
    lib = os.path.join(env.subst("$PROJECT_LIBDEPS_DIR"), env.subst("$PIOENV"), "ESP32QRCodeReader")  # noqa: F821
    if not os.path.isdir(lib):
        print("[patch_quirc] ไม่พบ %s — ข้าม (env นี้ไม่ใช้ ESP32QRCodeReader)" % lib)
        return
    for rel, marker, edits in PATCHES:
        path = os.path.join(lib, rel)
        if not os.path.isfile(path):
            print("[patch_quirc] ERROR: ไม่พบ %s — หยุดบิลด์" % path)
            env.Exit(1)  # noqa: F821
        if patch_file(path, marker, edits):
            print("[patch_quirc] แก้แล้ว: %s" % rel)


patch_quirc()
