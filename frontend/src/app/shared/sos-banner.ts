import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { I18n, type Tr } from '../core/i18n';
import { SosAlarm } from '../core/sos-alarm';
import { screenUrl } from '../screens/registry';

/**
 * แถบแดง SOS ค้างบนทุกหน้าของเจ้าหน้าที่/หัวหน้า ตราบที่ยังมีเรื่องไม่มีคนรับ (✅ 2026-11-27) พร้อมไซเรน+สั่น
 * ใช้ทั้งใน AreaShell และหน้า /settings/* ซึ่งอยู่นอก shell · ซ่อนเฉพาะตอนอยู่ในหน้าของเรื่องนั้นเอง
 */
@Component({
  selector: 'app-sos-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bar(); as b) {
      <button type="button" (click)="open()">
        <strong role="alert">{{ i18n.t(b.title) }}</strong>
        <span>{{ i18n.t(b.sub) }}</span>
      </button>
    }
  `,
  styles: `
    :host {
      display: block;
      position: sticky;
      inset-block-start: 0;
      z-index: 50;
    }
    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      inline-size: 100%;
      min-block-size: 56px;
      padding: 8px 16px;
      border: 0;
      background: var(--sos-bg);
      color: var(--sos-fg);
      font: inherit;
      font-weight: var(--fw-strong);
      cursor: pointer;
    }
    span {
      font-size: var(--fs-sm);
      font-weight: 400;
    }
  `,
})
export class SosBanner {
  protected readonly i18n = inject(I18n);
  private readonly alarm = inject(SosAlarm);
  private readonly router = inject(Router);
  /** ผู้ใช้อยู่ฝั่งหัวหน้า → หน้ารายการ SOS มีปุ่มกลับไปภาพรวม */
  readonly head = input(false);

  private readonly location = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.router.url),
      startWith(this.router.url),
    ),
  );

  protected readonly bar = computed(() => {
    const open = this.alarm.waiting();
    if (!open.length) return null;
    const only = open.length === 1 ? open[0] : null;
    const url = this.router.parseUrl(this.location() ?? '/');
    const path = '/' + (url.root.children['primary']?.segments.map((s) => s.path).join('/') ?? '');
    if (only && path === screenUrl('O09') && url.queryParams['id'] === only.id) return null;
    const oldest = Math.min(...open.map((c) => Date.parse(c.returned_at ?? c.created_at)));
    const min = Math.max(0, Math.floor((this.alarm.checkedAt() - oldest) / 60_000));
    const waited: Tr = min ? { th: `รอมา ${min} นาที`, en: `waiting ${min} min` } : { th: 'เพิ่งแจ้ง', en: 'just now' };
    const tap: Tr = this.alarm.needsTap() ? { th: 'แตะเพื่อเปิดเสียงและดูเรื่อง', en: 'tap to turn on sound and open' } : { th: 'แตะเพื่อดูเรื่อง', en: 'tap to open' };
    const title: Tr = only
      ? { th: `SOS บ้านเลขที่ ${only.house_no} ยังไม่มีคนรับ`, en: `SOS at house ${only.house_no}, not accepted` }
      : { th: `SOS ยังไม่มีคนรับ ${open.length} เรื่อง`, en: `${open.length} SOS not accepted` };
    return { title, sub: { th: `${waited.th} · ${tap.th}`, en: `${waited.en} · ${tap.en}` }, id: only?.id ?? null };
  });

  constructor() {
    this.alarm.start();
    inject(DestroyRef).onDestroy(() => this.alarm.stop());
  }

  /** แตะแถบ = ปลดล็อกเสียง + ไปที่เรื่อง (หลายเรื่อง → รายการ) */
  protected open(): void {
    const b = this.bar();
    if (!b) return;
    void this.alarm.unlock();
    const from = this.head() ? { from: 'L04' } : {};
    void this.router.navigate([screenUrl(b.id ? 'O09' : 'O12')], { queryParams: b.id ? { id: b.id } : from });
  }
}
