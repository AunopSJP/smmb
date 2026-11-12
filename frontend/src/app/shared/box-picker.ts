import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { I18n } from '../core/i18n';
import { Icon } from './icon';

export interface BoxChoice {
  id: string;
  name: string;
  house_no: string;
}

/** id ไม่ซ้ำเมื่อมีตัวเลือกมากกว่าหนึ่งตัวในหน้าเดียว */
let nextId = 0;

/**
 * ตัวเลือกตู้แบบกะทัดรัด (เจ้าของบ้านมีหลายตู้)
 *
 * เดิมใช้ `<select>` ของเบราว์เซอร์ — หน้าตาเป็นกล่องเดียวกับหน้านี้ แต่รายการที่กางออก
 * เป็นของระบบปฏิบัติการ (พื้นน้ำเงิน/ตัวอักษรคนละฟอนต์) จึงไม่เข้ากับธีม
 * ที่นี่วาดรายการเองด้วย token ของโปรเจ็ค พร้อมคีย์บอร์ดและ ARIA ตามรูปแบบ listbox
 */
@Component({
  selector: 'app-box-picker',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.open]': 'open()',
    '(document:pointerdown)': 'onPointerDown($event)',
  },
  template: `
    <button
      #trigger
      type="button"
      class="trigger"
      aria-haspopup="listbox"
      [attr.aria-expanded]="open()"
      [attr.aria-controls]="listId"
      (click)="toggle()"
      (keydown)="onTriggerKey($event)"
    >
      <span class="lead" aria-hidden="true"><app-icon name="box" [size]="20" /></span>
      <span class="txt">
        <span class="eyebrow">{{ i18n.t({ th: 'ตู้ที่กำลังดู', en: 'Viewing mailbox' }) }}</span>
        <strong>{{ titleOf(current()) }}</strong>
        <span class="meta">{{ subOf(current()) }}</span>
      </span>
      <span class="count" [attr.aria-label]="countLabel()">
        {{ index() }}<i>/</i>{{ boxes().length }}
      </span>
      <span class="chev" [class.up]="open()" aria-hidden="true">
        <app-icon name="chevronRight" [size]="18" />
      </span>
    </button>

    @if (open()) {
      <div
        #list
        class="panel"
        role="listbox"
        tabindex="-1"
        [attr.id]="listId"
        [attr.aria-label]="i18n.t({ th: 'เลือกตู้', en: 'Choose a mailbox' })"
        [attr.aria-activedescendant]="optionId(active())"
        (keydown)="onListKey($event)"
      >
        <p class="panel-label" aria-hidden="true">
          {{ i18n.t({ th: 'เลือกตู้', en: 'Choose mailbox' }) }}
          <span>{{ boxes().length }}</span>
        </p>
        @for (b of boxes(); track b.id; let i = $index) {
          <div
            role="option"
            class="option"
            [id]="optionId(i)"
            [class.active]="i === active()"
            [class.selected]="b.id === value()"
            [attr.aria-selected]="b.id === value()"
            (click)="choose(b.id)"
            (mouseenter)="active.set(i)"
          >
            <span class="opt-ic" aria-hidden="true"><app-icon name="box" [size]="18" /></span>
            <span class="opt-txt">
              <strong>{{ titleOf(b) }}</strong>
              <span>{{ subOf(b) }}</span>
            </span>
            @if (b.id === value()) {
              <span class="tick" aria-hidden="true"><app-icon name="check" [size]="14" /></span>
            }
          </div>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      z-index: 5;
    }
    .trigger {
      display: flex;
      align-items: center;
      gap: 12px;
      inline-size: 100%;
      min-block-size: 64px;
      padding: 10px 12px;
      border: 1.5px solid var(--line);
      border-radius: var(--radius);
      background: var(--surface);
      color: var(--text);
      box-shadow: var(--shadow);
      font: inherit;
      text-align: start;
      cursor: pointer;
      transition:
        border-color 0.15s,
        box-shadow 0.15s;
    }
    @media (hover: hover) {
      .trigger:hover {
        border-color: color-mix(in srgb, var(--brand) 45%, var(--line));
      }
    }
    .trigger:focus-visible {
      outline: 3px solid var(--brand-text);
      outline-offset: 2px;
    }
    :host(.open) .trigger {
      border-color: var(--brand);
      box-shadow: var(--focus, 0 0 0 3px rgb(154 47 54 / 18%));
    }
    .lead {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 42px;
      block-size: 42px;
      border-radius: 12px;
      background: var(--brand-light);
      color: var(--brand-dark);
    }
    .txt {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 1px;
      min-inline-size: 0;
    }
    .eyebrow {
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--text-muted);
    }
    .txt strong {
      font-size: 1rem;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    .meta {
      font-size: 0.8125rem;
      line-height: 1.35;
      color: var(--text-muted);
      overflow-wrap: anywhere;
    }
    .count {
      flex: none;
      padding: 3px 9px;
      border-radius: 999px;
      background: var(--icon-bg);
      color: var(--text-muted);
      font-size: 0.75rem;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
      i {
        margin-inline: 1px;
        font-style: normal;
        opacity: 0.55;
      }
    }
    .chev {
      display: grid;
      place-items: center;
      flex: none;
      color: var(--text-muted);
      transform: rotate(90deg);
      transition: transform 0.15s;
    }
    .chev.up {
      transform: rotate(-90deg);
    }

    .panel {
      position: absolute;
      inset-inline: 0;
      inset-block-start: calc(100% + 6px);
      z-index: 40;
      max-block-size: min(340px, 60vh);
      padding: 6px;
      border: 1px solid var(--line-strong, var(--line));
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: 0 18px 40px rgb(0 0 0 / 22%);
      overflow-y: auto;
      overscroll-behavior: contain;
      animation: picker-in 0.14s ease-out;
    }
    .panel:focus {
      outline: none;
    }
    /* ตัวเลือกที่ active เป็นตัวบอกตำแหน่งโฟกัสของ listbox อยู่แล้ว — ไม่ต้องมีกรอบซ้อนรอบ panel */
    .panel-label {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 4px 8px 6px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--text-muted);
      span {
        padding: 1px 7px;
        border-radius: 999px;
        background: var(--icon-bg);
        font-variant-numeric: tabular-nums;
      }
    }
    .option {
      display: flex;
      align-items: center;
      gap: 10px;
      min-block-size: 56px;
      padding: 8px 10px;
      border-radius: var(--radius-sm);
      cursor: pointer;
    }
    .option + .option {
      margin-block-start: 2px;
    }
    .option.active {
      background: var(--brand-lighter);
    }
    .option.selected .opt-ic {
      background: var(--brand-light);
      color: var(--brand-dark);
    }
    .opt-ic {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 36px;
      block-size: 36px;
      border-radius: 10px;
      background: var(--icon-bg);
      color: var(--text-muted);
    }
    .opt-txt {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: 1px;
      min-inline-size: 0;
      strong {
        font-size: 0.9375rem;
        line-height: 1.35;
        overflow-wrap: anywhere;
      }
      span {
        font-size: 0.8125rem;
        line-height: 1.35;
        color: var(--text-muted);
        overflow-wrap: anywhere;
      }
    }
    .tick {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 22px;
      block-size: 22px;
      border-radius: 50%;
      background: var(--action-bg);
      color: var(--action-fg);
    }

    /* โหมดง่าย: แตะง่ายขึ้น อ่านง่ายขึ้น */
    :host-context(:root[data-mode='easy']) {
      .trigger {
        min-block-size: 76px;
        padding: 12px 14px;
      }
      .eyebrow {
        font-size: 0.75rem;
      }
      .txt strong {
        font-size: 1.125rem;
      }
      .meta {
        font-size: 0.875rem;
      }
      .option {
        min-block-size: 66px;
      }
      .opt-txt strong {
        font-size: 1.0625rem;
      }
      .opt-txt span {
        font-size: 0.875rem;
      }
    }

    @keyframes picker-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .panel {
        animation: none;
      }
      .chev {
        transition: none;
      }
    }
  `,
})
export class BoxPicker {
  protected readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly boxes = input.required<BoxChoice[]>();
  readonly value = input<string | null | undefined>(null);
  readonly pick = output<string>();

