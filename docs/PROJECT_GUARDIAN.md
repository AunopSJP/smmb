# Project Guardian (SMMB)

เอเจนต์/สคริปต์สำหรับตรวจสุขภาพโปรเจ็คและรายงานข้อผิดพลาด โดยไม่แก้ไขโค้ด

## ใช้งาน

| วิธี | คำสั่ง |
|---|---|
| ผ่าน OpenCode command | `/guardian` |
| ขอเอเจนต์ตรง ๆ | “ให้ project-guardian ตรวจโปรเจ็คแบบ full” |
| ตรวจเร็ว (static) | `node scripts/project-guardian.mjs` |
| ตรวจเต็ม (build/lint/test) | `node scripts/project-guardian.mjs --full` |
| สำหรับ CI | `node scripts/project-guardian.mjs --full --ci` |

รายงานจะถูกเขียนที่ `reports/guardian-YYYY-MM-DD_HH-mm.md` (ไม่ commit — อยู่ใน `.gitignore`)

## สิ่งที่ตรวจ

| หมวด | รายละเอียด |
|---|---|
| Git | ไฟล์ค้าง commit, branch/commit ปัจจุบัน |
| Registry ↔ routes | รหัสหน้าซ้ำ, path ซ้ำ, `BUILT` ไม่มีใน registry, หน้าที่ยังไม่มี component |
| Tabs | แท็บอ้างรหัสหน้าที่ไม่มีอยู่ |
| 3-mode | หน้าใน `pages/` ที่ไม่มี marker `easy-hide/easy-only/adv-only/desk-only` และไม่ได้อ่าน `DisplaySettings` |
| i18n | `i18n.t({ th: ... })` ที่ขาด `en:` |
| Secrets | ค่าที่ดูเหมือน password/token/api key ฝังใน source (ยกเว้น mock/spec) |
| Migrations | เลข migration ซ้ำ |
| TODO/FIXME | จำนวนจุดค้าง |
| Build | frontend `ng build`, backend `nest build` |
| Lint | backend `oxlint` |
| Unit tests | frontend `ng test --watch=false`, backend `vitest run` |

FAIL = build/lint/test/route/i18n/mode/migration ผิด · WARN = ควรแก้แต่ยังใช้งานได้ · INFO = ข้อมูล/สิ่งที่ถูกข้าม

## เอเจนต์

- `.opencode/agents/project-guardian.md` — subagent แบบ read-only (ห้ามแก้ไฟล์) มีสิทธิ์รันสคริปต์นี้กับ `git status/diff/log`
- `.opencode/commands/guardian.md` — คำสั่ง `/guardian` เรียกเอเจนต์แบบ background child

## CI (ไม่บังคับ)

`.github/workflows/project-guardian.yml` ตั้งให้ตรวจ:
- ทุก push เข้า `main`
- ทุก pull request
- ทุกวัน 08:00 น. เวลาไทย (01:00 UTC)
- กดรันเองผ่าน `workflow_dispatch`

ผลลัพธ์จะอยู่ที่ **Actions → Project Guardian → Artifacts → project-guardian-report** และสรุปในหน้า workflow run
ถ้าอยากให้แจ้งเตือนเพิ่ม (LINE/อีเมล) ต้องต่อ webhook ภายหลัง
