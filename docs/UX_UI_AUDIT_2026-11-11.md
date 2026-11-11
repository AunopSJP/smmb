# SMMB — ผลตรวจโฟลวและ UX/UI รอบ 2 (ละเอียดทุกบทบาท × 3 โหมด)

> ตรวจเมื่อ **2026-11-11** · ฐานโค้ด commit `38ac237` + งาน multi-box ที่ยังไม่ commit (`owner-settings` auto-fill/ข้อความแนะนำ)
> วิธีตรวจ: อ่านโค้ดจริงแบบ read-only + ไล่เส้นทางทุกบทบาท/โหมด + ตรวจ state/error/a11y/ responsive จาก template & CSS + ตรวจ production bundle ว่าตรงกับHEAD
> **ไม่ได้รันเบราว์เซอร์จริงในรอบนี้** — ข้อที่เกี่ยวกับสี/การทับ/scroll ยืนยันจากโค้ดและสไตล์ ต้องเคาะซ้ำด้วย Playwright/มือถือจริง (ดู §8)
> เอกสารนี้เป็นผลตรวจ + ข้อเสนอ ไม่ใช่สเปกฟีเจอร์ · งานที่แก้แล้วให้เปลี่ยนสถานะพร้อมหลักฐาน

---

## 0. สถานะหลังแก้ (2026-11-11)

**แก้แล้วในรอบนี้ (build/lint/test ผ่าน):**
| กลุ่ม | รายการ |
|---|---|
| P0 | P0-01 พื้นหลัง SOS โหมดง่าย · P0-02 ย้ายการ์ด SOS error เข้า `.page` + ปุ่มโทร + scrollIntoView |
| เจ้าของ/หลายตู้ | P1-01 ส่ง `?box=` ทุกเมนู + H13-b แสดงบ้านเลขที่ + H13/H13-c อ่าน `?box=` · P1-02 `last_inspected_at`/`deliveries_today` จาก DB · P1-03 push link มี `&box=` + H12/H12-d อ่าน `?box=` · P1-04 easy headline ตาม coverage · P1-05 H11/H11-b link-lost/error+retry |
| Error/offline/scroll | P1-19 owner-settings/H16/H12-d/officer-box/admin-qr easy/head-members ใช้ error+retry (เหลือ admin-hub) · P1-20 `withInMemoryScrolling` · P1-21 เก็บ path ก่อน offline + `online` กลับหน้าอัตโนมัติ + retry ฉลาด |
| เจ้าหน้าที่ | P1-07 SOS list error · P1-08 badge หมดอายุหยุดวน/ปุ่มสร้างใหม่ · P1-09 O05 โหลดบ้านเลขที่ + แยก “งานหมดเวลา” · P1-10 ปุ่มยกเลิกใน O05/O06 |
| หัวหน้า | P1-06 overview error+retry/ไม่ยืนยัน 0 · P1-22 confirm ก่อนถอดเจ้าหน้าที่ · P1-11 แจ้ง “แสดง 20 หลังแรก” + เปลี่ยนป้ายเลือกทั้งหมด (ยังไม่มี total จาก API) |
| แอดมิน/Auth | P1-12 firmware confirm · P1-13 reset password confirm · P1-14 QR reissue confirm · P1-15 D03/D09 load more · P1-16 เมนู D16/ตั้งค่า/A14 บนคอนโซล · P1-17 signup error summary+scroll · P1-18 เก็บร่างบ้าน/step ข้ามหน้าข้อตกลง · P1-23 A13 busy/error/signout + A04 signout เมื่อบัญชีไม่มีบทบาท |
| a11y/detail | focus trap + คืนโฟกัสใน ConfirmDialog · skip link · map role=group + i18n label · easy tabs นิ่งตาม area · admin easy มี sign-out |

**อัปเดตรอบ P2 (11 พ.ย. 2026 — ต่อจาก commit `5d7776c`):** toast แยกสี/ไอคอน error + ไม่ทับ SOS · rider R03-b มีทางออก/R01 แจ้ง error · TZ `datetime-local` เป็นเวลาไทย + เลื่อน/ยกเลิกนัดได้ · theme boot ก่อน Angular (ไม่มีจอวาบ) · notification mute แจ้งเมื่อบันทึกไม่ได้ + retry online · admin-hub/head agency profile error+retry · head log/D11 load more ไม่ข้ามหน้า · head SOS มีปุ่มกลับ L04 · H12-d เข้าถึงได้ + push offline มี `?box=` · ใบพิมพ์ QR มี activation · notif settings มีปุ่มย้อนกลับ + easy mode ปรับชนิดแจ้งเตือนได้ · relative time เป็นชั่วโมง/วัน · title หน้า error/settings แปลตามภาษา · aria-label กลุ่มตัวกรอง · แผนที่แจ้ง tile error + ปุ่มลองใหม่ · legend หมุดในโซน · ค้นบ้านมี `X-Total-Count` แสดง 20/N · D17 นับตู้ทุกหน้า · CSV ใช้ชื่อไฟล์เวลาไทย · admin easy มีลิงก์ D16/ตั้งค่า/A14

**ยังไม่ทำ (ตั้งใจเลื่อน):** composite widget arrow keys (radio/tab) · easy mode แอดมินบนมือถือยังไม่ถึง D16/ตั้งค่าโดยตรง (มีลิงก์ใน D01 แล้ว) · dead code บางส่วน · P2-26

---

## 1. สรุปผู้บริหาร

**คุณภาพโดยรวมดีกว่าโปรเจ็คทั่วไปในระยะเดียวกัน** — โครง guards/session แยก 401/ออฟไลน์ถูกต้อง, i18n มีวินัย (แทบไม่พบข้อความฮาร์ดโค้ด), 3 โหมดมี token กลาง, เวลาไทย fix `Asia/Bangkok` ในเส้นหลัก, หน้าตรวจตู้/SOS มีรายละเอียดที่ดี (hold 3 วิ, wake lock, badge TTL, server-decides) และ destructive action หลายจุดมี confirm แล้ว

**แต่ยังไม่ควรเปิดบ้านนำร่องทันที** เพราะพบ **2 เรื่องระดับ P0 ในเส้น SOS** และ **กลุ่ม P1 ที่ทำให้ทำกับ “ตู้ผิดหลัง” / เห็นข้อมูลผิด / ถูกบล็อกกลางทาง**:

