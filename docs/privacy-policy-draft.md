# นโยบายความเป็นส่วนตัว (ร่าง) · Privacy Policy (Draft)

> **สถานะ: ร่างเพื่อให้ผู้รับผิดชอบตรวจก่อนใช้จริง ยังไม่ใช่ฉบับประกาศ** · ยังไม่ผ่านการตรวจโดยที่ปรึกษากฎหมาย
> ตัวเลขระยะเก็บทั้งหมดต้องตรงกับค่าคงที่ใน `backend/src/scheduler/scheduler.service.ts` และหน้าข้อตกลง (`docs/terms-*.md`) เมื่อแก้ตัวเลขต้องแก้ทั้งสามที่
> วันที่มีผลบังคับใช้: ________ · ผู้ควบคุมข้อมูล: ________ · ติดต่อเรื่องข้อมูลส่วนบุคคล: ________

---

## ไทย

### 1. ผู้ควบคุมข้อมูลและช่องทางติดต่อ
ระบบ SMMB (ตู้ไปรษณีย์อัจฉริยะ) ดำเนินการโดย ________ ติดต่อเรื่องข้อมูลส่วนบุคคลได้ที่ ________

### 2. ข้อมูลที่เราเก็บ
| กลุ่ม | ตัวอย่าง | ใครเป็นผู้ให้ |
|---|---|---|
| ข้อมูลบัญชี | ชื่อ-สกุล คำนำหน้า เบอร์โทร อีเมล รหัสผ่าน (เก็บเป็นค่าแฮชเท่านั้น) | ผู้สมัคร |
| ข้อมูลบ้าน (เจ้าของบ้าน) | ที่อยู่ แขวง เขต จังหวัด รหัสไปรษณีย์ หมุดพิกัดบ้าน ผู้อยู่อาศัย ผู้ที่ต้องดูแลพิเศษ จุดสังเกต | เจ้าของบ้าน |
| ผู้ติดต่อฉุกเฉิน | ชื่อและเบอร์ของผู้ติดต่อ | เจ้าของบ้าน |
| ข้อมูลหน่วยงาน/เจ้าหน้าที่ | ตำแหน่ง รหัสเจ้าหน้าที่ ที่อยู่หน่วยงาน หมุดหน่วยงาน | หน่วยงาน/เจ้าหน้าที่ |
| ข้อมูลการตรวจตู้ | ประวัติการสแกน QR ประจำตัวเจ้าหน้าที่ เวลา ผลการตรวจ และ IP/อุปกรณ์ที่ใช้ | ระบบบันทึกอัตโนมัติ |
| รูปยืนยันการตรวจ (Snapface) | รูปถ่ายจากกล้องตู้หลังการตรวจผ่าน | ระบบบันทึกอัตโนมัติ |
| ข้อมูลอุปกรณ์และแจ้งเตือน | ข้อมูล Web Push (subscription) รหัสอุปกรณ์ | ระบบบันทึกอัตโนมัติ |
| ตำแหน่ง | หมุดบ้านที่ใช้ปุ่มนำทาง (ขอเมื่อกดเท่านั้น ไม่เก็บในแอป) | ระบบ/อุปกรณ์ของผู้ใช้ |

**เราไม่เก็บ** เลขบัตรประชาชน ข้อมูลการชำระเงิน และข้อมูลสุขภาพ

### 3. วัตถุประสงค์และฐานทางกฎหมาย
- ยืนยันการตรวจตู้ของเจ้าหน้าที่ และเป็นหลักฐานการตรวจ (ตามความยินยอม/การปฏิบัติตามภารกิจของการตรวจ)
- ส่งแจ้งเตือนถึงเจ้าของบ้าน ไรเดอร์ และเจ้าหน้าที่ รวมถึงการแจ้งเหตุ SOS
- แสดงข้อมูลให้หัวหน้าหน่วยงานและแอดมินตามบทบาท
- ป้องกันการใช้งานผิดปกติและตรวจสอบความปลอดภัยของระบบ