  protected readonly open = signal(false);
  protected readonly active = signal(0);
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  protected readonly listId = `box-picker-${++nextId}`;

  protected readonly current = computed(() => {
    const list = this.boxes();
    return list.find((b) => b.id === this.value()) ?? list[0] ?? null;
  });
  private readonly currentIndex = computed(() => {
    const i = this.boxes().findIndex((b) => b.id === this.value());
    return i < 0 ? 0 : i;
  });
  protected readonly index = computed(() => Math.max(1, this.currentIndex() + 1));
  protected readonly countLabel = computed(() =>
    this.i18n.t({
      th: `ตู้ที่ ${this.index()} จาก ${this.boxes().length}`,
      en: `Mailbox ${this.index()} of ${this.boxes().length}`,
    }),
  );

  protected titleOf(b: BoxChoice | null): string {
    if (!b) return '';
    return b.name || b.house_no || b.id;
  }

  protected subOf(b: BoxChoice | null): string {
    if (!b) return '';
    return b.name ? this.i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + b.house_no : b.id;
  }

  protected optionId(i: number): string {
    return `${this.listId}-opt-${i}`;
  }

  protected toggle(): void {
    if (this.open()) this.close();
    else this.openMenu();
  }

  private openMenu(): void {
    if (!this.boxes().length) return;
    this.active.set(this.currentIndex());
    this.open.set(true);
    // รอ @if สร้าง panel ก่อน แล้วย้ายโฟกัสไป listbox (โฟกัสยังอยู่ใน component เดียวกัน)
    setTimeout(() => this.list()?.nativeElement.focus());
  }

