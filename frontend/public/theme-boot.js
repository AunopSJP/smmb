/*
 * ตั้งธีม/ขนาดตัวอักษร/ภาษา ก่อน Angular boot — กันจอวาบขาวตอนเปิดโหมดมืด
 * ไฟล์นี้อยู่นอก bundle จึงต้องเป็น JS ธรรมดา (โหลดก่อน CSS ใน index.html)
 */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('smmb.display') || '{}');
    var root = document.documentElement;
    if (s.theme === 'dark' || s.theme === 'light') root.setAttribute('data-theme', s.theme);
    if (s.textSize) root.setAttribute('data-text-size', s.textSize);
    if (s.mode) root.setAttribute('data-mode', s.mode);
    if (s.lang) root.setAttribute('lang', s.lang);
  } catch (e) {
    /* localStorage ปิด/ค่าเสีย — ปล่อยให้ Angular จัดการ */
  }
})();
