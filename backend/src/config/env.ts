// อ่านและตรวจค่า env ตอนเริ่มเซิร์ฟเวอร์ — ขาดค่าที่จำเป็นให้ล้มทันที ไม่ใช่ล้มตอนมีคำขอ
export interface Env {
  NODE_ENV: 'development' | 'test' | 'production';
  PORT: number;
  DATABASE_URL: string;
  REDIS_URL: string;
  /** ห้ามฮาร์ดโค้ดโดเมน — ทุกลิงก์ที่ server สร้างมาจากค่านี้ */
  PUBLIC_BASE_URL: string;
  /** โดเมนที่ยอมรับใน qr_text (คั่นด้วย ,) */
  QR_ALLOWED_HOSTS: string[];
  /** ค่าให้ express `trust proxy` — เช่น `1` (proxy ชั้นเดียว) หรือ `loopback` · ว่าง = ไม่เชื่อ proxy */
  TRUST_PROXY: string | number | false;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
  VAPID_SUBJECT: string;
  /** จำนวน connection สูงสุดของ Postgres pool */
  DB_POOL_MAX: number;
  /** อายุ session (วัน) — ต่ออายุเองเมื่อใช้งาน */
  SESSION_TTL_DAYS: number;
}

const NODE_ENVS = ['development', 'test', 'production'] as const;

export function validateEnv(raw: Record<string, unknown>): Env {
  const errors: string[] = [];
  const str = (key: string, fallback?: string): string => {
    const v = raw[key];
    if (typeof v === 'string' && v.trim() !== '') return v.trim();
    if (fallback !== undefined) return fallback;
    errors.push(`${key} is required`);
    return '';
  };

  const posInt = (key: string, fallback: number): number => {
    const n = Number(str(key, String(fallback)));
    if (!Number.isInteger(n) || n <= 0) errors.push(`${key} must be a positive integer`);
    return n;
  };

  const nodeEnv = str('NODE_ENV', 'development');
  if (!(NODE_ENVS as readonly string[]).includes(nodeEnv)) {
    errors.push(`NODE_ENV must be one of ${NODE_ENVS.join(', ')}`);
  }

  const port = posInt('PORT', 3000);

  const publicBaseUrl = str('PUBLIC_BASE_URL');
  if (publicBaseUrl && !URL.canParse(publicBaseUrl)) errors.push('PUBLIC_BASE_URL must be a URL');

  const trustRaw = str('TRUST_PROXY', '');
  const trustProxy = trustRaw === '' || trustRaw === 'false' ? false : /^\d+$/.test(trustRaw) ? Number(trustRaw) : trustRaw;

  const env: Env = {
    NODE_ENV: nodeEnv as Env['NODE_ENV'],
    PORT: port,
    DATABASE_URL: str('DATABASE_URL'),
    REDIS_URL: str('REDIS_URL'),
    PUBLIC_BASE_URL: publicBaseUrl.replace(/\/+$/, ''),
    QR_ALLOWED_HOSTS: str('QR_ALLOWED_HOSTS')
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
    TRUST_PROXY: trustProxy,
    VAPID_PUBLIC_KEY: str('VAPID_PUBLIC_KEY', ''),
    VAPID_PRIVATE_KEY: str('VAPID_PRIVATE_KEY', ''),
    VAPID_SUBJECT: str('VAPID_SUBJECT', ''),
    DB_POOL_MAX: posInt('DB_POOL_MAX', 10),
    SESSION_TTL_DAYS: posInt('SESSION_TTL_DAYS', 30),
  };

  if (errors.length) throw new Error(`Invalid environment:\n- ${errors.join('\n- ')}`);
  return env;
}
