// สร้างจาก docs/terms-2026-10-27.md ด้วย docs/scripts/gen-terms.mjs — ห้ามแก้ไฟล์นี้ตรง ๆ
// ของจริงหน้า A13 อ่านจาก GET /api/v1/terms/current (ฉบับเดียวกัน)

export interface TermsPart {
  title: string;
  intro: string;
  sections: { title: string; items: string[] }[];
}

export const TERMS_VERSION = '2026-10-27';

export const TERMS: { th: TermsPart; en: TermsPart } = {
  "th": {
    "title": "ข้อตกลงการใช้งาน Smart Mailbox",
    "intro": "ฉบับวันที่ 27 ตุลาคม 2026 · ใช้กับทุกคนที่มีบัญชี (เจ้าของบ้าน เจ้าหน้าที่ หัวหน้าหน่วยงาน แอดมิน)",
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
          "ใส่รหัสผิด 5 ครั้งใน 15 นาที บัญชีถูกพักการเข้าสู่ระบบ 15 นาที"
        ]
      },
      {
        "title": "4. สิ่งที่ระบบบันทึก",
        "items": [
          "ทุกการสแกนหรือพิมพ์รหัส แม้ไม่ผ่าน: ใคร · ตู้ไหน · QR ใบไหน · สแกนหรือพิมพ์ · ผล · เวลา",
          "การแจ้งส่งของ (ไม่เก็บว่าไรเดอร์เป็นใคร) · SOS · การยอมรับข้อตกลง · การที่แอดมินเปิดดูข้อมูลส่วนบุคคล",
          "บันทึกเหล่านี้แก้ไขหรือลบไม่ได้ และเก็บไว้ 1 ปี"
        ]
      },
      {
        "title": "5. ใครเห็นข้อมูลอะไร",
        "items": [
          "เจ้าหน้าที่และหัวหน้าเห็นบ้านเลขที่และชื่อตู้ ไม่เห็นชื่อหรือเบอร์ของเจ้าของบ้าน ยกเว้นระหว่างที่ SOS ของบ้านนั้นเปิดอยู่",
          "เจ้าของบ้านเห็นชื่อและหน่วยงานของเจ้าหน้าที่ที่มาตรวจ และเห็นเบอร์ของคนที่รับ SOS ระหว่างที่ SOS เปิดอยู่",
          "ไรเดอร์เห็นแค่บ้านเลขที่ · ช่องทางติดต่อที่หน่วยงานกรอกตอนสมัคร แสดงให้คนที่ขอเข้าหน่วยงานเห็น",
          "แอดมินเห็นข้อมูลทั้งระบบเพื่อดูแลและแก้ปัญหา และทุกครั้งที่เปิดดูข้อมูลส่วนบุคคลจะถูกบันทึก"
        ]
      },
      {
        "title": "6. ตู้และ QR",
        "items": [
          "ตู้อ่าน QR อย่างเดียว ไม่ถ่ายรูป ไม่อัดเสียง ไม่มีไซเรน",
          "เจ้าหน้าที่ตรวจได้เฉพาะเวลาตรวจที่หน่วยงานตั้ง และต้องยืนยันด้วย QR ประจำตัวที่ตู้สแกน",
          "ตู้ต้องมี Wi-Fi บ้าน (2.4 GHz) และแผงโซลาร์ที่รับแดด · ถ้าตู้ไม่ออนไลน์ การตรวจจะบันทึกไม่ได้"
        ]
      },
      {
        "title": "7. หน้าที่ของเจ้าของบ้าน",
        "items": [
          "เก็บ QR สำรองและ QR เปิดใช้ตู้ไว้ในตู้ · แจ้งเมื่อ QR หน้าตู้เสียหรือหาย",
          "ขายบ้านหรือย้ายออก ให้แจ้งผู้ดูแลเพื่อยกเลิกการผูกตู้"
        ]
      },
      {
        "title": "8. หน้าที่ของเจ้าหน้าที่และหัวหน้า",
        "items": [
          "เปิดการแจ้งเตือนไว้ตลอด เพื่อไม่พลาด SOS",
          "สแกน QR หน้าตู้ผ่านแอปเท่านั้น และตรวจเฉพาะบ้านในโซนของตัวเอง",
          "ใช้ข้อมูลที่เห็นเพื่อหน้าที่นี้เท่านั้น · หัวหน้าดูแลสมาชิกและโซนของหน่วยงานตัวเอง"
        ]
      },
      {
        "title": "9. การเปลี่ยนข้อตกลงและการยกเลิก",
        "items": [
          "เมื่อข้อตกลงเปลี่ยน ต้องกดยอมรับฉบับใหม่ก่อนใช้งานต่อ · ไม่ยอมรับ = ใช้งานต่อไม่ได้",
          "ขอปิดบัญชีได้ทางผู้ดูแลระบบ · ผู้ดูแลปิดบัญชีที่ใช้งานผิดข้อตกลงได้",
          "ติดต่อผู้ดูแลระบบได้ทางช่องทางที่แสดงในแอป"
        ]
      }
    ]
  },
  "en": {
    "title": "Smart Mailbox terms of use",
    "intro": "Version of 27 October 2026 · applies to everyone with an account (homeowners, officers, agency heads, admins)",
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
          "5 wrong passwords within 15 minutes pause sign-in for 15 minutes"
        ]
      },
      {
        "title": "4. What the system records",
        "items": [
          "Every scan or typed code, even failures: who · which box · which QR · scanned or typed · result · time",
          "Delivery reports (riders are not identified) · SOS · terms acceptance · every time an admin views personal data",
          "These records cannot be edited or deleted and are kept for 1 year"
        ]
      },
      {
        "title": "5. Who sees what",
        "items": [
          "Officers and heads see house numbers and box names, not the homeowner's name or phone — except while that house's SOS is open",
          "Homeowners see the name and agency of the officer who checked, and the phone of whoever accepted their SOS while it is open",
          "Riders see only the house number · the contact an agency enters at sign-up is shown to people asking to join it",
          "Admins see the whole system to keep it running, and every view of personal data is logged"
        ]
      },
      {
        "title": "6. Mailboxes and QR codes",
        "items": [
          "The box only reads QR codes — no photos, no audio, no siren",
          "Officers can inspect only during the patrol hours their agency sets, confirmed by their badge QR scanned at the box",
          "The box needs home Wi-Fi (2.4 GHz) and a sunny solar panel · if it is offline, an inspection cannot be recorded"
        ]
      },
      {
        "title": "7. Homeowner duties",
        "items": [
          "Keep the backup QR and the activation QR inside the box · report a damaged or missing front QR",
          "If you sell or leave the house, tell the admin so the box can be unbound"
        ]
      },
      {
        "title": "8. Officer and head duties",
        "items": [
          "Keep notifications on so you never miss an SOS",
          "Scan box QR codes only through the app, and only for houses in your own zones",
          "Use what you see only for this work · heads manage only their own agency's members and zones"
        ]
      },
      {
        "title": "9. Changes and closing an account",
        "items": [
          "When these terms change you must accept the new version before continuing · not accepting means you cannot continue",
          "You can ask the admin to close your account · the admin may close accounts that break these terms",
          "Contact the admin through the channel shown in the app"
        ]
      }
    ]
  }
};
