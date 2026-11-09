import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminApi, type FirmwareInfo } from '../../core/admin-api';
import { apiError } from '../../core/api';
import { I18n } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';

const kb = (n: number) => (n >= 1_048_576 ? (n / 1_048_576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** D17 เฟิร์มแวร์ (ตามแคนวาสดีไซน์) — ใช้ API เดิม: รายการ/อัปโหลด/ลบ/อัปเดตอัตโนมัติ (`/admin/firmware*`) */
@Component({
  selector: 'app-admin-firmware',
  imports: [PageHeader],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' })" [back]="url('D16')" />
    <div class="stack grow">
      <section class="card stack">
        <strong>{{ i18n.t({ th: 'อัปเดตอัตโนมัติ', en: 'Automatic update' }) }}</strong>
        @if (auto(); as v) {
          <p>{{ i18n.t({ th: 'ตู้ทุกใบจะอัปเดตเป็นรุ่น ', en: 'Every box updates to ' }) }}<span class="mono">{{ v }}</span>{{ i18n.t({ th: ' เองเมื่อกลับมาออนไลน์', en: ' when it comes online' }) }}</p>
          <button type="button" class="btn secondary" [disabled]="busy()" (click)="setAuto(null)">{{ i18n.t({ th: 'ปิดอัปเดตอัตโนมัติ', en: 'Turn off' }) }}</button>
        } @else {
          <p class="muted">{{ i18n.t({ th: 'ปิดอยู่ — เลือกรุ่นด้านล่างเพื่อให้ตู้ทุกใบอัปเดตเอง', en: 'Off — pick a version below to update every box' }) }}</p>
        }
      </section>

      <h2 class="section-title">{{ i18n.t({ th: 'ไฟล์บนเซิร์ฟเวอร์', en: 'Files on the server' }) }}</h2>
      <ul class="list">
        @for (f of list(); track f.version) {
          <li class="row">
            <span class="grow">
              <strong class="mono">{{ f.version }}</strong>
              @if (f.version === auto()) {
                <span class="chip ok">{{ i18n.t({ th: 'ใช้อยู่', en: 'In use' }) }}</span>
              }
              <span class="muted small block">{{ date(f.uploaded_at) }} · {{ size(f.size) }}</span>
              <span class="muted small block mono adv-only">{{ f.sha256.slice(0, 12) }}…</span>
            </span>
            @if (f.version !== auto()) {
              <button type="button" class="btn secondary pick" [disabled]="busy()" (click)="setAuto(f.version)">{{ i18n.t({ th: 'ใช้รุ่นนี้', en: 'Use' }) }}</button>
            }
          </li>
        } @empty {
          <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีไฟล์', en: 'No files yet' }) }}</li>
        }
      </ul>

      <section class="card stack easy-hide">
        <strong>{{ i18n.t({ th: 'อัปโหลดรุ่นใหม่', en: 'Upload a new version' }) }}</strong>
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อรุ่น (ต้องตรงกับในไฟล์)', en: 'Version (must match the file)' }) }}</span>
          <input maxlength="32" [value]="version()" (input)="version.set($any($event.target).value)" />
        </label>
        <input type="file" accept=".bin" (change)="file.set($any($event.target).files?.[0] ?? null)" />
        <button type="button" class="btn" [disabled]="busy() || !file() || !version().trim()" (click)="upload()">{{ i18n.t({ th: 'อัปโหลด', en: 'Upload' }) }}</button>
      </section>
      <p class="muted small">{{ i18n.t({ th: 'ตู้ตรวจไฟล์ก่อนติดตั้ง และย้อนกลับรุ่นเดิมเองถ้าอัปเดตไม่สำเร็จ', en: 'Boxes verify the file first and roll back by themselves if an update fails' }) }}</p>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .pick {
      inline-size: auto;
      min-block-size: 40px;
      padding: 6px 14px;
    }
  `,
})
export class AdminFirmware {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly list = signal<FirmwareInfo[]>([]);
  protected readonly auto = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly version = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly size = kb;
  protected readonly latest = computed(() => this.list()[0]?.version ?? '');

  constructor() {
    void this.load();
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.list.set(await this.api.firmwareList());
      this.auto.set((await this.api.firmwareAuto()).version);
    } catch {
      this.toast.show({ th: 'โหลดข้อมูลเฟิร์มแวร์ไม่สำเร็จ', en: 'Could not load firmware' });
    } finally {
      this.loading.set(false);
    }
  }

  protected async setAuto(version: string | null): Promise<void> {
    this.busy.set(true);
    try {
      this.auto.set((await this.api.setFirmwareAuto(version)).version);
    } catch (err) {
      this.toast.show({ th: 'ตั้งค่าไม่สำเร็จ (' + (apiError(err).code ?? 'ERROR') + ')', en: 'Could not save (' + (apiError(err).code ?? 'ERROR') + ')' });
    } finally {
      this.busy.set(false);
    }
  }

  protected async upload(): Promise<void> {
    const f = this.file();
    if (!f) return;
    this.busy.set(true);
    try {
      await this.api.uploadFirmware(this.version().trim(), f);
      this.version.set('');
      this.file.set(null);
      await this.load();
      this.toast.show({ th: 'อัปโหลดแล้ว', en: 'Uploaded' });
    } catch (err) {
      this.toast.show({ th: 'อัปโหลดไม่สำเร็จ (' + (apiError(err).code ?? 'ERROR') + ')', en: 'Upload failed (' + (apiError(err).code ?? 'ERROR') + ')' });
    } finally {
      this.busy.set(false);
    }
  }
}
