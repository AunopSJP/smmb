// สร้างจาก docs/terms-2026-11-13.md ด้วย docs/scripts/gen-terms.mjs — ห้ามแก้ไฟล์นี้ตรง ๆ
// ของจริงหน้า A13 อ่านจาก GET /api/v1/terms/current (ฉบับเดียวกัน)

export interface TermsPart {
  title: string;
  intro: string;
  sections: { title: string; items: string[] }[];
}

export const TERMS_VERSION = '2026-11-13';

export const TERMS: { th: TermsPart; en: TermsPart } = {
  "th": {
    "title": "ข้อตกลงการใช้งาน Smart Mailbox (ฉบับร่างสำหรับเดโม)",
    "intro": "⚠️ ฉบับ Mock สำหรับทดสอบ/เดโมเท่านั้น ยังไม่ใช่ข้อตกลงจริงและยังไม่ผ่านการตรวจโดยผู้เชี่ยวชาญกฎหมายหรือ PDPA · ฉบับวันที่ 13 พฤศจิกายน 2026 · ใช้กับทุกคนที่มีบัญชี (เจ้าของบ้าน เจ้าหน้าที่ หัวหน้าหน่วยงาน แอดมิน)",
    "sections": [
      {
        "title": "1. SOS ไม่ได้แทนการโทร 191 / 1669",
        "items": [
          "เหตุฉุกเฉินร้ายแรง ให้โทร 191 (ตำรวจ) หรือ 1669 (การแพทย์ฉุกเฉิน) โดยตรงเสมอ",
          "SOS ส่งถึงเจ้าหน้าที่ในโซนของบ้านเป็นขั้น ๆ ระบบไม่รับประกันว่าจะมีคนรับเรื่อง หรือมาถึงภายในเวลาที่กำหนด",
          "ถ้าบ้านยังไม่มีเจ้าหน้าที่ดูแล ระบบจะบอกให้โทรทันที"
        ]
      },
      {
        "title": "2. ช่วงทดลอง ใช้ฟรี",
        "items": [
          "ตอนนี้เป็นรุ่นทดลอง ไม่มีการชำระเงิน · เจ้าของบ้านได้แพ็กเกจ \"ฟรี\" อัตโนมัติ ไม่มีวันหมดอายุ และใช้ได้ทุกฟีเจอร์",
          "SOS และการตรวจตู้ใช้ได้เสมอ ไม่ขึ้นกับแพ็กเกจ",
          "ระบบอาจหยุดชั่วคราวเพื่อปรับปรุง หรือเปลี่ยนแปลงได้ระหว่างทดลอง"
        ]
      },
      {
        "title": "3. บัญชีและรหัสผ่าน",
        "items": [
          "1 เบอร์โทร = 1 บัญชี มีได้หลายบทบาท (เช่น เจ้าของบ้านที่เป็นเจ้าหน้าที่ด้วย) · บัญชีแอดมินมีบทบาทอื่นร่วมไม่ได้",
          "เก็บรหัสผ่านไว้เอง ห้ามให้คนอื่นใช้บัญชี · ระบบไม่มี OTP และไม่ส่ง SMS",
          "ลืมรหัส: เจ้าหน้าที่ขอให้หัวหน้ารีเซ็ต · คนอื่นติดต่อผู้ดูแลระบบ · รหัสชั่วคราวต้องเปลี่ยนก่อนใช้งาน",
          "ใส่รหัสผิด 5 ครั้งใน 15 นาที บัญชีถูกพักการเข้าสู่ระบบ 15 นาที",
          "ดูเครื่องที่ล็อกอินอยู่และสั่งออกจากระบบทีละเครื่องได้เอง ที่เมนู \"ข้อมูลของฉัน\""
        ]
      },
      {
        "title": "4. สิ่งที่ระบบบันทึก",
        "items": [
          "ทุกการสแกนหรือพิมพ์รหัส แม้ไม่ผ่าน: ใคร · ตู้ไหน · QR ใบไหน · สแกนหรือพิมพ์ · ผล · เวลา",
          "การแจ้งส่งของ (ไม่เก็บว่าไรเดอร์เป็นใคร) · SOS · การยอมรับข้อตกลง · การที่แอดมินเปิดดูข้อมูลส่วนบุคคล · การที่คุณส่งออกข้อมูลของตัวเอง",
          "บันทึกเหล่านี้แก้ไขหรือลบไม่ได้ และเก็บไว้ 1 ปี",
          "ข้อมูลบ้านที่เจ้าของบ้านกรอก: ที่อยู่ · หมุดตำแหน่งบ้าน (ถ้าปัก) · ผู้ติดต่อฉุกเฉิน (ถ้ากรอก)",
          "ข้อมูลเพิ่มเติมตอนสมัคร (ไม่บังคับ): คำนำหน้า อีเมล ประเภทบ้าน จำนวนผู้อยู่อาศัย ผู้ที่ต้องดูแลเป็นพิเศษ (เช่น ผู้สูงอายุ เด็กเล็ก ผู้ป่วยติดเตียง) และจุดสังเกตหน้าบ้าน — เก็บเพื่อให้เจ้าหน้าที่ช่วยได้ตรงจุดตอนเกิดเหตุ ระบบไม่เก็บเลขบัตรประชาชน",
          "ข้อมูลเจ้าหน้าที่และหน่วยงานตอนสมัคร: ยศ/ตำแหน่ง รหัสประจำตัว ที่อยู่ เบอร์โทร อีเมล และหมุดตำแหน่งหน่วยงาน",
          "รูปถ่ายเจ้าหน้าที่จากกล้องของตู้ ถ่ายอัตโนมัติ 1 รูปหลังสแกน QR ประจำตัวผ่าน (ไม่แจ้งเวลาที่ถ่าย) เพื่อยืนยันว่ามาตรวจด้วยตัวเอง — เก็บ 30 วันแล้วลบ ไม่ใช้เทียบหรือจดจำใบหน้า",
          "เครื่องที่ใช้เข้าสู่ระบบ (รหัสเครื่องแบบเข้ารหัส ชนิดเบราว์เซอร์ และที่อยู่เครือข่ายแบบย่อ) — เจ้าหน้าที่เข้าจากเครื่องใหม่ หัวหน้าจะได้รับแจ้ง"
        ]
      },
      {
        "title": "5. ใครเห็นข้อมูลอะไร",
        "items": [
          "เจ้าหน้าที่และหัวหน้าเห็นบ้านเลขที่และชื่อตู้ ไม่เห็นชื่อหรือเบอร์ของเจ้าของบ้าน ยกเว้นระหว่างที่ SOS ของบ้านนั้นเปิดอยู่ ซึ่งจะเห็นชื่อ เบอร์ ที่อยู่ หมุดตำแหน่งบ้าน จำนวนผู้อยู่อาศัย ผู้ที่ต้องดูแลเป็นพิเศษ และจุดสังเกตหน้าบ้านด้วย",
          "หัวหน้าหน่วยงานขอเพิ่มบ้านเข้าโซนได้ แต่บ้านจะเข้าโซนเมื่อเจ้าของบ้านกดยอมรับเท่านั้น",
          "เจ้าของบ้านเห็นชื่อ หน่วยงาน และรูปยืนยันตัวของเจ้าหน้าที่ที่มาตรวจบ้านตัวเอง (รูปเก็บ 30 วัน) และเห็นเบอร์ของคนที่รับ SOS ระหว่างที่ SOS เปิดอยู่",
          "เจ้าของบ้านเห็นหมุดตำแหน่งและข้อมูลติดต่อของหน่วยงานที่แอดมินอนุมัติแล้ว เพื่อเลือกว่าจะให้หน่วยงานไหนดูแลบ้าน",
          "ไรเดอร์เห็นแค่บ้านเลขที่ · ช่องทางติดต่อที่หน่วยงานกรอกตอนสมัคร แสดงให้คนที่ขอเข้าหน่วยงานเห็น",
          "แอดมินเห็นข้อมูลทั้งระบบเพื่อดูแลและแก้ปัญหา และทุกครั้งที่เปิดดูข้อมูลส่วนบุคคลจะถูกบันทึก"
        ]
      },
      {
        "title": "6. ตู้และ QR",
        "items": [
          "ตู้อ่าน QR และถ่ายรูปยืนยันตัวเจ้าหน้าที่ 1 รูปหลังตรวจผ่านเท่านั้น ไม่ถ่ายรูปเวลาอื่น ไม่อัดเสียง ไม่มีไซเรน",
          "เจ้าหน้าที่ตรวจได้เฉพาะเวลาตรวจที่หน่วยงานตั้ง และต้องยืนยันด้วย QR ประจำตัวที่ตู้สแกน",
          "ตู้ต้องมี Wi-Fi บ้าน (2.4 GHz) และแผงโซลาร์ที่รับแดด · ถ้าตู้ไม่ออนไลน์ การตรวจจะบันทึกไม่ได้"
        ]
      },
      {
        "title": "7. หน้าที่ของเจ้าของบ้าน",
        "items": [
          "เก็บ QR สำรองและ QR เปิดใช้ตู้ไว้ในตู้ · แจ้งเมื่อ QR หน้าตู้เสียหรือหาย",
          "ขายบ้านหรือย้ายออก ให้กด \"ยกเลิกการผูกตู้นี้\" ในหน้าตั้งค่า (ตู้จะลืม Wi-Fi บ้านคุณ และข้อมูลบ้านกับการอยู่ในโซนจะถูกล้าง) หรือแจ้งผู้ดูแลให้ทำให้"
        ]
      },
      {
        "title": "8. หน้าที่ของเจ้าหน้าที่และหัวหน้า",
        "items": [
          "เปิดการแจ้งเตือนไว้ตลอด เพื่อไม่พลาด SOS",
          "ตรวจตู้ด้วยตัวเองเท่านั้น ห้ามให้คนอื่นใช้บัญชีหรือสแกนแทน · ตู้จะถ่ายรูปยืนยันตัวหลังตรวจผ่าน",
          "สแกน QR หน้าตู้ผ่านแอปเท่านั้น และตรวจเฉพาะบ้านในโซนของตัวเอง",
          "ใช้ข้อมูลที่เห็นเพื่อหน้าที่นี้เท่านั้น · หัวหน้าดูแลสมาชิกและโซนของหน่วยงานตัวเอง"
        ]
      },
      {
        "title": "9. ข้อมูลของคุณ การลบบัญชี และการเปลี่ยนข้อตกลง",
        "items": [
          "ส่งออกข้อมูลของตัวเองเป็นไฟล์ได้ที่เมนู \"ข้อมูลของฉัน\" วันละไม่เกิน 3 ครั้ง · ไฟล์มีเฉพาะข้อมูลของคุณ ไม่มีข้อมูลของคนอื่น",
          "ลบบัญชีได้เองที่เมนู \"ข้อมูลของฉัน\" โดยยืนยันด้วยรหัสผ่าน · บัญชีจะถูกพักไว้ 7 วัน ระหว่างนี้เข้าสู่ระบบไม่ได้ และผู้ดูแลระบบกู้คืนให้ได้ถ้าคุณขอ",
          "ครบ 7 วัน ระบบซ่อนตัวตนถาวร: ชื่อ เบอร์โทร รหัสผ่าน ที่อยู่ หมุดตำแหน่ง ผู้ติดต่อฉุกเฉิน ข้อมูลเพิ่มเติม การแจ้งเตือน เครื่องที่เคยเข้า และรูปยืนยันตัวเจ้าหน้าที่ จะถูกลบหรือแทนที่ และกู้คืนไม่ได้อีก · เบอร์เดิมสมัครใหม่ได้",
          "บันทึกที่แก้ไขหรือลบไม่ได้ (การสแกน การเปิดดูข้อมูล การยอมรับข้อตกลง) ยังคงอยู่ตามระยะเวลาเก็บ แต่จะไม่ระบุตัวตนของคุณอีก",
          "ลบบัญชีไม่ได้ถ้ายังมีตู้ที่ผูกอยู่ (ให้ยกเลิกการผูกตู้ก่อน) · เป็นหัวหน้าคนเดียวของหน่วยงาน · มี SOS ที่ยังเปิดอยู่ · หรือเป็นบัญชีแอดมิน",
          "เมื่อข้อตกลงเปลี่ยน ต้องกดยอมรับฉบับใหม่ก่อนใช้งานต่อ · ไม่ยอมรับ = ใช้งานต่อไม่ได้",
          "ผู้ดูแลปิดบัญชีที่ใช้งานผิดข้อตกลงได้",
          "ติดต่อผู้ดูแลระบบได้ทางช่องทางที่แสดงในแอป"
        ]
      }
    ]
  },
  "en": {
    "title": "Smart Mailbox terms of use (demo draft)",
    "intro": "⚠️ Mock version for testing and demos only — not the real terms and not reviewed by legal or PDPA experts · Version of 13 November 2026 · applies to everyone with an account (homeowners, officers, agency heads, admins)",
    "sections": [
      {
        "title": "1. SOS does not replace calling 191 / 1669",
        "items": [
          "In a serious emergency, always call 191 (police) or 1669 (medical) directly",
          "SOS goes to the officers of your house's zone in stages; we cannot promise someone will accept it or arrive within any time",
          "If your house has no officer yet, the app tells you to call right away"
        ]
      },
      {
        "title": "2. Free during the trial",
        "items": [
          "This is a trial with no payments · homeowners get the \"Free\" plan automatically, with no end date and every feature included",
          "SOS and inspections always work, whatever the plan",
          "The service may pause for maintenance or change during the trial"
        ]
      },
      {
        "title": "3. Accounts and passwords",
        "items": [
          "One phone number = one account, which can hold several roles (e.g. a homeowner who is also an officer) · admin accounts cannot hold other roles",
          "Keep your password to yourself and do not let others use your account · there is no OTP and no SMS",
          "Forgot it? Officers ask their head to reset it · everyone else contacts the admin · a temporary password must be changed before use",
          "5 wrong passwords within 15 minutes pause sign-in for 15 minutes",
          "You can see the devices signed in to your account and sign any of them out yourself, under \"My data\""
        ]
      },
      {
        "title": "4. What the system records",
        "items": [
          "Every scan or typed code, even failures: who · which box · which QR · scanned or typed · result · time",
          "Delivery reports (riders are not identified) · SOS · terms acceptance · every time an admin views personal data · every time you export your own data",
          "These records cannot be edited or deleted and are kept for 1 year",
          "House details the homeowner enters: address · house pin (if set) · emergency contact (if given)",
          "Optional sign-up details: title, email, house type, number of residents, people who need extra care (e.g. elderly, small children, bedridden) and a landmark near the house — kept so officers can help properly in an emergency. National ID numbers are not collected",
          "Officer and agency sign-up details: rank/position, staff number, address, phone, email and the agency pin",
          "A photo of the officer taken automatically by the box camera once the badge QR passes (the exact moment is not shown), to show they came in person — kept 30 days then deleted, never used for face matching",
          "Devices used to sign in (a hashed device code, browser type and a shortened network address) — when an officer signs in on a new device, their head is notified"
        ]
      },
      {
        "title": "5. Who sees what",
        "items": [
          "Officers and heads see house numbers and box names, not the homeowner's name or phone — except while that house's SOS is open, when they also see the address, house pin, number of residents, people who need extra care and the landmark",
          "An agency head can ask to add a house to a zone, but it joins only after the homeowner accepts",
          "Homeowners see the name, agency and confirmation photo of the officer who checked their own house (photos kept 30 days), and the phone of whoever accepted their SOS while it is open",
          "Homeowners can see the pin and contact details of approved agencies, to choose which one looks after their house",
          "Riders see only the house number · the contact an agency enters at sign-up is shown to people asking to join it",
          "Admins see the whole system to keep it running, and every view of personal data is logged"
        ]
      },
      {
        "title": "6. Mailboxes and QR codes",
        "items": [
          "The box reads QR codes and takes one officer confirmation photo after a passed inspection — no other photos, no audio, no siren",
          "Officers can inspect only during the patrol hours their agency sets, confirmed by their badge QR scanned at the box",
          "The box needs home Wi-Fi (2.4 GHz) and a sunny solar panel · if it is offline, an inspection cannot be recorded"
        ]
      },
      {
        "title": "7. Homeowner duties",
        "items": [
          "Keep the backup QR and the activation QR inside the box · report a damaged or missing front QR",
          "If you sell or leave the house, tap \"Unlink this mailbox\" in Settings (the box forgets your Wi-Fi, and your house details and zone coverage are cleared) or ask the admin to do it"
        ]
      },
      {
        "title": "8. Officer and head duties",
        "items": [
          "Keep notifications on so you never miss an SOS",
          "Inspect in person only — never let anyone else use your account or scan for you · the box takes a confirmation photo after each passed inspection",
          "Scan box QR codes only through the app, and only for houses in your own zones",
          "Use what you see only for this work · heads manage only their own agency's members and zones"
        ]
      },
      {
        "title": "9. Your data, deleting your account, and changes to these terms",
        "items": [
          "You can export your own data as a file under \"My data\", up to 3 times a day · the file holds only your data, never anyone else's",
          "You can delete your account yourself under \"My data\", confirmed with your password · the account is put on hold for 7 days, during which you cannot sign in and an admin can restore it if you ask",
          "After 7 days your identity is permanently scrubbed: your name, phone, password, address, pin, emergency contact, extra details, notifications, signed-in devices and officer confirmation photos are deleted or replaced and cannot be restored · the same phone number can sign up again",
          "Records that cannot be edited or deleted (scans, data access, terms acceptance) stay for their retention period but no longer identify you",
          "You cannot delete your account while you still have a linked mailbox (unlink it first), are the only head of an agency, have an SOS still open, or hold an admin account",
          "When these terms change you must accept the new version before continuing · not accepting means you cannot continue",
          "The admin may close accounts that break these terms",
          "Contact the admin through the channel shown in the app"
        ]
      }
    ]
  }
};