1. **P0 — โหมดง่ายของ H09 (SOS) ใช้ตัวอักษร/ปุ่มสีขาวบนพื้นสว่าง** ทำให้อ่านสถานะไม่ได้และ **มองไม่เห็นปุ่มยกเลิก SOS** (`owner-sos.ts`)
2. **P0 — ข้อความ “ส่ง SOS ไม่สำเร็จ — โทร 191/1669” ถูกวางหลังแถบ SOS แบบ fixed และไม่มีปุ่มโทร** ผู้ใช้อาจคิดว่าส่งแล้ว (`owner-home.ts`)
3. **P1 — เจ้าของหลายตู้: เมนู H13/การ์ด offline ไม่ส่ง `?box=`** → กด “เปลี่ยน Wi-Fi” อาจสั่ง **ตู้ใบแรกแทนตู้ที่เลือก** (ตู้จะออฟไลน์ 10 นาที) และ push ของตู้ที่ 2 เปิดประวัติผิด/เงียบ
4. **P1 — ข้อมูลหน้าแรกผิด**: “ของมาส่งวันนี้” และ “ตรวจล่าสุด” คำนวณจาก `latest_events` เพียง 5 แถว (ตรวจ+ส่งของปนกัน)
5. **P1 — หลายหน้าที่ยังใช้ API ไม่ครบ**: ถ้าโหลดล้มจะขึ้น “ไม่มีข้อมูล/ไม่มี SOS” แทน error+retry (เสี่ยงด้านความปลอดภัย โดยเฉพาะหัวหน้า/officer)

---

## 2. สิ่งที่ยืนยันว่าดี (ห้ามรื้อ)

| ด้าน | หลักฐาน |
|---|---|
| แยก 401 / เน็ตหลุด / 5xx / PUSH_REQUIRED ที่จุดเดียว | `core/api.ts:56-75`, `core/session.ts:83-98,159-178` |
| บัญชี `roles=[]` ไม่วนกลับ owner; pending แยกสถานะ | `core/session.ts:45-50,201-205` |
| SOS กดค้าง 3 วิ + pointer capture + easy แตะ→ยืนยัน + focus ไปปุ่มยืนยัน | `owner-home.ts:314-339,657-698`, `owner-home.scss:270-335` |
| ไม่มีเจ้าหน้าที่ดูแล → `SOS_NO_COVERAGE` → H08 + `tel:191/1669` | `owner-home.ts:701-717`, `owner-sos.ts:331-375`, `owner/call-buttons.ts` |
| ตู้หลายใบสลับแล้วไม่ค้างข้อมูลเก่า (Home) | `owner-home.ts:471-545` (`selected` + `loadSeq`) |
| หน้าตรวจ: server ตัดสิน, แยก O02–O08, badge TTL/นับถอยหลัง/3 ครั้ง, wake lock | `officer/officer-check.ts:28-66,791-811,937-1010` |
| O08 แยก “ยืนยันผลไม่ได้” + retry (ไม่ขึ้นเขียวหลอก) | `officer-check.ts:1069-1090,1195-1226` |
| ไรเดอร์: ตั๋วครั้งเดียว, กันกดซ้ำ, ตัดสินจาก `code` | `rider/rider.ts:21-26,41-63,281-297` |
| หัวหน้า: เพิ่มบ้าน multi-select + แผนที่ sync + confirm ก่อนส่ง | `head/head-zones.ts:265,307-321,695-774` |
| Confirm ในแอป 13+ จุด (ลบโซน/ถอดบ้าน/ปิดบัญชี/ถอดหัวหน้า ฯลฯ) | `head-zones.ts:717,832`, `admin-boxes.ts`, `admin-people.ts:633` |
| Notification optimistic read-all + rollback | `shared/notification-list.ts:380-394` |
| 3 โหมด + token กลาง + clamp ตัวอักษรตามจอ | `styles.scss:7-216,1530-1544`, `core/display-settings.ts` |
| i18n ไทย/อังกฤษเกือบ 100% (ไม่พบ aria-label/placeholder ฮาร์ดโค้ด) | ตรวจทั้ง `frontend/src/app` |
| เวลาไทยในเส้นหลัก (home/history/settings/SOS/officer/admin) | `owner-home.ts:605-655`, `owner-history.ts:121-126`, `officer-history.ts:156` |
| self-host ฟอนต์ + map tile ผ่าน backend + ResizeObserver | `index.html`, `map-tiles.service.ts`, `shared/map-pin.ts` |

---

## 3. P0 — ต้องแก้ก่อนใช้งานจริง

### P0-01 · H09 โหมดง่าย: ตัวอักษร/ปุ่มยกเลิก SOS สีขาวบนพื้นสว่าง
- **ไฟล์:** `pages/owner/owner-sos.ts:157-201` (`.easy-sos p { color: rgb(255 255 255 / 95%) }`, `.easy-cancel { color:#fff; border:#fff/75% }`, `.pulse` ขาว) เทียบ `styles.scss:745-749` (`.sos-page` ไม่มีพื้นหลัง) และ `styles.scss:750-756` (`.sos-head` เท่านั้นที่มี `--sos-bg`)
- **อาการ:** โหมดง่าย (ค่าเริ่มต้นของผู้สูงอายุ) แสดงข้อความ “กำลังขอความช่วยเหลือ/โปรดโทรแจ้งเหตุทันที” เป็นสีขาวบนพื้น `--bg` #f5f5f5 และปุ่ม “ยกเลิก SOS” เป็นกรอบขาวบนพื้นขาว → **อ่านไม่เห็น/กดไม่เจอ** (โหมดมืดและโหมดปกติไม่เป็น)
- **ผลกระทบ:** เส้นทางฉุกเฉิน ผู้ใช้มองไม่เห็นทางยกเลิกและไม่เห็นคำแนะนำให้โทร — P0
- **แนวแก้:** ให้ `.easy-sos` (หรือ `.sos-page` เฉพาะ easy) มี `background: var(--sos-bg); color: var(--sos-fg)` ครอบทั้งบล็อก หรือเปลี่ยนข้อความ/ปุ่มเป็น `--text`/`--sos` บนพื้นสว่าง + เพิ่ม contrast test ใน Playwright (light/dark × easy)

### P0-02 · H03 ข้อความ “ส่ง SOS ไม่สำเร็จ” ถูกแถบ SOS บัง และไม่มีปุ่มโทร
- **ไฟล์:** `pages/owner-home.ts:312-343` — `@if (sosError())` อยู่ **หลัง** `</div>` ของ `.page` และหลัง `.sos-bar` (fixed, `owner-home.scss:228-240`), ข้อความเป็นการ์ดเปล่า ไม่มี `app-call-buttons`
- **อาการ:** เมื่อ `startSos` ล้ม (นอกจาก 409) ผู้ใช้เห็นเพียงปุ่ม SOS เดิม; การ์ด error อยู่ท้ายเอกสาร ใต้แถบ fixed (ไม่มี padding กันทับ เพราะอยู่นอก `.page`) และกดโทรไม่ได้
- **ผลกระทบ:** ผู้ใช้อาจเชื่อว่าส่ง SOS แล้ว — P0 ด้านความปลอดภัย
- **แนวแก้:** ย้ายการ์ดเข้าใน `.page` ก่อน `.sos-bar`, ใส่ `<app-call-buttons [big]="true" />` + `role="alert"` + `scrollIntoView` เมื่อเกิด error (หรือแทนที่ปุ่ม SOS ด้วยสถานะ error ชั่วคราว)

---

## 4. P1 — ทำผิดตู้ / ข้อมูลผิด / ถูกบล็อกกลางทาง

