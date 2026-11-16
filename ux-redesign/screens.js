/* SMMB UX/UI redesign — shared demo content for all three directions.
   ข้อมูลตัวอย่างทั้งหมดเป็นของสมมติ ใช้เพื่อทดสอบลำดับขั้นและภาษาบนหน้าจอเท่านั้น */
(function () {
  'use strict';

  var IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V21H3z"/><path d="M9 21v-7h6v7"/>',
    list: '<path d="M9 6h12M9 12h12M9 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    settings: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.4"/><circle cx="9" cy="17" r="2.4"/>',
    alert: '<path d="M12 3.5 22 20H2z"/><path d="M12 9.5v4.5M12 17.2h.01"/>',
    box: '<path d="M3 8.2 12 3l9 5.2V16L12 21 3 16z"/><path d="M3 8.2 12 13.4l9-5.2M12 13.4V21"/>',
    check: '<path d="M4.5 12.5 9.5 17.5 20 6.5"/>',
    scan: '<path d="M4 9V5h4M20 9V5h-4M4 15v4h4M20 15v4h-4"/><path d="M3 12h18"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5c1.4-3.6 4.2-5.4 7.5-5.4s6.1 1.8 7.5 5.4"/>',
    pin: '<path d="M12 21s7-6.2 7-11.2A7 7 0 0 0 5 9.8C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.6" r="2.4"/>',
    phone: '<path d="M6.2 3.5h3l1.4 4-2 1.5a12 12 0 0 0 6.4 6.4l1.5-2 4 1.4v3c0 1.4-1.2 2.4-2.6 2.2C10.4 19 5 13.6 4 6.1 3.8 4.7 4.8 3.5 6.2 3.5z"/>',
    wifi: '<path d="M2.5 8.5a15 15 0 0 1 19 0M6 12.2a10 10 0 0 1 12 0M9.5 15.8a5 5 0 0 1 5 0"/><circle cx="12" cy="19.4" r=".8"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
    chevron: '<path d="M9 5l7 7-7 7"/>',
    back: '<path d="M15 19l-7-7 7-7"/>',
    qr: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14h1M14 20h1M18 18h3v3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.4l3.4 2"/>',
    shield: '<path d="M12 3 5 6v6c0 4.6 3 7.4 7 9 4-1.6 7-4.4 7-9V6z"/><path d="M9 12l2 2 4-4"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    send: '<path d="M21 3 10.5 13.5M21 3l-7 18-3.5-7.5L3 10z"/>',
    camera: '<rect x="3" y="6.5" width="18" height="13" rx="2.5"/><circle cx="12" cy="13" r="4"/><path d="M8.5 6.5 10 4h4l1.5 2.5"/>',
    torch: '<path d="M9 3h6l1 5H8z"/><path d="M10 8v13h4V8M8 21h8"/>',
    map: '<path d="M9 4 3 6.5V20l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
    team: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20c1-3.2 3-4.8 5.5-4.8S13.5 16.8 14.5 20"/><path d="M16 5.5a3.2 3.2 0 0 1 0 5M17.5 15.5c1.8.4 3 1.9 3.6 4.5"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12 20 3M17 6l2 2M15 8l2 2"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
    logout: '<path d="M14 4H5v16h9"/><path d="M10 12h11M18 8l4 4-4 4"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5M4 20h16"/>',
    wrench: '<path d="M20 4a5 5 0 0 1-6.5 6.5L6 18a2.1 2.1 0 0 0 3 3l7.5-7.5A5 5 0 0 0 20 4z"/>',
    text: '<path d="M4 6h16M8 6v14M16 6v14M4 20h16"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>',
    door: '<path d="M5 21V4h11l3 4v13"/><path d="M3 21h18M14 12h.01"/>',
    phoneBox: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 9h8M8 13h5"/>'
  };

  function icon(name, size) {
    var path = IC[name] || IC.info;
    var s = size || 24;
    return '<svg class="ic" viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
  }

  var TABS = {
    owner: [
      { id: 'owner-home', icon: 'home', label: 'หน้าหลัก' },
      { id: 'owner-history', icon: 'list', label: 'ประวัติ' },
      { id: 'owner-settings', icon: 'settings', label: 'ตั้งค่า' }
    ],
    officer: [
      { id: 'officer-home', icon: 'home', label: 'หน้าสรุป' },
      { id: 'officer-history', icon: 'list', label: 'ประวัติ' },
      { id: 'officer-sos-list', icon: 'alert', label: 'SOS' },
      { id: 'officer-settings', icon: 'settings', label: 'ตั้งค่า' }
    ],
    head: [
      { id: 'head-home', icon: 'home', label: 'ภาพรวม' },
      { id: 'head-zones', icon: 'pin', label: 'โซน' },
      { id: 'head-members', icon: 'team', label: 'สมาชิก' },
      { id: 'head-settings', icon: 'settings', label: 'ตั้งค่า' }
    ],
    admin: [
      { id: 'admin-home', icon: 'home', label: 'ภาพรวม' },
      { id: 'admin-boxes', icon: 'box', label: 'ตู้' },
      { id: 'admin-users', icon: 'user', label: 'ผู้ใช้' },
      { id: 'admin-system', icon: 'settings', label: 'ระบบ' }
    ]
  };

  var ROLE_LABEL = {
    owner: 'เจ้าของบ้าน',
    officer: 'เจ้าหน้าที่',
    head: 'หัวหน้าหน่วยงาน',
    admin: 'แอดมิน / ช่าง',
    rider: 'ไรเดอร์',
    auth: 'เข้าสู่ระบบ',
    shared: 'ใช้ร่วมกัน'
  };

  var SCREENS = [
    /* ───────────────────────── เจ้าของบ้าน ───────────────────────── */
    {
      id: 'owner-home', role: 'owner', group: 'เจ้าของบ้าน', code: 'H03', tab: 'home',
      title: 'หน้าหลัก', sub: 'บ้านเลขที่ 42 · หมู่ 5 บ้านสวน',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'check', title: 'ตู้ทำงานปกติ', text: 'เจ้าหน้าที่ตรวจล่าสุด วันนี้ 09:12', meta: 'ตู้หน้าบ้าน · แบตเตอรี่ 86%' },
        { type: 'sos', state: 'idle' },
        {
          type: 'actions', title: 'วันนี้มีอะไร',
          items: [
            { icon: 'box', tone: 'warn', label: 'ของมาส่งวันนี้ 2 ครั้ง', sub: 'ครั้งล่าสุด 08:40 · ยังอยู่ในตู้', to: 'owner-history' },
            { icon: 'shield', label: 'ประวัติการตรวจ', sub: 'เจ้าหน้าที่มาเมื่อ 09:12', to: 'owner-inspection' },
            { icon: 'wrench', label: 'ตู้มีปัญหา?', sub: 'แจ้งช่าง หรือเปลี่ยน Wi-Fi', to: 'owner-settings' }
          ]
        },
        {
          type: 'list', title: 'เหตุการณ์ล่าสุด', seeAll: { label: 'ดูทั้งหมด', to: 'owner-history' },
          items: [
            { icon: 'shield', tone: 'ok', title: 'เจ้าหน้าที่มาตรวจ', sub: 'อสม. หมู่ 5 · คุณสมหญิง', meta: '09:12', to: 'owner-inspection' },
            { icon: 'box', tone: 'warn', title: 'มีของมาส่ง', sub: 'ไรเดอร์สแกน QR หน้าตู้', meta: '08:40', to: 'owner-delivery' },
            { icon: 'shield', tone: 'ok', title: 'เจ้าหน้าที่มาตรวจ', sub: 'อสม. หมู่ 5 · คุณสมหญิง', meta: 'เมื่อวาน 17:05', to: 'owner-inspection' }
          ]
        }
      ]
    },
    {
      id: 'owner-empty', role: 'owner', group: 'เจ้าของบ้าน', code: 'H03', tab: 'home',
      title: 'เริ่มใช้งานตู้', sub: 'ยังไม่ได้ผูกตู้กับบัญชีนี้',
      blocks: [
        { type: 'callout', tone: 'info', title: 'อีก 3 ขั้นก็ใช้ได้', text: 'ใช้เวลาประมาณ 2 นาที · ไม่ต้องกรอกเลขตู้เอง' },
        {
          type: 'steps',
          items: [
            { t: 'เปิดฝาตู้', s: 'QR เปิดใช้ตู้ติดอยู่ด้านใน' },
            { t: 'สแกน QR หรือพิมพ์รหัส', s: 'รหัส 8 ตัวอยู่ใต้ QR' },
            { t: 'ตั้งชื่อตู้', s: 'เช่น “ตู้หน้าบ้าน” แล้วพร้อมใช้' }
          ]
        },
        { type: 'primary', label: 'ผูกตู้ตอนนี้', sub: 'ใช้กล้องมือถือสแกน', icon: 'scan', to: 'auth-activate' },
        { type: 'note', text: 'ไม่มี QR ในตู้? โทรหาผู้ติดตั้ง 080-000-0000' }
      ]
    },
    {
      id: 'sos-hold', role: 'owner', group: 'เจ้าของบ้าน · SOS', code: 'H09', tab: 'home', noTabs: true,
      title: 'ขอความช่วยเหลือ', sub: 'บ้านเลขที่ 42', step: { n: 1, total: 2, label: 'ส่ง SOS' }, back: 'owner-home',
      blocks: [
        { type: 'sos', state: 'hold' },
        { type: 'callout', tone: 'danger', title: 'SOS ไม่แทนการโทร 191', text: 'ถ้าเป็นเหตุฉุกเฉิน ให้โทร 191 หรือ 1669 ทันที' }
      ]
    },
    {
      id: 'sos-sending', role: 'owner', group: 'เจ้าของบ้าน · SOS', code: 'H09', noTabs: true,
      title: 'กำลังส่ง…', sub: 'บ้านเลขที่ 42 · อย่าปิดหน้านี้', step: { n: 2, total: 2, label: 'ส่ง SOS' }, back: 'owner-home',
      blocks: [
        { type: 'sos', state: 'sending' },
        {
          type: 'steps', title: 'ลำดับการแจ้ง',
          items: [
            { t: 'เจ้าหน้าที่โซน 1', s: 'ส่งแล้ว', done: true },
            { t: 'เจ้าหน้าที่โซน 2', s: 'กำลังส่ง', active: true },
            { t: 'เจ้าหน้าที่โซน 3', s: 'รอคิว' }
          ]
        },
        { type: 'secondary', label: 'ยกเลิก SOS', to: 'owner-home' }
      ]
    },
    {
      id: 'sos-accepted', role: 'owner', group: 'เจ้าของบ้าน · SOS', code: 'H11', noTabs: true, back: 'owner-home',
      title: 'มีคนรับเรื่องแล้ว', sub: 'บ้านเลขที่ 42 · รับเรื่อง 09:41',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'shield', title: 'คุณสมหญิงกำลังไปที่บ้านคุณ', text: 'เจ้าหน้าที่โซน 1 · อสม. หมู่ 5', meta: 'กดโทรได้เลยถ้าอาการเปลี่ยน' },
        {
          type: 'steps', title: 'ทำตอนนี้',
          items: [
            { t: 'เปิดไฟหน้าบ้าน', s: 'ให้เจ้าหน้าที่หาเจอเร็วขึ้น' },
            { t: 'อยู่ใกล้ประตู', s: 'แต่อย่าออกไปข้างนอกถ้าไม่ปลอดภัย' },
            { t: 'โทร 191 ถ้าหนักขึ้น', s: 'เจ้าหน้าที่จะถึงเร็วที่สุดเท่าที่ทำได้' }
          ]
        },
        { type: 'primary', label: 'โทรหาเจ้าหน้าที่', sub: '081-234-5678', icon: 'phone', to: 'owner-home', tel: true },
        { type: 'secondary', label: 'ปิด SOS · ปลอดภัยแล้ว', to: 'owner-home' }
      ]
    },
    {
      id: 'sos-no-officer', role: 'owner', group: 'เจ้าของบ้าน · SOS', code: 'H08', noTabs: true, back: 'owner-home',
      title: 'ยังไม่มีเจ้าหน้าที่ดูแลบ้านนี้', sub: 'บ้านเลขที่ 42',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'โทรขอความช่วยเหลือทันที', text: 'ระบบแจ้งเจ้าหน้าที่ไม่ได้ เพราะบ้านนี้ยังไม่อยู่ในโซน' },
        {
          type: 'actions', title: 'โทรเลย',
          items: [
            { icon: 'phone', tone: 'danger', label: 'โทร 191', sub: 'ตำรวจ · เหตุฉุกเฉิน', tel: true },
            { icon: 'phone', tone: 'danger', label: 'โทร 1669', sub: 'รถพยาบาลฉุกเฉิน', tel: true }
          ]
        },
        { type: 'primary', label: 'ดูหน่วยงานใกล้บ้าน', sub: 'ขอให้หน่วยงานมารับดูแล', icon: 'pin', to: 'owner-agencies' },
        { type: 'note', text: 'หลังวางสาย ให้แจ้งผู้ดูแลระบบเพื่อเพิ่มบ้านคุณเข้าสู่โซน' }
      ]
    },
    {
      id: 'owner-history', role: 'owner', group: 'เจ้าของบ้าน', code: 'H12', tab: 'history',
      title: 'ประวัติ', sub: 'บ้านเลขที่ 42 · เดือนนี้',
      blocks: [
        { type: 'chips', items: ['ทั้งหมด', 'ตรวจ', 'ส่งของ', 'ซ่อม'], active: 0 },
        { type: 'stats', items: [{ label: 'ตรวจตู้', value: '18', sub: 'ครั้ง' }, { label: 'ของมาส่ง', value: '7', sub: 'ครั้ง' }] },
        {
          type: 'list', title: 'รายการล่าสุด',
          items: [
            { icon: 'shield', tone: 'ok', title: 'เจ้าหน้าที่มาตรวจ', sub: 'คุณสมหญิง · อสม. หมู่ 5', meta: 'วันนี้ 09:12', to: 'owner-inspection' },
            { icon: 'box', tone: 'warn', title: 'มีของมาส่ง', sub: 'Kerry Express · ยังอยู่ในตู้', meta: 'วันนี้ 08:40', to: 'owner-delivery' },
            { icon: 'shield', tone: 'ok', title: 'เจ้าหน้าที่มาตรวจ', sub: 'คุณสมหญิง · อสม. หมู่ 5', meta: 'เมื่อวาน 17:05', to: 'owner-inspection' },
            { icon: 'wrench', tone: 'info', title: 'แจ้งช่าง · ปิดงานแล้ว', sub: 'เปลี่ยนแบตเตอรี่', meta: '12 พ.ย. 14:20', to: 'owner-technician' },
            { icon: 'box', tone: 'warn', title: 'มีของมาส่ง', sub: 'ไปรษณีย์ไทย', meta: '12 พ.ย. 10:05', to: 'owner-delivery' },
            { icon: 'shield', tone: 'ok', title: 'เจ้าหน้าที่มาตรวจ', sub: 'คุณสมหญิง · อสม. หมู่ 5', meta: '11 พ.ย. 16:40', to: 'owner-inspection' }
          ]
        }
      ]
    },
    {
      id: 'owner-delivery', role: 'owner', group: 'เจ้าของบ้าน', code: 'H12-c', noTabs: true, back: 'owner-history',
      title: 'ของมาส่ง', sub: 'วันนี้ 08:40 · บ้านเลขที่ 42',
      blocks: [
        { type: 'receipt', tone: 'warn', title: 'ของอยู่ในตู้', text: 'ไรเดอร์แจ้งส่งเมื่อ 08:40 · เปิดฝาตู้เพื่อรับของ' },
        {
          type: 'facts', title: 'รายละเอียด',
          rows: [['ผู้ส่ง', 'Kerry Express'], ['วิธีแจ้ง', 'สแกน QR หน้าตู้'], ['ช่องที่วาง', 'ช่องกลาง'], ['เจ้าของบ้าน', 'คุณสมชาย']]
        },
        { type: 'primary', label: 'รับทราบ', sub: 'กลับไปหน้าประวัติ', icon: 'check', to: 'owner-history' },
        { type: 'secondary', label: 'แจ้งว่าไม่ได้รับของ', to: 'owner-technician' }
      ]
    },
    {
      id: 'owner-inspection', role: 'owner', group: 'เจ้าของบ้าน', code: 'H12-b', noTabs: true, back: 'owner-history',
      title: 'การตรวจตู้', sub: 'วันนี้ 09:12 · บ้านเลขที่ 42',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'check', title: 'ตรวจผ่าน', text: 'เจ้าหน้าที่ตรวจตู้และกดยืนยันที่ตัวตู้', meta: 'ใช้เวลา 40 วินาที' },
        {
          type: 'facts', title: 'รายละเอียด',
          rows: [['เจ้าหน้าที่', 'คุณสมหญิง'], ['หน่วยงาน', 'อสม. หมู่ 5'], ['สภาพตู้', 'ปกติ · ฝาปิดสนิท'], ['QR หน้าตู้', 'อ่านได้ปกติ'], ['หมายเหตุ', 'ไม่มี']]
        },
        { type: 'primary', label: 'รับทราบ', icon: 'check', to: 'owner-history' }
      ]
    },
    {
      id: 'owner-notifications', role: 'owner', group: 'เจ้าของบ้าน', code: 'H14', noTabs: true, back: 'owner-home',
      title: 'แจ้งเตือน', sub: 'ยังไม่อ่าน 2 รายการ',
      blocks: [
        { type: 'linkAction', label: 'ทำเครื่องหมายว่าอ่านทั้งหมด', to: 'owner-notifications' },
        {
          type: 'list',
          items: [
            { icon: 'box', tone: 'warn', title: 'มีของมาส่ง', sub: 'Kerry Express · ยังอยู่ในตู้', meta: '08:40', unread: true, to: 'owner-delivery' },
            { icon: 'wrench', tone: 'info', title: 'ช่างปิดงานแล้ว', sub: 'เปลี่ยนแบตเตอรี่เรียบร้อย', meta: 'เมื่อวาน', unread: true, to: 'owner-technician' },
            { icon: 'shield', tone: 'ok', title: 'เจ้าหน้าที่มาตรวจ', sub: 'คุณสมหญิง · ตรวจผ่าน', meta: 'เมื่อวาน', to: 'owner-inspection' },
            { icon: 'info', tone: 'info', title: 'ตู้กลับมาออนไลน์', sub: 'ใช้ได้ตามปกติ', meta: '12 พ.ย.', to: 'owner-home' }
          ]
        },
        { type: 'note', text: 'ปิดเสียงแจ้งเตือนได้ที่ ตั้งค่า › การแจ้งเตือน' }
      ]
    },
    {
      id: 'owner-settings', role: 'owner', group: 'เจ้าของบ้าน', code: 'H13', tab: 'settings',
      title: 'ตั้งค่า', sub: 'บ้านเลขที่ 42',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'box', title: 'ตู้หน้าบ้าน', text: 'ออนไลน์ · แบตเตอรี่ 86%', meta: 'BX-00042 · หมู่ 5' },
        {
          type: 'actions', title: 'การแจ้งเตือน',
          items: [
            { icon: 'bell', label: 'ตั้งค่าการแจ้งเตือน', sub: 'ของมาส่ง · การตรวจ · SOS', to: 'notif-settings' },
            { icon: 'text', label: 'ขนาดตัวอักษรและการแสดงผล', sub: 'โหมดง่าย · ตัวใหญ่', to: 'display' }
          ]
        },
        {
          type: 'actions', title: 'ดูแลตู้',
          items: [
            { icon: 'wifi', label: 'Wi-Fi ของตู้', sub: 'BaanSuan_5G', to: 'owner-wifi' },
            { icon: 'wrench', label: 'เรียกช่าง', sub: 'แจ้งปัญหา · ประวัติการซ่อม', to: 'owner-technician' },
            { icon: 'pin', label: 'หน่วยงานใกล้บ้าน', sub: 'อสม. หมู่ 5 · 0.8 กม.', to: 'owner-agencies' }
          ]
        },
        {
          type: 'actions', title: 'บัญชี',
          items: [{ icon: 'logout', tone: 'danger', label: 'ออกจากระบบ', to: 'auth-signin' }]
        }
      ]
    },
    {
      id: 'owner-wifi', role: 'owner', group: 'เจ้าของบ้าน', code: 'H13-b', noTabs: true, back: 'owner-settings',
      title: 'เปลี่ยน Wi-Fi', sub: 'ตู้หน้าบ้าน · บ้านเลขที่ 42',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'ตู้จะขาดการเชื่อมต่อ 10 นาที', text: 'ระหว่างนี้เจ้าหน้าที่จะตรวจตู้ไม่ได้ แต่ของที่อยู่ในตู้ยังปลอดภัย' },
        {
          type: 'form',
          fields: [
            { label: 'ชื่อ Wi-Fi', value: 'BaanSuan_5G', type: 'text' },
            { label: 'รหัสผ่าน Wi-Fi', value: '', type: 'password', hint: 'พิมพ์ให้ตรงตัวพิมพ์ใหญ่-เล็ก', placeholder: 'รหัสผ่านบ้านคุณ' }
          ],
          submit: { label: 'บันทึกและเชื่อมต่อ', to: 'owner-home' },
          note: 'ไม่ทราบรหัส? ดูที่หลังเราเตอร์ หรือให้ช่างช่วยตั้ง'
        },
        { type: 'secondary', label: 'ยกเลิก', to: 'owner-settings' }
      ]
    },
    {
      id: 'owner-technician', role: 'owner', group: 'เจ้าของบ้าน', code: 'H13-c', noTabs: true, back: 'owner-settings',
      title: 'เรียกช่าง', sub: 'ตู้หน้าบ้าน · บ้านเลขที่ 42',
      blocks: [
        {
          type: 'form',
          fields: [
            { label: 'อาการ', type: 'chips', options: ['ตู้ไม่ติด', 'ฝาเปิดไม่ได้', 'QR ชำรุด', 'อื่น ๆ'], value: 0 },
            { label: 'เล่าเพิ่มเติม', type: 'textarea', placeholder: 'เช่น ไฟที่ตู้ไม่ติดตั้งแต่เมื่อวาน', hint: 'ไม่บังคับ' },
            { label: 'เบอร์ติดต่อ', type: 'text', value: '081-234-5678', hint: 'ช่างจะโทรเบอร์นี้' },
            { label: 'เวลาที่สะดวก', type: 'chips', options: ['เช้า', 'บ่าย', 'เย็น'], value: 1 }
          ],
          submit: { label: 'ส่งเรื่องถึงช่าง', to: 'owner-home' },
          note: 'ช่างจะโทรกลับภายใน 1 วันทำการ'
        }
      ]
    },
    {
      id: 'owner-agencies', role: 'owner', group: 'เจ้าของบ้าน', code: 'H16', noTabs: true, back: 'owner-settings',
      title: 'หน่วยงานใกล้บ้าน', sub: 'บ้านเลขที่ 42 · รัศมี 3 กม.',
      blocks: [
        { type: 'map', note: 'อสม. หมู่ 5 ดูแลบ้านคุณ' },
        {
          type: 'list', title: 'หน่วยงาน',
          items: [
            { icon: 'shield', tone: 'ok', title: 'อสม. หมู่ 5', sub: '0.8 กม. · ดูแลบ้านคุณ', meta: 'โทร', tel: true, to: 'owner-agencies' },
            { icon: 'shield', title: 'หน่วยกู้ภัยสวนหลวง', sub: '2.4 กม. · 24 ชั่วโมง', meta: 'โทร', tel: true, to: 'owner-agencies' },
            { icon: 'shield', title: 'สถานีตำรวจบางนา', sub: '3.1 กม.', meta: 'โทร', tel: true, to: 'owner-agencies' }
          ]
        },
        { type: 'note', text: 'ถ้าบ้านคุณยังไม่มีหน่วยงานดูแล กด SOS แล้วระบบจะบอกให้โทร 191 ทันที' }
      ]
    },

    /* ───────────────────────── เจ้าหน้าที่ ───────────────────────── */
    {
      id: 'officer-home', role: 'officer', group: 'เจ้าหน้าที่', code: 'O01', tab: 'home',
      title: 'หน้าสรุป', sub: 'คุณสมชาย · โซน 3 · รอบ 09:00–11:00',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'clock', title: 'ถึงเวลาตรวจแล้ว', text: 'เหลืออีก 9 หลัง · ตรวจแล้ว 3 หลัง', meta: 'รอบนี้ปิด 11:00' },
        { type: 'progress', value: 3, max: 12, label: 'ตรวจแล้ว 3 จาก 12 หลัง' },
        { type: 'primary', label: 'สแกนตู้หลังถัดไป', sub: 'บ้านเลขที่ 45 · ห่าง 80 เมตร', icon: 'scan', to: 'officer-scan' },
        { type: 'callout', tone: 'danger', title: 'มี SOS 1 เรื่อง', text: 'บ้านเลขที่ 42 · ยังไม่มีคนรับ', cta: { label: 'ดูและรับเรื่อง', to: 'officer-sos-list' } },
        {
          type: 'list', title: 'บ้านที่เหลือ', seeAll: { label: 'ดูทั้งหมด', to: 'officer-history' },
          items: [
            { icon: 'box', title: 'บ้านเลขที่ 45', sub: 'ตู้ BX-00045 · ยังไม่ตรวจ', meta: '80 ม.', to: 'officer-box' },
            { icon: 'box', title: 'บ้านเลขที่ 48', sub: 'ตู้ BX-00048 · ยังไม่ตรวจ', meta: '150 ม.', to: 'officer-box' },
            { icon: 'box', title: 'บ้านเลขที่ 51', sub: 'ตู้ BX-00051 · ยังไม่ตรวจ', meta: '220 ม.', to: 'officer-box' }
          ]
        }
      ]
    },
    {
      id: 'officer-scan', role: 'officer', group: 'เจ้าหน้าที่', code: 'O02', noTabs: true, back: 'officer-home',
      title: 'สแกน QR หน้าตู้', sub: 'บ้านเลขที่ 45', step: { n: 1, total: 3, label: 'ตรวจตู้' },
      blocks: [
        { type: 'camera', hint: 'ส่อง QR หน้าตู้ให้อยู่ในกรอบ · ถือมือให้นิ่ง' },
        { type: 'primary', label: 'จำลองว่าสแกนติด', sub: 'ไปขั้นยืนยันตัวตน', icon: 'qr', to: 'officer-badge' },
        { type: 'actions', items: [{ icon: 'key', label: 'พิมพ์รหัสใต้ QR แทน', to: 'officer-code' }, { icon: 'torch', label: 'เปิดไฟฉาย', to: 'officer-scan' }] }
      ]
    },
    {
      id: 'officer-code', role: 'officer', group: 'เจ้าหน้าที่', code: 'O02-b', noTabs: true, back: 'officer-scan',
      title: 'พิมพ์รหัสใต้ QR', sub: 'บ้านเลขที่ 45', step: { n: 1, total: 3, label: 'ตรวจตู้' },
      blocks: [
        { type: 'codeinput', label: 'รหัสตู้ 8 ตัว', value: 'BX42 7K9Q', hint: 'อยู่ใต้ QR หน้าตู้ · ใช้เมื่อกล้องสแกนไม่ได้' },
        { type: 'primary', label: 'ตรวจรหัส', sub: 'รหัสถูกต้อง', icon: 'check', to: 'officer-badge' },
        { type: 'secondary', label: 'กลับไปสแกน', to: 'officer-scan' }
      ]
    },
    {
      id: 'officer-badge', role: 'officer', group: 'เจ้าหน้าที่', code: 'O06', noTabs: true, back: 'officer-scan',
      title: 'QR ประจำตัว', sub: 'ยื่นให้กล้องตู้ · เปลี่ยนทุก 30 วินาที', step: { n: 2, total: 3, label: 'ตรวจตู้' },
      blocks: [
        { type: 'codeqr', label: 'รหัสของคุณ', value: 'SMMB·7K9Q·42', meta: 'เหลือ 24 วินาที · ใช้ได้ 3 ครั้ง' },
        {
          type: 'steps', title: 'วิธีใช้',
          items: [
            { t: 'ยื่นจอให้กล้องตู้', s: 'ห่างประมาณ 20 ซม.' },
            { t: 'รอไฟเขียวที่ตู้', s: 'ประมาณ 2 วินาที' },
            { t: 'เก็บมือถือ', s: 'แล้วรอผลบนจอ' }
          ]
        },
        { type: 'primary', label: 'ตู้สแกนผ่านแล้ว', sub: 'จำลองผลการสแกน', icon: 'check', to: 'officer-done' },
        { type: 'note', text: 'ถ้าไม่ผ่าน 3 ครั้ง ให้กดสร้างรหัสใหม่ที่หน้าจอถัดไป' }
      ]
    },
    {
      id: 'officer-done', role: 'officer', group: 'เจ้าหน้าที่', code: 'O08', noTabs: true, back: 'officer-home',
      title: 'ตรวจแล้ว', sub: 'บ้านเลขที่ 45 · 09:52', step: { n: 3, total: 3, label: 'ตรวจตู้' },
      blocks: [
        { type: 'done', title: 'บันทึกการตรวจแล้ว', text: 'ตู้ BX-00045 · ผ่าน', meta: '09:52 · เจ้าหน้าที่ คุณสมชาย' },
        { type: 'facts', title: 'ผลการตรวจ', rows: [['สภาพตู้', 'ปกติ'], ['ฝาตู้', 'ปิดสนิท'], ['แบตเตอรี่', '78%'], ['หมายเหตุ', 'ไม่มี']] },
        { type: 'primary', label: 'ไปหลังถัดไป', sub: 'บ้านเลขที่ 48', icon: 'chevron', to: 'officer-home' }
      ]
    },
    {
      id: 'officer-sos-list', role: 'officer', group: 'เจ้าหน้าที่', code: 'O12', tab: 'sos',
      title: 'SOS', sub: 'โซน 3 · เปิดอยู่ 1 เรื่อง',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'บ้านเลขที่ 42 ขอความช่วยเหลือ', text: '2 นาทีที่แล้ว · ยังไม่มีคนรับ', cta: { label: 'ดูและรับเรื่อง', to: 'officer-sos-case' } },
        { type: 'note', text: 'SOS เข้ามาได้ตลอด 24 ชั่วโมง แม้อยู่นอกเวลาตรวจ' },
        {
          type: 'list', title: 'ปิดแล้ว · 30 วัน',
          items: [
            { icon: 'alert', tone: 'ok', title: 'บ้านเลขที่ 18', sub: 'รับโดยคุณมาลี · ปิดเรื่องแล้ว', meta: 'เมื่อวาน 21:10', to: 'officer-sos-case' },
            { icon: 'alert', tone: 'info', title: 'บ้านเลขที่ 33', sub: 'เจ้าของบ้านยกเลิก', meta: '13 พ.ย. 06:40', to: 'officer-sos-case' }
          ]
        }
      ]
    },
    {
      id: 'officer-sos-case', role: 'officer', group: 'เจ้าหน้าที่', code: 'O09', noTabs: true, back: 'officer-sos-list',
      title: 'SOS · บ้านเลขที่ 42', sub: 'ยังไม่มีคนรับ · 2 นาทีที่แล้ว',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'ล้มในบ้าน ขยับไม่ได้', text: 'ผู้แจ้ง: คุณสมชาย · 081-234-5678' },
        { type: 'map', note: 'บ้านเลขที่ 42 · ประตูรั้วสีเขียว · 120 เมตรจากคุณ' },
        { type: 'facts', title: 'ข้อมูลบ้าน', rows: [['ผู้อยู่อาศัย', '2 คน · ผู้สูงอายุ 1 คน'], ['สัตว์เลี้ยง', 'สุนัขพันธุ์เล็ก'], ['หมายเหตุ', 'ประตูรั้วสีเขียว กดกริ่ง 2 ครั้ง']] },
        { type: 'primary', label: 'รับเรื่องและไปช่วย', sub: 'ระบบจะแจ้งเจ้าของบ้านว่าคุณกำลังไป', icon: 'send', tone: 'danger', to: 'officer-sos-close' },
        { type: 'actions', items: [{ icon: 'phone', tone: 'danger', label: 'โทร 191', sub: 'ถ้าต้องการกำลังเสริม', tel: true }] }
      ]
    },
    {
      id: 'officer-sos-close', role: 'officer', group: 'เจ้าหน้าที่', code: 'O11', noTabs: true, back: 'officer-sos-case',
      title: 'ปิดเรื่อง SOS', sub: 'บ้านเลขที่ 42 · คุณสมชาย',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'pin', title: 'ถึงบ้านแล้ว', text: 'กดปิดเรื่องเมื่อช่วยเหลือเสร็จ', meta: 'เริ่มรับเรื่อง 09:44' },
        {
          type: 'form',
          fields: [
            { label: 'ผลการช่วยเหลือ', type: 'chips', options: ['ปลอดภัยดี', 'ส่งโรงพยาบาล', 'ส่งต่อ 191'], value: 0 },
            { label: 'หมายเหตุ', type: 'textarea', placeholder: 'เช่น ล้มในห้องน้ำ ช่วยพยุงขึ้นมาได้', hint: 'เจ้าของบ้านจะเห็นข้อความนี้' }
          ],
          submit: { label: 'ปิดเรื่อง', to: 'officer-sos-list' },
          note: 'เจ้าของบ้านจะได้รับแจ้งเตือนทันทีที่ปิดเรื่อง'
        }
      ]
    },
    {
      id: 'officer-history', role: 'officer', group: 'เจ้าหน้าที่', code: 'O15', tab: 'history',
      title: 'ประวัติการสแกน', sub: 'วันนี้ · ตรวจแล้ว 3 หลัง',
      blocks: [
        { type: 'stats', items: [{ label: 'วันนี้', value: '3', sub: 'หลัง' }, { label: 'สัปดาห์นี้', value: '27', sub: 'หลัง' }] },
        {
          type: 'list', title: 'วันนี้',
          items: [
            { icon: 'check', tone: 'ok', title: 'บ้านเลขที่ 45', sub: 'ตรวจผ่าน · ฝาปิดสนิท', meta: '09:52', to: 'officer-box' },
            { icon: 'check', tone: 'ok', title: 'บ้านเลขที่ 39', sub: 'ตรวจผ่าน', meta: '09:30', to: 'officer-box' },
            { icon: 'alert', tone: 'warn', title: 'บ้านเลขที่ 36', sub: 'ฝาตู้เปิดค้าง · แจ้งซ่อมแล้ว', meta: '09:08', to: 'officer-box' }
          ]
        }
      ]
    },
    {
      id: 'officer-box', role: 'officer', group: 'เจ้าหน้าที่', code: 'O16', noTabs: true, back: 'officer-home',
      title: 'บ้านเลขที่ 45', sub: 'ตู้ BX-00045 · ออนไลน์',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'check', title: 'พร้อมตรวจ', text: 'อยู่ในเวลาตรวจ · แบตเตอรี่ 78%', meta: 'ตรวจล่าสุด 2 วันที่แล้ว' },
        { type: 'facts', title: 'ข้อมูลตู้', rows: [['เจ้าของบ้าน', 'คุณมาลี'], ['โซน', 'โซน 3 · หมู่ 5'], ['QR หน้าตู้', 'ปกติ'], ['สัญญาณ', 'ดี']] },
        { type: 'primary', label: 'สแกนตู้หลังนี้', icon: 'scan', to: 'officer-scan' },
        { type: 'secondary', label: 'กลับหน้าสรุป', to: 'officer-home' }
      ]
    },

    /* ───────────────────────── หัวหน้าหน่วยงาน ───────────────────────── */
    {
      id: 'head-home', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L04', tab: 'home',
      title: 'ภาพรวมทีมวันนี้', sub: 'อสม. หมู่ 5 · 4 คน',
      blocks: [
        { type: 'stats', items: [{ label: 'ตรวจแล้ว', value: '8/20', sub: 'หลัง', tone: 'warn' }, { label: 'SOS วันนี้', value: '1', sub: 'เรื่อง', tone: 'danger' }, { label: 'ออนไลน์', value: '3/4', sub: 'คน', tone: 'ok' }] },
        { type: 'callout', tone: 'danger', title: 'SOS ยังเปิดอยู่ 1 เรื่อง', text: 'บ้านเลขที่ 42 · คุณสมชายกำลังไปช่วย', cta: { label: 'ดูรายละเอียด', to: 'head-log' } },
        { type: 'primary', label: 'ดูโซนที่ต้องตรวจ', sub: 'โซน 4 ยังไม่เริ่มวันนี้', icon: 'pin', to: 'head-zones' },
        {
          type: 'list', title: 'เจ้าหน้าที่วันนี้', seeAll: { label: 'จัดการสมาชิก', to: 'head-members' },
          items: [
            { icon: 'user', tone: 'ok', title: 'คุณสมชาย', sub: 'กำลังตรวจบ้าน 45', meta: 'ออนไลน์', to: 'head-members' },
            { icon: 'user', tone: 'ok', title: 'คุณมาลี', sub: 'ตรวจแล้ว 4 หลัง', meta: 'ออนไลน์', to: 'head-members' },
            { icon: 'user', tone: 'warn', title: 'คุณประเสริฐ', sub: 'ยังไม่เริ่มรอบนี้', meta: 'ออฟไลน์', to: 'head-members' }
          ]
        }
      ]
    },
    {
      id: 'head-members', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L05', tab: 'members',
      title: 'สมาชิก', sub: '4 คน · ออนไลน์ 3',
      blocks: [
        { type: 'chips', items: ['ทั้งหมด', 'ออนไลน์', 'รออนุมัติ'], active: 0 },
        {
          type: 'list',
          items: [
            { icon: 'user', tone: 'ok', title: 'คุณสมหญิง', sub: 'หัวหน้าโซน 3 · 081-111-2222', meta: 'หัวหน้า', to: 'head-members' },
            { icon: 'user', tone: 'ok', title: 'คุณสมชาย', sub: 'เจ้าหน้าที่ · กำลังตรวจบ้าน 45', meta: 'ออนไลน์', to: 'head-members' },
            { icon: 'user', tone: 'warn', title: 'คุณมาลี', sub: 'เจ้าหน้าที่ · ตรวจแล้ว 4 หลัง', meta: 'ออนไลน์', to: 'head-members' },
            { icon: 'user', title: 'คุณประเสริฐ', sub: 'เจ้าหน้าที่ · ยังไม่เริ่มรอบนี้', meta: 'ออฟไลน์', to: 'head-members' }
          ]
        },
        { type: 'notice', tone: 'info', title: 'มีคำขอเข้า 1 คน', text: 'คุณอนันต์ ขอเข้าโซน 3', cta: { label: 'ตรวจคำขอ', to: 'head-members' } }
      ]
    },
    {
      id: 'head-zones', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L06', tab: 'zones',
      title: 'โซน', sub: '2 โซน · 20 หลัง',
      blocks: [
        {
          type: 'list', title: 'โซนที่ดูแล',
          items: [
            { icon: 'pin', tone: 'ok', title: 'โซน 3 · หมู่ 5', sub: '12 หลัง · 3 คน · ตรวจแล้ว 8', meta: 'กำลังตรวจ', to: 'head-zones' },
            { icon: 'pin', tone: 'warn', title: 'โซน 4 · หมู่ 6', sub: '8 หลัง · 1 คน · ยังไม่เริ่ม', meta: 'ต้องดู', to: 'head-zones' }
          ]
        },
        { type: 'callout', tone: 'warn', title: 'มี 2 หลังยังไม่อยู่ในโซน', text: 'บ้านที่ไม่อยู่ในโซนจะไม่มีเจ้าหน้าที่ตรวจ และกด SOS ไม่ถึงใคร' },
        { type: 'primary', label: 'เพิ่มโซนใหม่', sub: 'วาดพื้นที่บนแผนที่', icon: 'plus', to: 'head-zones' }
      ]
    },
    {
      id: 'head-log', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L08', tab: 'zones',
      title: 'บันทึกการตรวจ', sub: 'วันนี้ · 8 รายการ',
      blocks: [
        { type: 'chips', items: ['วันนี้', '7 วัน', '30 วัน', 'SOS'], active: 0 },
        {
          type: 'list',
          items: [
            { icon: 'check', tone: 'ok', title: 'บ้าน 45 · คุณสมชาย', sub: 'ตรวจผ่าน · ฝาปิดสนิท', meta: '09:52', to: 'head-log' },
            { icon: 'check', tone: 'ok', title: 'บ้าน 39 · คุณมาลี', sub: 'ตรวจผ่าน', meta: '09:30', to: 'head-log' },
            { icon: 'alert', tone: 'warn', title: 'บ้าน 36 · คุณประเสริฐ', sub: 'ฝาตู้เปิดค้าง · แจ้งซ่อม', meta: '09:08', to: 'head-log' },
            { icon: 'check', tone: 'ok', title: 'บ้าน 33 · คุณสมชาย', sub: 'ตรวจผ่าน', meta: '08:50', to: 'head-log' },
            { icon: 'check', tone: 'ok', title: 'บ้าน 30 · คุณมาลี', sub: 'ตรวจผ่าน', meta: '08:35', to: 'head-log' }
          ]
        },
        { type: 'secondary', label: 'ส่งออกรายงาน (CSV)', to: 'head-log' }
      ]
    },
    {
      id: 'head-settings', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L11', tab: 'settings',
      title: 'ตั้งค่า', sub: 'อสม. หมู่ 5',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'team', title: 'อสม. หมู่ 5', text: 'หัวหน้า: คุณสมหญิง', meta: 'รหัสหน่วยงาน AG-005 · สมาชิก 4 คน' },
        {
          type: 'actions', title: 'หน่วยงาน',
          items: [
            { icon: 'pin', label: 'ข้อมูลหน่วยงาน', sub: 'ที่อยู่ · เบอร์ติดต่อ', to: 'head-settings' },
            { icon: 'team', label: 'สมาชิกและคำขอ', sub: '4 คน · รออนุมัติ 1', to: 'head-members' }
          ]
        },
        {
          type: 'actions', title: 'การใช้งาน',
          items: [
            { icon: 'bell', label: 'การแจ้งเตือน', to: 'notif-settings' },
            { icon: 'text', label: 'ขนาดตัวอักษรและการแสดงผล', to: 'display' },
            { icon: 'logout', tone: 'danger', label: 'ออกจากระบบ', to: 'auth-signin' }
          ]
        }
      ]
    },

    /* ───────────────────────── แอดมิน / ช่าง ───────────────────────── */
    {
      id: 'admin-home', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D01', tab: 'home', device: 'desk',
      title: 'ภาพรวมระบบ', sub: 'ข้อมูล ณ 09:55 · อัปเดตอัตโนมัติ',
      blocks: [
        { type: 'stats', items: [{ label: 'ตู้ออนไลน์', value: '118/124', sub: '86% ของทั้งระบบ', tone: 'ok' }, { label: 'ต้องดูแล', value: '6', sub: 'ออฟไลน์ 4 · QR 2', tone: 'warn' }, { label: 'รออนุมัติ', value: '1', sub: 'หน่วยงานใหม่', tone: 'info' }, { label: 'แจ้งเตือนค้าง', value: '2', sub: 'ยังไม่อ่าน', tone: 'warn' }] },
        { type: 'notice', tone: 'warn', title: 'ต้องจัดการ 6 รายการ', text: 'ตู้ออฟไลน์ 4 หลัง และ QR ชำรุด 2 ใบ', cta: { label: 'เปิดรายการ', to: 'admin-boxes' } },
        {
          type: 'actions', title: 'งานด่วน',
          items: [
            { icon: 'box', label: 'ตู้ทั้งหมด', sub: 'ลงทะเบียน · ปลุก · ตั้งค่า', to: 'admin-boxes' },
            { icon: 'qr', label: 'จัดการ QR', sub: 'เคสเสีย/ปลอม/ออกใหม่', to: 'admin-qr' },
            { icon: 'user', label: 'ผู้ใช้', sub: 'ค้นหา · รีเซ็ต · ปิดบัญชี', to: 'admin-users' },
            { icon: 'settings', label: 'ระบบ', sub: 'เฟิร์มแวร์ · แพ็กเกจ · บันทึก', to: 'admin-system' }
          ]
        },
        {
          type: 'list', title: 'ความเคลื่อนไหวล่าสุด',
          items: [
            { icon: 'alert', tone: 'warn', title: 'BX-00042 ออฟไลน์', sub: 'แบต 12% · บ้านเลขที่ 42', meta: '07:40', to: 'admin-box' },
            { icon: 'qr', tone: 'warn', title: 'QR ชำรุด · บ้าน 51', sub: 'เจ้าของยืนยันใช้ใบสำรองแล้ว', meta: '08:15', to: 'admin-qr' },
            { icon: 'check', tone: 'ok', title: 'อนุมัติหน่วยงานใหม่', sub: 'อสม. หมู่ 7', meta: 'เมื่อวาน', to: 'admin-users' }
          ]
        }
      ]
    },
    {
      id: 'admin-boxes', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D03', tab: 'boxes', device: 'desk',
      title: 'ตู้ทั้งหมด', sub: '124 ตู้ · ออนไลน์ 118',
      blocks: [
        { type: 'toolbar', search: 'ค้นหารหัสตู้หรือบ้านเลขที่', chips: ['ทั้งหมด', 'ออฟไลน์', 'QR มีปัญหา', 'แบตต่ำ'], active: 0, action: 'ลงทะเบียนตู้ใหม่' },
        {
          type: 'table', columns: ['ตู้', 'บ้าน', 'สถานะ', 'แบต', 'ติดต่อล่าสุด'], to: 'admin-box',
          rows: [
            ['BX-00042', '42 / 5', { t: 'ออฟไลน์', tone: 'danger' }, '12%', '2 ชม.'],
            ['BX-00051', '51 / 5', { t: 'QR ชำรุด', tone: 'warn' }, '64%', '8 นาที'],
            ['BX-00045', '45 / 5', { t: 'ออนไลน์', tone: 'ok' }, '78%', '1 นาที'],
            ['BX-00048', '48 / 5', { t: 'ออนไลน์', tone: 'ok' }, '91%', '3 นาที'],
            ['BX-00039', '39 / 5', { t: 'ออนไลน์', tone: 'ok' }, '55%', '5 นาที'],
            ['BX-00036', '36 / 5', { t: 'แบตต่ำ', tone: 'warn' }, '9%', '20 นาที']
          ]
        },
        { type: 'note', text: 'แสดง 6 จาก 124 ตู้ · เลื่อนลงเพื่อดูเพิ่ม' }
      ]
    },
    {
      id: 'admin-box', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D04', noTabs: true, device: 'desk', back: 'admin-boxes',
      title: 'BX-00042', sub: 'บ้านเลขที่ 42 · หมู่ 5 · เจ้าของ คุณสมชาย',
      blocks: [
        { type: 'status', tone: 'danger', icon: 'alert', title: 'ออฟไลน์ 2 ชั่วโมง', text: 'ติดต่อล่าสุด 07:40 · แบตเตอรี่ 12%', meta: 'แจ้งเตือนเจ้าของบ้านแล้ว' },
        { type: 'chips', items: ['ภาพรวม', 'ทดสอบ', 'ตั้งค่า', 'QR', 'ขั้นสูง'], active: 0 },
        { type: 'facts', title: 'ข้อมูลตู้', rows: [['รหัสตู้', 'BX-00042'], ['โซน', 'โซน 3 · หมู่ 5'], ['หน่วยงาน', 'อสม. หมู่ 5'], ['เฟิร์มแวร์', 'v2.4.1'], ['QR หน้าตู้', 'ปกติ']] },
        { type: 'primary', label: 'ปลุกตู้', sub: 'ส่งสัญญาณปลุก · ใช้เวลา 30 วินาที', icon: 'send', to: 'admin-box' },
        { type: 'actions', items: [{ icon: 'list', label: 'ดูบันทึกของตู้นี้', to: 'admin-box' }, { icon: 'wrench', label: 'แจ้งเจ้าของบ้าน', to: 'admin-box' }] }
      ]
    },
    {
      id: 'admin-qr', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D05', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'สุขภาพ QR', sub: '2 เคสต้องดูแล · ทั้งระบบ 124 ใบ',
      blocks: [
        { type: 'callout', tone: 'info', title: 'เคส QR ใช้เวลา 1–2 วัน', text: 'เจ้าของบ้านเป็นคนติด QR สำรอง · แอดมินออกใบใหม่แล้วจัดส่ง' },
        { type: 'chips', items: ['ต้องดูแล 2', 'รอเจ้าของ 1', 'ปิดแล้ว'], active: 0 },
        {
          type: 'list',
          items: [
            { icon: 'qr', tone: 'warn', title: 'บ้าน 51 · QR ชำรุด', sub: 'เจ้าของใช้ใบสำรองแล้ว · รอออกใบใหม่ 2 ใบ', meta: '08:15', to: 'admin-box' },
            { icon: 'qr', tone: 'danger', title: 'บ้าน 27 · QR ปลอม', sub: 'พบ QR แปะทับ · ปิดลิงก์ปลอมแล้ว', meta: 'เมื่อวาน', to: 'admin-box' }
          ]
        },
        { type: 'primary', label: 'พิมพ์ QR ใบใหม่', sub: 'เลือกตู้แล้วพิมพ์', icon: 'qr', to: 'admin-box' }
      ]
    },
    {
      id: 'admin-users', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D09', tab: 'users', device: 'desk',
      title: 'ผู้ใช้', sub: '318 บัญชี · ใช้งาน 301',
      blocks: [
        { type: 'toolbar', search: 'ค้นหาชื่อ เบอร์ หรือบ้านเลขที่', chips: ['ทั้งหมด', 'เจ้าของบ้าน', 'เจ้าหน้าที่', 'หัวหน้า', 'ปิดใช้งาน'], active: 0, action: 'เพิ่มผู้ใช้' },
        {
          type: 'table', columns: ['ชื่อ', 'บทบาท', 'เบอร์', 'สถานะ'], to: 'admin-users',
          rows: [
            ['สมชาย ใจดี', 'เจ้าของบ้าน', '081-234-5678', { t: 'ใช้งาน', tone: 'ok' }],
            ['สมหญิง รักบ้าน', 'หัวหน้า', '082-345-6789', { t: 'ใช้งาน', tone: 'ok' }],
            ['มาลี สว่าง', 'เจ้าหน้าที่', '083-456-7890', { t: 'ใช้งาน', tone: 'ok' }],
            ['ประเสริฐ ดีงาม', 'เจ้าหน้าที่', '084-567-8901', { t: 'รออนุมัติ', tone: 'warn' }],
            ['อนันต์ พูลสุข', 'เจ้าของบ้าน', '085-678-9012', { t: 'ปิดใช้งาน', tone: 'danger' }]
          ]
        },
        { type: 'note', text: 'แสดง 5 จาก 318 บัญชี · ค้นหาเพื่อดูบัญชีอื่น' }
      ]
    },
    {
      id: 'admin-system', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D16', tab: 'system', device: 'desk',
      title: 'ระบบ', sub: 'ตั้งค่าและเครื่องมือ',
      blocks: [
        { type: 'stats', items: [{ label: 'ต้องดูแล', value: '6', sub: 'ตู้ + QR', tone: 'warn' }, { label: 'รออนุมัติ', value: '1', sub: 'หน่วยงาน', tone: 'info' }, { label: 'เฟิร์มแวร์', value: 'v2.4.1', sub: 'ตู้ 118 ตัวล่าสุด', tone: 'ok' }] },
        {
          type: 'actions', title: 'ต้องดูแล',
          items: [
            { icon: 'qr', tone: 'warn', label: 'QR มีปัญหา', sub: '2 เคส', to: 'admin-qr' },
            { icon: 'shield', tone: 'warn', label: 'หน่วยงานรออนุมัติ', sub: '1 คำขอ', to: 'admin-users' }
          ]
        },
        {
          type: 'actions', title: 'เครื่องมือ',
          items: [
            { icon: 'box', label: 'เฟิร์มแวร์ตู้', sub: 'อัปเดตทั้งระบบ · v2.4.1', to: 'admin-system' },
            { icon: 'download', label: 'แพ็กเกจและราคา', to: 'admin-system' },
            { icon: 'list', label: 'บันทึกทั้งหมด', sub: 'เข้าใช้งาน · ตรวจ · ระบบ', to: 'admin-system' }
          ]
        },
        {
          type: 'actions', title: 'บัญชี',
          items: [
            { icon: 'key', label: 'เปลี่ยนรหัสผ่าน', to: 'admin-system' },
            { icon: 'logout', tone: 'danger', label: 'ออกจากระบบ', to: 'auth-signin' }
          ]
        }
      ]
    },

    /* ───────────────────────── ไรเดอร์ ───────────────────────── */
    {
      id: 'rider-code', role: 'rider', group: 'ไรเดอร์', code: 'R01', noTabs: true,
      title: 'ส่งของ', sub: 'ไม่ต้องสมัคร ไม่ต้องล็อกอิน',
      step: { n: 1, total: 3, label: 'แจ้งส่งของ' },
      blocks: [
        { type: 'text', title: 'พิมพ์รหัส 8 ตัว', body: 'รหัสอยู่ใต้ QR ที่หน้าตู้ · ใช้เมื่อกล้องสแกนไม่ได้' },
        { type: 'codeinput', label: 'รหัสตู้', value: 'BX42 7K9Q', hint: 'ตัวอักษรและตัวเลข 8 ตัว' },
        { type: 'primary', label: 'เปิดตู้', sub: 'ตรวจรหัสก่อนเปิดช่อง', icon: 'door', to: 'rider-confirm' },
        { type: 'callout', tone: 'info', title: 'ไม่มีบัญชีก็ส่งได้', text: 'ระบบไม่เก็บชื่อหรือเบอร์ไรเดอร์' }
      ]
    },
    {
      id: 'rider-confirm', role: 'rider', group: 'ไรเดอร์', code: 'R02', noTabs: true, back: 'rider-code',
      title: 'บ้านเลขที่ 42', sub: 'ตู้ BX-00042 · พร้อมรับ', step: { n: 2, total: 3, label: 'แจ้งส่งของ' },
      blocks: [
        { type: 'status', tone: 'ok', icon: 'door', title: 'เปิดฝาตู้ได้เลย', text: 'ช่องกลางว่าง · กรุณาปิดฝาให้สนิท', meta: 'เปิดได้ภายใน 3 นาที' },
        {
          type: 'steps', title: 'วิธีส่ง',
          items: [
            { t: 'เปิดฝาตู้', s: 'ดึงมือจับด้านบน' },
            { t: 'วางของในช่อง', s: 'ช่องกลาง · วางให้สุด' },
            { t: 'ปิดฝาให้สนิท', s: 'ได้ยินเสียงคลิก' }
          ]
        },
        { type: 'primary', label: 'ยืนยันว่าส่งแล้ว', sub: 'เจ้าของบ้านจะได้รับแจ้งเตือนทันที', icon: 'check', to: 'rider-done' },
        { type: 'secondary', label: 'ยกเลิก', to: 'rider-code' }
      ]
    },
    {
      id: 'rider-done', role: 'rider', group: 'ไรเดอร์', code: 'R04', noTabs: true, back: 'rider-code',
      title: 'แจ้งส่งของแล้ว', sub: 'บ้านเลขที่ 42 · 09:58', step: { n: 3, total: 3, label: 'แจ้งส่งของ' },
      blocks: [
        { type: 'done', title: 'เรียบร้อย', text: 'เจ้าของบ้านได้รับแจ้งเตือนแล้ว', meta: 'ไม่ต้องกรอกอะไรอีก' },
        { type: 'primary', label: 'ส่งตู้ถัดไป', sub: 'กลับไปหน้าพิมพ์รหัส', icon: 'scan', to: 'rider-code' }
      ]
    },
    {
      id: 'rider-invalid', role: 'rider', group: 'ไรเดอร์', code: 'R03', noTabs: true, back: 'rider-code',
      title: 'รหัสไม่ถูกต้อง', sub: 'ลองอีกครั้ง',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'เปิดตู้ไม่ได้', text: 'รหัสอาจพิมพ์ผิด หรือ QR หน้าตู้ถูกเปลี่ยน' },
        { type: 'primary', label: 'ลองใหม่', sub: 'พิมพ์รหัสอีกครั้ง', icon: 'back', to: 'rider-code' },
        { type: 'callout', tone: 'info', title: 'ตู้ปิดปรับปรุง?', text: 'จะมีป้ายแจ้งที่หน้าตู้ · ไม่ต้องรอ ให้แจ้งต้นทางแล้วไปส่งตู้ถัดไป' }
      ]
    },

    /* ───────────────────────── เข้าสู่ระบบ ───────────────────────── */
    {
      id: 'auth-signin', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A04', noTabs: true,
      title: 'เข้าสู่ระบบ', sub: 'ตู้จดหมายอัจฉริยะ',
      blocks: [
        {
          type: 'form',
          fields: [
            { label: 'เบอร์โทรศัพท์', type: 'text', value: '081-234-5678', hint: 'เบอร์ที่ใช้สมัคร' },
            { label: 'รหัสผ่าน', type: 'password', value: '••••••••', hint: 'ลืมรหัส? ให้หัวหน้าหน่วยงานรีเซ็ตให้' }
          ],
          submit: { label: 'เข้าสู่ระบบ', to: 'owner-home' },
          note: 'ใช้ได้ทั้งเจ้าของบ้าน เจ้าหน้าที่ และหัวหน้าหน่วยงาน'
        },
        { type: 'secondary', label: 'สมัครใหม่', to: 'auth-choose' },
        { type: 'callout', tone: 'info', title: 'เป็นไรเดอร์?', text: 'ไม่ต้องเข้าสู่ระบบ ใช้ลิงก์จาก QR ที่หน้าตู้ หรือพิมพ์รหัสตู้', cta: { label: 'ไปหน้าส่งของ', to: 'rider-code' } }
      ]
    },
    {
      id: 'auth-choose', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A05', noTabs: true, back: 'auth-signin',
      title: 'สมัครใช้งาน', sub: 'เลือกประเภทผู้ใช้',
      blocks: [
        {
          type: 'actions',
          items: [
            { icon: 'home', label: 'เจ้าของบ้าน', sub: 'ผูกตู้ที่บ้าน · รับแจ้งเตือน · กด SOS', to: 'auth-signup' },
            { icon: 'shield', label: 'เจ้าหน้าที่ตรวจตู้', sub: 'ต้องมีรหัสจากหัวหน้าหน่วยงาน', to: 'auth-signup' },
            { icon: 'team', label: 'หัวหน้าหน่วยงาน', sub: 'สร้างโซน · ดูแลเจ้าหน้าที่', to: 'auth-signup' }
          ]
        },
        { type: 'note', text: 'ยังไม่แน่ใจ? เลือก “เจ้าของบ้าน” แล้วทำตามขั้นตอนได้เลย' },
        { type: 'secondary', label: 'มีบัญชีอยู่แล้ว · เข้าสู่ระบบ', to: 'auth-signin' }
      ]
    },
    {
      id: 'auth-signup', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A06', noTabs: true, back: 'auth-choose',
      title: 'สมัคร · เจ้าของบ้าน', sub: 'ขั้น 1 จาก 2', step: { n: 1, total: 2, label: 'สมัคร' },
      blocks: [
        {
          type: 'form',
          fields: [
            { label: 'ชื่อที่ให้เรียก', type: 'text', value: 'สมชาย', placeholder: 'เช่น สมชาย' },
            { label: 'เบอร์โทรศัพท์', type: 'text', value: '081-234-5678', hint: 'ใช้เข้าสู่ระบบและรับแจ้งเตือน' },
            { label: 'รหัสผ่าน', type: 'password', value: '', placeholder: 'อย่างน้อย 8 ตัวอักษร', hint: 'ตั้งให้จำง่าย แต่คนอื่นเดาไม่ได้' },
            { label: 'ยอมรับข้อตกลง', type: 'check', value: true, hint: 'SOS ไม่แทนการโทร 191 · อ่านข้อตกลง' }
          ],
          submit: { label: 'ต่อไป · ยืนยันเบอร์', to: 'auth-activate' },
          note: 'เราจะส่งรหัส 6 หลักไปที่เบอร์นี้'
        }
      ]
    },
    {
      id: 'auth-activate', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A07', noTabs: true, back: 'auth-signup',
      title: 'ผูกตู้กับบัญชี', sub: 'ขั้น 2 จาก 2', step: { n: 2, total: 2, label: 'ผูกตู้' },
      blocks: [
        { type: 'text', title: 'หาก QR ในตู้', body: 'เปิดฝาตู้ · QR เปิดใช้ติดอยู่ด้านในฝา' },
        { type: 'camera', hint: 'ส่อง QR เปิดใช้ตู้ให้อยู่ในกรอบ' },
        { type: 'primary', label: 'สแกน QR ในตู้', sub: 'ใช้กล้องมือถือ', icon: 'scan', to: 'owner-home' },
        { type: 'secondary', label: 'พิมพ์รหัส 8 ตัวแทน', to: 'auth-activate' },
        { type: 'note', text: 'ตู้หนึ่งใบผูกได้กับบัญชีเดียว · ถ้าตู้มีเจ้าของแล้ว ให้ติดต่อผู้ดูแลระบบ' }
      ]
    },

    /* ───────────────────────── ใช้ร่วมกัน ───────────────────────── */
    {
      id: 'notif-settings', role: 'shared', group: 'ใช้ร่วมกัน', code: 'ALL', noTabs: true, back: 'owner-settings',
      title: 'ตั้งค่าการแจ้งเตือน', sub: 'เลือกว่าจะให้เตือนเรื่องอะไร',
      blocks: [
        {
          type: 'form',
          fields: [
            { label: 'SOS และเหตุฉุกเฉิน', type: 'toggle', value: true, locked: true, hint: 'ปิดไม่ได้ เพื่อความปลอดภัย' },
            { label: 'มีของมาส่ง', type: 'toggle', value: true, hint: 'เตือนทันทีที่ไรเดอร์แจ้ง' },
            { label: 'เจ้าหน้าที่มาตรวจ', type: 'toggle', value: true },
            { label: 'ข่าวสารและประกาศ', type: 'toggle', value: false },
            { label: 'เสียงแจ้งเตือน', type: 'toggle', value: true, hint: 'ปิดเสียงได้ แต่ยังเห็นในรายการ' }
          ],
          submit: { label: 'บันทึก', to: 'owner-settings' },
          note: 'ปิดการแจ้งเตือนทั้งหมดไม่ได้ เพราะ SOS ต้องถึงคุณเสมอ'
        }
      ]
    },
    {
      id: 'display', role: 'shared', group: 'ใช้ร่วมกัน', code: 'H13-d · O13-b', noTabs: true, back: 'owner-settings',
      title: 'แบบการใช้งาน', sub: 'ปรับให้เหมาะกับสายตาและการใช้งาน',
      blocks: [
        {
          type: 'options', label: 'รูปแบบหน้าจอ', value: 0,
          options: [
            { t: 'ง่าย', s: 'ตัวใหญ่ ปุ่มใหญ่ เห็นเฉพาะสิ่งสำคัญ', icon: 'sun' },
            { t: 'ปกติ', s: 'ข้อมูลครบ ใช้งานทั่วไป', icon: 'text' },
            { t: 'ละเอียด', s: 'เห็นข้อมูลเทคนิค เวลา และรหัส', icon: 'sliders' }
          ]
        },
        { type: 'options', label: 'ขนาดตัวอักษร', value: 1, compact: true, options: [{ t: 'ปกติ', s: 'A' }, { t: 'ใหญ่', s: 'A' }, { t: 'ใหญ่มาก', s: 'A' }] },
        { type: 'primary', label: 'ใช้แบบนี้', to: 'owner-home' },
        { type: 'note', text: 'เปลี่ยนแล้วมีผลทุกหน้าทันที · เปลี่ยนกลับได้ตลอด' }
      ]
    },
    {
      id: 'error-offline', role: 'shared', group: 'ใช้ร่วมกัน', code: 'ERR', noTabs: true, back: 'owner-home',
      title: 'ไม่มีอินเทอร์เน็ต', sub: 'ข้อมูลล่าสุดเมื่อ 09:41',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'wifi', title: 'ตอนนี้ต่อเน็ตไม่ได้', text: 'ข้อมูลที่เห็นเป็นข้อมูลล่าสุดก่อนขาดการเชื่อมต่อ', meta: 'ต่อ Wi-Fi หรือเปิดข้อมูลมือถือ แล้วลองใหม่' },
        { type: 'primary', label: 'ลองอีกครั้ง', sub: 'ตรวจสอบสัญญาณแล้วกด', icon: 'wifi', retry: true },
        { type: 'secondary', label: 'กลับหน้าหลัก', to: 'owner-home' },
        { type: 'note', text: 'ถ้าเป็นเหตุฉุกเฉิน ไม่ต้องรอเน็ต · โทร 191 หรือ 1669 ได้ทันที' }
      ]
    },
    {
      id: 'error-404', role: 'shared', group: 'ใช้ร่วมกัน', code: 'ERR', noTabs: true, back: 'owner-home',
      title: 'ไม่พบหน้านี้', sub: 'ลิงก์อาจเก่าหรือพิมพ์ผิด',
      blocks: [
        { type: 'callout', tone: 'info', title: 'ไม่ต้องตกใจ', text: 'ข้อมูลของคุณยังอยู่ครบ · กลับหน้าหลักแล้วทำต่อได้เลย' },
        { type: 'primary', label: 'กลับหน้าหลัก', icon: 'home', to: 'owner-home' },
        { type: 'note', text: 'ถ้าเปิดจาก QR ในตู้ ให้สแกน QR ใหม่ที่หน้าตู้' }
      ]
    },

    /* ───────────── เพิ่มเติม: ครบ 99 รหัส wireframe ───────────── */

    /* เจ้าของบ้าน · SOS / ประวัติ / สมาชิกในบ้าน */
    {
      id: 'owner-sos-cancel', role: 'owner', group: 'เจ้าของบ้าน · SOS', code: 'H10', noTabs: true, back: 'sos-hold',
      title: 'ยกเลิก SOS?', sub: 'บ้านเลขที่ 42 · ยังไม่ได้ส่ง',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'ถ้ายกเลิกตอนนี้ จะไม่มีใครได้รับแจ้ง', text: 'ถ้าต้องการความช่วยเหลือจริง ๆ ให้กลับไปกดค้างต่อ' },
        { type: 'primary', label: 'ยกเลิก SOS', sub: 'กลับหน้าหลัก', icon: 'x', tone: 'danger', to: 'owner-home' },
        { type: 'secondary', label: 'กลับไปส่งต่อ', to: 'sos-hold' },
        { type: 'note', text: 'กดส่ง SOS ซ้ำได้ตลอด เมื่อรู้สึกไม่ปลอดภัย' }
      ]
    },
    {
      id: 'owner-sos-closed', role: 'owner', group: 'เจ้าของบ้าน · SOS', code: 'H11-b', noTabs: true, back: 'owner-home',
      title: 'ปิดเรื่องแล้ว', sub: 'บ้านเลขที่ 42 · วันนี้ 09:58',
      blocks: [
        { type: 'done', title: 'ปลอดภัยแล้ว', text: 'เจ้าหน้าที่ปิดเรื่องและบันทึกหมายเหตุไว้', meta: 'คุณสมหญิง · อสม. หมู่ 5' },
        { type: 'facts', title: 'สรุปเหตุการณ์', rows: [['รับเรื่อง', '09:44'], ['ถึงบ้าน', '09:52'], ['ปิดเรื่อง', '09:58'], ['หมายเหตุ', 'ล้มในห้องน้ำ ช่วยพยุงขึ้นมาได้']] },
        { type: 'primary', label: 'กลับหน้าหลัก', icon: 'home', to: 'owner-home' }
      ]
    },
    {
      id: 'owner-offline', role: 'owner', group: 'เจ้าของบ้าน', code: 'H12-d', noTabs: true, back: 'owner-history',
      title: 'ตู้ไม่ออนไลน์', sub: 'บ้านเลขที่ 42 · ขาดการติดต่อ 2 ชั่วโมง',
      blocks: [
        { type: 'status', tone: 'danger', icon: 'alert', title: 'ตู้ไม่ส่งสัญญาณ', text: 'เจ้าหน้าที่จะตรวจตู้ไม่ได้จนกว่าตู้จะกลับมาออนไลน์', meta: 'ติดต่อล่าสุด 07:40 · แบตเตอรี่ 12%' },
        { type: 'callout', tone: 'info', title: 'สาเหตุที่พบบ่อย', text: 'แบตเตอรี่หมด · Wi-Fi บ้านเปลี่ยนรหัส · แผงโซลาร์โดนบัง' },
        {
          type: 'steps', title: 'ลองทำตามนี้',
          items: [
            { t: 'ดูว่าแผงโซลาร์โดนแดดไหม', s: 'ถ้ามีอะไรบัง ให้ย้ายออก' },
            { t: 'เช็ก Wi-Fi ที่บ้าน', s: 'ถ้าเพิ่งเปลี่ยนรหัส ให้ตั้งใหม่' },
            { t: 'ยังไม่กลับมา? แจ้งช่าง', s: 'ช่างจะโทรกลับภายใน 1 วันทำการ' }
          ]
        },
        { type: 'primary', label: 'แจ้งช่าง', sub: 'ให้ช่างมาตรวจที่บ้าน', icon: 'wrench', to: 'owner-technician' },
        { type: 'secondary', label: 'ตั้ง Wi-Fi ใหม่', to: 'owner-wifi' }
      ]
    },
    {
      id: 'owner-range', role: 'owner', group: 'เจ้าของบ้าน', code: 'H12-e', noTabs: true, back: 'owner-history',
      title: 'เลือกช่วงวันที่', sub: 'ดูประวัติย้อนหลังของบ้าน 42',
      blocks: [
        { type: 'chips', items: ['7 วัน', '30 วัน', '3 เดือน', 'กำหนดเอง'], active: 1 },
        { type: 'facts', title: 'ช่วงที่เลือก', rows: [['ตั้งแต่', '17 ต.ค. 2026'], ['ถึง', '16 พ.ย. 2026'], ['รายการ', '25 รายการ']] },
        { type: 'primary', label: 'ดูประวัติช่วงนี้', icon: 'list', to: 'owner-history' },
        { type: 'note', text: 'ประวัติเก็บย้อนหลัง 12 เดือน · ส่งออกได้ที่หน้าตั้งค่า' }
      ]
    },
    {
      id: 'owner-family', role: 'owner', group: 'เจ้าของบ้าน · ข้อเสนอ', code: 'H15', noTabs: true, back: 'owner-settings',
      title: 'สมาชิกในบ้าน', sub: 'แชร์การแจ้งเตือนกับคนในบ้าน',
      blocks: [
        { type: 'callout', tone: 'info', title: 'ข้อเสนอ · ยังไม่เปิดใช้', text: 'หน้านี้อยู่นอกขอบเขตผลิตภัณฑ์รอบนี้ แสดงไว้เพื่อให้เห็นทิศทาง' },
        {
          type: 'list', title: 'สมาชิกตอนนี้',
          items: [
            { icon: 'user', tone: 'ok', title: 'คุณสมชาย', sub: 'เจ้าของบัญชี · เห็นทุกอย่าง', meta: 'คุณ', to: 'owner-family' },
            { icon: 'user', title: 'คุณมาลี', sub: 'ลูกสาว · เห็นของมาส่งและ SOS', meta: 'ใช้งาน', to: 'owner-family-home' }
          ]
        },
        { type: 'primary', label: 'เชิญสมาชิก', sub: 'ส่งลิงก์ทาง SMS', icon: 'plus', to: 'owner-family-invite' },
        { type: 'note', text: 'สมาชิกจะไม่เห็นรหัสผ่านหรือข้อมูลบัญชีของเจ้าของบ้าน' }
      ]
    },
    {
      id: 'owner-family-invite', role: 'owner', group: 'เจ้าของบ้าน · ข้อเสนอ', code: 'H15-b', noTabs: true, back: 'owner-family',
      title: 'เชิญสมาชิก', sub: 'บ้านเลขที่ 42',
      blocks: [
        {
          type: 'form',
          fields: [
            { label: 'ชื่อที่ให้เรียก', type: 'text', placeholder: 'เช่น มาลี' },
            { label: 'เบอร์โทรศัพท์', type: 'text', placeholder: '08x-xxx-xxxx', hint: 'สมาชิกจะได้รับลิงก์เชิญทาง SMS' }
          ],
          submit: { label: 'ส่งคำเชิญ', to: 'owner-family' },
          note: 'คำเชิญหมดอายุใน 24 ชั่วโมง · ส่งใหม่ได้ตลอด'
        }
      ]
    },
    {
      id: 'owner-family-home', role: 'owner', group: 'เจ้าของบ้าน · ข้อเสนอ', code: 'H15-c', noTabs: true, back: 'owner-family',
      title: 'หน้าหลักของสมาชิก', sub: 'คุณมาลี · บ้านเลขที่ 42',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'check', title: 'ตู้ทำงานปกติ', text: 'เห็นเฉพาะของบ้านนี้', meta: 'ไม่มีข้อมูลบัญชีของเจ้าของบ้าน' },
        { type: 'sos', state: 'idle' },
        { type: 'actions', items: [{ icon: 'box', tone: 'warn', label: 'ของมาส่งวันนี้ 2 ครั้ง', to: 'owner-history' }, { icon: 'bell', label: 'การแจ้งเตือนของฉัน', to: 'notif-settings' }] },
        { type: 'note', text: 'สมาชิกออกจากบ้านได้เองที่หน้าตั้งค่า' }
      ]
    },

    /* เจ้าหน้าที่ · สถานะการตรวจ + ตั้งค่า */
    {
      id: 'officer-camera', role: 'officer', group: 'เจ้าหน้าที่', code: 'O02-c', noTabs: true, back: 'officer-scan',
      title: 'ขอสิทธิ์กล้อง', sub: 'ใช้กล้องเพื่อสแกน QR หน้าตู้',
      blocks: [
        { type: 'callout', tone: 'info', title: 'ทำไมต้องใช้กล้อง', text: 'ระบบใช้กล้องเฉพาะตอนสแกน · ไม่บันทึกภาพและไม่ส่งภาพออกจากเครื่อง' },
        { type: 'camera', hint: 'ภาพตัวอย่าง: QR หน้าตู้จะอยู่ในกรอบ' },
        { type: 'primary', label: 'อนุญาตให้ใช้กล้อง', icon: 'camera', to: 'officer-scan' },
        { type: 'secondary', label: 'พิมพ์รหัสแทน', to: 'officer-code' }
      ]
    },
    {
      id: 'officer-qr-condition', role: 'officer', group: 'เจ้าหน้าที่', code: 'O03', noTabs: true, back: 'officer-scan',
      title: 'QR หน้าตู้เสียไหม', sub: 'บ้านเลขที่ 45',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'qr', title: 'QR อ่านไม่ชัด', text: 'อาจมีรอยขีดข่วน แสงสะท้อน หรือมีอะไรแปะทับ', meta: 'ลองเช็ดด้วยผ้าแห้งก่อน' },
        { type: 'primary', label: 'QR ใช้งานได้ · ไปต่อ', icon: 'check', to: 'officer-badge' },
        { type: 'secondary', label: 'QR เสีย · แจ้งซ่อม', to: 'officer-done' },
        { type: 'note', text: 'ถ้า QR เสีย ให้ใช้ QR สำรองในตู้หรือแจ้งแอดมินออกใบใหม่' }
      ]
    },
    {
      id: 'officer-not-system', role: 'officer', group: 'เจ้าหน้าที่', code: 'O04', noTabs: true, back: 'officer-scan',
      title: 'QR นี้ไม่ใช่ของระบบ', sub: 'อาจถูกแปะทับ · บ้าน 45',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'อย่าสแกนต่อ', text: 'QR นี้อาจถูกแปะทับเพื่อหลอกให้เข้าเว็บปลอม · ถ่ายรูปไว้เป็นหลักฐาน' },
        { type: 'steps', items: [{ t: 'ถ่ายรูป QR ที่แปะทับ', s: 'ให้เห็นตำแหน่งหน้าตู้' }, { t: 'แจ้งแอดมินทันที', s: 'แอดมินจะปิดลิงก์และออก QR ใหม่' }, { t: 'ใช้ QR สำรองในตู้', s: 'ถ้ามี' }] },
        { type: 'primary', label: 'แจ้งแอดมินแล้ว', icon: 'send', to: 'officer-home' },
        { type: 'secondary', label: 'กลับไปสแกน', to: 'officer-scan' }
      ]
    },
    {
      id: 'officer-denied', role: 'officer', group: 'เจ้าหน้าที่', code: 'O04-b', noTabs: true, back: 'officer-scan',
      title: 'ตรวจไม่ได้', sub: 'บ้านเลขที่ 45',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'สาเหตุที่เป็นไปได้', text: 'อยู่นอกโซนที่ดูแล · อยู่นอกเวลาตรวจ · รหัสตู้ไม่ถูกต้อง' },
        { type: 'facts', rows: [['โซนของคุณ', 'โซน 3 · หมู่ 5'], ['เวลาตรวจ', '09:00–11:00'], ['ตอนนี้', '10:12 · อยู่ในเวลา']] },
        { type: 'primary', label: 'ลองอีกครั้ง', icon: 'scan', to: 'officer-scan' },
        { type: 'secondary', label: 'กลับหน้าสรุป', to: 'officer-home' }
      ]
    },
    {
      id: 'officer-wake', role: 'officer', group: 'เจ้าหน้าที่', code: 'O05', noTabs: true, back: 'officer-home',
      title: 'กำลังปลุกตู้', sub: 'บ้านเลขที่ 45 · ใช้เวลาประมาณ 30 วินาที',
      blocks: [
        { type: 'status', tone: 'info', icon: 'wifi', title: 'ส่งสัญญาณปลุกแล้ว', text: 'รอตู้ตื่นและตอบกลับ', meta: 'กำลังเชื่อมต่อ…' },
        { type: 'steps', items: [{ t: 'ส่งสัญญาณปลุก', s: 'สำเร็จ', done: true }, { t: 'ตู้ตื่นและตรวจสอบ', s: 'กำลังทำ', active: true }, { t: 'พร้อมสแกน QR', s: 'รอ' }] },
        { type: 'primary', label: 'ตื่นแล้ว · ไปต่อ', icon: 'check', to: 'officer-badge' },
        { type: 'secondary', label: 'ยกเลิก', to: 'officer-home' }
      ]
    },
    {
      id: 'officer-badge-failed', role: 'officer', group: 'เจ้าหน้าที่', code: 'O06-c', noTabs: true, back: 'officer-badge',
      title: 'ตู้สแกนไม่ผ่าน 3 ครั้ง', sub: 'บ้านเลขที่ 45',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'ยังตรวจไม่ได้', text: 'รหัสอาจหมดอายุ หรือกล้องตู้สกปรก · ตู้จะไม่รับรหัสเดิมอีก' },
        { type: 'steps', title: 'ลองใหม่', items: [{ t: 'เช็ดกล้องที่ตู้', s: 'ใช้ผ้าแห้ง เช็ดเบา ๆ' }, { t: 'สร้างรหัสใหม่', s: 'รหัสเปลี่ยนทุก 30 วินาที' }, { t: 'ยื่นให้ห่าง 20 ซม.', s: 'อย่าให้นิ้วบัง' }] },
        { type: 'primary', label: 'สร้างรหัสใหม่', icon: 'qr', to: 'officer-badge' },
        { type: 'secondary', label: 'แจ้งแอดมิน', to: 'officer-home' }
      ]
    },
    {
      id: 'officer-sos-handling', role: 'officer', group: 'เจ้าหน้าที่', code: 'O10', noTabs: true, back: 'officer-sos-case',
      title: 'กำลังดูแล SOS', sub: 'บ้านเลขที่ 42 · คุณสมชาย',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'pin', title: 'ถึงบ้านแล้ว 09:52', text: 'ตรวจความปลอดภัยก่อน แล้วค่อยปฐมพยาบาล', meta: 'เริ่มรับเรื่อง 09:44' },
        { type: 'steps', title: 'ขั้นตอน', items: [{ t: 'ตรวจความปลอดภัย', s: 'ดูว่ามีอะไรเสี่ยงก่อนเข้าไป', done: true }, { t: 'ปฐมพยาบาล', s: 'ถ้าหนักให้โทร 1669', active: true }, { t: 'บันทึกผลและปิดเรื่อง', s: 'เจ้าของบ้านจะได้รับแจ้ง' }] },
        { type: 'primary', label: 'ปิดเรื่อง', sub: 'บันทึกผลการช่วยเหลือ', icon: 'check', to: 'officer-sos-close' },
        { type: 'actions', items: [{ icon: 'phone', tone: 'danger', label: 'โทร 1669', sub: 'ถ้าต้องการรถพยาบาล', tel: true }] }
      ]
    },
    {
      id: 'officer-settings', role: 'officer', group: 'เจ้าหน้าที่', code: 'O13', tab: 'settings',
      title: 'ตั้งค่า', sub: 'คุณสมชาย · โซน 3',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'shield', title: 'พร้อมปฏิบัติงาน', text: 'แจ้งเตือนเปิด · เครื่องนี้', meta: 'โซน 3 · หมู่ 5' },
        { type: 'actions', title: 'การใช้งาน', items: [
          { icon: 'bell', label: 'การแจ้งเตือน', sub: 'SOS · งานตรวจ', to: 'officer-notifications' },
          { icon: 'text', label: 'ขนาดตัวอักษรและการแสดงผล', to: 'display' },
          { icon: 'pin', label: 'โซนที่ดูแล', sub: 'โซน 3 · 12 หลัง', to: 'officer-history' }
        ] },
        { type: 'actions', title: 'บัญชี', items: [{ icon: 'logout', tone: 'danger', label: 'ออกจากระบบ', to: 'auth-signin' }] }
      ]
    },
    {
      id: 'officer-notifications', role: 'officer', group: 'เจ้าหน้าที่', code: 'O14', noTabs: true, back: 'officer-settings',
      title: 'แจ้งเตือน', sub: 'ยังไม่อ่าน 1 รายการ',
      blocks: [
        { type: 'linkAction', label: 'ทำเครื่องหมายว่าอ่านทั้งหมด', to: 'officer-notifications' },
        { type: 'list', items: [
          { icon: 'alert', tone: 'danger', title: 'SOS ใหม่ · บ้าน 42', sub: 'ยังไม่มีคนรับ', meta: '2 นาที', unread: true, to: 'officer-sos-case' },
          { icon: 'clock', tone: 'info', title: 'ถึงเวลาตรวจรอบบ่าย', sub: 'โซน 3 · 13:00–15:00', meta: 'วันนี้', to: 'officer-home' },
          { icon: 'check', tone: 'ok', title: 'หัวหน้าอนุมัติคำขอแล้ว', sub: 'คุณอนันต์ เข้าโซน 3', meta: 'เมื่อวาน', to: 'officer-home' }
        ] }
      ]
    },

    /* หัวหน้าหน่วยงาน · จัดการโซน/สมาชิก */
    {
      id: 'head-member', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L05-b', noTabs: true, back: 'head-members',
      title: 'จัดการสมาชิก', sub: 'คุณสมชาย · เจ้าหน้าที่',
      blocks: [
        { type: 'facts', rows: [['ชื่อ', 'คุณสมชาย ใจดี'], ['บทบาท', 'เจ้าหน้าที่'], ['โซน', 'โซน 3 · หมู่ 5'], ['สถานะ', 'ออนไลน์ · กำลังตรวจบ้าน 45'], ['เบอร์', '081-111-2222']] },
        { type: 'actions', items: [{ icon: 'list', label: 'ดูประวัติการตรวจ', to: 'head-log' }, { icon: 'pin', label: 'ย้ายโซน', to: 'head-zone-officers' }] },
        { type: 'callout', tone: 'danger', title: 'ถอดออกจากโซน', text: 'สมาชิกจะตรวจบ้านในโซนนี้ไม่ได้ จนกว่าจะได้รับเชิญใหม่' },
        { type: 'secondary', label: 'ถอดออกจากโซน', to: 'head-members' },
        { type: 'primary', label: 'บันทึก', icon: 'check', to: 'head-members' }
      ]
    },
    {
      id: 'head-zone-edit', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L07', noTabs: true, back: 'head-zones',
      title: 'แก้โซน 3', sub: 'หมู่ 5 · 12 หลัง',
      blocks: [
        { type: 'form', fields: [
          { label: 'ชื่อโซน', type: 'text', value: 'โซน 3 · หมู่ 5' },
          { label: 'เวลาตรวจ', type: 'chips', options: ['เช้า 09:00–11:00', 'บ่าย 13:00–15:00', 'เย็น 16:00–18:00'], value: 0 }
        ], note: 'เจ้าหน้าที่จะเห็นรอบนี้ในหน้าสรุป' },
        { type: 'actions', title: 'จัดการในโซน', items: [
          { icon: 'home', label: 'บ้านในโซน', sub: '12 หลัง', to: 'head-zone-houses' },
          { icon: 'team', label: 'เจ้าหน้าที่ในโซน', sub: '3 คน', to: 'head-zone-officers' }
        ] },
        { type: 'primary', label: 'บันทึกโซน', icon: 'check', to: 'head-zones' }
      ]
    },
    {
      id: 'head-zone-houses', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L07-b', noTabs: true, back: 'head-zone-edit',
      title: 'เพิ่มบ้านเข้าโซน', sub: 'โซน 3 · เลือกบ้านที่ยังไม่มีโซน',
      blocks: [
        { type: 'toolbar', search: 'ค้นหาบ้านเลขที่', chips: ['ยังไม่มีโซน 2', 'ทั้งหมด'], active: 0, action: 'เพิ่มบ้านใหม่' },
        { type: 'list', items: [
          { icon: 'home', tone: 'warn', title: 'บ้านเลขที่ 62', sub: 'หมู่ 5 · ยังไม่มีเจ้าหน้าที่ดูแล', meta: 'เลือก', to: 'head-zone-houses' },
          { icon: 'home', tone: 'warn', title: 'บ้านเลขที่ 64', sub: 'หมู่ 5 · ยังไม่มีเจ้าหน้าที่ดูแล', meta: 'เลือก', to: 'head-zone-houses' }
        ] },
        { type: 'primary', label: 'เพิ่ม 2 หลังที่เลือก', sub: 'กลับไปหน้าแก้โซน', icon: 'plus', to: 'head-zone-edit' },
        { type: 'note', text: 'บ้านที่ไม่อยู่ในโซนจะกด SOS ไม่ถึงเจ้าหน้าที่' }
      ]
    },
    {
      id: 'head-zone-officers', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L07-c', noTabs: true, back: 'head-zone-edit',
      title: 'เพิ่มเจ้าหน้าที่', sub: 'โซน 3 · มี 3 คน',
      blocks: [
        { type: 'toolbar', search: 'ค้นหาชื่อหรือเบอร์', chips: ['ในหน่วยงาน 4', 'ยังไม่เข้าโซน 1'], active: 0, action: 'เชิญเจ้าหน้าที่' },
        { type: 'list', items: [
          { icon: 'user', tone: 'ok', title: 'คุณสมหญิง', sub: 'หัวหน้าโซน 3', meta: 'อยู่ในโซน', to: 'head-zone-officers' },
          { icon: 'user', tone: 'warn', title: 'คุณประเสริฐ', sub: 'ยังไม่เข้าโซน · ออฟไลน์', meta: 'เพิ่ม', to: 'head-zone-officers' }
        ] },
        { type: 'primary', label: 'เพิ่มเข้าโซน 3', icon: 'plus', to: 'head-zone-edit' },
        { type: 'note', text: 'เจ้าหน้าที่หนึ่งคนดูแลได้หลายโซน แต่จะเห็นบ้านตามโซนที่ได้รับ' }
      ]
    },
    {
      id: 'head-notifications', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L09', noTabs: true, back: 'head-home',
      title: 'แจ้งเตือน', sub: 'ยังไม่อ่าน 2 รายการ',
      blocks: [
        { type: 'linkAction', label: 'ทำเครื่องหมายว่าอ่านทั้งหมด', to: 'head-notifications' },
        { type: 'list', items: [
          { icon: 'alert', tone: 'danger', title: 'SOS · บ้าน 42', sub: 'คุณสมชายกำลังไปช่วย', meta: '09:44', unread: true, to: 'head-log' },
          { icon: 'user', tone: 'warn', title: 'คำขอเข้าโซน', sub: 'คุณอนันต์ ขอเข้าโซน 3', meta: '08:20', unread: true, to: 'head-members' },
          { icon: 'check', tone: 'ok', title: 'ตรวจครบ 20 หลัง', sub: 'รอบเช้าเสร็จแล้ว', meta: 'เมื่อวาน', to: 'head-log' }
        ] }
      ]
    },
    {
      id: 'head-profile', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L10', noTabs: true, back: 'head-settings',
      title: 'ข้อมูลหน่วยงาน', sub: 'อสม. หมู่ 5',
      blocks: [
        { type: 'facts', rows: [['ชื่อหน่วยงาน', 'อสม. หมู่ 5'], ['หัวหน้า', 'คุณสมหญิง รักบ้าน'], ['เบอร์ติดต่อ', '082-345-6789'], ['ที่อยู่', 'หมู่ 5 ต.บางนา'], ['รหัสกลุ่ม', 'AG-005'], ['สมาชิก', '4 คน']] },
        { type: 'actions', items: [{ icon: 'team', label: 'แชร์รหัสกลุ่ม', sub: 'ให้เจ้าหน้าที่ใหม่', to: 'head-profile' }, { icon: 'pin', label: 'ขอบเขตที่ดูแล', sub: '2 โซน · 20 หลัง', to: 'head-zones' }] },
        { type: 'note', text: 'แก้ไขข้อมูลหน่วยงานได้ที่ผู้ดูแลระบบ' }
      ]
    },
    {
      id: 'head-pending', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L02', noTabs: true,
      title: 'รอแอดมินอนุมัติ', sub: 'ส่งคำขอแล้ว · โดยปกติ 1 วันทำการ',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'clock', title: 'กำลังตรวจสอบคำขอ', text: 'แอดมินจะโทรยืนยันเบอร์ก่อนอนุมัติ', meta: 'ส่งเมื่อ 16 พ.ย. 09:10' },
        { type: 'steps', items: [{ t: 'ส่งคำขอ', s: 'สำเร็จ', done: true }, { t: 'แอดมินตรวจสอบ', s: 'กำลังทำ', active: true }, { t: 'อนุมัติและเริ่มใช้งาน', s: 'รอ' }] },
        { type: 'primary', label: 'กลับเข้าสู่ระบบ', icon: 'logout', to: 'auth-signin' },
        { type: 'note', text: 'ระหว่างรอ ยังไม่สามารถสร้างโซนหรือเพิ่มเจ้าหน้าที่ได้' }
      ]
    },
    {
      id: 'head-approved', role: 'head', group: 'หัวหน้าหน่วยงาน', code: 'L03', noTabs: true,
      title: 'อนุมัติแล้ว', sub: 'อสม. หมู่ 5 พร้อมใช้งาน',
      blocks: [
        { type: 'done', title: 'หน่วยงานพร้อมใช้งาน', text: 'เริ่มสร้างโซนและเพิ่มเจ้าหน้าที่ได้เลย', meta: 'อนุมัติ 16 พ.ย. 10:05' },
        { type: 'facts', title: 'รหัสกลุ่ม', rows: [['รหัส', 'AG-005'], ['ใช้สำหรับ', 'เชิญเจ้าหน้าที่เข้าโซน'], ['หัวหน้า', 'คุณสมหญิง']] },
        { type: 'primary', label: 'เริ่มใช้งาน', icon: 'home', to: 'head-home' },
        { type: 'secondary', label: 'แชร์รหัสกลุ่ม', to: 'head-profile' }
      ]
    },

    /* แอดมิน · งานที่เหลือ */
    {
      id: 'admin-agency-requests', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D02', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'คำขอหน่วยงาน', sub: 'รออนุมัติ 1 · ทั้งหมด 12',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'อสม. หมู่ 7 ขอเข้าใช้งาน', text: 'ส่งเมื่อวันนี้ 08:20 · หัวหน้า คุณสมหญิง · 082-345-6789', cta: { label: 'โทรยืนยัน', to: 'admin-agency-requests' } },
        { type: 'facts', title: 'ข้อมูลที่ส่งมา', rows: [['ชื่อหน่วยงาน', 'อสม. หมู่ 7'], ['พื้นที่', 'หมู่ 7 · 8 หลัง'], ['เอกสาร', 'หนังสือรับรอง (แนบแล้ว)'], ['ผู้ขอ', 'คุณสมหญิง']] },
        { type: 'primary', label: 'อนุมัติหน่วยงาน', icon: 'check', to: 'admin-system' },
        { type: 'secondary', label: 'ขอข้อมูลเพิ่ม', to: 'admin-agency-requests' }
      ]
    },
    {
      id: 'admin-qr-fake', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D06', device: 'desk', noTabs: true, back: 'admin-qr',
      title: 'QR ปลอม · บ้าน 27', sub: 'พบ QR แปะทับหน้าตู้',
      blocks: [
        { type: 'status', tone: 'danger', icon: 'alert', title: 'QR ไม่ใช่ของระบบ', text: 'เจ้าหน้าที่พบ QR แปะทับเมื่อวาน 16:40', meta: 'ลิงก์ปลอมถูกปิดแล้วชั่วคราว' },
        { type: 'steps', title: 'จัดการเคส', items: [{ t: 'ปิดลิงก์ปลอม', s: 'ทำแล้ว', done: true }, { t: 'แจ้งเจ้าของบ้าน', s: 'กำลังทำ', active: true }, { t: 'ตรวจตู้และติด QR ใหม่', s: 'รอ' }] },
        { type: 'primary', label: 'ปิดลิงก์และแจ้งเจ้าของ', icon: 'send', tone: 'danger', to: 'admin-qr-fixed' },
        { type: 'note', text: 'เก็บรูปหลักฐานไว้ 30 วัน · หากพบซ้ำให้แจ้งตำรวจ' }
      ]
    },
    {
      id: 'admin-qr-damaged', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D06-b', device: 'desk', noTabs: true, back: 'admin-qr',
      title: 'QR ชำรุด · บ้าน 51', sub: 'เลือกวิธีแก้',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'qr', title: 'QR อ่านไม่ชัด', text: 'เจ้าของบ้านยืนยันว่ามีรอยขีดข่วน', meta: 'แจ้งเมื่อวันนี้ 08:15' },
        { type: 'actions', title: 'เลือกวิธีแก้', items: [
          { icon: 'qr', label: 'ใช้ QR สำรองในตู้', sub: 'เร็วที่สุด · เจ้าของบ้านทำเองได้', to: 'admin-qr-reissued' },
          { icon: 'plus', label: 'ออก QR ใหม่ 2 ใบ', sub: 'จัดส่งถึงบ้าน 1–2 วัน', to: 'admin-qr-reissued' }
        ] },
        { type: 'note', text: 'QR เก่าจะถูกปิดทันทีเมื่อออกใบใหม่' }
      ]
    },
    {
      id: 'admin-qr-waiting', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D07', device: 'desk', noTabs: true, back: 'admin-qr-damaged',
      title: 'รอเจ้าของบ้านติด QR', sub: 'บ้าน 51 · แจ้งแล้ว 08:20',
      blocks: [
        { type: 'status', tone: 'warn', icon: 'clock', title: 'รอเจ้าของบ้าน', text: 'ส่ง QR สำรองให้แล้ว · รอติดที่หน้าตู้', meta: 'ครบกำหนด 18 พ.ย.' },
        { type: 'steps', items: [{ t: 'แจ้งเจ้าของบ้าน', s: 'ส่ง SMS แล้ว', done: true }, { t: 'เจ้าของติด QR สำรอง', s: 'กำลังทำ', active: true }, { t: 'ตรวจและปิดเคส', s: 'รอ' }] },
        { type: 'primary', label: 'แจ้งเตือนอีกครั้ง', icon: 'bell', to: 'admin-qr-waiting' },
        { type: 'secondary', label: 'กลับหน้าสุขภาพ QR', to: 'admin-qr' }
      ]
    },
    {
      id: 'admin-qr-reissued', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D07-b', device: 'desk', noTabs: true, back: 'admin-qr',
      title: 'ออก QR ใหม่แล้ว', sub: 'บ้าน 51 · 2 ใบ',
      blocks: [
        { type: 'done', title: 'ออกใบใหม่เรียบร้อย', text: 'QR เก่าถูกปิดแล้ว · พิมพ์และจัดส่ง', meta: 'เลขใบ QR-051-A / QR-051-B' },
        { type: 'facts', rows: [['เจ้าของบ้าน', 'คุณมาลี'], ['ที่อยู่จัดส่ง', 'บ้าน 51 หมู่ 5'], ['กำหนดถึง', '18 พ.ย. 2026']] },
        { type: 'primary', label: 'พิมพ์ QR', icon: 'qr', to: 'admin-qr-reissued' },
        { type: 'secondary', label: 'กลับหน้าสุขภาพ QR', to: 'admin-qr' }
      ]
    },
    {
      id: 'admin-qr-fixed', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D08', device: 'desk', noTabs: true, back: 'admin-qr',
      title: 'แก้แล้ว', sub: 'บ้าน 27 · ปิดเคส 10:20',
      blocks: [
        { type: 'done', title: 'ปิดเคส QR ปลอมแล้ว', text: 'ลิงก์ปลอมถูกปิด · เจ้าของบ้านได้รับแจ้ง', meta: 'ใช้เวลา 1 ชั่วโมง 20 นาที' },
        { type: 'facts', rows: [['ผู้พบ', 'คุณสมชาย · เจ้าหน้าที่'], ['การจัดการ', 'ปิดลิงก์ · เปลี่ยน QR ใหม่'], ['หลักฐาน', 'รูปถ่าย 2 รูป']] },
        { type: 'primary', label: 'กลับหน้าสุขภาพ QR', icon: 'qr', to: 'admin-qr' }
      ]
    },
    {
      id: 'admin-config', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D10', device: 'desk', noTabs: true, back: 'admin-box',
      title: 'ค่าตั้งค่าตู้', sub: 'BX-00042 · บ้าน 42',
      blocks: [
        { type: 'form', fields: [
          { label: 'เวลาปลุกตู้ (วินาที)', type: 'text', value: '30' },
          { label: 'แจ้งเตือนแบตต่ำ (%)', type: 'text', value: '15' },
          { label: 'โหมดประหยัดพลังงาน', type: 'toggle', value: true, hint: 'ตื่นทุก 10 นาทีแทนทุก 1 นาที' },
          { label: 'อนุญาตให้ไรเดอร์ส่งของ', type: 'toggle', value: true }
        ], submit: { label: 'บันทึกค่าตู้', to: 'admin-box' }, note: 'ค่าบางอย่างต้องปลุกตู้ใหม่ก่อนมีผล' }
      ]
    },
    {
      id: 'admin-logs', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D11', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'บันทึกทั้งหมด', sub: 'วันนี้ · 128 รายการ',
      blocks: [
        { type: 'toolbar', search: 'ค้นหาเลขอ้างอิงหรือบ้าน', chips: ['ทั้งหมด', 'เข้าใช้งาน', 'ตรวจ', 'ระบบ'], active: 0, action: 'ส่งออก CSV' },
        { type: 'table', columns: ['เวลา', 'เหตุการณ์', 'ผู้ทำ', 'ผล'], rows: [
          ['09:58', 'ปิด SOS บ้าน 42', 'สมหญิง', { t: 'สำเร็จ', tone: 'ok' }],
          ['09:52', 'ตรวจบ้าน 45', 'สมชาย', { t: 'ผ่าน', tone: 'ok' }],
          ['09:08', 'ตรวจบ้าน 36', 'ประเสริฐ', { t: 'แจ้งซ่อม', tone: 'warn' }],
          ['08:15', 'เคส QR บ้าน 51', 'แอดมิน', { t: 'รอเจ้าของ', tone: 'warn' }],
          ['07:40', 'BX-00042 ขาดการติดต่อ', 'ระบบ', { t: 'แจ้งเตือน', tone: 'danger' }]
        ] },
        { type: 'note', text: 'บันทึกเก็บ 90 วัน · ส่งออกได้ไม่เกิน 10,000 แถวต่อครั้ง' }
      ]
    },
    {
      id: 'admin-notifications', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D12', device: 'desk', noTabs: true, back: 'admin-home',
      title: 'แจ้งเตือน', sub: 'ยังไม่อ่าน 2 รายการ',
      blocks: [
        { type: 'linkAction', label: 'ทำเครื่องหมายว่าอ่านทั้งหมด', to: 'admin-notifications' },
        { type: 'list', items: [
          { icon: 'alert', tone: 'danger', title: 'BX-00042 ออฟไลน์', sub: 'แบต 12% · แจ้งเจ้าของแล้ว', meta: '07:40', unread: true, to: 'admin-box' },
          { icon: 'qr', tone: 'warn', title: 'เคส QR ใหม่ · บ้าน 51', sub: 'เจ้าของยืนยัน QR ชำรุด', meta: '08:15', unread: true, to: 'admin-qr-damaged' },
          { icon: 'shield', tone: 'info', title: 'คำขอหน่วยงานใหม่', sub: 'อสม. หมู่ 7', meta: 'เมื่อวาน', to: 'admin-agency-requests' }
        ] }
      ]
    },
    {
      id: 'admin-agencies', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D13', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'หน่วยงาน', sub: '12 หน่วยงาน · ใช้งาน 11',
      blocks: [
        { type: 'toolbar', search: 'ค้นหาชื่อหน่วยงานหรือพื้นที่', chips: ['ทั้งหมด', 'ใช้งาน', 'รออนุมัติ'], active: 0, action: 'เพิ่มหน่วยงาน' },
        { type: 'list', items: [
          { icon: 'shield', tone: 'ok', title: 'อสม. หมู่ 5', sub: '2 โซน · 20 หลัง · หัวหน้า คุณสมหญิง', meta: 'ใช้งาน', to: 'admin-agency-requests' },
          { icon: 'shield', tone: 'ok', title: 'หน่วยกู้ภัยสวนหลวง', sub: '1 โซน · 8 หลัง', meta: 'ใช้งาน', to: 'admin-agency-requests' },
          { icon: 'shield', tone: 'warn', title: 'อสม. หมู่ 7', sub: 'รออนุมัติ · 8 หลัง', meta: 'รอ', to: 'admin-agency-requests' }
        ] },
        { type: 'note', text: 'หน่วยงานที่ปิดใช้งานจะไม่ได้รับ SOS และตรวจตู้ไม่ได้' }
      ]
    },
    {
      id: 'admin-plans', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D14', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'แพ็กเกจ', sub: '3 แพ็กเกจ · ใช้อยู่ 118 ตู้',
      blocks: [
        { type: 'stats', items: [{ label: 'ฟรี', value: '42', sub: 'ตู้', tone: 'info' }, { label: 'พื้นฐาน', value: '68', sub: 'ตู้', tone: 'ok' }, { label: 'ครอบครัว', value: '8', sub: 'ตู้', tone: 'warn' }] },
        { type: 'list', items: [
          { icon: 'box', title: 'ฟรี', sub: 'แจ้งเตือนพื้นฐาน · ประวัติ 30 วัน', meta: '0 บาท', to: 'admin-plans' },
          { icon: 'box', tone: 'ok', title: 'พื้นฐาน', sub: 'SOS · ประวัติ 12 เดือน · 2 สมาชิก', meta: '99 บาท/เดือน', to: 'admin-plans' },
          { icon: 'box', tone: 'warn', title: 'ครอบครัว', sub: 'สมาชิก 5 คน · ส่งออกข้อมูล', meta: '199 บาท/เดือน', to: 'admin-plans' }
        ] },
        { type: 'primary', label: 'เพิ่มแพ็กเกจ', icon: 'plus', to: 'admin-plans' }
      ]
    },
    {
      id: 'admin-tech-requests', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D15', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'คำขอช่าง', sub: '2 รายการ · เร่งด่วน 1',
      blocks: [
        { type: 'chips', items: ['เปิด 2', 'วันนี้', 'ปิดแล้ว'], active: 0 },
        { type: 'list', items: [
          { icon: 'wrench', tone: 'danger', title: 'บ้าน 42 · ตู้ไม่ออนไลน์', sub: 'แบต 12% · เจ้าของแจ้ง 07:55', meta: '2 ชม.', to: 'admin-box' },
          { icon: 'wrench', tone: 'warn', title: 'บ้าน 51 · QR ชำรุด', sub: 'รอออกใบใหม่', meta: '08:15', to: 'admin-qr-damaged' }
        ] },
        { type: 'note', text: 'ช่างจะโทรหาเจ้าของบ้านก่อนเข้าหน้างานทุกครั้ง' }
      ]
    },
    {
      id: 'admin-firmware', role: 'admin', group: 'แอดมิน / ช่าง', code: 'D17', device: 'desk', noTabs: true, back: 'admin-system',
      title: 'เฟิร์มแวร์', sub: 'v2.4.1 · ตู้ล่าสุด 118/124',
      blocks: [
        { type: 'status', tone: 'ok', icon: 'box', title: 'เฟิร์มแวร์เป็นปัจจุบัน', text: 'ตู้ 118 ตัวอัปเดตแล้ว · เหลือ 6 ตัวออฟไลน์', meta: 'ตรวจล่าสุด 09:40' },
        { type: 'facts', rows: [['เวอร์ชันล่าสุด', 'v2.4.1'], ['ออกเมื่อ', '12 พ.ย. 2026'], ['ตู้ที่รองรับ', '124'], ['ตู้ที่อัปเดตแล้ว', '118']] },
        { type: 'actions', items: [{ icon: 'download', label: 'อัปเดตตู้ที่เหลือ', sub: '6 ตัว · จะทำเมื่อออนไลน์', to: 'admin-firmware' }, { icon: 'list', label: 'ประวัติเวอร์ชัน', to: 'admin-logs' }] },
        { type: 'note', text: 'การอัปเดตใช้เวลา 5–10 นาทีต่อตู้ และตู้จะตรวจไม่ได้ระหว่างนั้น' }
      ]
    },

    /* ช่างติดตั้ง · หน้างาน */
    {
      id: 'tech-checklist', role: 'admin', group: 'ช่างติดตั้ง', code: 'T01', noTabs: true, back: 'admin-box',
      title: 'เช็กลิสต์ติดตั้ง', sub: 'บ้าน 45 · BX-00045', step: { n: 1, total: 3, label: 'ติดตั้ง' },
      blocks: [
        { type: 'status', tone: 'info', icon: 'wrench', title: 'ติดตั้งตู้ใหม่', text: 'ทำตามลำดับ 5 ข้อ ใช้เวลาประมาณ 20 นาที', meta: 'ช่าง: คุณประเสริฐ' },
        { type: 'steps', items: [
          { t: 'ยึดเสาและตัวตู้', s: 'ให้ฝาตู้สูงประมาณ 1.1 เมตร', done: true },
          { t: 'ต่อแผงโซลาร์', s: 'หันไปทางทิศใต้', done: true },
          { t: 'เปิดเครื่องและรอไฟเขียว', s: 'ประมาณ 30 วินาที', active: true },
          { t: 'ตั้ง Wi-Fi', s: 'ขั้นต่อไป' },
          { t: 'ทดสอบกดกริ่งและสแกน QR', s: 'ขั้นสุดท้าย' }
        ] },
        { type: 'primary', label: 'ขั้นต่อไป · ตั้ง Wi-Fi', icon: 'wifi', to: 'tech-wifi' }
      ]
    },
    {
      id: 'tech-wifi', role: 'admin', group: 'ช่างติดตั้ง', code: 'T02', noTabs: true, back: 'tech-checklist',
      title: 'ตั้ง Wi-Fi ของตู้', sub: 'เชื่อมต่อที่ 192.168.4.1', step: { n: 2, total: 3, label: 'ติดตั้ง' },
      blocks: [
        { type: 'callout', tone: 'info', title: 'ตู้ปล่อย Wi-Fi ชั่วคราว', text: 'ชื่อ SMMB-SETUP-45 · รหัสอยู่บนสติกเกอร์ใต้ฝาตู้' },
        { type: 'form', fields: [
          { label: 'ชื่อ Wi-Fi บ้าน', type: 'text', value: 'BaanSuan_5G' },
          { label: 'รหัสผ่าน', type: 'password', placeholder: 'รหัสผ่านบ้าน' }
        ], submit: { label: 'เชื่อมต่อ', to: 'tech-lights' }, note: 'ถ้าต่อไม่ได้ ให้ลอง hotspot มือถือก่อน' }
      ]
    },
    {
      id: 'tech-lights', role: 'admin', group: 'ช่างติดตั้ง', code: 'T02-b', noTabs: true, back: 'tech-wifi',
      title: 'ดูไฟที่ตู้', sub: 'อ่านสถานะจากไฟ 3 ดวง', step: { n: 3, total: 3, label: 'ติดตั้ง' },
      blocks: [
        { type: 'facts', title: 'ความหมายของไฟ', rows: [['ไฟเขียวติดค้าง', 'ออนไลน์ · พร้อมใช้'], ['ไฟเขียวกระพริบ', 'กำลังเชื่อมต่อ'], ['ไฟแดง', 'เชื่อมต่อไม่ได้ · เช็ก Wi-Fi'], ['ไฟเหลือง', 'แบตต่ำ · ต้องชาร์จ']] },
        { type: 'status', tone: 'ok', icon: 'check', title: 'ตอนนี้ไฟเขียวติดค้าง', text: 'ตู้ออนไลน์และพร้อมใช้งานแล้ว', meta: 'ทดสอบสแกน QR ผ่าน' },
        { type: 'primary', label: 'อ่านครบแล้ว · จบงาน', icon: 'check', to: 'tech-checklist' }
      ]
    },
    {
      id: 'tech-wifi-failed', role: 'admin', group: 'ช่างติดตั้ง', code: 'T02-c', noTabs: true, back: 'tech-wifi',
      title: 'ต่อ Wi-Fi ไม่ได้', sub: 'บ้าน 45 · ลองอีกครั้ง',
      blocks: [
        { type: 'callout', tone: 'danger', title: 'ตู้เชื่อมต่อไม่ได้', text: 'ตรวจรหัสผ่านและสัญญาณ Wi-Fi ก่อนลองใหม่' },
        { type: 'steps', items: [{ t: 'ตรวจรหัสผ่าน', s: 'ตัวพิมพ์ใหญ่-เล็กต้องตรง' }, { t: 'ขยับตู้ให้ใกล้เราเตอร์', s: 'หรือใช้ hotspot มือถือ' }, { t: 'กดเชื่อมต่อใหม่', s: 'รอ 30 วินาที' }] },
        { type: 'primary', label: 'ลองอีกครั้ง', icon: 'wifi', to: 'tech-wifi' },
        { type: 'secondary', label: 'ใช้ hotspot มือถือ', to: 'tech-wifi' }
      ]
    },

    /* ไรเดอร์ · สถานะผิดพลาด */
    {
      id: 'rider-closed', role: 'rider', group: 'ไรเดอร์', code: 'R03-b', noTabs: true, back: 'rider-code',
      title: 'ตู้ปิดบริการ', sub: 'บ้านเลขที่ 42',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'อย่าวางของในตู้', text: 'ตู้ปิดปรับปรุง · เจ้าของบ้านยังรับของไม่ได้' },
        { type: 'steps', items: [{ t: 'แจ้งต้นทาง', s: 'บอกว่าตู้ปิดปรับปรุง' }, { t: 'เก็บของไว้ที่สาขา', s: 'หรือส่งใหม่พรุ่งนี้' }, { t: 'ไม่ต้องรอที่ตู้', s: 'ระบบจะไม่เปิดให้' }] },
        { type: 'primary', label: 'เข้าใจแล้ว', icon: 'check', to: 'rider-code' }
      ]
    },
    {
      id: 'rider-limited', role: 'rider', group: 'ไรเดอร์', code: 'R03-c', noTabs: true, back: 'rider-code',
      title: 'ส่งถี่เกินไป', sub: 'บ้านเลขที่ 42',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'ตู้นี้เพิ่งรับของเมื่อ 2 นาทีที่แล้ว', text: 'ระบบจำกัดการส่ง 1 ครั้งต่อ 5 นาที เพื่อป้องกันการกดซ้ำ' },
        { type: 'facts', rows: [['ครั้งล่าสุด', '09:56'], ['ลองใหม่ได้เวลา', '10:01'], ['เหลืออีก', '3 นาที']] },
        { type: 'primary', label: 'เข้าใจแล้ว · กลับ', icon: 'back', to: 'rider-code' },
        { type: 'note', text: 'ถ้าเป็นการส่งหลายกล่อง ให้แจ้งเจ้าของบ้านมารับพร้อมกัน' }
      ]
    },

    /* เข้าสู่ระบบ / สมัคร · ครบทุกขั้น */
    {
      id: 'auth-line', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A01', noTabs: true,
      title: 'เปิดใน LINE อยู่', sub: 'ต้องเปิดในเบราว์เซอร์',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'ถ้าเปิดใน LINE จะไม่ได้รับแจ้งเตือน', text: 'กดปุ่มด้านล่างเพื่อเปิดใน Safari หรือ Chrome' },
        { type: 'steps', items: [{ t: 'กดปุ่มเปิดในเบราว์เซอร์', s: 'ระบบจะพาออกไปเอง' }, { t: 'ถ้าปุ่มไม่ทำงาน', s: 'กดจุด 3 จุดมุมขวาบน แล้วเลือก “เปิดในเบราว์เซอร์”' }] },
        { type: 'primary', label: 'เปิดใน Safari / Chrome', icon: 'send', to: 'auth-signin' },
        { type: 'secondary', label: 'คัดลอกลิงก์', to: 'auth-line' }
      ]
    },
    {
      id: 'auth-install', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A02', noTabs: true,
      title: 'ติดตั้งเป็นแอป', sub: 'iPhone · ทำครั้งเดียว',
      blocks: [
        { type: 'steps', items: [{ t: 'กดปุ่มแชร์', s: 'อยู่ด้านล่างของ Safari' }, { t: 'เลือก “เพิ่มไปยังหน้าจอหลัก”', s: 'เลื่อนลงหาในเมนู' }, { t: 'กด “เพิ่ม”', s: 'จากนั้นเปิดจากไอคอนได้เลย' }] },
        { type: 'primary', label: 'ติดตั้งแล้ว', icon: 'check', to: 'auth-signin' },
        { type: 'note', text: 'การติดตั้งช่วยให้เปิดเร็วและรับแจ้งเตือนได้เสถียรขึ้น' }
      ]
    },
    {
      id: 'auth-notifications', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A03', noTabs: true,
      title: 'เปิดแจ้งเตือน', sub: 'เพื่อรับ SOS และของมาส่ง',
      blocks: [
        { type: 'callout', tone: 'info', title: 'ทำไมต้องเปิด', text: 'ถ้าปิดแจ้งเตือน คุณจะไม่รู้ว่ามีของมาส่งหรือ SOS จากคนในบ้าน' },
        { type: 'form', fields: [{ label: 'แจ้งเตือนบนเครื่องนี้', type: 'toggle', value: true, hint: 'เปลี่ยนได้ที่ตั้งค่าเครื่อง' }], note: 'SOS ยังทำงานแม้ปิดเสียง' },
        { type: 'primary', label: 'เปิดแจ้งเตือน', icon: 'bell', to: 'auth-signin' },
        { type: 'secondary', label: 'ข้ามไปก่อน', to: 'auth-signin' }
      ]
    },
    {
      id: 'auth-name-box', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A08', noTabs: true, back: 'auth-activate',
      title: 'ตั้งชื่อตู้', sub: 'บ้านเลขที่ 42', step: { n: 3, total: 3, label: 'ผูกตู้' },
      blocks: [
        { type: 'form', fields: [{ label: 'ชื่อตู้', type: 'text', value: 'ตู้หน้าบ้าน', hint: 'ตั้งชื่อให้จำง่าย เช่น “ตู้หน้าบ้าน” หรือ “ตู้ข้างครัว”' }], submit: { label: 'เสร็จสิ้น', to: 'auth-done' }, note: 'เปลี่ยนชื่อได้ตลอดที่หน้าตั้งค่า' }
      ]
    },
    {
      id: 'auth-done', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A09', noTabs: true,
      title: 'พร้อมใช้งาน', sub: 'ตู้หน้าบ้าน · บ้านเลขที่ 42',
      blocks: [
        { type: 'done', title: 'ผูกตู้เรียบร้อย', text: 'เจ้าหน้าที่ตรวจตู้เมื่อไหร่ คุณจะรู้ทันที', meta: 'ใช้เวลา 1 นาที 40 วินาที' },
        { type: 'facts', rows: [['ตู้', 'BX-00042'], ['ชื่อตู้', 'ตู้หน้าบ้าน'], ['การแจ้งเตือน', 'เปิดแล้ว']] },
        { type: 'primary', label: 'เข้าหน้าหลัก', icon: 'home', to: 'owner-home' }
      ]
    },
    {
      id: 'auth-signup-officer', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A10', noTabs: true, back: 'auth-choose',
      title: 'สมัคร · เจ้าหน้าที่', sub: 'ต้องมีรหัสจากหัวหน้าหน่วยงาน', step: { n: 1, total: 2, label: 'สมัครเจ้าหน้าที่' },
      blocks: [
        { type: 'form', fields: [
          { label: 'รหัสหน่วยงาน', type: 'text', value: 'AG-005', hint: 'ขอจากหัวหน้าหน่วยงาน' },
          { label: 'ชื่อที่ให้เรียก', type: 'text', placeholder: 'เช่น สมชาย' },
          { label: 'เบอร์โทรศัพท์', type: 'text', value: '081-111-2222' },
          { label: 'รหัสผ่าน', type: 'password', placeholder: 'อย่างน้อย 8 ตัวอักษร' }
        ], submit: { label: 'ส่งคำขอ', to: 'auth-waiting-head' }, note: 'หัวหน้าหน่วยงานต้องยืนยันก่อนใช้งาน' }
      ]
    },
    {
      id: 'auth-waiting-head', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A11', noTabs: true,
      title: 'รอหัวหน้ายืนยัน', sub: 'ส่งคำขอแล้ว · คุณสมชาย', step: { n: 2, total: 2, label: 'สมัครเจ้าหน้าที่' },
      blocks: [
        { type: 'status', tone: 'warn', icon: 'clock', title: 'รอหัวหน้าหน่วยงาน', text: 'คุณสมหญิงจะเห็นคำขอและกดยืนยันให้', meta: 'โดยปกติภายใน 1 วัน' },
        { type: 'steps', items: [{ t: 'ส่งคำขอ', s: 'สำเร็จ', done: true }, { t: 'หัวหน้ายืนยัน', s: 'กำลังรอ', active: true }, { t: 'เปิดแจ้งเตือนและเริ่มงาน', s: 'รอ' }] },
        { type: 'primary', label: 'กลับเข้าสู่ระบบ', icon: 'logout', to: 'auth-signin' },
        { type: 'note', text: 'ระหว่างรอ ยังสแกนตรวจตู้ไม่ได้ แต่รับ SOS ไม่ได้เช่นกัน' }
      ]
    },
    {
      id: 'auth-push-required', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A12', noTabs: true,
      title: 'ต้องเปิดแจ้งเตือนก่อน', sub: 'สำหรับเจ้าหน้าที่',
      blocks: [
        { type: 'callout', tone: 'warn', title: 'งาน SOS ต้องถึงคุณทันที', text: 'ระบบจึงบังคับเปิดแจ้งเตือนบนเครื่องนี้ก่อนเริ่มงาน' },
        { type: 'form', fields: [{ label: 'แจ้งเตือน SOS', type: 'toggle', value: true, locked: true, hint: 'ปิดไม่ได้เพื่อความปลอดภัย' }], note: 'ถ้าเปิดไม่ได้ ให้ตรวจสิทธิ์การแจ้งเตือนในตั้งค่าเครื่อง' },
        { type: 'primary', label: 'เปิดแจ้งเตือน', icon: 'bell', to: 'officer-home' },
        { type: 'secondary', label: 'ออกจากระบบ', to: 'auth-signin' }
      ]
    },
    {
      id: 'auth-terms', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A13', noTabs: true, back: 'auth-signup',
      title: 'ข้อตกลงการใช้งาน', sub: 'อ่านสั้น ๆ 1 นาที',
      blocks: [
        { type: 'text', title: 'สิ่งที่ระบบทำ', body: 'ระบบแจ้งเตือนเมื่อเจ้าหน้าที่ตรวจตู้และเมื่อมีของมาส่ง รวมถึงส่ง SOS ไปยังเจ้าหน้าที่ในโซน' },
        { type: 'text', title: 'สิ่งที่ระบบไม่ทำ', body: 'ระบบไม่แทนการโทร 191 หรือ 1669 · ไม่รับประกันว่าเจ้าหน้าที่จะถึงภายในเวลาที่กำหนด' },
        { type: 'callout', tone: 'danger', title: 'เหตุฉุกเฉิน', text: 'โทร 191 หรือ 1669 ทันที · อย่ารอระบบ' },
        { type: 'primary', label: 'ยอมรับและดำเนินการต่อ', icon: 'check', to: 'auth-signup' }
      ]
    },
    {
      id: 'auth-password', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A14', noTabs: true, back: 'auth-signin',
      title: 'เปลี่ยนรหัสผ่าน', sub: 'บังคับเปลี่ยนหลังถูกรีเซ็ต',
      blocks: [
        { type: 'form', fields: [
          { label: 'รหัสผ่านที่ได้รับ', type: 'password', placeholder: 'รหัสชั่วคราว' },
          { label: 'รหัสผ่านใหม่', type: 'password', placeholder: 'อย่างน้อย 8 ตัวอักษร', hint: 'ตั้งให้จำง่าย แต่คนอื่นเดาไม่ได้' },
          { label: 'ยืนยันรหัสผ่านใหม่', type: 'password', placeholder: 'พิมพ์อีกครั้ง' }
        ], submit: { label: 'บันทึกรหัสใหม่', to: 'auth-signin' }, note: 'หลังเปลี่ยนแล้ว ต้องเข้าสู่ระบบใหม่ทุกเครื่อง' }
      ]
    },
    {
      id: 'auth-add-owner', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A15', noTabs: true, back: 'officer-settings',
      title: 'เพิ่มบทบาทเจ้าของบ้าน', sub: 'บัญชีนี้เป็นเจ้าหน้าที่อยู่แล้ว',
      blocks: [
        { type: 'callout', tone: 'info', title: 'ใช้บัญชีเดิมได้', text: 'เพิ่มบทบาทเจ้าของบ้านเพื่อผูกตู้ที่บ้านของคุณ ไม่ต้องสมัครใหม่' },
        { type: 'steps', items: [{ t: 'สแกน QR เปิดใช้ตู้', s: 'QR อยู่ด้านในฝาตู้' }, { t: 'ตั้งชื่อตู้', s: 'แล้วสลับบทบาทได้จากหน้าโปรไฟล์' }] },
        { type: 'primary', label: 'สแกน QR ในตู้', icon: 'scan', to: 'auth-activate' },
        { type: 'secondary', label: 'ยกเลิก', to: 'officer-settings' }
      ]
    },
    {
      id: 'auth-join-agency', role: 'auth', group: 'เข้าสู่ระบบ', code: 'A16', noTabs: true,
      title: 'ขอเข้าหน่วยงาน', sub: 'อสม. หมู่ 5',
      blocks: [
        { type: 'form', fields: [
          { label: 'รหัสหน่วยงาน', type: 'text', placeholder: 'AG-005', hint: 'ขอจากหัวหน้าหน่วยงาน' },
          { label: 'ชื่อที่ให้เรียก', type: 'text', placeholder: 'เช่น สมชาย' },
          { label: 'เบอร์โทรศัพท์', type: 'text', placeholder: '08x-xxx-xxxx' }
        ], submit: { label: 'ส่งคำขอเข้า', to: 'auth-waiting-head' }, note: 'หัวหน้าหน่วยงานจะเห็นคำขอและกดยืนยัน' }
      ]
    },
    {
      id: 'auth-signup-agency', role: 'auth', group: 'เข้าสู่ระบบ', code: 'L01', noTabs: true, back: 'auth-choose',
      title: 'สมัครหน่วยงาน', sub: 'สำหรับหัวหน้าหน่วยงาน', step: { n: 1, total: 2, label: 'สมัครหน่วยงาน' },
      blocks: [
        { type: 'form', fields: [
          { label: 'ชื่อหน่วยงาน', type: 'text', placeholder: 'เช่น อสม. หมู่ 7' },
          { label: 'พื้นที่ที่ดูแล', type: 'text', placeholder: 'หมู่ 7 ต.บางนา' },
          { label: 'ชื่อหัวหน้า', type: 'text', placeholder: 'ชื่อ-นามสกุล' },
          { label: 'เบอร์โทรศัพท์', type: 'text', placeholder: '08x-xxx-xxxx' }
        ], submit: { label: 'ส่งคำขออนุมัติ', to: 'head-pending' }, note: 'แอดมินจะโทรยืนยันก่อนอนุมัติ · 1 วันทำการ' }
      ]
    },

    /* ใช้ร่วมกัน · ข้อมูลของฉัน */
    {
      id: 'my-data', role: 'shared', group: 'ใช้ร่วมกัน', code: 'MyData', noTabs: true, back: 'owner-settings',
      title: 'ข้อมูลของฉัน', sub: 'บัญชี · เครื่องที่เข้าสู่ระบบ',
      blocks: [
        { type: 'facts', title: 'บัญชี', rows: [['ชื่อ', 'สมชาย ใจดี'], ['เบอร์', '081-234-5678'], ['บทบาท', 'เจ้าของบ้าน · เจ้าหน้าที่'], ['บ้าน', 'เลขที่ 42 หมู่ 5']] },
        { type: 'actions', title: 'เครื่องที่เข้าสู่ระบบ', items: [
          { icon: 'phone', title: 'iPhone 13', sub: 'ใช้งานล่าสุด 09:40 · กรุงเทพฯ', meta: 'เครื่องนี้', to: 'my-data' },
          { icon: 'phone', title: 'iPad ของบ้าน', sub: 'ใช้งานล่าสุด เมื่อวาน', meta: 'ออก', to: 'my-data' }
        ] },
        { type: 'actions', items: [
          { icon: 'download', label: 'ส่งออกข้อมูลของฉัน', sub: 'ไฟล์ CSV · ใช้เวลาประมาณ 1 นาที', to: 'my-data' },
          { icon: 'key', label: 'เปลี่ยนรหัสผ่าน', to: 'auth-password' }
        ] },
        { type: 'callout', tone: 'danger', title: 'ลบบัญชี', text: 'ลบแล้วกู้คืนไม่ได้ · ประวัติการตรวจและ SOS จะยังอยู่ในระบบตามกฎหมาย' },
        { type: 'secondary', label: 'ลบบัญชีของฉัน', to: 'my-data' },
        { type: 'note', text: 'ข้อมูลจะถูกเก็บตามนโยบายความเป็นส่วนตัว · ส่งออกได้ทุกเมื่อ' }
      ]
    }
  ];

  var byId = {};
  SCREENS.forEach(function (s) { byId[s.id] = s; });

  window.SMMB = {
    IC: IC,
    icon: icon,
    TABS: TABS,
    ROLE_LABEL: ROLE_LABEL,
    SCREENS: SCREENS,
    byId: function (id) { return byId[id] || null; },
    tabsFor: function (role) { return TABS[role] || null; },
    homeFor: function (role) {
      if (role === 'owner') return 'owner-home';
      if (role === 'officer') return 'officer-home';
      if (role === 'head') return 'head-home';
      if (role === 'admin') return 'admin-home';
      if (role === 'rider') return 'rider-code';
      return 'auth-signin';
    }
  };
})();
