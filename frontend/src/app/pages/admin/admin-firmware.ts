import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AdminApi, type AdminBoxRow, type FirmwareInfo } from '../../core/admin-api';
import { apiError } from '../../core/api';
import { I18n } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { Confirm } from '../../shared/confirm-dialog';
import { screenUrl } from '../../screens/registry';
import { PageHeader } from '../../shared/page-header';
import { Icon } from '../../shared/icon';

const kb = (n: number) => (n >= 1_048_576 ? (n / 1_048_576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');

/** D17 เฟิร์มแวร์ (ตามแคนวาสดีไซน์) — ใช้ API เดิม: รายการ/อัปโหลด/ลบ/อัปเดตอัตโนมัติ (`/admin/firmware*`) */
@Component({
  selector: 'app-admin-firmware',
  imports: [PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="i18n.t({ th: 'แอดมิน', en: 'Admin' })" [title]="i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' })" [back]="url('D16')" />
    <div class="stack grow">
      <section class="card stack easy-hide">
        <strong>{{ i18n.t({ th: 'อัปเดตอัตโนมัติ', en: 'Automatic update' }) }}</strong>
        @if (auto(); as v) {
          <p>{{ i18n.t({ th: 'ตู้ทุกใบจะอัปเดตเป็นรุ่น ', en: 'Every box updates to ' }) }}<span class="mono">{{ v }}</span>{{ i18n.t({ th: ' เองเมื่อกลับมาออนไลน์', en: ' when it comes online' }) }}</p>
          <button type="button" class="btn secondary" [disabled]="busy()" (click)="setAuto(null)">{{ i18n.t({ th: 'ปิดอัปเดตอัตโนมัติ', en: 'Turn off' }) }}</button>
        } @else {
          <p class="muted">{{ i18n.t({ th: 'ปิดอยู่ — เลือกรุ่นด้านล่างเพื่อให้ตู้ทุกใบอัปเดตเอง', en: 'Off — pick a version below to update every box' }) }}</p>
        }
      </section>

      <!-- โหมดง่าย (AdmFirmware_E): ตู้ที่ใช้รุ่นล่าสุด + สถานะอัปเดตอัตโนมัติ -->
      <section class="card easy-only easy-fw" [attr.aria-label]="i18n.t({ th: 'ตู้ที่ใช้เฟิร์มแวร์ล่าสุด', en: 'Boxes on the latest firmware' })">
        <span class="muted">{{ i18n.t({ th: 'ตู้ที่ใช้รุ่นล่าสุด', en: 'Boxes on the latest version' }) }}</span>
        <strong class="easy-n">{{ applied() }}<small> / {{ boxesTotal() }}</small></strong>
        <span class="fbar" aria-hidden="true"><i [style.width.%]="appliedPct()"></i></span>
        <span class="muted small">{{ i18n.t({ th: 'เหลือ ', en: 'Waiting: ' }) }}{{ boxesTotal() - applied() }} {{ i18n.t({ th: 'ตู้ · ตู้จะอัปเดตเองเมื่อออนไลน์', en: 'boxes · they update when online' }) }}</span>
      </section>
      <section class="card easy-only">
        <strong>{{ i18n.t({ th: 'รุ่นล่าสุด ', en: 'Latest ' }) }}<span class="mono">{{ latest() || '—' }}</span></strong>
        <span>{{ i18n.t({ th: 'อัปเดตอัตโนมัติ: ', en: 'Auto update: ' }) }}{{ auto() ? i18n.t({ th: 'เปิดอยู่', en: 'On' }) : i18n.t({ th: 'ปิด', en: 'Off' }) }}</span>
      </section>

      <h2 class="section-title easy-hide">{{ i18n.t({ th: 'ไฟล์บนเซิร์ฟเวอร์', en: 'Files on the server' }) }}</h2>
      <ul class="list easy-hide">
        @for (f of list(); track f.version) {
          <li class="row">
            <span class="grow">
              <strong class="mono">{{ f.version }}</strong>
              @if (f.version === auto()) {
                <span class="chip ok">{{ i18n.t({ th: 'ใช้อยู่', en: 'In use' }) }}</span>
              }
              <span class="muted small block">{{ date(f.uploaded_at) }} · {{ size(f.size) }}</span>
            </span>
            @if (f.version !== auto()) {
              <button type="button" class="btn secondary pick" [disabled]="busy()" (click)="setAuto(f.version)">{{ i18n.t({ th: 'ใช้รุ่นนี้', en: 'Use' }) }}</button>
            }
          </li>
        } @empty {
          <li class="row muted">{{ loading() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'ยังไม่มีไฟล์', en: 'No files yet' }) }}</li>
        }
      </ul>

      <!-- โหมดละเอียด (AdmFirmware_A): เวอร์ชันตามตู้จริง + ตู้ค้างรุ่นเก่า -->
      <section class="card adv-only stack">
        <strong>{{ i18n.t({ th: 'เวอร์ชันที่ตู้รายงาน', en: 'Versions reported by boxes' }) }}</strong>
        <dl class="kv small">
          @for (g of versionGroups(); track g.version) {
            <dt>{{ g.version }}</dt><dd>{{ g.n }} {{ i18n.t({ th: 'ตู้', en: 'boxes' }) }}</dd>
          } @empty {
            <dt>—</dt><dd>—</dd>
          }
          <dt>{{ i18n.t({ th: 'อัปเดตอัตโนมัติ', en: 'Auto update' }) }}</dt><dd>{{ auto() ?? i18n.t({ th: 'ปิด', en: 'Off' }) }}</dd>
          <dt>{{ i18n.t({ th: 'รุ่นล่าสุด', en: 'Latest version' }) }}</dt><dd>{{ latest() || '—' }}</dd>
        </dl>
        <p class="muted small">{{ i18n.t({ th: 'ตู้ที่ยังใช้รุ่นเก่า: ', en: 'Boxes on an older version: ' }) }}<span>{{ staleBoxes().join(', ') || '—' }}</span></p>
      </section>

      <section class="card stack easy-hide">
        <strong>{{ i18n.t({ th: 'อัปโหลดรุ่นใหม่', en: 'Upload a new version' }) }}</strong>
        <label class="field">
          <span>{{ i18n.t({ th: 'ชื่อรุ่น (ต้องตรงกับในไฟล์)', en: 'Version (must match the file)' }) }}</span>
          <input maxlength="32" [value]="version()" (input)="version.set($any($event.target).value)" />
        </label>
        <label class="file-pick">
          <input type="file" accept=".bin" (change)="file.set($any($event.target).files?.[0] ?? null)" />
          <span class="btn secondary small-btn"><app-icon name="plus" [size]="16" />{{ i18n.t({ th: 'เลือกไฟล์ .bin', en: 'Choose a .bin file' }) }}</span>
          <span class="muted small">{{ file()?.name ?? i18n.t({ th: 'ยังไม่ได้เลือกไฟล์', en: 'No file selected' }) }}</span>
        </label>
        <button type="button" class="btn" [disabled]="busy() || !file() || !version().trim()" (click)="upload()">{{ i18n.t({ th: 'อัปโหลด', en: 'Upload' }) }}</button>
      </section>
      <p class="muted small easy-hide">{{ i18n.t({ th: 'ตู้ตรวจไฟล์ก่อนติดตั้ง และย้อนกลับรุ่นเดิมเองถ้าอัปเดตไม่สำเร็จ', en: 'Boxes verify the file first and roll back by themselves if an update fails' }) }}</p>
    </div>
  `,
  styles: `
    .file-pick {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      min-inline-size: 0;
    }
    .file-pick input {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
    }
    .file-pick:focus-within .btn {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }
    .file-pick .muted {
      overflow-wrap: anywhere;
    }
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
    .easy-fw {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 24px 20px;
      text-align: center;
    }
    .easy-n {
      font-size: 3rem;
      font-weight: 800;
      line-height: 1;
      color: var(--brand-text);
      font-variant-numeric: tabular-nums;
    }
    .easy-n small {
      font-size: 1.125rem;
      font-weight: 600;
      color: var(--text-muted);
    }
    .fbar {
      display: block;
      block-size: 14px;
      border-radius: 7px;
      background: var(--icon-bg);
      overflow: hidden;
    }
    .fbar i {
      display: block;
      block-size: 100%;
      background: var(--ok);
    }
  `,
})
export class AdminFirmware {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);
  protected readonly url = screenUrl;
  protected readonly list = signal<FirmwareInfo[]>([]);
  protected readonly boxes = signal<AdminBoxRow[]>([]);
  protected readonly auto = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly version = signal('');
  protected readonly file = signal<File | null>(null);
  protected readonly size = kb;
  protected readonly latest = computed(() => this.list()[0]?.version ?? '');
  protected readonly boxesTotal = computed(() => this.boxes().length);
  protected readonly applied = computed(() => {
    const latest = this.latest();
    return latest ? this.boxes().filter((b) => b.fw === latest).length : 0;
  });
  protected readonly appliedPct = computed(() => (this.boxesTotal() ? (this.applied() / this.boxesTotal()) * 100 : 0));
  protected readonly staleBoxes = computed(() => {
    const latest = this.latest();
    return latest ? this.boxes().filter((b) => b.fw !== latest).map((b) => b.id) : [];
  });
  protected readonly versionGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const b of this.boxes()) {
      const v = b.fw ?? '—';
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([version, n]) => ({ version, n }));
  });

  constructor() {
    void this.load();
  }

  protected date(iso: string): string {
    return new Date(iso).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
  }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [list, auto, boxes] = await Promise.all([
        this.api.firmwareList(),
        this.api.firmwareAuto(),
        this.allBoxes().catch(() => [] as AdminBoxRow[]),
      ]);
      this.list.set(list);
      this.auto.set(auto.version);
      this.boxes.set(boxes);
    } catch {
      this.toast.show({ th: 'โหลดข้อมูลเฟิร์มแวร์ไม่สำเร็จ', en: 'Could not load firmware' });
    } finally {
      this.loading.set(false);
    }
  }

  /** โหลดตู้ทั้งหมด (API แบ่งหน้า 100) — ตัวเลข “ใช้รุ่นล่าสุด” ต้องไม่นับแค่ 100 ใบแรก */
  private async allBoxes(): Promise<AdminBoxRow[]> {
    const out: AdminBoxRow[] = [];
    for (let page = 1; page <= 50; page += 1) {
      const r = await this.api.boxes('', page);
      out.push(...r.data);
      if (r.data.length < r.per_page || out.length >= r.total) break;
    }
    return out;
  }

  protected async setAuto(version: string | null): Promise<void> {
    if (version) {
      const ok = await this.confirm.ask({
        title: { th: 'ให้ตู้ทุกใบอัปเดตเป็นรุ่นนี้?', en: 'Update every box to this version?' },
        body: {
          th: `ตู้ทุกใบในระบบจะอัปเดตเป็น ${version} เมื่อกลับมาออนไลน์ — ถ้าไฟล์มีปัญหา ตู้จะได้รับผลทั้งหมด`,
          en: `Every box in the system will update to ${version} when it comes online — a bad file affects all of them.`,
        },
        confirm: { th: 'ใช้รุ่นนี้กับทุกตู้', en: 'Use for all boxes' },
        danger: true,
      });
      if (!ok) return;
    }
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