### P1-01 · เจ้าของหลายตู้: `?box=` ไม่ถูกส่งต่อไปหน้าลูก → สั่ง Wi-Fi ผิดตู้
- **ไฟล์:** `owner-settings.ts:77` (easy menu → H13-c), `:262` (เมนูทั้งหมด → `url(m.code)` ไม่มี query), `owner-home.ts:131-132` (การ์ด offline → H13-b/H13-c ไม่มี `box`), `owner-settings.ts:719` (H13-b ไม่แสดงบ้านเลขที่/รหัสตู้เลย), `:883-887` (อ่าน `?box=` แต่ fallback `boxes[0]`), `:1226-1227` (H13-c default ตู้แรก)
- **อาการ:** เลือกตู้ที่ 2 ใน H13 → กด “เปลี่ยน Wi-Fi บ้าน” → H13-b โหลดตู้แรก; ไม่มีชื่อ/เลขบ้านให้รู้ตัว → กดยืนยัน = **ตู้ผิดหลังออฟไลน์ 10 นาที** (ตรวจ/ส่งของไม่ได้)
- **แนวแก้:** ส่ง `[queryParams]="{ box: box()?.id }"` ทุกเมนู/ลิงก์ที่เกี่ยวกับตู้; H13-b แสดง “บ้านเลขที่ + ชื่อตู้” ที่หัวหน้า; ถ้าไม่มี `?box=` ให้ใช้ picker กลางแทนการเดา `boxes[0]`; H13-c ส่ง `box` ไปกับปุ่ม “แจ้งช่างแทน” ด้วย

### P1-02 · “ของมาส่งวันนี้” / “ตรวจล่าสุด” คำนวณจาก 5 เหตุการณ์ล่าสุด (ตรวจ+ส่งของปน)
- **ไฟล์:** `owner-home.ts:615-630` (`lastCheck`/`deliveriesToday` ใช้ `latest_events`), `backend/src/box/owner-box.service.ts:131` (`eventsOf(boxId, 5, 0)`)
- **อาการ:** ตู้มีของส่งวันนี้ 3 ครั้ง แต่ 5 event ล่าสุดเป็นการตรวจ → ขึ้น “วันนี้ 0 ครั้ง”; ตรวจล่าสุดเก่ากว่า 5 event → “ยังไม่มี”
- **แนวแก้:** เพิ่มฟิลด์สรุปใน `GET /boxes/:id` เช่น `last_inspected_at`, `deliveries_today` (นับใน SQL ตาม TZ ไทย) แล้วให้หน้าแรกอ่านค่านั้น; อย่าใช้ list 5 แถวเป็นตัวเลขสรุป

### P1-03 · Push ของตู้ที่ 2 เปิดประวัติผิด/เงียบ (ไม่มี `?box=` + H12 ไม่อ่าน `?box=`)
- **ไฟล์:** `backend/src/inspection/inspection.service.ts:607-611` และ `rider.service.ts:109-112` (link `/home/history/...?id=` ไม่มี box), `owner-history.ts:366-374` (H12 อ่านแค่ `?type=`), `:417-429` (detail ต้องมี `box` จึงจะโหลดตู้ที่ถูก)
- **อาการ:** เจ้าของหลายตู้กด push ของตู้ที่ 2 → detail หา event ในตู้แรกไม่เจอ → `navigateByUrl('H12')` เงียบ ๆ; หรือเห็นประวัติตู้อีกหลัง
- **แนวแก้:** เติม `&box=<box_id>` ใน link ฝั่ง backend; H12 อ่าน `?box=` เพื่อเลือกตู้เริ่มต้น; `useEvent` แสดง error/ทางกลับเมื่อหาไม่เจอ

### P1-04 · โหมดง่ายยืนยัน “บ้านคุณปลอดภัยดี” แม้ไม่มีเจ้าหน้าที่ดูแล
- **ไฟล์:** `owner-home.ts:568-573` (`easyHeadline` ไม่ดู `coverage.has_officer`) เทียบการ์ดเตือนที่ `:113-117`
- **อาการ:** การ์ดแดง “ยังไม่มีเจ้าหน้าที่ดูแลบ้านนี้” อยู่เหนือ hero เขียว “บ้านคุณปลอดภัยดี” — ขัดกันและเป็นคำยืนยันที่ระบบยืนยันไม่ได้
- **แนวแก้:** branch `!b.coverage.has_officer` → “ยังไม่มีเจ้าหน้าที่ดูแลบ้านนี้” + ไฮไลต์ปุ่มโทร; ถ้า `open_sos` → “มี SOS เปิดอยู่”

### P1-05 · H11/H11-b ขาดสถานะ “ติดต่อเซิร์ฟเวอร์ไม่ได้”
- **ไฟล์:** `owner-sos.ts:552-556` (H11 เรียก `pollSos` โดยไม่ส่ง `onLink`), `:643-645` (H11-b `catch(() => null)` โหลดครั้งเดียว)
- **อาการ:** H11 ค้างหน้า “เจ้าหน้าที่รับแล้ว” ทั้งที่ขาดการติดต่อ; H11-b แสดงช่องว่าง (ชื่อ/หมายเหตุ) แต่ดูเหมือนเคสปิดสมบูรณ์
- **แนวแก้:** ส่ง `onLink` และแสดงแบนเนอร์ `linkOk` เหมือน H09/H11; H11-b เพิ่ม `loading/error/retry` + ข้อความ “โหลดสรุปไม่ได้”

### P1-06 · Head overview: API ล้มแล้วแสดง 0 / “ไม่มี SOS เปิดอยู่”
- **ไฟล์:** `pages/head-home.ts:489-491` (`catch(() => null)`), template `:55-77,123-140` ใช้ `today()?.sos_open ?? 0` และ `zones ?? []`
- **อาการ:** เน็ตหลุด/5xx → “ตอนนี้ไม่มีเคสเปิดอยู่”, “ตรวจแล้ว 0/0”, ไม่มี loading/error/retry — หัวหน้าอาจพลาด SOS จริง
- **แนวแก้:** แยก `loading/error` + `app-load-error` retry; คงค่าเดิม (`catch(() => this.today())`); ห้าม render 0 ก่อนโหลดเสร็จ; แสดง “โหลดไม่ได้ — อาจมีเคส” แทน empty

### P1-07 · Officer SOS list: API ล้มแล้วขึ้น “ไม่มี SOS ที่เปิดอยู่ตอนนี้”
- **ไฟล์:** `officer/officer-sos.ts:140-144` (`catch(() => null)` + ถ้า null ไม่เซ็ตค่า), template `:43-44`
- **อาการ:** เปิดหน้า SOS ครั้งแรกตอนเน็ตหลุด → `open()=[]` → ประโยคยืนยันว่าไม่มีเหตุ
- **แนวแก้:** `loadFailed` + `app-load-error` retry; ข้อความ “โหลดรายการไม่ได้ — อาจมี SOS” แทน empty; poll ต่อเมื่อกลับมา online

