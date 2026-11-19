"""
ทดสอบตัวอ่าน QR ของตู้บนคอม (ไม่ต้องมีบอร์ด) — ใช้ quirc ซอร์สเดียวกับในตู้ (หลัง patch_quirc.py) + qr_scan.h ตัวจริง

ทำอะไร: คอมไพล์ quirc ที่แพชแล้วจาก firmware/.pio/libdeps/esp32cam (ต้อง `pio run -d firmware -e esp32cam` มาก่อน 1 ครั้ง) ด้วยคอมไพเลอร์ zig
สร้างภาพจำลอง "QR ประจำตัวบนจอมือถือผ่านกล้องตู้" (เบลอ · เอียง · สัญญาณรบกวน · JPEG · โทนสีม่วง) ทั้งแบบ "ภาพกระจก" (เหมือนกล้องตู้จริง) และแบบปกติ
ทั้ง QVGA และ VGA แล้วเทียบว่าอ่านได้กี่ % — ตรวจเกณฑ์ผ่าน/ไม่ผ่านอัตโนมัติ (รหัสออก 1 = ไม่ผ่าน)
ภาพที่ไม่มี QR ต้องไม่อ่านมั่ว และไม่ทำให้รอบสอง (ลับขอบ) ทำงานเปล่า ๆ

เตรียมเครื่อง (ครั้งเดียว):   python -m venv .venv   แล้ว   .venv/Scripts/pip install ziglang pillow numpy qrcode
รัน:                          .venv/Scripts/python firmware/test/qr_host/qr_host_test.py

ผลที่วัดได้ตอนสร้าง (2026-11-19): กระจก QVGA 97% · กระจก VGA 92% · ปกติ QVGA 97% · ปกติ VGA 92% (quirc เดิมของไลบรารีอ่านภาพกระจกได้ 0%) ·
ภาพจริงจากตู้ (QR กระดาษเอียง/เบลอ) ถอดได้ทั้ง 640×480 และ 320×240 · ภาพไม่มี QR 400 ภาพ อ่านมั่ว 0
"""
import io
import pathlib
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import qrcode
from PIL import Image, ImageDraw, ImageFilter

HERE = pathlib.Path(__file__).parent
FIRMWARE = HERE.parent.parent
LIB = FIRMWARE / ".pio" / "libdeps" / "esp32cam" / "ESP32QRCodeReader" / "src"
TEXT = "SMMB-O2.J-8f31c2.U-0007.sw1n3k.Xk9QpL3mZr7tV2aB"  # รูปแบบเดียวกับ QR ประจำตัวจริง (47 ตัวอักษร)

# เกณฑ์ผ่าน (วัดได้ ~97/92 · เผื่อไว้ให้ต่ำกว่าเล็กน้อย)
MIN_QVGA = 90
MIN_VGA = 85
MAX_EMPTY_TRIGGER = 2.0  # % ของภาพไม่มี QR ที่เข้าเงื่อนไขทำรอบสอง


def build_host(work: pathlib.Path) -> pathlib.Path:
    if not (LIB / "quirc" / "identify.c").exists():
        raise SystemExit("ไม่พบไลบรารี — รัน `pio run -d firmware -e esp32cam` ก่อน 1 ครั้ง")
    for marker, rel in (("SMMB_LIFO_BYTES", "openmv/collections.c"), ("SMMB_ROUND", "openmv/fmath.h"), ("SMMB_THRESHOLD", "quirc/identify.c")):
        if marker not in (LIB / rel).read_text(encoding="utf-8"):
            raise SystemExit(f"{rel} ยังไม่ถูกแพช ({marker}) — รัน pio build ให้ patch_quirc.py ทำงานก่อน")
    src = work / "src"
    shutil.copytree(LIB, src)
    (work / "shim").mkdir()
    (work / "shim" / "Arduino.h").write_text("#include <stdlib.h>\n#include <string.h>\n#define ps_malloc malloc\n#define ps_calloc calloc\n")
    fm = (src / "openmv" / "fmath.h").read_text(encoding="utf-8")  # บนคอมใช้ sqrtf แทน asm ของ xtensa
    fm = fm.replace('asm("fsqrt.s %0, %1"\n      : "=f"(x)\n      : "f"(x));\n  return x;', "return sqrtf(x);")
    (src / "openmv" / "fmath.h").write_text(fm, encoding="utf-8")
    exe = work / "harness.exe"
    cmd = [sys.executable, "-m", "ziglang", "cc", "-O2", "-w", "-I", str(work / "shim"), "-I", str(src), "-I", str(FIRMWARE / "src"), "-include", "Arduino.h",
           str(HERE / "harness.c"), str(src / "quirc" / "decode.c"), str(src / "quirc" / "identify.c"), str(src / "quirc" / "quirc.c"),
           str(src / "quirc" / "version_db.c"), str(src / "openmv" / "collections.c"), "-lm", "-o", str(exe)]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        raise SystemExit("คอมไพล์ไม่ผ่าน:\n" + r.stdout + r.stderr)
    return exe


