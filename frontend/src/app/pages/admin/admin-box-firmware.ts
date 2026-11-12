import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal, type OnInit } from '@angular/core';
import { apiError } from '../../core/api';
import { AdminApi, type AdminBoxDetail, type FirmwareInfo } from '../../core/admin-api';
import { I18n } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { Confirm } from '../../shared/confirm-dialog';
import { EmptyState } from '../../shared/state-view';

/**
 * D04 แท็บ "เฟิร์มแวร์" ของตู้ (แยกจาก admin-box.ts) — รายการไฟล์ · อัปเดตตู้นี้ · อัปเดตอัตโนมัติทุกตู้ · อัปโหลด
 * state ของแท็บนี้อยู่ในตัวเอง · เมื่อสั่งอัปเดตตู้แล้วแจ้ง `changed` ให้หน้าแม่โหลดข้อมูลตู้ใหม่
 */
@Component({
  selector: 'app-admin-box-firmware',
  imports: [EmptyState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let b = box();
        <h2 class="section-title">{{ i18n.t({ th: 'อัปเดตเฟิร์มแวร์', en: 'Firmware update' }) }}</h2>
        <section class="card stack">
          <div class="fw-now">
            <span class="muted">{{ i18n.t({ th: 'ตู้รันเวอร์ชัน', en: 'Box is running' }) }}</span>
            <strong class="fw-ver">{{ b.fw ?? '—' }}</strong>
          </div>
          @if (b.fw_target && b.fw_stuck) {
            <div class="info-box" role="alert">
              <strong class="warn-text">{{ i18n.t({ th: 'ตู้โหลดไฟล์ ' + b.fw_target + ' ไปแล้ว แต่ยังรายงานเป็น ' + (b.fw ?? '—'), en: 'The box downloaded ' + b.fw_target + ' but still reports ' + (b.fw ?? '—') }) }}</strong>
              <p class="small">{{ i18n.t({ th: 'มักเกิดจากชื่อเวอร์ชันที่ตั้งตอนอัปโหลดไม่ตรงกับเลขที่ฝังในไฟล์ (FW_VERSION) หรือบอร์ดลงไฟล์ไม่สำเร็จ · ให้อัปโหลดไฟล์ด้วยชื่อที่ตรงกับเลขในไฟล์ แล้วกดอัปเดตใหม่ หรือกด "ลองอีกครั้ง" เพื่อให้ตู้โหลดอีกครั้ง', en: 'Usually the version name given at upload differs from the number built into the file (FW_VERSION), or the board could not install it · upload the file under the matching name and update again, or press "Retry" to let the box download once more' }) }}</p>
              <button type="button" class="btn secondary fw-act" (click)="setTarget(b.fw_target)">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
            </div>
          }
          @if (b.fw_target) {
            <div class="fw-pending">
              <span>{{ i18n.t({ th: 'รอตู้อัปเดตเป็น', en: 'Waiting for the box to update to' }) }} <strong>{{ b.fw_target }}</strong></span>
              <button type="button" class="btn secondary fw-act" (click)="setTarget(null)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
            </div>
          }
        </section>

        <section class="card stack fw-auto">
          <strong>{{ i18n.t({ th: 'อัปเดตอัตโนมัติทุกตู้', en: 'Automatic update for every box' }) }}</strong>
          @if (fwAuto(); as v) {
            <p class="row">
              <span class="chip ok">{{ i18n.t({ th: 'เปิดอยู่', en: 'On' }) }}</span>
              <span>{{ i18n.t({ th: 'ตู้ที่ออนไลน์จะอัปเดตเป็น ', en: 'Online boxes update to ' }) }}<strong>{{ v }}</strong></span>
            </p>
            <button type="button" class="btn secondary fw-act" [disabled]="fwAutoBusy()" (click)="setAuto(null)">{{ i18n.t({ th: 'ปิดอัตโนมัติ', en: 'Turn off' }) }}</button>
          } @else {
            <p class="muted small">{{ i18n.t({ th: 'ปิดอยู่ · ตู้อัปเดตเมื่อแอดมินกดเท่านั้น', en: 'Off · boxes update only when an admin taps' }) }}</p>
          }
          @if (firmware()[0]; as latest) {
            @if (fwAuto() !== latest.version) {
              <button type="button" class="btn fw-act" [disabled]="fwAutoBusy()" (click)="setAuto(latest.version)">
                {{ i18n.t({ th: 'บังคับทุกตู้ใช้ล่าสุด (' + latest.version + ')', en: 'Make every box use the latest (' + latest.version + ')' }) }}
              </button>
            }
          }
          <p class="muted small">{{ i18n.t({ th: 'ตู้จะโหลดเองเมื่อออนไลน์ · รอถ้ามีงานตรวจค้างอยู่ · ตู้ที่โหลดแล้วยังติดเวอร์ชันเดิมจะขึ้น "อัปเดตค้าง" ไม่วนซ้ำ · ถ้าไฟล์เสียจะกระทบทุกตู้ ทดสอบกับตู้เดียวก่อนเสมอ', en: 'Boxes download it when online · they wait if an inspection is open · a box that downloaded it but still runs the old version is flagged "update stuck", not retried in a loop · a bad file affects every box — test on one box first' }) }}</p>
        </section>

        <div class="list">
          @for (f of firmware(); track f.version) {
            <div class="row">
              <span class="grow">
                <strong>{{ f.version }}</strong>
                <span class="muted small block">{{ (f.size / 1024).toFixed(0) }} KB · {{ fwDate(f.uploaded_at) }}</span>
              </span>
              @if (f.version === b.fw) {
                <span class="chip ok">{{ i18n.t({ th: 'ตู้รันอยู่', en: 'Running' }) }}</span>
              } @else if (f.version === b.fw_target) {
                <span class="chip warn">{{ i18n.t({ th: 'รอตู้อัปเดต', en: 'Pending' }) }}</span>
              } @else {
                <button type="button" class="btn fw-act" (click)="setTarget(f.version)">{{ i18n.t({ th: 'อัปเดตตู้นี้', en: 'Update box' }) }}</button>
                <button type="button" class="btn secondary fw-act" [attr.aria-label]="i18n.t({ th: 'ลบ ', en: 'Delete ' }) + f.version" (click)="removeFirmware(f.version)">
                  {{ i18n.t({ th: 'ลบ', en: 'Delete' }) }}
                </button>
              }
            </div>
          } @empty {
            @if (fwLoadError(); as err) {
              <app-empty-state kind="error" compact [hint]="i18n.t({ th: 'โหลดรายการเฟิร์มแวร์ไม่สำเร็จ (' + err + ') — ไม่ใช่ว่ายังไม่มีไฟล์', en: 'Could not load the firmware list (' + err + ') — this does not mean there are no files' })" (retry)="reloadFirmware()" />
            } @else {
              <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มีเฟิร์มแวร์ที่อัปโหลดไว้', en: 'No firmware uploaded yet' })" />
            }
          }
        </div>

        <section class="card stack">
          <strong>{{ i18n.t({ th: 'อัปโหลดเวอร์ชันใหม่', en: 'Upload a new version' }) }}</strong>
          <label class="field">
            <span>{{ i18n.t({ th: 'ชื่อเวอร์ชัน', en: 'Version name' }) }}</span>
            <input type="text" maxlength="32" [placeholder]="fwSuggest()" [value]="fwVersion()" (input)="fwVersion.set($any($event.target).value)" />
            <small>{{ i18n.t({ th: 'ต้องตรงกับ FW_VERSION ในไฟล์ที่คอมไพล์ (เว้นว่าง = ใช้ที่แนะนำ)', en: 'Must match FW_VERSION compiled into the file (empty = use the suggestion)' }) }}</small>
          </label>
          <label class="fw-drop" [class.has-file]="fwFile()">
            <input type="file" accept=".bin" (change)="fwFile.set($any($event.target).files?.[0] ?? null)" />
            <span>{{ fwFile() ? fwFile()!.name + ' · ' + (fwFile()!.size / 1024).toFixed(0) + ' KB' : i18n.t({ th: 'แตะเพื่อเลือกไฟล์ firmware.bin', en: 'Tap to choose firmware.bin' }) }}</span>
          </label>
          <button type="button" class="btn" [disabled]="uploadingFw() || !fwFile() || !(fwVersion().trim() || fwSuggest())" (click)="uploadFirmware()">
            {{ uploadingFw() ? i18n.t({ th: 'กำลังอัปโหลด…', en: 'Uploading…' }) : i18n.t({ th: 'อัปโหลด', en: 'Upload' }) }}
          </button>
        </section>


  `,
  styles: `
    .fw-now {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .fw-ver {
      font-size: 1.5rem;
    }
    .fw-auto .row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .fw-pending {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 12px;
      border-radius: var(--radius-sm);
      background: var(--warn-bg);
      color: var(--warn);
    }
    .btn.fw-act {
      inline-size: auto;
      min-block-size: 44px;
      padding: 6px 14px;
      font-size: 0.9375rem;
      flex: none;
    }
    .fw-drop {
      display: flex;
      align-items: center;
      justify-content: center;
      min-block-size: 64px;
      padding: 12px;
      border: 2px dashed color-mix(in srgb, var(--text-muted) 55%, transparent);
      border-radius: var(--radius-sm);
      color: var(--text-muted);
      text-align: center;
      cursor: pointer;
      word-break: break-all;
    }
    .fw-drop.has-file {
      border-style: solid;
      border-color: var(--ok);
      color: var(--text);
    }
    .fw-drop input {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      opacity: 0;
    }
    .fw-drop:focus-within {
      outline: 2px solid var(--brand);
      outline-offset: 1px;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
  `,
})
export class AdminBoxFirmware implements OnInit {
  readonly box = input.required<AdminBoxDetail>();
  /** สั่งอัปเดต/ยกเลิกแล้ว — หน้าแม่ควรโหลดตู้ใหม่ */
  readonly changed = output<void>();
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);

  protected readonly firmware = signal<FirmwareInfo[]>([]);
  /** เวอร์ชันที่ตั้งให้ทุกตู้อัปเดตอัตโนมัติ (null = ปิด) */
  protected readonly fwAuto = signal<string | null>(null);
  protected readonly fwAutoBusy = signal(false);
  protected readonly fwVersion = signal('');
  protected readonly fwFile = signal<File | null>(null);
  protected readonly uploadingFw = signal(false);
  /** โหลดรายการไม่ได้ (รหัสสถานะ) — แยกจาก "ยังไม่มีไฟล์" */
  protected readonly fwLoadError = signal<string | null>(null);
  /** ชื่อเวอร์ชันที่แนะนำ = เลขท้ายของเวอร์ชันล่าสุด + 1 (x.y.z → x.y.z+1) */
  protected readonly fwSuggest = computed(() => {
    const m = /^(.*?)(\d+)$/.exec(this.firmware()[0]?.version ?? '');
    return m ? `${m[1]}${Number(m[2]) + 1}` : '';
  });

  protected reloadFirmware(): void {
    void this.loadFirmware();
  }

  private async loadFirmware(): Promise<void> {
    try {
      this.firmware.set(await this.api.firmwareList());
      this.fwLoadError.set(null);
      void this.api.firmwareAuto().then((r) => this.fwAuto.set(r.version)).catch(() => undefined); // ไม่ให้กระทบรายการเวอร์ชัน
    } catch (e) {
      // ไม่กระทบหน้าอื่น แต่ต้องบอกว่าโหลดไม่ได้ ไม่ใช่ปล่อยให้ดูเหมือนยังไม่มีไฟล์
      const a = apiError(e);
      this.fwLoadError.set(a.code ?? (a.status ? `HTTP ${a.status}` : 'network'));
    }
  }


  protected async uploadFirmware(): Promise<void> {
    const file = this.fwFile();
    const version = this.fwVersion().trim() || this.fwSuggest();
    if (!file || !version || this.uploadingFw()) return;
    this.uploadingFw.set(true);
    try {
      await this.api.uploadFirmware(version, file);
      this.fwFile.set(null);
      this.fwVersion.set('');
      await this.loadFirmware();
      this.toast.show({ th: 'อัปโหลดแล้ว', en: 'Uploaded' });
    } catch (e) {
      const a = apiError(e);
      const why = a.code ?? (a.status ? `HTTP ${a.status}` : 'network');
      this.toast.show(
        a.status === 409
          ? { th: 'มีเวอร์ชันนี้แล้ว · ใช้ชื่อเวอร์ชันใหม่', en: 'That version already exists · use a new version name' }
          : a.status === 413
            ? { th: 'ไฟล์ใหญ่เกินที่เซิร์ฟเวอร์รับ (413) — ตัวกลาง (nginx/gateway) จำกัดขนาด แจ้งผู้ดูแลเซิร์ฟเวอร์', en: 'The file is larger than the server accepts (413) — a proxy limits the size; tell the server admin' }
            : a.status === 0
              ? { th: 'ส่งไฟล์ไม่ถึงเซิร์ฟเวอร์ (เครือข่าย/ตัวกลางตัดการเชื่อมต่อ)', en: 'The file never reached the server (network or a proxy cut it off)' }
              : { th: `อัปโหลดไม่สำเร็จ (${why}) · ต้องเป็นไฟล์ firmware.bin ของ ESP32 ไม่เกิน 1.9 MB และชื่อเวอร์ชันไม่มีช่องว่าง`, en: `Upload failed (${why}) · it must be an ESP32 firmware.bin up to 1.9 MB, and the version name must have no spaces` },
      );
    } finally {
      this.uploadingFw.set(false);
    }
  }


  protected async removeFirmware(version: string): Promise<void> {
    const ok = await this.confirm.ask({
      title: { th: `ลบไฟล์เฟิร์มแวร์ ${version} ใช่ไหม?`, en: `Delete firmware ${version}?` },
      body: {
        th: 'ตู้ที่รันเวอร์ชันนี้อยู่ไม่กระทบ แต่จะสั่งอัปเดตเป็นเวอร์ชันนี้อีกไม่ได้จนกว่าจะอัปโหลดใหม่',
        en: 'Boxes already running it are not affected, but it can’t be sent again until uploaded again.',
      },
      confirm: { th: 'ลบไฟล์นี้', en: 'Delete it' },
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.deleteFirmware(version);
      await this.loadFirmware();
      this.toast.show({ th: 'ลบแล้ว', en: 'Deleted' });
    } catch {
      this.toast.show({ th: 'ลบไม่สำเร็จ · อาจมีตู้รอโหลดเวอร์ชันนี้อยู่ ให้ยกเลิกงานอัปเดตของตู้นั้นก่อน', en: 'Could not delete · a box may be waiting for it — cancel that update first' });
    }
  }

  protected async setAuto(version: string | null): Promise<void> {
    if (this.fwAutoBusy()) return;
    if (
      version &&
      !(await this.confirm.ask({
        title: { th: `ให้ตู้ทุกใบที่ออนไลน์อัปเดตเป็น ${version} ใช่ไหม?`, en: `Make every online box update to ${version}?` },
        body: {
          th: 'ถ้าไฟล์มีปัญหาจะกระทบทุกตู้ ควรทดสอบกับตู้เดียวก่อน',
          en: 'A bad file affects every box — test on one box first.',
        },
        confirm: { th: 'เปิดอัปเดตอัตโนมัติ', en: 'Turn on auto-update' },
      }))
    )
      return;
    this.fwAutoBusy.set(true);
    try {
      this.fwAuto.set((await this.api.setFirmwareAuto(version)).version);
      this.toast.show(version
        ? { th: `เปิดอัปเดตอัตโนมัติเป็น ${version} แล้ว`, en: `Automatic update to ${version} is on` }
        : { th: 'ปิดอัปเดตอัตโนมัติแล้ว', en: 'Automatic update is off' });
    } catch {
      this.toast.show({ th: 'ตั้งไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not change the setting — check your connection and try again' });
    } finally {
      this.fwAutoBusy.set(false);
    }
  }

  protected async setTarget(version: string | null): Promise<void> {
    const id = this.box().id;
    if (!id) return;
    try {
      await this.api.setFirmwareTarget(id, version);
      this.changed.emit();
      this.toast.show(version
        ? { th: `สั่ง ${id} อัปเดตเป็น ${version} แล้ว`, en: `${id} will update to ${version}` }
        : { th: 'ยกเลิกการอัปเดตแล้ว', en: 'Update cancelled' });
    } catch {
      this.toast.show({ th: 'สั่งไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not send the update — check your connection and try again' });
    }
  }


  protected fwDate(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  }

  ngOnInit(): void {
    void this.loadFirmware();
  }
}