### P1-08 · Officer badge QR: error อื่นถูกกลืน + QR หมดอายุแล้วยังโชว์/ยิงซ้ำ
- **ไฟล์:** `officer/officer-check.ts:956-959` (`left <= 6` เรียก refresh ทุก 500 ms), `:973-986` (`catch` จัดการเฉพาะ `NOT_READY`), `:791-811` แสดง QR/นับถอยหลัง
- **อาการ:** badge ล้มเพราะเน็ต/5xx → QR เก่าค้าง, `left` ถึง 0 แต่ยังวนขอใหม่ทุก 500 ms; ผู้ใช้อาจยื่น QR หมดอายุให้ตู้ → เสีย attempt ฟรี
- **แนวแก้:** หยุดเมื่อ `left===0` + แสดง “QR หมดอายุ — ลองใหม่”, แยก error เครือข่าย/5xx, ปุ่มขอ QR ใหม่ manual, ใช้ `expires_at` จาก server (อย่าพึ่งนาฬิกาเครื่อง)

### P1-09 · O05 `?problem=1`: ไม่โหลดข้อมูลงาน → ไม่เห็นบ้านเลขที่; `expired` ถูกอธิบายเป็น “ตู้ไม่ตอบ 30 วิ”
- **ไฟล์:** `officer-check.ts:704-710` (return ก่อน `api.get`), `:724-726` (`expired` → `noResponse`), `:595-596` (ข้อความ “รอมา 30 วินาที”)
- **อาการ:** แจ้งปัญหาตู้โดยไม่เห็นว่าเป็นบ้านไหน; งานหมดอายุ (60 วิ) ถูกตีความเป็นตู้ไม่ตอบ → แจ้งเจ้าของ/แอดมินผิดสาเหตุ
- **แนวแก้:** โหลด inspection เสมอ (หรืออย่างน้อย house_no), แยก copy “งานหมดเวลา” กับ “ตู้ไม่ตอบ”, เสนอ “สแกนปลุกใหม่” ก่อนแจ้งปัญหา

### P1-10 · O05/O06 เป็น fullscreen ที่ไม่มีปุ่มยกเลิก/กลับ
- **ไฟล์:** `screens/registry.ts:160-164` (`fullscreen: true`), `officer-check.ts:612-623` (O05 waiting ไม่มีปุ่มออก), O06 `:780-816` มีแต่ลิงก์ “แจ้งปัญหาตู้”
- **อาการ:** สแกนผิดหลัง/เปลี่ยนใจ → ติดรอ 30–60 วิ; PWA standalone ไม่มีปุ่ม back ของเบราว์เซอร์; ถูกชี้นำให้แจ้งปัญหาตู้ทั้งที่ไม่มีปัญหา
- **แนวแก้:** เพิ่ม “ยกเลิก/กลับหน้าสรุป” (ปล่อย job หมดอายุ) + “สแกนหลังอื่น” แยกจาก “แจ้งปัญหา”; อย่าซ่อนแท็บในหน้าที่ผู้ใช้อาจต้องออกกลางทาง

### P1-11 · ค้นบ้านได้ไม่เกิน 20 หลัง แต่ UI บอก “พบ N” และมี “เลือกทั้งหมด”
- **ไฟล์:** `backend/src/agency/zone.service.ts:69,259` (`HOUSE_SEARCH_LIMIT=20`), `head-zones.ts:310-321`
- **อาการ:** หมู่บ้านใหญ่ → เพิ่มบ้านเข้าโซนได้ไม่ครบโดยไม่รู้ตัว; “เลือกทั้งหมด” เลือกเฉพาะ 20 ที่โหลดมา
- **แนวแก้:** คืน `total` + “20 จาก N” + load more/แบ่งหน้า; “เลือกทั้งหมด” ต้องหมายถึงชุดที่โหลดและบอกชัด

### P1-12 · Admin: “ใช้รุ่นนี้” = อัปเดตทุกตู้ทันที ไม่มี confirm
- **ไฟล์:** `admin/admin-firmware.ts:53` + `:193-202` (`setAuto` เรียก API ทันที), ข้อความ “ตู้ทุกใบ” อยู่ `:20-26`
- **อาการ:** แอดมินคิดว่าเลือกให้ตู้เดียว → ตู้ทั้งฝูงอัปเดตพร้อมกัน; ไฟล์เสีย = outage ทั้งระบบ
- **แนวแก้:** `Confirm.ask` ระบุจำนวนตู้/ความหมาย “ทุกตู้จะอัปเดตเมื่อออนไลน์” + แยกปุ่ม “ตั้งให้ทุกตู้” ให้ชัด

### P1-13 · Admin: “รีเซ็ตรหัส” ไม่มี confirm และเตะ session ทุกเครื่อง
- **ไฟล์:** `admin/admin-people.ts:356-357` (ปุ่ม) + `:618-629` (`reset()` ไม่มี Confirm; ต่างจากปิดบัญชี `:633-641` ที่มี)
- **อาการ:** กดพลาดผู้ใช้ผิด = คนนั้นหลุดทันทีและเข้าสู่ระบบไม่ได้จนได้รหัสชั่วคราว
- **แนวแก้:** `Confirm.ask` แสดงชื่อ/เบอร์/บทบาท + ผลกระทบ “ออกจากระบบทุกเครื่อง”

### P1-14 · Admin: ออก QR ใหม่ 2 ใบ/ส่งช่าง ไม่มี confirm (U-03)
- **ไฟล์:** `admin/admin-qr.ts:429-431` (เคสอาจปลอม), `:454-455` (start), `:484-486` (issueAll), `:870-880` (เรียก `reissueQr([1,2])`)
- **อาการ:** คลิกเดียว = QR ฟิสิกส์ทั้งสองใบใช้ไม่ได้ทันที → ตรวจ/ส่งของไม่ได้จนช่างไปติด
- **แนวแก้:** Confirm ระบุ “ใบเก่า 2 ใบจะใช้ไม่ได้ทันที” + แยก dispatch ออกจาก issue

### P1-15 · Admin list ถูกจำกัด 100 แถว ไม่มี load more
- **ไฟล์:** `core/admin-api.ts:256-258` (`per_page=100&page=`), `:342-343` (logs 100), `:405-409` (users 100), callers `admin-boxes.ts:554`, `admin-people.ts:587` (ไม่ส่ง page)
- **อาการ:** ตู้/ผู้ใช้ที่ 101+ **จัดการไม่ได้จาก UI**; ตัวเลข “ทั้งหมด N” ขัดกับรายการที่เห็น; D17 นับ firmware จาก 100 แรก; D01 “ต้องจัดการ” ไม่มีตู้ที่ 101+
- **แนวแก้:** เพิ่ม `loadMore()`/infinite scroll + “แสดง 100/N”; งานสรุปใช้ `overview` จาก server; เขียนเตือนเมื่อ `data.length===per_page`