### 4. การเปิดเผยข้อมูล
- **เบอร์โทรและที่อยู่ของเจ้าของบ้าน** เห็นได้เฉพาะตอนมี SOS เปิดอยู่ และบันทึกการเข้าถึงทุกครั้ง
- **หมุดบ้าน** เจ้าหน้าที่ขอได้เฉพาะตู้ในโซนของตัวเองและในเวลาตรวจ และถูกบันทึกการเข้าถึง
- **รูปยืนยันการตรวจ** เห็นได้เฉพาะเจ้าของบ้านและแอดมิน เจ้าหน้าที่ไม่ได้รับแจ้งว่ามีรูปหรือเวลาถ่าย
- เราไม่ขายข้อมูลส่วนบุคคล

### 5. ระยะเวลาการเก็บรักษา
| ข้อมูล | ระยะเก็บ | หมายเหตุ |
|---|---|---|
| session การเข้าสู่ระบบ | 30 วัน | หลังหมดอายุจึงลบ |
| รูปยืนยันการตรวจ (Snapface) | 30 วัน | |
| ประวัติการสแกนและผลการตรวจ (`scan_log`) | 1 ปี | ใช้เป็นหลักฐานการตรวจ |
| ประวัติการเข้าถึงข้อมูลส่วนบุคคล (`data_access_log`) | 1 ปี | ใช้ตรวจสอบการเข้าถึง |
| ประวัติการแจ้งเตือน | 1 ปี | |
| ข้อมูลอุปกรณ์ที่เคยเข้าสู่ระบบ | 1 ปี | |
| บันทึกการเชื่อมต่อของตู้และรายงานตู้ | 90 วัน | |

เมื่อครบกำหนดระบบจะลบข้อมูลอัตโนมัติ การลบเป็นไปตามตารางนี้ ไม่สามารถกู้คืนได้

> **จุดที่ต้องตัดสิน:** ระยะ 30 วันของรูปและ 1 ปีของ log ยังไม่ผ่านการตรวจจากที่ปรึกษากฎหมาย โดยเฉพาะเหตุผลที่ต้องเก็บหลักฐานการตรวจนานกว่า 30 วัน

### 6. สิทธิของเจ้าของข้อมูล
ท่านมีสิทธิขอเข้าถึง แก้ไข ลบ ระงับ คัดค้าน และขอรับข้อมูลในรูปแบบที่อ่านได้ (portability) ตามพระราชบัญญัติคุ้มครองข้อมูลส่วนบุคคล พ.ศ. 2562 (PDPA) ได้ที่ช่องทางในข้อ 1 ท่านถอนความยินยอมได้ทุกเมื่อ โดยไม่กระทบต่อการประมวลผลที่ทำไปแล้ว

ผู้ใช้สามารถดูและส่งออกข้อมูลของตัวเอง และลบบัญชีได้จากหน้า **ข้อมูลของฉัน** ในแอป

### 7. ความปลอดภัย
- รหัสผ่านเก็บเป็นค่าแฮช · การสื่อสารผ่าน HTTPS · ข้อมูลของตู้ลงลายเซ็นทุกคำขอ
- ฐานข้อมูลทำงานใน container บนเครื่องเซิร์ฟเวอร์ที่เข้าถึงจากภายนอกไม่ได้โดยตรง
- บันทึกการเข้าถึงและ log ถูกเขียนแบบเพิ่มได้อย่างเดียว แก้หรือลบจากแอปไม่ได้
- มีการสำรองข้อมูลรายวัน เก็บสำเนาไว้นอกเครื่องเซิร์ฟเวอร์ · ระยะเวลาการเก็บสำรองคือ ________

