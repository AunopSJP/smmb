# 3 โหมดการแสดงผล — สเปกจากแคนวาสดีไซน์ (2026-11-09)

อ้างอิง: `smmb-design-canvas.zip` (263 ไฟล์ = 99 หน้า · 82 หน้า × 3 โหมด)
โทเคน/สไตล์กลาง: `frontend/src/styles.scss` · ค่าโหมด: `frontend/src/app/core/display-settings.ts`
attribute ที่ root: `<html data-mode="easy|default|advanced" data-theme data-text-size>`

## หลักการ

| โหมด | เป้าหมาย | กติกาการเขียนหน้า |
|---|---|---|
| `easy` | ตัวใหญ่ ปุ่มใหญ่ เห็นเฉพาะสิ่งที่ต้องทำ | ซ่อนรายละเอียดรองด้วย `.easy-hide` · เนื้อหาที่ต่างจากโหมดปกติใช้ `.easy-only` · ไม่มีข้อมูลเทคนิค · เก็บ SOS/คำเตือนความปลอดภัยไว้เสมอ |
| `default` | หน้าปกติ | เลย์เอาต์ปัจจุบัน |
| `advanced` | เห็นข้อมูลเทคนิคครบ | เพิ่มรหัส/เวลา/เวอร์ชัน/สถานะด้วย `.adv-only` · ใช้ข้อมูลที่มีใน API เท่านั้น |

- `.desk-only` = ซ่อนบนมือถือ ยกเว้นโหมด advanced (แดชบอร์ดจอคอม)
- ห้ามใส่ข้อมูลปลอมหรือเปิดข้อมูลส่วนบุคคลเกินกฎใน `CLAUDE.md`
- ทุกข้อความใหม่ต้องมีไทย+อังกฤษผ่าน `i18n.t({ th, en })`

## แท็บล่างตามโหมด (จากแคนวาส)

| บทบาท | default / advanced | easy |
|---|---|---|
| เจ้าของบ้าน | หน้าหลัก · ประวัติ · ตั้งค่า | เหมือนปกติ |
| เจ้าหน้าที่ | สรุป · ประวัติ · SOS · ตั้งค่า | สรุป · SOS · ตั้งค่า |
| หัวหน้า | ภาพรวม · โซน · สมาชิก · ตั้งค่า | ภาพรวม · สมาชิก · ตั้งค่า |
| แอดมิน | ภาพรวม · ตู้ · ผู้ใช้ · ระบบ | ภาพรวม · ตู้ · ผู้ใช้ |

ทำแล้ว: `TABS_EASY` ใน `screens/registry.ts` + `area-shell.ts` (ลดแท็บเฉพาะ **หน้าหลัก** ของบทบาท — หน้าอื่นในโหมดง่ายยังใช้แท็บเต็มตามแคนวาส)

## หน้า ↔ แคนวาส

| กลุ่ม | แคนวาส | หน้าในแอป |
|---|---|---|
| เจ้าของบ้าน | Main / HomeEasy / HomeAdv | `H03` `pages/owner-home.ts` |
| | SettingsDefault / Easy / Adv | `H13` `pages/owner/owner-settings.ts` |
| | OwnHistory · OwnOffline · OwnDelivery · OwnRange | `H12*` `pages/owner/owner-history.ts` |
| | OwnSos* / SosHold | `H08`–`H11-b` `pages/owner/owner-sos.ts` |
| | OwnWifi · OwnTech · OwnTechRequest · OwnTechDone | `H13-b/c` `owner-settings.ts` |
| | OwnAgencyMap | `H16` `owner-agencies.ts` |
| | OwnZoneReq · OwnBoxes | การ์ด/chips ใน `H13` |
| เจ้าหน้าที่ | OffHome / OffEasy / OffAdv · OffOffHours · OffAllDone | `O01` `officer-home.ts` |
| | OffScan · OffCode · OffCamPerm · OffNotSystem · OffSaving · OffFailed · OffBadge | `O02`–`O08` `officer-check.ts` |
| | OffSosList · OffSos · OffSosAccepted · OffSosClosed | `O09`–`O12` `officer-sos.ts` |
| | OffHistory | `O15` `officer-history.ts` |
| | SetOfficer | `O13` `officer-account.ts` |
| หัวหน้า | HeadHome / Easy / Adv | `L04` `head-home.ts` |
| | HeadMembers · HeadMember | `L05` `head/head-members.ts` |
| | HeadZones · HeadZoneEdit · HeadHouses · HeadHouseRequests | `L06`–`L07` `head/head-zones.ts` |
| | HeadProfile | `L10` `head/head-agency-profile.ts` |
| | HeadScanLog | `L08` `head/head-log.ts` |
| | SetHead | `L11` `head/head-settings.ts` |
| | AuthPending | `A11` `head/head-setup.ts` |
| แอดมิน | AdmHome / Easy / Adv | `D01` `admin-home.ts` |
| | AdmBoxes · AdmBoxDetail · AdmRegister · AdmUnbind | `D03`/`D04` `admin/admin-boxes.ts` |
| | AdmUsers · AdmUserDetail · AdmAgencies · AdmCreateAgency | `D09`/`D13` `admin/admin-people.ts` |
| | AdmQrList · AdmQrCase | `D05`–`D08` `admin/admin-qr.ts` |
| | AdmFirmware | `D17` `admin/admin-firmware.ts` |
| | AdmPlans · AdmTechReq · AdmAccessLog | `D14`/`D15`/`D11` `admin/*` |
| | SetAdmin | `D16` `admin/admin-hub.ts` |
| | TechCheck | `T01` `admin/technician.ts` |
| Auth/ไรเดอร์ | AuthLogin · Signup* · Terms · ChangePw · RolePicker | `A01`–`A16` `pages/auth/*` |
| | RidCode · RidConfirm · RidDone · RidError | `R01`–`R04` `pages/rider/rider.ts` |
| Shared | Notifications | `H14`/`L09`/`D12` `shared/notification-list.ts` |
| | NotifSettings | `/settings/notifications` (ทุกบทบาท) |
| | ModePicker | `/settings/display` (ทุกบทบาท) · H13-d/O13-b ใช้หน้าเดียวกัน |
| | ErrOffline · ErrNoAccess · ErrSession | `/error/offline` · `/error/not-found` · `/error/session` |

## สถานะ

- [x] กลไกโหมด 3 ระดับ + ธีม + ขนาดตัวอักษร + ภาษา
- [x] แท็บล่างตามโหมด (easy ลดเมนู)
- [x] ปรับเนื้อหา/เลย์เอาต์ 3 โหมดครบทุกหน้า (2026-11-09)
- [x] หน้า NotifSettings แยกทุกบทบาท — `/settings/notifications`
- [x] หน้า error 3 หน้า — `/error/offline` · `/error/session` · `/error/not-found` (+ ดัก `offline` event)
- [ ] Officer box detail (OffBoxDetail) — ยังไม่มีหน้าแยก
- [ ] OwnTechRequest timeline + OwnTechDone confirm — รอ API ยืนยันผลงานช่าง
- [ ] รายการอุปกรณ์/เครื่องที่เข้าสู่ระบบ — รอ API device list