### P1-16 · Admin บนคอนโซล (≥1024) เข้า D16/ตั้งค่า/เปลี่ยนรหัสตัวเองไม่ได้
- **ไฟล์:** `layout/area-shell.ts:25-96` (`ADMIN_NAV` ไม่มี D16/settings/A14), `:132-176` side nav, `:261-263` ซ่อน tab bar ≥1024, `admin-home.ts:315-324` เมนู/sign-out เป็น `mobile-only easy-hide`
- **อาการ:** แอดมินนั่งคอมเปลี่ยนภาษา/ธีม/ขนาดตัวอักษรไม่ได้, ตั้งค่าการแจ้งเตือนไม่ได้, เปลี่ยนรหัสตัวเองไม่ได้
- **แนวแก้:** เพิ่มกลุ่ม “ระบบ/บัญชี” ใน `ADMIN_NAV`: D16, `/settings/display`, `/settings/notifications`, A14 (หรือแสดงปุ่ม account ใน header ของ admin)

### P1-17 · สมัครเจ้าของบ้าน: กด “ถัดไป” แล้วเงียบเมื่อข้อมูลไม่ครบ
- **ไฟล์:** `auth/auth-owner.ts:167-173` (`return` เงียบ), `:62-78` (ฟิลด์บ้าน), `shared/house-fields.ts:39-41` + `profile-extras.ts:65` (เงื่อนไขซ่อน), แสดงเฉพาะขอบแดง
- **อาการ:** step 2 ต้องการที่อยู่ 4 ช่อง + ประเภทบ้าน/รหัสไปรษณีย์/จำนวนผู้อยู่อาศัย ที่ไม่ติดดาวว่า required และอยู่ล่างสุด → ผู้ใช้คิดว่าปุ่มพัง/เลิกสมัคร
- **แนวแก้:** สรุป error 1 บรรทัดบนสุด + `scrollIntoView` + focus ช่องแรก + ป้าย “(จำเป็น)” + `aria-describedby`

### P1-18 · อ่านข้อตกลงระหว่างสมัคร → กลับมา ฟอร์มหาย + step รีเซ็ต
- **ไฟล์:** `auth/auth-owner.ts:144-146` (`house` เป็น signal ของ component), `:80` (ลิงก์ A13), `auth-officer.ts:495-497` (กลับ A06 ด้วย `replaceUrl`)
- **อาการ:** ที่อยู่/แขวง/เขต/จังหวัด/หมุด/ข้อมูลบ้าน/ผู้ติดต่อฉุกเฉินหายหมด; เหลือเฉพาะชื่อ/เบอร์/บ้านเลขที่ใน `AuthDemo.forms`
- **แนวแก้:** ย้าย `house` ไปเก็บใน `AuthDemo.forms.owner` หรือ sessionStorage + จำ step ใน query (`?step=3`) หรือเปิดข้อตกลงเป็น sheet โดยไม่ทิ้งฟอร์ม

### P1-19 · ยังมีหน้า “โหลดล้ม → ขึ้นว่าไม่มีข้อมูล” (U-01 ยังไม่ปิด)
- **จุดที่เหลือ (ยืนยันจากโค้ด):**
  - `owner-settings.ts:497-505` (`boxes().catch(() => loaded=true)`) → “ยังไม่ได้ผูกตู้” + ปุ่มผูกตู้
  - `owner-settings.ts:509-512` (`open().catch(() => null)`) → การ์ดตู้หายทั้งใบ
  - `owner-agencies.ts:181-184` → H16 “ยังไม่มีหน่วยงานที่ปักหมุด”
  - `owner-history.ts:855-860` + `:835-841` → H12-d โหลด `boxes[0]` (ไม่สน `?box=`) และถ้าโหลดล้มจะขึ้น “ตู้ยังไม่เคยติดต่อมา”
  - `head-head-members.ts:176-177` + `:97-99` → ขึ้น “กำลังโหลด…” ตลอด/easy ว่าง
  - `officer-box-detail.ts:28-31` → error ทุกชนิดกลายเป็น “อาจไม่อยู่ในโซน/ถูกลบ” ไม่มี retry
  - `admin-qr.ts:169-181` → easy branch ไม่แสดง `loadFailed` (ขึ้น “กำลังโหลด…” ตลอด)
  - `admin-hub.ts:170-173` → catch เงียบ ตัวเลขว่าง
- **แนวแก้:** ใช้แพตเทิร์นเดียวกับ `owner-history`/`admin-boxes` (`loading` + `loadFailed` + `app-load-error (retry)` + คงข้อมูลเดิม) และเพิ่ม test “API 500 → เห็น error ไม่ใช่ empty”

### P1-20 · SPA ไม่รีเซ็ต/กู้ตำแหน่ง scroll
- **ไฟล์:** `app.config.ts:12` ไม่มี `withInMemoryScrolling`; ทั้งแอปไม่มี `scrollTo`/`scrollPositionRestoration`; `main` ไม่ใช่ scroll container (`area-shell.ts:557`)
- **อาการ:** แตะรายการท้ายลิสต์ (D03/H12/O15/L08) → หน้ารายละเอียดเปิดกลางหน้า หัวข้อ/ปุ่มย้อนกลับหลุดจอ
- **แนวแก้:** `provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration:'enabled', anchorScrolling:'enabled' }))`

### P1-21 · `/error/offline` กู้ไม่ได้ + event offline เตะออกจาก flow กลางทาง
- **ไฟล์:** `app.ts:31-33` (`offline` → navigate `/error/offline` ทันที), `error-screen.ts:107-109` (`retry()` = `location.reload()` ที่ URL เดิม), ไม่มี listener `online`
- **อาการ:** เน็ตกลับมาแล้วกด “ลองอีกครั้ง” ก็ยังอยู่ `/error/offline`; ช่วง Wi-Fi→4G สลับ 1 วิ จะถูกเตะออกจาก O02–O08/H09 กลางทาง
- **แนวแก้:** retry ตรวจ `navigator.onLine` แล้ว `history.back()`/ไปหน้าแรกของบทบาท; `online` → ออกจาก error อัตโนมัติ; อย่า navigate ทิ้งถ้าอยู่ใน fullscreen flow (แสดงแบนเนอร์แทน)

### P1-22 · หัวหน้า: ติ๊ก/ถอดเจ้าหน้าที่บันทึกทันที ไม่มี confirm/undo
- **ไฟล์:** `head-zones.ts:789-813` (toggle officers), `:402` (เตือนคนสุดท้ายแค่สีการ์ด)
- **อาการ:** แตะพลาด = โซนไม่มีคนตรวจ (บ้านไม่ถูกตรวจ/SOS ไม่ถึง) โดยไม่มีใครรู้
- **แนวแก้:** confirm เมื่อ uncheck + บล็อก/เตือนชัดเมื่อถอดคนสุดท้าย/ตัวเอง + toast/undo

