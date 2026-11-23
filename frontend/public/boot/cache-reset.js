/*
 * ล้าง service worker + Cache Storage ของเบราว์เซอร์ทุกเครื่อง "ครั้งเดียวต่อเวอร์ชัน"
 *
 * วิธีใช้ในอนาคต: เมื่อต้องการบังคับให้ทุกเครื่องล้างแคชใหม่ ให้เปลี่ยนค่า RESET_VERSION ด้านล่าง
 * (ใช้ค่าวันที่+ชื่อเรื่อง เช่น '2026-12-01-theme') แล้ว deploy ตามปกติ
 *
 * หมายเหตุ:
 * - ไฟล์นี้อยู่ใต้ /boot/ จึงไม่ถูก service worker แคช (ngsw-config จับเฉพาะ /*.js ที่รากและรูปภาพ)
 *   ทำให้สคริปต์นี้ถูกโหลดจากเครือข่ายเสมอ และไม่ถูกแคชเวอร์ชันเก่า
 * - ถ้าเวอร์ชันตรงกับที่บันทึกไว้แล้ว สคริปต์จบทันที ไม่มีต้นทุนเพิ่ม
 * - ไอคอนที่ผู้ใช้เพิ่มลงหน้าจอหลักของมือถือแล้ว ไม่มีอะไรบังคับเปลี่ยนได้จากฝั่งเว็บ (ต้องลบแล้วติดตั้งใหม่)
 */
(function () {
  'use strict';

  var RESET_VERSION = '2026-11-23-icons';
  var STORAGE_KEY = 'smmb.cacheReset';

  var done;
  try {
    done = localStorage.getItem(STORAGE_KEY) === RESET_VERSION;
  } catch (e) {
    // localStorage ใช้ไม่ได้ (โหมดส่วนตัวบางตัว) — ข้ามไปเลย กันวนรีโหลดไม่รู้จบ
    return;
  }
  if (done) return;

  var jobs = [];
  try {
    if ('serviceWorker' in navigator) {
      jobs.push(
        navigator.serviceWorker.getRegistrations().then(function (regs) {
          return Promise.all(regs.map(function (r) { return r.unregister(); }));
        })
      );
    }
    if ('caches' in window) {
      jobs.push(
        caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        })
      );
    }
  } catch (e) {
    // ปล่อยผ่าน แล้วบันทึกว่าทำแล้วด้านล่าง
  }

  Promise.all(jobs)
    .catch(function () { /* ไม่ให้ล้มทั้งหน้า */ })
    .then(function () {
      try {
        // บันทึกก่อนรีโหลด เพื่อกันการรีโหลดซ้ำไม่รู้จบ
        localStorage.setItem(STORAGE_KEY, RESET_VERSION);
      } catch (e) { /* ไม่มีที่เก็บ — ยอมรับได้ */ }
      // โหลดใหม่ 1 ครั้ง เพื่อให้หน้านี้ไม่ถูกควบคุมโดย service worker เก่าอีกต่อไป
      location.reload();
    });
})();
