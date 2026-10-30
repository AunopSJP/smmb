import { DOCUMENT } from '@angular/common';
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { I18n, type Lang } from './i18n';
import type { ServerPrefs } from './session';

export type Theme = 'light' | 'dark' | 'system';
export type TextSize = 'normal' | 'large' | 'xlarge';

interface Saved {
  theme: Theme;
  lang: Lang;
  textSize: TextSize;
  simpleHome: boolean;
  nightAutoDark?: boolean;
}

const bangkokHour = () =>
  Number(new Date().toLocaleString('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' }));

const KEY = 'smmb.display';

/**
 * การแสดงผล (หน้า H13-d / O13-b): ธีม · ภาษา · ขนาดตัวอักษร · หน้าหลักแบบเรียบง่าย
 * ตอนนี้จำไว้ในเบราว์เซอร์ — ตอนต่อ backend จะเก็บที่ `Me.prefs` (api.md §3) เพราะภาษาใช้กับแจ้งเตือนด้วย
 */
@Injectable({ providedIn: 'root' })
export class DisplaySettings {
  private readonly doc = inject(DOCUMENT);
  private readonly i18n = inject(I18n);

  readonly theme = signal<Theme>('system');
  readonly textSize = signal<TextSize>('normal');
  readonly simpleHome = signal(false);
  /** ธีมมืดอัตโนมัติ 18:00–06:00 — เจ้าหน้าที่/หัวหน้าเท่านั้น (api.md §3 `night_auto_dark`) */
  readonly nightAutoDark = signal(true);
  /** ตอนนี้อยู่ในหน้าของเจ้าหน้าที่/หัวหน้าไหม (ดูจาก URL) */
  readonly officerContext = toSignal(
    inject(Router).events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => /^\/(officer|agency)(\/|\?|$)/.test(e.urlAfterRedirects)),
    ),
    { initialValue: false },
  );
  readonly lang = this.i18n.lang;

  private readonly hour = signal(bangkokHour());

  /** ค่าที่เก็บกับบัญชี (ชื่อฟิลด์ตาม api.md §3 `Prefs`) */
  readonly prefs = computed<ServerPrefs>(() => ({
    theme: this.theme(),
    lang: this.lang(),
    text_size: this.textSize(),
    simple_home: this.simpleHome(),
    night_auto_dark: this.nightAutoDark(),
  }));

  /** ใช้ค่าจากบัญชี (ตอนล็อกอิน) — ภาษาที่เลือกไว้ที่เครื่องอื่นตามมาด้วย */
  apply(p: Partial<ServerPrefs> | null | undefined): void {
    if (!p) return;
    if (p.theme) this.theme.set(p.theme);
    if (p.lang) this.lang.set(p.lang);
    if (p.text_size) this.textSize.set(p.text_size);
    if (p.simple_home !== undefined) this.simpleHome.set(p.simple_home);
    if (p.night_auto_dark !== undefined) this.nightAutoDark.set(p.night_auto_dark);
  }

  /** ธีมที่ใช้จริง: ตอนตรวจกลางคืน เจ้าหน้าที่ได้ธีมมืดเพื่อไม่แสบตา */
  readonly nightActive = computed(
    () => this.officerContext() && this.nightAutoDark() && (this.hour() >= 18 || this.hour() < 6),
  );

  constructor() {
    const saved = this.load();
    if (saved) {
      this.theme.set(saved.theme);
      this.textSize.set(saved.textSize);
      this.simpleHome.set(saved.simpleHome);
      this.nightAutoDark.set(saved.nightAutoDark ?? true);
      this.lang.set(saved.lang);
    }
    const t = setInterval(() => this.hour.set(bangkokHour()), 60_000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));

    effect(() => {
      const root = this.doc.documentElement;
      const theme = this.theme();
      const applied = this.nightActive() ? 'dark' : theme;
      if (applied === 'system') root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', applied);
      root.setAttribute('data-text-size', this.textSize());
      root.setAttribute('lang', this.lang());
      this.save({
        theme,
        lang: this.lang(),
        textSize: this.textSize(),
        simpleHome: this.simpleHome(),
        nightAutoDark: this.nightAutoDark(),
      });
    });
  }

  private load(): Saved | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      return null;
    }
  }

  private save(s: Saved): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(s));
    } catch {
      // โหมดส่วนตัว / ปิด storage — ใช้ค่าในหน่วยความจำต่อไป
    }
  }
}
