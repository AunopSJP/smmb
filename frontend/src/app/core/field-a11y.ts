/**
 * ผูกสถานะ error ของช่องกรอกกับเทคโนโลยีช่วยอ่านหน้าจอ ที่เดียวทั้งแอป
 * - `label.field.invalid` (สไตล์เดิมของทุกฟอร์ม) → `aria-invalid="true"` บนช่องข้างใน
 * - `<small>` คำอธิบาย/ข้อความผิดพลาดในป้ายเดียวกัน → `aria-describedby`
 * ไม่ต้องแก้เทมเพลตทีละหน้า · ช่องที่ไม่ได้ห่อด้วย label.field ต้องใส่ aria เอง
 */
const CONTROLS = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), select, textarea';
let seq = 0;

function sync(label: Element): void {
  const control = label.querySelector(CONTROLS);
  if (!control) return;
  if (label.classList.contains('invalid')) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
  const hint = label.querySelector('small');
  if (hint) {
    if (!hint.id) hint.id = `fh-${++seq}`;
    const ids = new Set((control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean));
    ids.add(hint.id);
    const next = [...ids].join(' ');
    if (control.getAttribute('aria-describedby') !== next) control.setAttribute('aria-describedby', next);
  }
}

export function startFieldA11y(doc: Document): void {
  const win = doc.defaultView;
  if (!win || typeof win.MutationObserver === 'undefined') return;
  const run = () => doc.querySelectorAll('label.field').forEach(sync);
  // ไม่ใช้ requestAnimationFrame — แท็บพื้นหลังไม่เรียก · เราแก้เฉพาะ aria-*/id ซึ่งไม่ทริกเกอร์ observer ซ้ำ
  new win.MutationObserver(run).observe(doc.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
  run();
}