### P1-23 · Auth: ทางตันตอนต้องยอมรับข้อตกลงใหม่/บัญชีถูกปิดสิทธิ์
- **ไฟล์:** `auth-officer.ts:487-493` (A13 update mode: ไม่มี `busy`/`try-catch`; POST ล้ม = เงียบ), `session.ts:45-50` (`pendingPath` ไม่รู้จัก `disabled`), `auth-start.ts:336` (เบอร์ผู้ดูแลเป็น `easy-hide`)
- **อาการ:** เน็ตกระตุกตอนกดยอมรับ → ค้างหน้าเดียว กดซ้ำไม่รู้ผล; บัญชี `roles=[]`+`disabled` ถูกพากลับ A04 ที่ล็อกอินค้างอยู่และไม่มีปุ่มออกจากระบบ (โหมดง่ายไม่เห็นเบอร์ติดต่อ)
- **แนวแก้:** เพิ่ม busy/error/toast + ปุ่มออกจากระบบใน A13 update mode; `agency_status==='disabled'` → หน้าแจ้งสิทธิ์ถูกปิด + signout; ไม่ซ่อนเบอร์ผู้ดูแลใน easy

---

## 5. P2 — ความสม่ำเสมอ / a11y / กรณีขอบ

| ID | เรื่อง | หลักฐาน | ผลกระทบ | แนวแก้ |
|---|---|---|---|---|
| P2-01 | Toast error หน้าตาเหมือนสำเร็จ (ไอคอน ✓ เขียว + `role=status`) | `core/toast.ts:24-29` | “บันทึกไม่สำเร็จ” อ่านผ่าน ๆ เหมือนสำเร็จ | เพิ่ม `kind:'ok'\|'error'` → ไอคอน/สี + `role=alert` |
| P2-02 | Toast ทับกลางปุ่ม SOS และแย่งคลิก | `toast.ts:38-45` (`bottom:88`, `pointer-events:auto`), `owner-home.scss:228` | ข้อความ error บังปุ่มฉุกเฉิน 4 วิ | ยก toast เหนือ `.sos-bar` หรือย้ายขึ้นบน; error toast ค้างจนกดปิด |
| P2-03 | Easy mode: ชุดแท็บสลับ 3↔4 ตามหน้าปัจจุบัน | `area-shell.ts:681-682` (`home[area]===code()`) | ตำแหน่งแท็บกระโดด กดผิด | คำนวณจาก area+mode เท่านั้น |
| P2-04 | Easy mode ซ่อน “ฟังก์ชัน” ไม่ใช่แค่รายละเอียด: ปิดชนิดแจ้งเตือน, sign-out/เปลี่ยนรหัสแอดมิน, ดู log เพิ่ม, หัวหน้าเข้าโซน | `notif-settings.ts:33,51,71`, `admin-home.ts:315-324`, `head-log.ts:147`, `head-settings.ts:42`, `TABS_EASY` | ผู้ใช้ easy (กลุ่มเปราะบาง) ตั้งค่าความปลอดภัย/ออกจากระบบไม่ได้ | แยกคลาส “ซ่อนรายละเอียด” กับ “ซ่อนฟังก์ชัน”; คงปุ่มตั้งค่า/ออกจากระบบใน easy |
| P2-05 | A11y: dialog ไม่ trap focus/คืนโฟกัส; SOS มี `role=main` ซ้ำ + `aria-live` ครอบทั้งหน้า (timer ทุกวิ); progressbar ไม่มีชื่อ; composite roles (radio/tab) ไม่มีคีย์ลูกศร | `confirm-dialog.ts:43,107-112`, `owner-sos.ts:45,453`, `head-home.ts:59`, `officer-check.ts:388-393`, `head-zones.ts:188-191` | SR อ่านรบกวน/คีย์บอร์ดหลุด/เข้าใจ widget ผิด | focus trap กลาง + คืนโฟกัส + Esc ทุกไดอะล็อก; `aria-live` เฉพาะ stage; `aria-label` progressbar; ใช้ radio/tab จริงหรือ roving tabindex (U-07) |
| P2-06 | แผนที่: tile ล่ม = เทาเปล่า ไม่มี error/retry; `role=application`; `houses-map` aria-label ไทยฮาร์ดโค้ด; ไม่มี legend | `map-pin.ts:32,114-130`, `agency-map.ts:31`, `houses-map.ts:25`, `map-tiles.ts:8-14` | ผู้ใช้ไม่รู้ว่าแผนที่พัง/SR อ่านไม่ได้ | `tileerror` → แถบ “โหลดแผนที่ไม่สำเร็จ + ลองใหม่” + ที่อยู่ข้อความสำรอง; `role=group`; i18n label; legend |
| P2-07 | ธีมมืด/ขนาดตัวอักษรแฟลชขาวก่อน boot | `index.html` ไม่มี early script, `display-settings.ts:121-131` | เปิดกลางคืนจอวาบขาว (เจ้าหน้าที่) | inline script อ่าน localStorage ใส่ `data-theme`/`data-text-size`/`lang` ก่อน CSS |
| P2-08 | R03-b “ตู้ปิดให้บริการ” ไม่มีปุ่มออก; R01 code ที่ไม่รู้จัก = กดแล้วเงียบ | `rider.ts:339-362`, `:156-165` | ไรเดอร์ทางตัน/กดซ้ำไม่จบ | เพิ่ม “สแกน/พิมพ์ใหม่ + กลับ R01”; fallback error + ไป R03 |
| P2-09 | Admin QR easy: โหลดล้มแล้วขึ้น “กำลังโหลด…” ตลอด | `admin-qr.ts:169-181` | ไม่มีทางกู้นอกจากออกจากหน้า | ใช้ `loadFailed()` + ปุ่ม retry ใน easy branch |
| P2-10 | หัวหน้า L05: โหลดล้ม → “กำลังโหลด…”/หน้าว่าง; L05-b เด้งกลับเงียบ | `head-members.ts:176-177,97-99,309-313` | คิดว่าคนรออนุมัติไม่มี/โหลดค้าง | error+retry; แยก 404 กับ network |
| P2-11 | Officer box detail: error ทุกชนิดข้อความเดียวและไม่มี retry | `officer-box-detail.ts:28-33,123-136` | ตู้ที่ควรตรวจถูกเข้าใจว่าไม่มีสิทธิ์ | แยก 404/5xx/status 0 + `app-load-error` |
| P2-12 | H16/D16 false empty | `owner-agencies.ts:181-184`, `admin-hub.ts:170-173` | เข้าใจว่าไม่มีหน่วยงาน/งานค้าง | `failed` + retry (U-01) |
| P2-13 | Head agency profile: โหลดล้ม → ฟอร์มว่าง ไม่มี error/retry (Save ถูก validation บล็อก ไม่ถึงขั้นลบข้อมูล) | `head-agency-profile.ts:96-114` | หัวหน้าติด/เข้าใจว่าข้อมูลหาย | `loadFailed` + retry + disable Save จนโหลดเสร็จ |
| P2-14 | Notification mute: optimistic + PATCH ล้มเงียบ ไม่ revert/retry | `notif-settings.ts:59-65`, `prefs-sync.ts:42-61` | ผู้ใช้คิดว่าปิดแล้วแต่ server ยังส่ง | revert + toast error + retry เมื่อ online |
| P2-15 | Head log `loadMore` เพิ่ม `page` ก่อน fetch; ล้มแล้วข้ามหน้าถาวร + ไม่มี error ในลิสต์ | `head-log.ts:265-272,325-328` | ประวัติหายเป็นช่วง | เลื่อน page เมื่อสำเร็จเท่านั้น + LoadError |
| P2-16 | D15 นัดช่างแล้วเลื่อน/ยกเลิกไม่ได้ | `admin-technician-requests.ts:45-47,132-141` | ต้องปิดงานทั้งที่ยังไม่ทำ/โทรตาม | เพิ่ม reschedule/cancel + แจ้งเจ้าของ |
| P2-17 | การ์ด SOS ของหัวหน้า link ไป area officer ไม่มีปุ่มกลับ L04 | `head-home.ts:71,138`, `officer-sos.ts:29` | หัวหน้าหลงบริบท กลับในแอปไม่ได้ | list SOS ของหัวหน้า หรือ `[back]=url('L04')`/`from=head` |
| P2-18 | Admin technician: `datetime-local` ตีความ TZ เครื่อง แล้วแสดงเป็นเวลาไทย | `admin-technician-requests.ts:132-137` เทียบ `:80-90` | เครื่อง TZ อื่น → เวลานัดเหลื่อมเป็นชั่วโมง | เติม `+07:00` ก่อน `new Date` + ป้าย “เวลาไทย (ICT)” |
| P2-19 | ใบพิมพ์ QR ใน D04 ไม่มี QR เปิดใช้ตู้; D03 ไม่มีปุ่มพิมพ์ | `admin-boxes.ts:771-775,1094-1104`, `styles.scss:1248-1253` | ช่างพิมพ์ใบเปิดใช้ตู้ไม่ได้ | เพิ่ม activation slot ใน print sheet + ปุ่มพิมพ์ใน D03 |
| P2-20 | H12-d/H12-e ไม่มีลิงก์จากที่ไหน; push `box_offline` ไป `/home`; H12-d โหลด `boxes[0]` และไม่รับ `?box=` | `scheduler.service.ts:123`, `registry.ts:130-134`, `owner-home.ts:130-136`, `owner-history.ts:855-860` | เสียงานออกแบบ; ถ้าเชื่อมลิงก์จะแสดงตู้ผิดหลัง | การ์ด offline บน H03 → H12-d พร้อม `?box=`; เปลี่ยน push link เป็น `/home/history/offline?box=`; ให้ H12-d อ่าน `?box=` |
| P2-21 | `/settings/notifications` ไม่มีปุ่มย้อนกลับบนหัว (ทางกลับอยู่ท้ายหน้า) | `notif-settings.ts:28,78` | PWA มือถือหาทางกลับยาก | ใส่ `[back]` ให้ `PageHeader` |
| P2-22 | `document.title` ของทุก route ฮาร์ดโค้ดไทย | `app.routes.ts:181,210-227` | ผู้ใช้ EN เห็นชื่อแท็บไทย | แปลจาก `I18n` ตอน NavigationEnd หรือมี titleKey |
| P2-23 | “ติดต่อล่าสุด” แสดงนาทีไม่จำกัด | `owner-home.ts:191-196`, `owner-api.ts:231` | “4320 นาทีที่แล้ว” อ่านไม่รู้เรื่อง | >120 นาที → ชั่วโมง/วัน (RelativeTimeFormat) |
| P2-24 | กลุ่ม segmented/tablist หลายจุดไม่มี `aria-label` | `admin-technician-requests.ts:16`, `head-log.ts:79`, `owner-settings.ts:1319-1332`, `head-zones.ts:188` | SR อ่านแค่ “group/tab list” | เติม label ตามแพตเทิร์น `notification-list.ts:61` |
| P2-25 | H13 “ใช้ที่อยู่เดียวกับตู้อื่น” อยู่ในโหมดแก้ไขเท่านั้น (แม้เพิ่ม hint/auto-fill แล้วแต่ยังไม่ commit) | `owner-settings.ts:180-215,466-472,600-612` | ผู้ใช้ไม่รู้ว่ามีทางลัด | แสดง hint ก่อนกดแก้ + auto-fill จากบ้านเลขที่เดียวกัน (งานที่ทำค้างไว้) |
| P2-26 | โค้ดตาย/บล็อกว่าง + component ยักษ์ 1,400–1,700 บรรทัด | `officer-check.ts:1099-1100`, `auth-start.ts:324,422`, `owner-settings.ts` | อ่าน/รีวิว/ทดสอบยาก | ลบบล็อกว่าง; แยก component ตามหน้าจอ (U-09) |