### 8. การโอนข้อมูลไปต่างประเทศ
________ (ระบุว่าใช้บริการภายนอกที่อยู่นอกประเทศไทยหรือไม่ เช่น บริการ Push ของเบราว์เซอร์ บริการตรวจ uptime และที่ตั้งเซิร์ฟเวอร์)

### 9. การเปลี่ยนแปลงนโยบาย
เมื่อแก้ไขนโยบายที่กระทบสิทธิของท่าน ระบบจะให้ท่านกดยอมรับฉบับใหม่ก่อนใช้งานต่อ

### 10. การร้องเรียน
ท่านสามารถร้องเรียนต่อสำนักงานคณะกรรมการคุ้มครองข้อมูลส่วนบุคคลได้

---

## English

### 1. Data controller and contact
SMMB (Smart Mailbox) is operated by ________. For personal data inquiries, contact ________.

### 2. Data we collect
- **Account:** name, title, phone number, email, password (stored only as a salted hash).
- **Home (owners):** address, sub-district, district, province, postal code, pinned home location, occupants, people needing special care, landmarks, emergency contacts.
- **Agency/officers:** position, staff number, agency address and location.
- **Inspection records:** QR scan logs for officer badges, time, outcome, IP address and device identifier.
- **Inspection photos (Snapface):** photos taken by the mailbox camera after a passed inspection.
- **Device and notifications:** Web Push subscription and device identifier.
- **Location:** the home pin is requested only when the user presses "Navigate" and is not stored in the app.

We do **not** collect national ID numbers, payment data, or health data.

### 3. Purposes and legal bases
Verifying inspections and keeping evidence; sending notifications including SOS alerts; showing data to agency heads and administrators according to role; preventing misuse and keeping the system secure. Legal bases to be confirmed: ________

### 4. Disclosure
- Owner phone numbers and address are visible to officers only while an SOS is active, and every access is logged.
- Home location is available to officers only for mailboxes in their own zone and during inspection hours, and every access is logged.
- Inspection photos are visible only to the home owner and administrators. Officers are not told that a photo was taken or when.
- We do not sell personal data.

### 5. Retention
| Data | Retention |
|---|---|
| Login sessions | 30 days |
| Inspection photos | 30 days |
| Inspection/scan logs | 1 year |
| Personal data access logs | 1 year |
| Notification history | 1 year |
| Device records | 1 year |
| Mailbox connection and report logs | 90 days |

Data is deleted automatically after these periods and cannot be recovered. **To be confirmed by legal review.**

### 6. Your rights
Under Thailand's PDPA (B.E. 2562 (2019)) you may access, correct, delete, restrict, object to, and request a copy of your data, and withdraw consent at any time. Contact us using section 1. Owners can export their data and delete their account from the **My Data** page in the app.

### 7. Security
Passwords are hashed. Traffic uses HTTPS. Mailbox requests are signed. The database runs in a container on a server that is not directly reachable from outside. Access and audit logs are append-only. Daily backups are made; off-site copy and backup retention: ________

### 8. International transfers
________ (state whether any external service outside Thailand is used, for example browser push services or an uptime monitoring service, and where servers are located)

### 9. Changes
If a change materially affects your rights, you must accept the new version before continuing to use the service.

### 10. Complaints
You may file a complaint with the Personal Data Protection Committee of Thailand.

---

## ตรวจก่อนประกาศ (สำหรับผู้รับผิดชอบ)
- [ ] ตัวเลขระยะเก็บตรงกับ `scheduler.service.ts` และ `docs/terms-*.md`
- [ ] เติมช่องว่าง (ผู้ควบคุม ช่องทางติดต่อ ฐานทางกฎหมาย การโอนต่างประเทศ ระยะสำรอง)
- [ ] ที่ปรึกษากฎหมายตรวจประเด็นรูปยืนยันและหมุดบ้าน
- [ ] ออกข้อตกลงฉบับใหม่ (`gen-terms.mjs`) ให้ทุกบัญชีกดยอมรับ
