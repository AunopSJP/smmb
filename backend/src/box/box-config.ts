// ค่าตั้งค่าที่ส่งให้ตู้ + สถานะตู้ — ฟังก์ชันล้วน (design §5.2, §8)
import { createHash } from 'node:crypto';

/** ค่ากลางที่แอดมินตั้ง (api.md §9.5) — เวลาตรวจไม่อยู่ที่นี่ มาจากโซน */
export interface BoxConfigDefaults {
  report_at: string;
  scan_timeout_s: number;
  max_attempts: number;
  flash_when_dark: boolean;
  longpoll_wait_s: number;
}

/** สิ่งที่ตู้ได้ใน `config` (โปรโตคอล §2.1) */
export interface BoxConfig extends BoxConfigDefaults {
  windows: [string, string][];
  tz: string;
}

export const BOX_TZ = 'Asia/Bangkok';

/** ช่วงตัวเลขที่ยอมให้ตั้ง (✅ api.md §0) */
export const CONFIG_LIMITS = {
  scan_timeout_s: [10, 60],
  max_attempts: [1, 5],
  longpoll_wait_s: [20, 55],
} as const;

export const DEFAULT_CONFIG: BoxConfigDefaults = {
  report_at: '23:30',
  scan_timeout_s: 20,
  max_attempts: 3,
  flash_when_dark: true,
  longpoll_wait_s: 50,
};

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** ค่าจากฐานข้อมูล (ค่ากลาง + ค่าทับเฉพาะตู้) → ค่าที่ใช้จริง · ค่าที่ผิดรูปแบบใช้ค่าเริ่มต้นแทน (ตู้ต้องได้ค่าที่ใช้ได้เสมอ) */
export function resolveDefaults(...layers: Record<string, unknown>[]): BoxConfigDefaults {
  const out = { ...DEFAULT_CONFIG };
  for (const layer of layers) {
    if (typeof layer.report_at === 'string' && HHMM.test(layer.report_at)) out.report_at = layer.report_at;
    if (typeof layer.flash_when_dark === 'boolean') out.flash_when_dark = layer.flash_when_dark;
    for (const key of ['scan_timeout_s', 'max_attempts', 'longpoll_wait_s'] as const) {
      const v = layer[key];
      const [min, max] = CONFIG_LIMITS[key];
      if (Number.isInteger(v) && (v as number) >= min && (v as number) <= max) out[key] = v as number;
    }
  }
  return out;
}

/**
 * เวลาตรวจของตู้ = รวมช่วงของทุกโซนที่มีตู้นี้ · ช่วงที่ทับหรือชนขอบกันรวมเป็นช่วงเดียว (design §5.2)
 * ตู้ไม่อยู่โซนไหน → [] (หลับลึกตลอด ตื่นแค่รายงานรายวัน)
 */
export function mergeWindows(windows: [string, string][]): [string, string][] {
  const sorted = windows.filter(([s, e]) => HHMM.test(s) && HHMM.test(e) && s < e).sort((a, b) => a[0].localeCompare(b[0]));
  const out: [string, string][] = [];
  for (const [s, e] of sorted) {
    const last = out[out.length - 1];
    if (last && s <= last[1]) {
      if (e > last[1]) last[1] = e;
    } else {
      out.push([s, e]);
    }
  }
  return out;
}

/**
 * config_ver ที่ตู้เทียบ = เลขจาก hash ของค่าทั้งก้อน (design §5.2 💡)
 * ค่าเปลี่ยนหรือแอดมินสั่งซิงก์ใหม่ → เลขเปลี่ยนเอง ไม่ต้องนับเวอร์ชัน
 * generation เป็น 0 สำหรับ config ปกติ จึงยังตรงกับ hash รุ่นเดิม; reset เพิ่ม generation เพื่อบังคับส่ง config แม้ค่าไม่เปลี่ยน
 * ตู้ใหม่ส่ง 0 มา → ไม่มีวันตรง (เลขนี้ไม่เป็น 0)
 */
export function configVersion(config: BoxConfig, generation = 0): number {
  const canonical = JSON.stringify([
    ...(generation > 0 ? [generation] : []),
    config.windows,
    config.tz,
    config.report_at,
    config.scan_timeout_s,
    config.max_attempts,
    config.flash_when_dark,
    config.longpoll_wait_s,
  ]);
  const n = parseInt(createHash('sha256').update(canonical).digest('hex').slice(0, 8), 16) & 0x7fffffff;
  return n === 0 ? 1 : n;
}

/** เวลาท้องถิ่น (นาทีตั้งแต่เที่ยงคืน) ของเขตเวลาที่ให้ */
export function localMinutes(now: Date, tz = BOX_TZ): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** อยู่ในช่วงเวลาตรวจไหม · คืนจำนวนนาทีที่ช่วงนั้นเริ่มมาแล้ว (null = นอกเวลาตรวจ) */
export function minutesIntoWindow(windows: [string, string][], now: Date, tz = BOX_TZ): number | null {
  const m = localMinutes(now, tz);
  for (const [s, e] of windows) {
    if (m >= toMinutes(s) && m < toMinutes(e)) return m - toMinutes(s);
  }
  return null;
}

export type BoxStatus = 'online' | 'offline' | 'sleeping' | 'service_closed' | 'unbound';

/** ตู้เงียบเกินนี้ = ไม่ออนไลน์ (✅ api.md §0) */
export const SILENT_AFTER_MS = 26 * 3600_000;
/** ถึงเวลาตรวจแล้ว ให้เวลาตู้ตื่นมาถือ long-poll ก่อนนับว่าไม่ออนไลน์ (design §8) */
export const WINDOW_GRACE_MIN = 5;

/**
 * สถานะตู้ที่แสดง (api.md §4.2, design §8) — คิดจากเวลาล่าสุดที่ตู้ติดต่อ ไม่ต้องมีงานเบื้องหลัง
 * - online: ถือ long-poll อยู่ (ภายใน 2 × longpoll_wait_s)
 * - offline: อยู่ในเวลาตรวจเกิน 5 นาทีแล้วแต่ไม่ถือ long-poll · หรือเงียบเกิน 26 ชม. · หรือยังไม่เคยติดต่อเลย
 * - sleeping: นอกเวลาตรวจ และติดต่อมาภายใน 26 ชม. (ตู้หลับลึกตามปกติ)
 */
export function boxStatus(
  box: { service_active: boolean; owner_user_id: string | null; last_poll_date: Date | null; last_seen_date: Date | null },
  windows: [string, string][],
  longpollWaitS: number,
  now = new Date(),
): BoxStatus {
  if (!box.service_active) return 'service_closed';
  if (!box.owner_user_id) return 'unbound';
  const t = now.getTime();
  if (box.last_poll_date && t - box.last_poll_date.getTime() <= 2 * longpollWaitS * 1000) return 'online';
  const into = minutesIntoWindow(windows, now);
  if (into !== null && into >= WINDOW_GRACE_MIN) return 'offline';
  if (box.last_seen_date && t - box.last_seen_date.getTime() <= SILENT_AFTER_MS) return 'sleeping';
  return 'offline';
}
