/**
 * ลูกศรเลื่อนในกลุ่มปุ่มตัวเลือก (a11y · WAI-ARIA toolbar/tabs) — ตัวจัดการกลางตัวเดียว ไม่ต้องแก้ทีละหน้า
 * - กลุ่ม = `.segmented` หรือ `[role=tablist]` · ปุ่มที่ปิดอยู่ข้าม · วนรอบได้
 * - `role=tab` เลื่อนแล้วเลือกทันที (automatic activation) · ปุ่ม aria-pressed เลื่อนโฟกัสอย่างเดียว กด Enter/Space เพื่อเลือก
 */
const GROUP = '.segmented, [role="tablist"]';

export function arrowNavTarget(group: Element, current: Element, key: string): HTMLElement | null {
  const items = Array.from(group.querySelectorAll<HTMLElement>('button, [role="tab"]')).filter(
    (el) => !el.hasAttribute('disabled') && el.getAttribute('aria-disabled') !== 'true' && el.offsetParent !== null,
  );
  const i = items.indexOf(current as HTMLElement);
  if (i < 0 || items.length < 2) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return items[(i + 1) % items.length];
  if (key === 'ArrowLeft' || key === 'ArrowUp') return items[(i - 1 + items.length) % items.length];
  if (key === 'Home') return items[0];
  if (key === 'End') return items[items.length - 1];
  return null;
}

export function installArrowNav(doc: Document): () => void {
  const onKey = (e: KeyboardEvent): void => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const el = e.target;
    if (!(el instanceof HTMLElement)) return;
    const group = el.closest(GROUP);
    if (!group || el.closest('input, textarea, select')) return;
    const next = arrowNavTarget(group, el, e.key);
    if (!next) return;
    e.preventDefault();
    next.focus();
    if (next.getAttribute('role') === 'tab') next.click();
  };
  doc.addEventListener('keydown', onKey);
  return () => doc.removeEventListener('keydown', onKey);
}
