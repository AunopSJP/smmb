// เลือกบ้าน → อัปเดตจำนวน/แถบส่งคำขอ (ใช้ร่วมทุก mockup)
function updatePicks() {
  const picks = [...document.querySelectorAll('.pick:checked')];
  document.querySelectorAll('[data-count]').forEach((el) => (el.textContent = String(picks.length)));
  document.querySelectorAll('[data-selbar]').forEach((el) => (el.hidden = picks.length === 0));
  document.querySelectorAll('.cart-row').forEach((row) => {
    row.hidden = !document.querySelector(`.pick[value="${row.dataset.id}"]`)?.checked;
  });
  document.querySelectorAll('.cart-empty').forEach((el) => {
    el.hidden = picks.length > 0;
  });
}

document.addEventListener('change', (e) => {
  if (e.target.classList.contains('pick')) updatePicks();
});

// select all (เฉพาะที่เลือกได้)
document.querySelectorAll('[data-select-all]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const boxes = [...document.querySelectorAll('.pick:not(:disabled)')];
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = !all));
    updatePicks();
  });
});

// tabs
document.querySelectorAll('.tabs').forEach((tabs) => {
  tabs.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || !tabs.contains(btn)) return;
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === btn));
    const name = btn.dataset.tab;
    document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  });
});

// light/dark preview
document.querySelectorAll('[data-scheme]').forEach((btn) => {
  btn.addEventListener('click', () => document.body.classList.toggle('dark', btn.dataset.scheme === 'dark'));
});

updatePicks();