# ───────────────────────── ภาพจำลอง ─────────────────────────
def qr_image():
    q = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_L, box_size=16, border=2)
    q.add_data(TEXT)
    q.make(fit=True)
    return q.make_image(fill_color="black", back_color="white").convert("L"), q.modules_count + 4


QR_IMG, TOTAL_MODULES = qr_image()


def to_firmware_gray(rgb):
    """เหมือนตัวแปลงในเฟิร์มแวร์: RGB565 แล้ว 2·(R5+B5) + 2·G6"""
    return (2 * ((rgb[..., 0] >> 3).astype(np.int32) + (rgb[..., 2] >> 3)) + 2 * (rgb[..., 1] >> 2)).astype(np.uint8)


def jpeg_gray(arr, rng):
    rgb = np.stack([arr, arr * 0.9, arr], axis=-1).clip(0, 255).astype(np.uint8)  # โทนม่วงอ่อนแบบภาพจริง
    buf = io.BytesIO()
    Image.fromarray(rgb).save(buf, "JPEG", quality=int(rng.integers(62, 82)))
    return to_firmware_gray(np.asarray(Image.open(io.BytesIO(buf.getvalue())).convert("RGB")))


def qr_scene(rng, m, blur640, angle, size):
    """ภาพเทาที่เฟิร์มแวร์เห็น: QR (โมดูลกว้าง m px) บนพื้นหลัง · None = QR ใหญ่เกินเฟรม"""
    W, H = size
    px = int(round(TOTAL_MODULES * m))
    pad = int(rng.integers(max(2, int(m)), max(3, int(m * 3))))
    side = px + 2 * pad
    if side * 1.45 >= min(W, H):
        return None
    card = Image.new("L", (side, side), 255)
    card.paste(QR_IMG.resize((px, px), Image.LANCZOS), (pad, pad))
    mask = Image.new("L", (side, side), 255)
    card = card.transform(card.size, Image.AFFINE, (1, float(rng.uniform(-0.08, 0.08)), 0, 0, 1, 0), resample=Image.BICUBIC, fillcolor=255)
    ang = angle + float(rng.uniform(-3, 3))
    card = card.rotate(ang, expand=True, resample=Image.BICUBIC, fillcolor=255)
    mask = mask.rotate(ang, expand=True, resample=Image.BICUBIC, fillcolor=0)
    xs, ys = np.linspace(-1, 1, W)[None, :], np.linspace(-1, 1, H)[:, None]
    bg = float(rng.integers(60, 150)) + 18 * xs * float(rng.uniform(-1, 1)) + 14 * ys * float(rng.uniform(-1, 1))
    canvas = Image.fromarray(np.clip(bg, 0, 255).astype(np.uint8), "L")
    canvas.paste(card, (int(rng.integers(0, max(1, W - card.size[0]))), int(rng.integers(0, max(1, H - card.size[1])))), mask)
    sigma = blur640 * (W / 640.0)
    if sigma > 0.05:
        canvas = canvas.filter(ImageFilter.GaussianBlur(sigma))
    arr = np.asarray(canvas).astype(np.float32) * float(rng.uniform(0.85, 1.15)) + float(rng.uniform(-10, 10))
    arr += rng.normal(0, float(rng.uniform(2, 6)), arr.shape)
    return jpeg_gray(arr.clip(0, 255), rng)


def empty_scene(rng, size):
    """ภาพไม่มี QR: พื้นหลังไล่เฉด + เส้น/สี่เหลี่ยมสุ่ม (ฉากรกให้ตัวหาตา QR พลาดง่าย)"""
    W, H = size
    xs, ys = np.linspace(-1, 1, W)[None, :], np.linspace(-1, 1, H)[:, None]
    arr = rng.integers(70, 190) + 25 * xs * rng.uniform(-1, 1) + 20 * ys * rng.uniform(-1, 1)
    img = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "L")
    draw = ImageDraw.Draw(img)
    for _ in range(int(rng.integers(5, 40))):
        x0, y0 = int(rng.integers(0, W)), int(rng.integers(0, H))
        x1, y1 = x0 + int(rng.integers(3, 60)), y0 + int(rng.integers(3, 60))
        if rng.random() < 0.5:
            draw.rectangle((x0, y0, x1, y1), fill=int(rng.integers(0, 255)))
        else:
            draw.line((x0, y0, x1, y1), fill=int(rng.integers(0, 255)), width=int(rng.integers(1, 5)))
    img = img.filter(ImageFilter.GaussianBlur(float(rng.uniform(0.3, 2.0))))
    a = np.asarray(img).astype(np.float32) + rng.normal(0, float(rng.uniform(2, 7)), (H, W))
    return jpeg_gray(a.clip(0, 255), rng)


