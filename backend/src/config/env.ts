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
  /** master key ของตู้ — รหัสลับประจำตู้ = HMAC(คีย์นี้, box_id) · แยกต่อ environment · เปลี่ยน = ทุกตู้ต้องเขียนรหัสลับใหม่ */
  BOX_MASTER_KEY: string;
  /** คีย์ลายเซ็น QR หน้าตู้ (และ QR ประจำตัวเจ้าหน้าที่ในเฟส 3) · แยกต่อ environment */
  QR_SIGNING_KEY: string;
  /** โหมด mock เท่านั้น: เจ้าหน้าที่ใช้งานได้โดยยังไม่เปิดแจ้งเตือน (ทดสอบบนมือถือที่ยังลงเว็บแอปไม่ได้) · production ห้ามตั้ง */
  SKIP_PUSH_REQUIRED: boolean;
  /**
   * prefix ของ path ที่ reverse proxy ส่งมาแบบ "ไม่ตัด" เช่น /smmb-api (ว่าง = ไม่มี prefix)
   * ตู้เซ็นลายเซ็นจาก path เต็ม (/smmb-api/v1/box/...) — backend ตัด prefix เองตอนจับคู่ route แต่ originalUrl ยังเต็ม
   * จึงตรวจลายเซ็นได้ · nginx ห้าม rewrite/ตัด path (CODEX_SERVER_SETUP 9.4)
   */
  API_PATH_PREFIX: string;
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

  const secret = (key: string): string => {
    const v = str(key);
    if (v && v.length < 32) errors.push(`${key} must be at least 32 characters (openssl rand -hex 32)`);
    return v;
  };

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
    BOX_MASTER_KEY: secret('BOX_MASTER_KEY'),
    QR_SIGNING_KEY: secret('QR_SIGNING_KEY'),
    SKIP_PUSH_REQUIRED: str('SKIP_PUSH_REQUIRED', '') === '1',
    API_PATH_PREFIX: str('API_PATH_PREFIX', '').replace(/\/+$/, ''),
  };
  if (env.API_PATH_PREFIX && !/^\/[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(env.API_PATH_PREFIX)) errors.push('API_PATH_PREFIX must look like /smmb-api');
  if (env.SKIP_PUSH_REQUIRED && env.NODE_ENV === 'production') errors.push('SKIP_PUSH_REQUIRED is not allowed in production');
  if (env.BOX_MASTER_KEY && env.BOX_MASTER_KEY === env.QR_SIGNING_KEY) errors.push('BOX_MASTER_KEY and QR_SIGNING_KEY must differ');

  if (errors.length) throw new Error(`Invalid environment:\n- ${errors.join('\n- ')}`);
  return env;
}
