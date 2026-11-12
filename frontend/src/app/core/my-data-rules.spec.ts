import { describe, expect, it } from 'vitest';
import {
  availabilityFromStatus,
  blockerText,
  canContinueFromPreview,
  canSubmitDelete,
  confirmPhrase,
  countLabel,
  myDataErrorText,
  retainedLabel,
} from './my-data-rules';

describe('availabilityFromStatus', () => {
  it('2xx = yes · 404/405/501 = no · อื่น ๆ = unknown (ซ่อนลิงก์)', () => {
    expect(availabilityFromStatus(200)).toBe('yes');
    expect(availabilityFromStatus(404)).toBe('no');
    expect(availabilityFromStatus(405)).toBe('no');
    expect(availabilityFromStatus(501)).toBe('no');
    expect(availabilityFromStatus(0)).toBe('unknown');
    expect(availabilityFromStatus(401)).toBe('unknown');
    expect(availabilityFromStatus(503)).toBe('unknown');
    expect(availabilityFromStatus(null)).toBe('unknown');
  });
});

describe('ปุ่มลบบัญชี', () => {
  const base = { typed: 'ลบบัญชี', password: 'x', lang: 'th' as const, blockers: [], busy: false };
  it('ปิดไว้จนกว่าจะพิมพ์ยืนยันตรง + มีรหัสผ่าน', () => {
    expect(canSubmitDelete(base)).toBe(true);
    expect(canSubmitDelete({ ...base, typed: '' })).toBe(false);
    expect(canSubmitDelete({ ...base, typed: 'ลบ' })).toBe(false);
    expect(canSubmitDelete({ ...base, password: '' })).toBe(false);
  });
  it('คำยืนยันเปลี่ยนตามภาษา และตัดช่องว่างหัวท้าย', () => {
    expect(confirmPhrase('en')).toBe('DELETE');
    expect(canSubmitDelete({ ...base, lang: 'en', typed: ' DELETE ' })).toBe(true);
    expect(canSubmitDelete({ ...base, lang: 'en', typed: 'delete' })).toBe(false);
    expect(canSubmitDelete({ ...base, lang: 'en', typed: 'ลบบัญชี' })).toBe(false);
  });
  it('มีเหตุขวางหรือกำลังส่ง = กดไม่ได้', () => {
    expect(canSubmitDelete({ ...base, blockers: [{ code: 'LAST_HEAD' }] })).toBe(false);
    expect(canSubmitDelete({ ...base, busy: true })).toBe(false);
  });
});

describe('ขั้นดูตัวอย่างก่อนลบ', () => {
  it('ไปต่อได้เมื่อไม่มีเหตุขวางเท่านั้น', () => {
    expect(canContinueFromPreview(null)).toBe(false);
    expect(canContinueFromPreview({ counts: {}, blockers: [{ code: 'SOS_OPEN' }], retained: [] })).toBe(false);
    expect(canContinueFromPreview({ counts: { boxes: 1 }, blockers: [], retained: [] })).toBe(true);
  });
});

describe('ตัดสินจาก code ไม่ใช่ message', () => {
  it('error code ที่รู้จักได้ข้อความเฉพาะ ทั้งไทยและอังกฤษ', () => {
    for (const c of ['INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'RATE_LIMITED', 'DELETE_BLOCKED', 'CONFIRM_MISMATCH']) {
      const t = myDataErrorText(c, 400);
      expect(t.th.length).toBeGreaterThan(5);
      expect(t.en.length).toBeGreaterThan(5);
    }
    expect(myDataErrorText('INVALID_CREDENTIALS', 401).th).not.toBe(myDataErrorText('RATE_LIMITED', 429).th);
  });
  it('ไม่มี code → ดูสถานะ (เน็ตหลุด/เซิร์ฟเวอร์ล้ม/อื่น ๆ) และทุกข้อความบอกทางต่อ', () => {
    expect(myDataErrorText(null, 0).th).toContain('อินเทอร์เน็ต');
    expect(myDataErrorText(null, 500).th).toContain('ภายหลัง');
    expect(myDataErrorText(null, 400).th).toContain('ติดต่อ');
  });
  it('รหัสเหตุขวาง/หมวดที่ไม่รู้จักไม่โชว์รหัสดิบ', () => {
    expect(blockerText('WHATEVER').th).not.toContain('WHATEVER');
    expect(countLabel('weird_key').th).not.toContain('weird_key');
    expect(retainedLabel('weird_kind').en).not.toContain('weird_kind');
  });
});