  private close(refocus = false): void {
    if (!this.open()) return;
    this.open.set(false);
    if (refocus) (this.host.nativeElement.querySelector('.trigger') as HTMLElement | null)?.focus();
  }

  protected choose(id: string): void {
    this.close(true);
    if (id !== this.value()) this.pick.emit(id);
  }

  protected onTriggerKey(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (this.open()) this.move(event.key === 'ArrowDown' ? 1 : -1);
      else this.openMenu();
    } else if (event.key === 'Escape') {
      this.close();
    }
  }

  protected onListKey(event: KeyboardEvent): void {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move(-1);
        break;
      case 'Home':
        event.preventDefault();
        this.setActive(0);
        break;
      case 'End':
        event.preventDefault();
        this.setActive(this.boxes().length - 1);
        break;
      case 'Enter':
      case ' ': {
        event.preventDefault();
        const box = this.boxes()[this.active()];
        if (box) this.choose(box.id);
        break;
      }
      case 'Escape':
        event.preventDefault();
        this.close(true);
        break;
      case 'Tab':
        this.close(true);
        break;
      default:
        break;
    }
  }

  private move(step: number): void {
    const count = this.boxes().length;
    if (!count) return;
    this.setActive((this.active() + step + count) % count);
  }

  private setActive(i: number): void {
    this.active.set(i);
    // ให้ตัวเลือกที่โฟกัสด้วยคีย์บอร์ดอยู่ในสายตาเสมอ
    setTimeout(() =>
      this.list()
        ?.nativeElement.querySelector(`#${this.optionId(i)}`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }

  /** คลิกนอกตัวเลือก = ปิด (ไม่ปิดเมื่อคลิกใน panel/trigger) */
  protected onPointerDown(event: Event): void {
    if (!this.open()) return;
    const target = event.target as Node | null;
    if (target && !this.host.nativeElement.contains(target)) this.close();
  }
}