---

## 6. โฟลวรายบทบาท — สรุปสั้น

### เจ้าของบ้าน (H03/H08–H16)
- **ผ่าน:** สมัคร→ผูกตู้→หน้าหลัก→SOS→ประวัติ→ตั้งค่า; hold SOS; ไม่มี coverage; multi-box สลับหน้าแรก; ประวัติกรองฝั่ง server; H16 หมุดตรงลำดับ
- **สะดุด:** P0-01/P0-02 (SOS), P1-01 (ผิดตู้), P1-02/P1-03 (ข้อมูล/push), P1-04 (ข้อความปลอดภัย), P1-05 (H11), P1-19 (error→empty), easy mode ซ่อนตัวกรองประวัติ (`?type=delivered` แล้วล้างไม่ได้ — chip ตัวกรองอยู่ใน `.easy-hide` `owner-history.ts:140-149`)

### เจ้าหน้าที่ (O01–O16)
- **ผ่าน:** ตรวจตู้ server-decides, badge TTL, 3 attempts, wake lock, PUSH_REQUIRED, SOS race 409/410, O08 ไม่หลอกว่าสำเร็จ
- **สะดุด:** P1-07 (SOS list false empty), P1-08 (badge หมดอายุ), P1-09/P1-10 (problem/expired, ทางออก), P2-11 (box detail), polling ไม่หยุดเมื่อแท็บซ่อน (U-05)

### หัวหน้า (L01–L11)
- **ผ่าน:** โซน+เวลาตรวจ+บ้าน+เจ้าหน้าที่, multi-select+แผนที่, confirm หลายจุด, log/export
- **สะดุด:** P1-06 (overview 0 หลอก), P1-11 (20 หลัง), P1-22 (ถอดเจ้าหน้าที่), P2-10/P2-13/P2-15, easy mode ตัดแท็บโซนโดยไม่มีทางไป L06/L07 ในโหมดนั้น

### แอดมิน/ช่าง (D01–D17, T01–T02)
- **ผ่าน:** D03 ค้นหา/กรอง/URL, D04 confirm หลายจุด, QR/print, firmware, checklist จากสถานะจริง
- **สะดุด:** P1-12/P1-13/P1-14 (confirm), P1-15 (100 แถว), P1-16 (desktop nav), P2-09/P2-16/P2-19, easy mode ออกจากระบบไม่ได้

