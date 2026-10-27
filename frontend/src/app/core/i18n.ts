import { Injectable, signal } from '@angular/core';

export type Lang = 'th' | 'en';

/** ข้อความสองภาษา — ทุกข้อความที่ผู้ใช้เห็นต้องมีทั้งไทยและอังกฤษ (CLAUDE.md กฎข้อ 11) */
export interface Tr {
  th: string;
  en: string;
}

/**
 * ภาษาของหน้าจอ · เรียก `i18n.t({ th, en })` ใน template — อ่าน signal จึงเปลี่ยนตามทันทีเมื่อสลับภาษา
 * ตอนต่อ backend จริง ภาษามาจาก `Me.prefs.lang` (ข้อความแจ้งเตือนจาก server แปลตามค่านี้ด้วย)
 */
@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>('th');

  t(text: Tr): string {
    return text[this.lang()];
  }
}
