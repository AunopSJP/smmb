import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { I18n } from '../core/i18n';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { screen, screenUrl, TABS } from './registry';

/** หน้าที่ยังไม่ได้ทำจริง — แสดงชื่อ คำอธิบาย และปุ่มไปหน้าถัดไปแบบ prototype */
@Component({
  selector: 'app-screen-placeholder',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let d = def();
    <app-page-header [title]="i18n.t(d.title)" [caption]="d.code" [back]="back()" />

    <div class="stack">
      <section class="card stack">
        <div class="tags">
          <span class="chip">{{ i18n.t({ th: 'หน้าโครง', en: 'Skeleton' }) }}</span>
          @if (d.proposal) {
            <span class="chip warn">{{ i18n.t({ th: 'ข้อเสนอ ยังไม่อยู่ในขอบเขต', en: 'Proposal — not in scope' }) }}</span>
          }
          @if (d.waitingDecision) {
            <span class="chip danger">{{ i18n.t({ th: 'รอตัดสินใจเรื่องบัญชี', en: 'Waiting on account decision' }) }}</span>
          }
        </div>
        @if (d.note) {
          <p>{{ i18n.t(d.note) }}</p>
        }
        @if (d.states?.length) {
          <p class="muted small">
            {{ i18n.t({ th: 'สถานะอื่นใน wireframe', en: 'Other states in the wireframe' }) }}: {{ d.states!.join(' · ') }}
          </p>
        }
      </section>

      @if (next().length) {
        <h2 class="section-title">{{ i18n.t({ th: 'ไปหน้าถัดไป', en: 'Go to' }) }}</h2>
        <nav class="list">
          @for (n of next(); track n.code) {
            <a class="row" [routerLink]="n.url">
              <span class="chip">{{ n.code }}</span>
              <span class="grow">{{ i18n.t(n.title) }}</span>
              <app-icon name="chevronRight" [size]="18" />
            </a>
          }
        </nav>
      }
    </div>
  `,
  styles: `
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .grow {
      flex: 1;
    }
  `,
})
export class ScreenPlaceholder {
  protected readonly i18n = inject(I18n);
  private readonly route = inject(ActivatedRoute);
  private readonly code = toSignal(this.route.data.pipe(map((d) => d['code'] as string)), {
    initialValue: this.route.snapshot.data['code'] as string,
  });

  protected readonly def = computed(() => screen(this.code()));
  protected readonly next = computed(() =>
    (this.def().next ?? []).map((c) => ({ code: c, title: screen(c).title, url: screenUrl(c) })),
  );
  /** หน้าที่เป็นแท็บไม่มีปุ่มย้อนกลับ · หน้าอื่นย้อนไปหน้าแรกของบทบาท */
  protected readonly back = computed(() => {
    const d = this.def();
    const tabs = TABS[d.area] ?? [];
    if (tabs.some((t) => t.code === d.code)) return undefined;
    return screenUrl(tabs[0]?.code ?? d.code);
  });
}