### ไรเดอร์ (R01–R04)
- **ผ่าน:** ตั๋ว 10 นาทีครั้งเดียว, 5 ครั้ง/ชม., code→screen, กันกดซ้ำ
- **สะดุด:** P2-08 (R03-b ทางตัน, R01 code ไม่รู้จักเงียบ)

### Auth (A01–A16, terms)
- **ผ่าน:** signin error แยก, lock/rate limit, must-change-password, 401 vs offline, ไม่มี admin signup, role entry
- **สะดุด:** P1-17/P1-18 (สมัคร), P1-23 (A13 update/disabled), P2-22, การแมป error เน็ต/5xx เป็น “กรอกข้อมูลไม่ถูกต้อง” (`auth-owner.ts:181-183`, `auth-officer.ts:198-200`)

### โหมดการแสดงผล
| โหมด | เจ้าของ | เจ้าหน้าที่ | หัวหน้า | แอดมิน |
|---|---|---|---|---|
| ง่าย | ใช้ได้ แต่ P0-01/P0-02 + ประวัติกรองค้าง | ใช้ได้ (ตัดประวัติตามดีไซน์) แต่ badge/ทางออกมีปัญหา | ใช้ได้ แต่เข้าโซนไม่ได้ | **dead end:** ไม่มี sign-out/settings/เปลี่ยนรหัส |
| ปกติ | ครบ | ครบ | ครบ | ครบ |
| ละเอียด | ครบ + technical | ครบ | ครบ | ครบ |

---

## 7. กลุ่มปัญหาเชิงระบบ (แก้ครั้งเดียวได้หลายหน้า)

1. **Error ≠ Empty (U-01):** ยังเหลือ 8+ จุดที่ catch แล้ว render ค่าเริ่มต้น/empty โดยไม่มี retry — ควรทำ `failed` signal + `app-load-error` เป็นมาตรฐานเดียว และเพิ่ม unit test “500 → error”
2. **Easy mode ซ่อนฟังก์ชัน (U-04):** `easy-hide` ถูกใช้ทั้ง “รายละเอียดรอง” และ “ฟังก์ชันตั้งค่า/ออกจากระบบ” → ต้องแยกคลาส/จัดกลุ่มใหม่; ชุดแท็บต้องนิ่งตาม area
3. **Destructive action (U-03):** confirm ครบหลายจุดแล้ว แต่ยังขาด firmware fleet, reset password, QR reissue, officer toggle — ใช้ `Confirm.ask` เดียวกัน
4. **Multi-box context:** ทุกอย่างที่เกี่ยวกับ “ตู้” ต้องมี `?box=` หรือ picker กลาง; อย่า fallback `boxes[0]` เงียบ ๆ
5. **A11y (U-07):** focus trap/restore, skip link, `aria-live` เฉพาะจุด, progressbar label, composite widget keyboard — ตรวจด้วย keyboard + SR 1 รอบ
6. **เวลา (U-02):** เหลือ CSV filename (UTC) และ `datetime-local` (TZ เครื่อง) — sweep ให้ครบ
7. **Polling (U-05):** officer check/SOS/badges ยัง `setInterval` โดยไม่เช็ก `visibilityState` — ใช้ `liveRefresh` หรือ guard
8. **ข้อมูลสรุปจาก list:** หน้าแรกใช้ 5 events เป็นตัวเลข; admin ใช้ 100 แถวเป็น “ทั้งหมด” — ต้องมี summary จาก server

---

## 8. ลำดับที่แนะนำให้แก้

### Batch 1 — P0 ความปลอดภัย (ควรทำทันที)
- P0-01 พื้นหลัง/คอนทราสต์ H09 easy
- P0-02 ย้ายการ์ด SOS error + ปุ่มโทร
- เพิ่ม Playwright: SOS easy light/dark, SOS fail (network abort) → เห็น error + tel

### Batch 2 — ผิดตู้ + ข้อมูลผิด
- P1-01 `?box=` ทุกเมนู/H13-b แสดงบ้าน
- P1-02 summary API (`last_inspected_at`, `deliveries_today`)
- P1-03 push link + H12 `?box=`
- P1-04 easy headline ตาม coverage/open_sos
- P1-05 H11/H11-b link-lost/error

### Batch 3 — Error/offline/scroll (แก้ครั้งเดียวหลายหน้า)
- P1-19 sweep `app-load-error` + test 500
- P1-20 `withInMemoryScrolling`
- P1-21 `/error/offline` retry/online
- P1-06/P1-07 false zero/no SOS

### Batch 4 — Admin/Head destructive + scale
- P1-12/13/14 confirm
- P1-15 load more 100+
- P1-16 admin nav settings/A14
- P1-11 search total/load more
- P1-22 officer toggle confirm

### Batch 5 — Auth + easy mode + a11y
- P1-17/18 validation/data loss
- P1-23 auth dead ends
- P2-03/04 easy mode
- P2-05/06 a11y/map

**ประมาณการ:** Batch 1 = 0.5–1 วัน, Batch 2 = 1–2 วัน, Batch 3 = 1–2 วัน, Batch 4 = 2–3 วัน, Batch 5 = 2–3 วัน (รวมทดสอบมือถือ/3 โหมด)

---

## 9. แผนตรวจซ้ำ (DoD)

- Playwright อย่างน้อย 8 เส้น: owner multi-box (สลับ/ใช้ที่อยู่/สั่ง Wi-Fi ถูกตู้), SOS fail + easy contrast, officer scan→badge→pass/expire, head zone add >20 houses, admin reset/QR confirm, admin desktop settings/A14, offline error recovery, rider closed
- จอ 390/768/1024/1440 × ธีมสว่าง/มืด × โหมด easy/default/advanced
- Keyboard + screen reader: dialog focus, SOS live region, tabs/radios, map alternative text
- API failure injection (500/status 0) ทุกหน้าหลัก → ต้องเห็น error+retry ไม่ใช่ empty
- ตรวจ contrast ของ `.easy-sos`, `.easy-cancel`, ป้าย warn/success ในธีมสว่าง
- ยืนยัน production หลัง deploy: bundle hash, `ngsw.json`, และ hard-refresh/SW update

## 10. ข้อจำกัดของผลตรวจ
- รอบนี้ไม่ได้เปิดเบราว์เซอร์จริง/ไม่ได้อัดวิดีโอ — ข้อ P0-01/P0-02, P2-02, P2-06, P2-07 ยืนยันจากโค้ด/CSS และต้องเคาะด้วยภาพจริงอีกครั้ง
- ตัวเลข/สถานะ production ไม่ได้ทดสอบกับบัญชีจริง (ไม่มี credential) — ข้อ P1-02/P1-06/P1-07 ยืนยันจากเส้นโค้ด ไม่ใช่จากข้อมูล prod
- บางหน้าเป็น component ขนาดใหญ่ (1,400–1,700 บรรทัด) ทำให้เสี่ยงพลาด interaction ย่อย; แนะนำแยกก่อนเพิ่ม test
