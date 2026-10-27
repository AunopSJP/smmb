import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { I18n } from '../../core/i18n';
import { OwnerHomeState } from '../../core/mock/owner-home-state';
import { screenUrl } from '../../screens/registry';
import { Icon } from '../../shared/icon';

/**
 * การ์ดแจ้งเรื่องที่ต้องรู้/ต้องทำ บนหน้าหลักเจ้าของบ้าน (H03-b / H03-c / H03-d)
 * เรียงจากสำคัญสุด: ตู้ออฟไลน์ → QR ชำรุด → แบตต่ำ → ยังไม่เปิดแจ้งเตือน → ยังไม่มีเจ้าหน้าที่
 */
@Component({
  selector: 'app-owner-home-alerts',
  imports: [RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (s.offline()) {
      <!-- H03-c -->
      <section class="alert orange" role="status">
        <h2><app-icon name="alert" [size]="22" />{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' }) }}</h2>
        <p>{{ i18n.t({ th: 'ถึงเวลาตรวจแล้ว แต่ตู้ยังไม่เชื่อมต่อ เจ้าหน้าที่จะตรวจตู้ไม่ได้', en: 'Patrol hours have started but the mailbox is not connected, so officers cannot inspect it' }) }}</p>
        <p class="muted small">{{ i18n.t({ th: 'ติดต่อล่าสุด เมื่อวาน 21:00 · แบตล่าสุด 12%', en: 'Last contact yesterday 21:00 · battery 12%' }) }}</p>
        <div class="checklist">
          <strong>{{ i18n.t({ th: 'ลองเช็กเองก่อน', en: 'Try these first' }) }}</strong>
          <ol>
            <li>{{ i18n.t({ th: 'ไฟที่ตู้ติดไหม (ไม่ติด = แบตหมด)', en: 'Is the box light on? (off = battery empty)' }) }}</li>
            <li>{{ i18n.t({ th: 'Wi-Fi บ้านใช้งานได้ไหม', en: 'Is your home Wi-Fi working?' }) }}</li>
            <li>{{ i18n.t({ th: 'เพิ่งเปลี่ยนรหัส Wi-Fi หรือเปล่า', en: 'Did you just change the Wi-Fi password?' }) }}</li>
          </ol>
        </div>
        <div class="two">
          <a class="btn secondary" [routerLink]="url('H13-b')">{{ i18n.t({ th: 'ตั้ง Wi-Fi ใหม่', en: 'Set up Wi-Fi' }) }}</a>
          <a class="btn dark" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่าง', en: 'Get a technician' }) }}</a>
        </div>
      </section>
    }

    @if (s.taskCount() > 0) {
      <h2 class="section-title">{{ i18n.t({ th: 'เรื่องที่ต้องทำ', en: 'To do' }) }} ({{ s.taskCount() }})</h2>
    }

    @if (s.qrTask()) {
      <!-- H03-d: QR หน้าตู้ชำรุด → เอาใบสำรองไปติด -->
      <section class="alert red" role="status">
        <h2>{{ i18n.t({ th: 'QR หน้าตู้ชำรุด', en: 'Front QR is damaged' }) }}</h2>
        <p>{{ i18n.t({ th: 'เปิดตู้ เอา QR สำรองที่เก็บไว้ด้านในมาติดหน้าตู้แทน แล้วกด "ติดแล้ว"', en: 'Open the box, put the backup QR from inside on the front, then tap “Done”' }) }}</p>
        <ol class="chips-row">
          <li class="chip">1 {{ i18n.t({ th: 'เปิดตู้', en: 'Open' }) }}</li>
          <li class="chip">2 {{ i18n.t({ th: 'ติด QR สำรอง', en: 'Stick backup QR' }) }}</li>
          <li class="chip">3 {{ i18n.t({ th: 'กดติดแล้ว', en: 'Tap done' }) }}</li>
        </ol>
        <button type="button" class="btn" (click)="s.qrSwapped.set(true)">{{ i18n.t({ th: 'ติดแล้ว', en: 'Done' }) }}</button>
      </section>
    }

    @if (s.lowBattery()) {
      <section class="alert orange row-alert" role="status">
        <app-icon name="alert" [size]="22" />
        <span>
          <strong>{{ i18n.t({ th: 'แบตตู้เหลือ 15%', en: 'Battery at 15%' }) }}</strong>
          <span class="muted small block">{{ i18n.t({ th: 'ดูว่าแผงโซลาร์โดนแดดไหม มีอะไรบังหรือเปล่า', en: 'Check the solar panel gets sun and is not blocked' }) }}</span>
        </span>
      </section>
    }

    @if (s.showPushBanner()) {
      <!-- H03-b -->
      <section class="alert pink" role="status">
        <h2>{{ i18n.t({ th: 'ยังไม่ได้เปิดการแจ้งเตือน', en: 'Notifications are off' }) }}</h2>
        <p class="small">{{ i18n.t({ th: 'เปิดไว้เพื่อรู้ทันทีเมื่อมีเจ้าหน้าที่มาตรวจหรือมีของมาส่ง', en: 'Turn them on to know right away when an officer checks or a parcel arrives' }) }}</p>
        <button type="button" class="btn" (click)="s.pushOn.set(true)">{{ i18n.t({ th: 'เปิดแจ้งเตือน', en: 'Turn on notifications' }) }}</button>
      </section>
    }

    @if (s.noOfficer()) {
      <section class="alert yellow" role="status">
        <h2>{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่ดูแลบ้านนี้', en: 'No officer covers this house yet' }) }}</h2>
        <p class="small">{{ i18n.t({ th: 'รอหัวหน้าหน่วยงานเพิ่มบ้านเข้าโซน ระหว่างนี้กด SOS ระบบจะให้โทร 191 / 1669', en: 'Waiting for an agency to add your house to a zone. Until then, SOS will ask you to call 191 / 1669' }) }}</p>
      </section>
    }
  `,
  styles: `
    :host {
      display: contents;
    }
    .alert {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: 16px;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      h2 {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 1.0625rem;
      }
      &.orange {
        border: 2px solid var(--orange-line);
        h2 { color: var(--orange); }
      }
      &.red {
        border: 2px solid var(--brand);
      }
      &.pink {
        background: var(--danger-bg);
        h2 { color: var(--sos); }
      }
      &.yellow {
        background: var(--warn-bg);
        h2 { color: var(--warn); }
      }
    }
    .row-alert {
      flex-direction: row;
      align-items: flex-start;
      gap: 12px;
      color: var(--orange);
      strong { color: var(--orange); }
    }
    .checklist {
      background: var(--bg);
      border-radius: var(--radius-sm);
      padding: 10px 12px;
      font-size: 0.875rem;
      ol { margin: 4px 0 0; padding-left: 20px; }
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .dark {
      background: #111827;
    }
    .chips-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .block {
      display: block;
    }
  `,
})
export class OwnerHomeAlerts {
  protected readonly i18n = inject(I18n);
  protected readonly s = inject(OwnerHomeState);
  protected readonly url = screenUrl;
}
