/**
 * ย่อ IP ให้ผู้ใช้เห็นแค่พอรู้ว่าเป็นเครือข่ายไหน (ไม่ใช่ที่อยู่เต็ม)
 * IPv4 → `203.0.113.x` · IPv6 → 3 กลุ่มแรก + `::` · ที่อยู่ภายใน/ไม่รู้จัก → null
 */
export function ipHint(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let ip = raw.trim().replace(/\/\d+$/, '');
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) ip = mapped[1];
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/.exec(ip);
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.x`;
  if (ip.includes(':')) {
    if (ip === '::1') return null;
    const groups = ip.split(':').filter((g) => g !== '');
    if (groups.length < 3) return null;
    return `${groups.slice(0, 3).join(':')}::`;
  }
  return null;
}