def run(exe, work, images, mode):
    d = work / "imgs"
    if d.exists():
        shutil.rmtree(d)
    d.mkdir()
    lines = []
    for i, g in enumerate(images):
        p = d / f"{i}.raw"
        p.write_bytes(np.ascontiguousarray(g).tobytes())
        lines.append(f"{p} {g.shape[1]} {g.shape[0]}")
    (d / "manifest.txt").write_text("\n".join(lines))
    out = subprocess.run([str(exe), str(d / "manifest.txt"), mode], capture_output=True, text=True).stdout.splitlines()
    res = [None] * len(images)
    for ln in out:
        parts = ln.split("|")
        res[int(parts[0])] = parts[1:]
    return res


def main():
    rng = np.random.default_rng(101)
    failures = []
    with tempfile.TemporaryDirectory(prefix="smmb_qr_host_") as tmp:
        work = pathlib.Path(tmp)
        exe = build_host(work)
        print(f"สร้างตัวอ่านบนคอมจาก {LIB} (แพชแล้ว) สำเร็จ\n")
        print(f"ภาพจำลอง QR ประจำตัว {TOTAL_MODULES - 4}×{TOTAL_MODULES - 4} โมดูล · เบลอ 0.5–2.0 · เอียง 0/12/28° (เกณฑ์ QVGA ≥ {MIN_QVGA}% · VGA ≥ {MIN_VGA}%)")
        print(f"{'เฟรม':>9} {'ภาพ':>6} {'#':>4}   ไม่มีรอบสอง   เต็ม(+ลับขอบ)")
        for size, ms, need in (((320, 240), [2.5, 3.0, 3.5, 4.0], MIN_QVGA), ((640, 480), [4.0, 5.0, 6.0, 8.0], MIN_VGA)):
            scenes = []
            for m in ms:
                for blur in (0.5, 1.0, 1.5, 2.0):
                    for angle in (0, 12, 28):
                        for _ in range(4):
                            g = qr_scene(rng, m, blur, angle, size)
                            if g is not None:
                                scenes.append(g)
            for label, transform in (("กระจก", np.fliplr), ("ปกติ", lambda g: g)):
                imgs = [np.ascontiguousarray(transform(g)) for g in scenes]
                rate = {}
                for mode in ("nowork", "full"):
                    rs = run(exe, work, imgs, mode)
                    rate[mode] = 100.0 * sum(1 for r in rs if r[0] == "OK" and r[1] == TEXT) / len(imgs)
                ok = rate["full"] >= need
                print(f"{size[0]}x{size[1]:<4} {label:>6} {len(imgs):4d}   {rate['nowork']:9.0f}%   {rate['full']:11.0f}%   {'ผ่าน' if ok else 'ไม่ผ่าน'}")
                if not ok:
                    failures.append(f"{size[0]}x{size[1]} {label}: {rate['full']:.0f}% < {need}%")

        empties = [empty_scene(rng, (320, 240)) for _ in range(300)] + [empty_scene(rng, (640, 480)) for _ in range(100)]
        rs = run(exe, work, empties, "full")
        wrong = sum(1 for r in rs if r[0] == "OK")
        trigger = 100.0 * sum(1 for r in rs if r[0] == "NO" and (int(r[1]) > 0 or int(r[2]) >= 2)) / len(empties)
        print(f"\nภาพไม่มี QR {len(empties)} ภาพ: อ่านมั่ว {wrong} · เข้าเงื่อนไขทำรอบสอง {trigger:.1f}% (เกณฑ์ 0 มั่ว และ ≤ {MAX_EMPTY_TRIGGER}%)")
        if wrong:
            failures.append(f"อ่านมั่ว {wrong} ภาพ")
        if trigger > MAX_EMPTY_TRIGGER:
            failures.append(f"รอบสองทำงานเปล่า {trigger:.1f}%")

    if failures:
        print("\nไม่ผ่าน:", *failures, sep="\n  - ")
        sys.exit(1)
    print("\nผ่านทุกเกณฑ์")


if __name__ == "__main__":
    main()
