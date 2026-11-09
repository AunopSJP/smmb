import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AdminApi, type AdminAgency, type AdminBoxRow, type AdminOverview, type FirmwareInfo } from '../core/admin-api';
import { I18n, type Tr } from '../core/i18n';
import { Session } from '../core/session';
import { Toast } from '../core/toast';
import { LOW_BATTERY_PCT, seenText } from './admin/admin-boxes';
import { screenUrl } from '../screens/registry';
import { Icon, type IconName } from '../shared/icon';
import { PageHeader } from '../shared/page-header';

type Tone = 'danger' | 'warn' | '';

interface Segment {
  key: string;
  label: Tr;
  n: number;
  tone: string;
  query: Record<string, string> | null;
}

/** D01 ภาพรวมแอดมิน — ตัวเลขสรุปก่อน → สถานะรวม → รายการที่ต้องลงมือทำ (ทุกอย่างกดไปจัดการต่อได้) */
@Component({
  selector: 'app-admin-home',
  imports: [RouterLink, PageHeader, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="i18n.t({ th: 'ผู้ดูแลระบบ', en: 'System admin' })"
      [title]="i18n.t({ th: 'ภาพรวมระบบ', en: 'System overview' })"
      [bell]="url('D12')"
    />

    <div class="stack page">
      <div class="asof easy-hide">
        <span class="muted small">{{ i18n.t({ th: 'ข้อมูล ณ ', en: 'As of ' }) }}{{ asOf() }}</span>
        <button type="button" class="btn secondary small-btn" [disabled]="refreshing()" (click)="refresh()">{{ refreshing() ? i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) : i18n.t({ th: 'รีเฟรช', en: 'Refresh' }) }}</button>
      </div>

      <!-- โหมดง่าย: สรุปสั้น + 3 ตัวเลขสำคัญ + 2 ปุ่มหลัก (ตาม AdmEasy) -->
      <section class="easy-hero easy-only" role="status">
        <strong>{{ i18n.t(easyTitle()) }}</strong>
        <span>{{ i18n.t({ th: 'ออนไลน์ ', en: 'Online ' }) }}{{ online() }} {{ i18n.t({ th: 'จาก ', en: 'of ' }) }}{{ totalBoxes() }} {{ i18n.t({ th: 'ตู้', en: 'boxes' }) }}</span>
      </section>
      <section class="easy-kpis easy-only" [attr.aria-label]="i18n.t({ th: 'ตัวเลขสำคัญ', en: 'Key numbers' })">
        <a class="easy-kpi" [routerLink]="url('D03')" [queryParams]="{ filter: 'offline' }">
          <span class="easy-n" [class.danger]="offline() > 0">{{ offline() }}</span>
          <span class="easy-l">{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Offline' }) }}</span>
        </a>
        <a class="easy-kpi" [routerLink]="url('D05')">
          <span class="easy-n" [class.warn]="qrTotal() > 0">{{ qrTotal() }}</span>
          <span class="easy-l">{{ i18n.t({ th: 'QR ต้องจัดการ', en: 'QR to fix' }) }}</span>
        </a>
        <a class="easy-kpi" [routerLink]="url('D02')">
          <span class="easy-n" [class.warn]="pendingCount() > 0">{{ pendingCount() }}</span>
          <span class="easy-l">{{ i18n.t({ th: 'หน่วยงานรออนุมัติ', en: 'Agencies waiting' }) }}</span>
        </a>
      </section>
      <div class="easy-actions easy-only">
        <a class="btn big" [routerLink]="url('D03')">{{ i18n.t({ th: 'ลงทะเบียนตู้ใหม่', en: 'Register a new mailbox' }) }}</a>
        <a class="btn secondary big" [routerLink]="url('D03')" [queryParams]="{ filter: 'offline' }">{{ i18n.t({ th: 'ดูตู้ที่ต้องดู', en: 'Open boxes to check' }) }} ({{ atRisk() }})</a>
      </div>

      <!-- 1) ตัวเลขสรุป -->
      <section class="kpis easy-hide" [attr.aria-label]="i18n.t({ th: 'ตัวเลขสรุป', en: 'Key numbers' })">
        @for (k of kpis(); track k.key) {
          <a class="kpi" [class.desk-only]="k.key === 'low' || k.key === 'sos' || k.key === 'requests'" [routerLink]="k.path" [queryParams]="k.query">
            <span class="kpi-label">{{ i18n.t(k.label) }}</span>
            <span class="kpi-value" [class.danger]="k.tone === 'danger' && k.n > 0" [class.warn]="k.tone === 'warn' && k.n > 0" [class.zero]="k.tone !== '' && k.n === 0">{{ k.text }}</span>
            <span class="kpi-hint">{{ i18n.t(k.hint) }}</span>
          </a>
        }
      </section>

      <!-- 2) สถานะรวม -->
      <div class="two-col desk-only easy-hide">
        <section class="panel">
          <header>
            <h2>{{ i18n.t({ th: 'สถานะตู้ทั้งหมด', en: 'Box status' }) }}</h2>
            <a [routerLink]="url('D03')">{{ i18n.t({ th: 'ดูตารางตู้', en: 'Open box table' }) }}</a>
          </header>
          @if (totalBoxes() > 0) {
            <div class="bar" role="img" [attr.aria-label]="i18n.t({ th: 'สัดส่วนสถานะตู้', en: 'Box status share' })">
              @for (s of segments(); track s.key) {
                @if (s.n > 0) {
                  <span [style.flex-grow]="s.n" [style.background]="s.tone"></span>
                }
              }
            </div>
            <table class="legend">
              <tbody>
                @for (s of segments(); track s.key) {
                  <tr>
                    <td><span class="swatch" [style.background]="s.tone"></span>{{ i18n.t(s.label) }}</td>
                    <td class="num">{{ s.n }}</td>
                    <td class="act">
                      @if (s.n > 0 && s.query) {
                        <a [routerLink]="url('D03')" [queryParams]="s.query">{{ i18n.t({ th: 'ดู', en: 'View' }) }}</a>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="empty">{{ i18n.t({ th: 'ยังไม่มีตู้ในระบบ — ลงทะเบียนที่หน้า "ตู้ทั้งหมด"', en: 'No boxes yet — register some on the boxes page' }) }}</p>
          }
        </section>

        <section class="panel">
          <header>
            <h2>{{ i18n.t({ th: 'ปัญหา QR', en: 'QR issues' }) }}</h2>
            <a [routerLink]="url('D05')">{{ i18n.t({ th: 'จัดการ QR', en: 'Manage QR' }) }}</a>
          </header>
          @if (qrTotal() > 0) {
            <table class="legend">
              <tbody>
                @for (r of qrRows(); track r.key) {
                  <tr>
                    <td>{{ i18n.t(r.label) }}</td>
                    <td class="meter"><span class="meter-fill" [style.width.%]="r.pct"></span></td>
                    <td class="num">{{ r.n }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="empty">{{ i18n.t({ th: 'QR ทุกใบปกติ', en: 'All QR codes are healthy' }) }}</p>
          }
        </section>
      </div>

      <!-- 2.5) กิจกรรม 7 วัน -->
      <section class="panel desk-only easy-hide">
        <header>
          <h2>{{ i18n.t({ th: 'กิจกรรม 7 วันล่าสุด', en: 'Last 7 days' }) }}</h2>
          <a [routerLink]="url('D11')">{{ i18n.t({ th: 'ดูประวัติ', en: 'Open the log' }) }}</a>
        </header>
        @if (activityTotal() > 0) {
          <div class="chart" role="img" [attr.aria-label]="i18n.t({ th: 'กราฟแท่งกิจกรรมรายวัน', en: 'Daily activity bar chart' })">
            @for (d of activity(); track d.date) {
              <div class="day" [title]="d.label + ' · ' + i18n.t({ th: 'ตรวจผ่าน ', en: 'Passed ' }) + d.inspections + ' · ' + i18n.t({ th: 'มีปัญหา ', en: 'Problems ' }) + d.problems + ' · ' + i18n.t({ th: 'ส่งของ ', en: 'Deliveries ' }) + d.deliveries">
                <div class="col">
                  <span class="seg ok" [style.height.%]="d.hInspections"></span>
                  <span class="seg bad" [style.height.%]="d.hProblems"></span>
                  <span class="seg mid" [style.height.%]="d.hDeliveries"></span>
                </div>
                <span class="dlabel">{{ d.label }}</span>
              </div>
            }
          </div>
          <ul class="key">
            <li><span class="swatch ok"></span>{{ i18n.t({ th: 'ตรวจผ่าน', en: 'Inspections passed' }) }} <strong>{{ activitySum().inspections }}</strong></li>
            <li><span class="swatch bad"></span>{{ i18n.t({ th: 'ตรวจไม่ผ่าน/ตู้มีปัญหา', en: 'Failed / box problem' }) }} <strong>{{ activitySum().problems }}</strong></li>
            <li><span class="swatch mid"></span>{{ i18n.t({ th: 'ส่งของ', en: 'Deliveries' }) }} <strong>{{ activitySum().deliveries }}</strong></li>
            <li>{{ i18n.t({ th: 'SOS', en: 'SOS' }) }} <strong>{{ activitySum().sos }}</strong></li>
          </ul>
        } @else {
          <p class="empty">{{ i18n.t({ th: 'ยังไม่มีกิจกรรมใน 7 วันที่ผ่านมา', en: 'No activity in the last 7 days' }) }}</p>
        }
      </section>

      <!-- 2.6) เฟิร์มแวร์ (โหมดปกติ/ละเอียด) — ตาม AdmHome -->
      <section class="panel easy-hide">
        <header>
          <h2>{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</h2>
          <a [routerLink]="url('D17')">{{ i18n.t({ th: 'จัดการ', en: 'Manage' }) }}</a>
        </header>
        <p>
          <strong>{{ i18n.t({ th: 'ตู้ใช้รุ่นล่าสุด ', en: 'Latest version ' }) }}{{ fwLatest() ?? '—' }} · {{ fwApplied() }} / {{ totalBoxes() }}</strong>
        </p>
        <span class="fwbar" aria-hidden="true"><i [style.width.%]="fwAppliedPct()"></i></span>
        <p class="muted small">{{ autoText() }}</p>
      </section>

      <!-- โหมดละเอียด: ตัวเลขระบบ + เวอร์ชัน/สถานะที่ดึงได้จริง (ตาม AdmAdv) -->
      <section class="card adv-only" [attr.aria-label]="i18n.t({ th: 'ข้อมูลระบบละเอียด', en: 'Technical overview' })">
        <header class="adv-head">
          <h2 class="section-title">{{ i18n.t({ th: 'ข้อมูลระบบ', en: 'System details' }) }}</h2>
          <span class="mono muted small">{{ asOfIso() }}</span>
        </header>
        <dl class="kv">
          <dt>{{ i18n.t({ th: 'ออนไลน์ / ทั้งหมด', en: 'Online / total' }) }}</dt><dd class="mono">{{ online() }} / {{ totalBoxes() }}</dd>
          <dt>{{ i18n.t({ th: 'ไม่ออนไลน์', en: 'Offline' }) }}</dt><dd class="mono">{{ offline() }}</dd>
          <dt>{{ i18n.t({ th: 'พักอยู่', en: 'Sleeping' }) }}</dt><dd class="mono">{{ sleeping() }}</dd>
          <dt>{{ i18n.t({ th: 'ปิดบริการ', en: 'Service closed' }) }}</dt><dd class="mono">{{ serviceClosed() }}</dd>
          <dt>{{ i18n.t({ th: 'ยังไม่ผูกเจ้าของ', en: 'Unbound' }) }}</dt><dd class="mono">{{ unbound() }}</dd>
          <dt>{{ i18n.t({ th: 'แบตต่ำ', en: 'Low battery' }) }}</dt><dd class="mono">{{ lowCount() }} &lt; {{ lowPct }}%</dd>
          <dt>{{ i18n.t({ th: 'ปัญหา QR', en: 'QR issues' }) }}</dt><dd class="mono">{{ qrTotal() }}</dd>
          <dt>{{ i18n.t({ th: 'SOS เปิดอยู่', en: 'Open SOS' }) }}</dt><dd class="mono">{{ overview()?.sos_open ?? 0 }}</dd>
          <dt>{{ i18n.t({ th: 'คำขอช่างเปิด', en: 'Open technician requests' }) }}</dt><dd class="mono">{{ overview()?.technician_requests_open ?? technicianRequests() }}</dd>
          <dt>config_ver</dt><dd class="mono">{{ configVer() !== null ? 'v' + configVer() : '—' }}</dd>
          <dt>{{ i18n.t({ th: 'เฟิร์มแวร์ล่าสุด', en: 'Latest firmware' }) }}</dt><dd class="mono">{{ fwLatest() ?? '—' }}</dd>
          <dt>{{ i18n.t({ th: 'อัปเดตอัตโนมัติ', en: 'Auto update' }) }}</dt>
          <dd>
            @if (fwAuto(); as v) {
              {{ i18n.t({ th: 'เปิด → ', en: 'On → ' }) }}<span class="mono">{{ v }}</span>
            } @else {
              {{ i18n.t({ th: 'ปิด', en: 'Off' }) }}
            }
          </dd>
          <dt>{{ i18n.t({ th: 'Push เครื่องนี้', en: 'Push on this device' }) }}</dt><dd>{{ pushOn() ? i18n.t({ th: 'พร้อม', en: 'Ready' }) : i18n.t({ th: 'ยังไม่เปิด', en: 'Not enabled' }) }}</dd>
        </dl>
      </section>

      <section class="card adv-only">
        <header class="adv-head">
          <h2 class="section-title">{{ i18n.t({ th: 'เฟิร์มแวร์ตามรุ่น', en: 'Firmware by version' }) }}</h2>
          <a [routerLink]="url('D17')">{{ i18n.t({ th: 'จัดการ', en: 'Manage' }) }}</a>
        </header>
        @if (fwGroups().length) {
          @for (g of fwGroups(); track g.version) {
            <div class="fwrow">
              <span class="mono">{{ g.version }}</span>
              <span class="fbar" aria-hidden="true"><i [style.width.%]="g.pct"></i></span>
              <span class="mono">{{ g.n }} {{ i18n.t({ th: 'ตู้', en: 'boxes' }) }}</span>
            </div>
          }
        } @else {
          <p class="empty">{{ i18n.t({ th: 'ยังไม่มีข้อมูลเฟิร์มแวร์จากตู้', en: 'No firmware report from boxes yet' }) }}</p>
        }
      </section>

      <!-- 3) งานที่ต้องทำ -->
      <section class="panel flush easy-hide">
        <header class="hpad">
          <h2>{{ i18n.t({ th: 'ต้องจัดการ', en: 'Needs action' }) }}</h2>
          <span class="muted small">{{ todo().length }} {{ i18n.t({ th: 'รายการ', en: 'items' }) }}</span>
        </header>
        @if (todo().length) {
          <table class="tbl">
            <thead>
              <tr>
                <th>{{ i18n.t({ th: 'เรื่อง', en: 'Item' }) }}</th>
                <th class="hide-sm">{{ i18n.t({ th: 'รายละเอียด', en: 'Detail' }) }}</th>
                <th>{{ i18n.t({ th: 'ระดับ', en: 'Level' }) }}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (t of todo(); track t.key) {
                <tr>
                  <td><strong>{{ i18n.t(t.title) }}</strong><span class="show-sm muted small">{{ i18n.t(t.sub) }}</span></td>
                  <td class="hide-sm muted">{{ i18n.t(t.sub) }}</td>
                  <td><span class="chip" [class.danger]="t.tone === 'danger'" [class.warn]="t.tone === 'warn'">{{ i18n.t(t.tone === 'danger' ? levelLabel.danger : levelLabel.warn) }}</span></td>
                  <td class="act"><a class="btn secondary small-btn" [routerLink]="t.path" [queryParams]="t.query ?? null">{{ i18n.t({ th: 'จัดการ', en: 'Open' }) }}</a></td>
                </tr>
              }
            </tbody>
          </table>
        } @else {
          <p class="empty hpad-empty">{{ i18n.t({ th: 'ไม่มีงานค้าง', en: 'Nothing waiting' }) }}</p>
        }
      </section>

      <div class="two-col desk-only easy-hide">
        <section class="panel flush">
          <header class="hpad">
            <h2>{{ i18n.t({ th: 'เจ้าของบ้านแยกตามแพ็กเกจ', en: 'Owners by plan' }) }}</h2>
            <a [routerLink]="url('D14')">{{ i18n.t({ th: 'จัดการแพ็กเกจ', en: 'Manage plans' }) }}</a>
          </header>
          <table class="tbl">
            <tbody>
              @for (p of plans(); track p.plan_code) {
                <tr>
                  <td>{{ p.plan_code }}</td>
                  <td class="num">{{ p.owners_count }}</td>
                </tr>
              } @empty {
                <tr>
                  <td class="muted">{{ i18n.t({ th: 'ยังไม่มีข้อมูล', en: 'No data yet' }) }}</td>
                  <td></td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <section class="panel support">
          <header>
            <h2>{{ i18n.t({ th: 'ช่องทางติดต่อผู้ดูแลระบบ', en: 'Admin contact' }) }}</h2>
          </header>
          <p class="muted small">{{ i18n.t({ th: 'แสดงให้ผู้ใช้เห็นตอนต้องติดต่อแอดมิน', en: 'Shown to users when they need the admin' }) }}</p>
          @if (editingSupport()) {
            <label class="field">
              <span class="sr-only">{{ i18n.t({ th: 'ช่องทางติดต่อ', en: 'Contact' }) }}</span>
              <input maxlength="500" [value]="supportDraft()" (input)="supportDraft.set($any($event.target).value)" />
            </label>
            <div class="row-actions">
              <button type="button" class="btn secondary" (click)="editingSupport.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
              <button type="button" class="btn" [disabled]="!supportDraft().trim()" (click)="saveSupport()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
            </div>
          } @else {
            <strong class="contact">{{ support() ?? i18n.t({ th: 'ยังไม่ได้ตั้ง', en: 'Not set' }) }}</strong>
            <button type="button" class="btn secondary" (click)="editSupport()">{{ i18n.t({ th: 'แก้ไข', en: 'Edit' }) }}</button>
          }
        </section>
      </div>

      <nav class="list mobile-only easy-hide">
        @for (m of menu; track m.code) {
          <a class="row" [routerLink]="url(m.code)" [queryParams]="m.code === 'A14' ? { from: 'D01' } : null">
            <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
            <strong class="grow">{{ i18n.t(m.label) }}</strong>
            <app-icon name="chevronRight" [size]="18" />
          </a>
        }
      </nav>
      <button type="button" class="btn secondary signout mobile-only" (click)="signout()">{{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}</button>
    </div>
  `,
  styles: `
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
    }
    .page {
      gap: 20px;
    }

    /* ตัวเลขสรุป */
    .kpis {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .kpi {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 14px 16px;
      background: var(--surface);
      border: 1px solid var(--line-strong, var(--line));
      border-radius: 10px;
      color: inherit;
      text-decoration: none;
    }
    .kpi:hover {
      border-color: var(--text);
    }
    .kpi-label {
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-muted);
    }
    .kpi-value {
      font-size: 2rem;
      font-weight: 700;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }
    .kpi-value.danger {
      color: var(--sos);
    }
    .kpi-value.zero {
      color: var(--text-muted);
      font-weight: 600;
    }
    .chart {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 10px;
      align-items: end;
      block-size: 190px;
      padding-block-start: 8px;
    }
    .day {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      gap: 6px;
      block-size: 100%;
    }
    .col {
      flex: 1;
      inline-size: 100%;
      max-inline-size: 44px;
      display: flex;
      flex-direction: column-reverse;
      gap: 1px;
      justify-content: flex-start;
      border-block-end: 1px solid var(--line-strong, var(--line));
    }
    .seg {
      display: block;
      inline-size: 100%;
      min-block-size: 0;
      border-radius: 3px;
    }
    .seg.ok,
    .swatch.ok {
      background: var(--ok);
    }
    .seg.bad,
    .swatch.bad {
      background: var(--sos);
    }
    .seg.mid,
    .swatch.mid {
      background: color-mix(in srgb, var(--text-muted) 70%, transparent);
    }
    .dlabel {
      font-size: 0.75rem;
      color: var(--text-muted);
      white-space: nowrap;
    }
    .key {
      list-style: none;
      display: flex;
      flex-wrap: wrap;
      gap: 6px 20px;
      margin: 14px 0 0;
      padding: 0;
      font-size: 0.875rem;
    }
    .key strong {
      margin-inline-start: 4px;
      font-variant-numeric: tabular-nums;
    }
    .asof {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 12px;
      margin-block-end: -8px;
    }
    .kpi-value.warn {
      color: var(--warn);
    }
    .kpi-hint {
      font-size: 0.75rem;
      color: var(--text-muted);
    }
    @media (min-width: 700px) {
      .kpis {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    @media (min-width: 1200px) {
      .kpis {
        grid-template-columns: repeat(6, minmax(0, 1fr));
      }
    }

    /* แผง */
    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
      align-items: start;
    }
    @media (min-width: 1024px) {
      .two-col {
        grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
      }
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--line-strong, var(--line));
      border-radius: 10px;
      padding: 16px 18px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      min-inline-size: 0;
    }
    .panel.flush {
      padding: 0;
      gap: 0;
      overflow: hidden;
    }
    .panel header {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .panel header.hpad {
      padding: 14px 18px;
      border-block-end: 1px solid var(--line-strong, var(--line));
    }
    .panel h2 {
      font-size: 1rem;
      font-weight: 700;
    }
    .panel header a,
    .act a {
      text-decoration: none;
    }
    .panel header a:hover,
    .act a:hover {
      text-decoration: underline;
    }
    .panel header a {
      font-size: 0.875rem;
      color: var(--brand);
      font-weight: 600;
    }
    .empty {
      color: var(--text-muted);
      padding: 8px 0;
    }
    .empty.hpad-empty {
      padding: 28px 18px;
    }

    /* แท่งสถานะ */
    .bar {
      display: flex;
      block-size: 14px;
      border-radius: 7px;
      overflow: hidden;
      background: var(--icon-bg);
      gap: 2px;
    }
    .bar span {
      min-inline-size: 6px;
    }
    .legend {
      inline-size: 100%;
      border-collapse: collapse;
    }
    .legend td {
      padding: 7px 0;
      border-block-start: 1px solid var(--line);
      vertical-align: middle;
    }
    .legend tr:first-child td {
      border-block-start: 0;
    }
    .swatch {
      display: inline-block;
      inline-size: 10px;
      block-size: 10px;
      border-radius: 2px;
      margin-inline-end: 8px;
    }
    .num {
      text-align: end;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      inline-size: 56px;
    }
    .act {
      text-align: end;
      inline-size: 72px;
    }
    .act a {
      color: var(--brand);
      font-weight: 600;
      font-size: 0.875rem;
    }
    .meter {
      inline-size: 45%;
    }
    .meter-fill {
      display: block;
      block-size: 8px;
      border-radius: 4px;
      background: var(--orange-line);
      min-inline-size: 4px;
    }

    /* ตาราง */
    .tbl {
      inline-size: 100%;
      border-collapse: collapse;
    }
    .tbl th {
      text-align: start;
      font-size: 0.8125rem;
      font-weight: 600;
      color: var(--text-muted);
      padding: 10px 18px;
      background: var(--icon-bg);
    }
    .tbl td {
      padding: 12px 18px;
      border-block-start: 1px solid var(--line-strong, var(--line));
      vertical-align: middle;
    }
    .tbl tbody tr:hover {
      background: var(--brand-lighter);
    }
    .tbl .num,
    .tbl .act {
      text-align: end;
    }
    .small-btn {
      display: inline-flex;
      inline-size: auto;
      min-block-size: 34px;
      padding: 4px 14px;
      font-size: 0.875rem;
    }
    .show-sm {
      display: block;
    }
    @media (max-width: 719px) {
      .hide-sm {
        display: none;
      }
    }
    @media (min-width: 720px) {
      .show-sm {
        display: none;
      }
    }

    .support {
      gap: 8px;
    }
    .contact {
      font-size: 1rem;
      overflow-wrap: anywhere;
    }
    .row-actions {
      display: flex;
      gap: 8px;
    }
    .signout {
      color: var(--brand);
    }

    /* โหมดง่าย (AdmEasy): การ์ดใหญ่ ตัวเลขชัด ปุ่มหลัก 2 ปุ่ม */
    .easy-hero {
      display: flex;
      flex-direction: column;
      gap: 6px;
      padding: 22px 20px;
      border-radius: var(--radius);
      background: var(--ok-bg);
      color: var(--ok);
      text-align: center;
    }
    .easy-hero strong {
      font-size: 1.5rem;
      line-height: 1.3;
    }
    .easy-hero span {
      font-size: 1rem;
    }
    .easy-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 10px;
    }
    .easy-kpi {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 16px 10px;
      border: 1px solid var(--line-strong, var(--line));
      border-radius: var(--radius-sm);
      background: var(--surface);
      color: inherit;
      text-align: center;
      text-decoration: none;
    }
    .easy-kpi:hover {
      border-color: var(--text);
    }
    .easy-n {
      font-size: 2rem;
      font-weight: 800;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .easy-n.danger {
      color: var(--sos);
    }
    .easy-n.warn {
      color: var(--warn);
    }
    .easy-l {
      font-size: 0.875rem;
      color: var(--text-muted);
      line-height: 1.35;
    }
    .easy-actions {
      display: grid;
      gap: 10px;
    }

    /* โหมดละเอียด (AdmAdv): ตารางแน่น ตัวเลข mono */
    .adv-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .adv-head a {
      font-size: 0.875rem;
      color: var(--brand);
      font-weight: 600;
      text-decoration: none;
    }
    .fwrow {
      display: grid;
      grid-template-columns: 5.5rem minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      font-size: 0.875rem;
    }
    .fbar {
      display: block;
      block-size: 8px;
      border-radius: 4px;
      background: var(--icon-bg);
      overflow: hidden;
    }
    .fbar i {
      display: block;
      block-size: 100%;
      background: var(--ok);
    }
    .fwbar {
      display: block;
      block-size: 8px;
      border-radius: 4px;
      background: var(--icon-bg);
      overflow: hidden;
    }
    .fwbar i {
      display: block;
      block-size: 100%;
      background: var(--ok);
    }
  `,
})
export class AdminHome implements OnInit {
  protected readonly i18n = inject(I18n);
  private readonly api = inject(AdminApi);
  private readonly http = inject(HttpClient);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly lowPct = LOW_BATTERY_PCT;
  protected readonly editingSupport = signal(false);
  protected readonly supportDraft = signal('');
  protected readonly support = signal<string | null>(null);
  protected readonly boxes = signal<AdminBoxRow[]>([]);
  protected readonly overview = signal<AdminOverview | null>(null);
  protected readonly pending = signal<AdminAgency[]>([]);
  protected readonly technicianRequests = signal(0);
  protected readonly firmwareList = signal<FirmwareInfo[]>([]);
  protected readonly fwAuto = signal<string | null>(null);
  protected readonly configVer = signal<number | null>(null);

  protected readonly online = computed(() => this.overview()?.boxes.online ?? this.boxes().filter((b) => b.status === 'online' || b.status === 'sleeping').length);
  protected readonly totalBoxes = computed(() => this.overview()?.boxes.total ?? this.boxes().length);
  protected readonly offline = computed(() => this.overview()?.boxes.offline ?? this.boxes().filter((b) => b.status === 'offline').length);
  protected readonly low = computed(() => this.boxes().filter((b) => b.bound && b.battery && b.battery.pct < LOW_BATTERY_PCT));
  protected readonly lowCount = computed(() => this.overview()?.boxes.low_battery ?? this.low().length);
  protected readonly pendingCount = computed(() => this.overview()?.agencies_pending ?? this.pending().length);
  protected readonly qrTotal = computed(() => this.overview()?.qr_issues.total ?? 0);
  protected readonly plans = computed(() => this.overview()?.owners_by_plan ?? []);
  protected readonly sleeping = computed(() => this.overview()?.boxes.sleeping ?? this.boxes().filter((b) => b.status === 'sleeping').length);
  protected readonly serviceClosed = computed(() => this.overview()?.boxes.service_closed ?? this.boxes().filter((b) => b.status === 'service_closed').length);
  protected readonly unbound = computed(() => this.overview()?.boxes.unbound ?? this.boxes().filter((b) => b.status === 'unbound').length);
  /** งานที่ต้องดูในโหมดง่าย = ตู้ไม่ออนไลน์ + เคส QR */
  protected readonly atRisk = computed(() => this.offline() + this.qrTotal());
  protected readonly easyTitle = computed<Tr>(() =>
    this.offline() === 0 && this.qrTotal() === 0
      ? { th: 'ตู้ส่วนใหญ่ปกติดี', en: 'Most mailboxes are fine' }
      : { th: 'มีตู้ที่ต้องดู', en: 'Some mailboxes need a look' },
  );
  protected readonly fwLatest = computed(() => this.firmwareList()[0]?.version ?? null);
  protected readonly fwApplied = computed(() => {
    const latest = this.fwLatest();
    return latest ? this.boxes().filter((b) => b.fw === latest).length : 0;
  });
  protected readonly fwAppliedPct = computed(() => (this.totalBoxes() ? (this.fwApplied() / this.totalBoxes()) * 100 : 0));
  protected readonly autoText = computed<Tr>(() =>
    this.fwAuto()
      ? { th: 'อัปเดตอัตโนมัติ: เปิด · ตู้จะอัปเดตเองเมื่อกลับมาออนไลน์', en: 'Auto update: on · boxes update when they come online' }
      : { th: 'อัปเดตอัตโนมัติ: ปิด · แอดมินกดอัปเดตเอง', en: 'Auto update: off · an admin updates each box' },
  );
  /** จำนวนตู้แยกตามเวอร์ชันเฟิร์มแวร์ที่ตู้รายงานจริง */
  protected readonly fwGroups = computed(() => {
    const counts = new Map<string, number>();
    for (const b of this.boxes()) {
      const v = b.fw ?? '—';
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([version, n]) => ({ version, n, pct: (n / max) * 100 }));
  });
  protected readonly pushOn = computed(() => this.session.me()?.push.subscribed ?? false);

  /** แท่งซ้อนต่อวัน: ความสูงเทียบวันที่มากที่สุดใน 7 วัน (ไม่นับ SOS ในแท่ง — แสดงเป็นตัวเลขใต้กราฟ) */
  protected readonly activity = computed(() => {
    const days = this.overview()?.activity_7d ?? [];
    const max = Math.max(1, ...days.map((d) => d.inspections + d.problems + d.deliveries));
    const lang = this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB';
    return days.map((d) => ({
      ...d,
      label: new Date(`${d.date}T12:00:00+07:00`).toLocaleDateString(lang, { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }),
      hInspections: (d.inspections / max) * 100,
      hProblems: (d.problems / max) * 100,
      hDeliveries: (d.deliveries / max) * 100,
    }));
  });
  protected readonly activitySum = computed(() =>
    (this.overview()?.activity_7d ?? []).reduce(
      (a, d) => ({ inspections: a.inspections + d.inspections, problems: a.problems + d.problems, deliveries: a.deliveries + d.deliveries, sos: a.sos + d.sos }),
      { inspections: 0, problems: 0, deliveries: 0, sos: 0 },
    ),
  );
  protected readonly activityTotal = computed(() => {
    const s = this.activitySum();
    return s.inspections + s.problems + s.deliveries + s.sos;
  });

  /** ตัวเลขสรุปด้านบนสุด — ทุกใบกดไปหน้าที่จัดการต่อได้ */
  protected readonly kpis = computed(() => {
    const requests = this.pendingCount() + this.technicianRequests();
    return [
      { key: 'online', label: { th: 'ตู้ออนไลน์', en: 'Boxes online' }, text: `${this.online()}/${this.totalBoxes()}`, n: 0, tone: '', hint: { th: 'รวมตู้ที่พักอยู่', en: 'incl. sleeping' }, path: screenUrl('D03'), query: null as Record<string, string> | null },
      { key: 'offline', label: { th: 'ตู้ไม่ออนไลน์', en: 'Offline' }, text: String(this.offline()), n: this.offline(), tone: 'danger', hint: { th: 'ติดต่อไม่ได้', en: 'not reachable' }, path: screenUrl('D03'), query: { filter: 'offline' } },
      { key: 'low', label: { th: 'แบตต่ำ', en: 'Low battery' }, text: String(this.lowCount()), n: this.lowCount(), tone: 'warn', hint: { th: `ต่ำกว่า ${LOW_BATTERY_PCT}%`, en: `below ${LOW_BATTERY_PCT}%` }, path: screenUrl('D03'), query: { filter: 'low' } },
      { key: 'qr', label: { th: 'ปัญหา QR', en: 'QR issues' }, text: String(this.qrTotal()), n: this.qrTotal(), tone: 'warn', hint: { th: 'เสีย · น่าสงสัย · ใกล้หมดอายุ', en: 'damaged · suspicious · expiring' }, path: screenUrl('D05'), query: null },
      { key: 'agencies', label: { th: 'หน่วยงานรออนุมัติ', en: 'Agencies waiting' }, text: String(this.pendingCount()), n: this.pendingCount(), tone: 'warn', hint: { th: 'รอแอดมินอนุมัติ', en: 'awaiting approval' }, path: screenUrl('D13'), query: null as Record<string, string> | null },
      { key: 'requests', label: { th: 'คำขอรอจัดการ', en: 'Requests waiting' }, text: String(requests), n: requests, tone: 'warn', hint: { th: 'หน่วยงาน + คำขอช่าง', en: 'agencies + technician' }, path: this.pendingCount() > 0 ? screenUrl('D02') : screenUrl('D15'), query: null },
      { key: 'sos', label: { th: 'SOS ที่เปิดอยู่', en: 'Open SOS' }, text: String(this.overview()?.sos_open ?? 0), n: this.overview()?.sos_open ?? 0, tone: 'danger', hint: { th: 'ดูในประวัติระบบ', en: 'see the system log' }, path: screenUrl('D11'), query: null },
    ];
  });

  /** แท่งสถานะตู้ — ไม่เกิน 5 ส่วน (ออนไลน์ · พัก · ไม่ออนไลน์ · ปิดบริการ · ยังไม่ผูก) */
  protected readonly segments = computed<Segment[]>(() => {
    const b = this.overview()?.boxes;
    if (!b) return [];
    return [
      { key: 'online', label: { th: 'ออนไลน์', en: 'Online' }, n: b.online, tone: 'var(--ok)', query: null },
      { key: 'sleeping', label: { th: 'พักอยู่', en: 'Sleeping' }, n: b.sleeping, tone: 'color-mix(in srgb, var(--text-muted) 70%, transparent)', query: null },
      { key: 'offline', label: { th: 'ไม่ออนไลน์', en: 'Offline' }, n: b.offline, tone: 'var(--sos)', query: { filter: 'offline' } },
      { key: 'closed', label: { th: 'ปิดบริการ', en: 'Service closed' }, n: b.service_closed, tone: 'var(--orange-line)', query: null },
      { key: 'unbound', label: { th: 'ยังไม่ผูกเจ้าของ', en: 'Unbound' }, n: b.unbound, tone: 'var(--line-strong, #b8bec7)', query: { filter: 'unbound' } },
    ];
  });

  protected readonly qrRows = computed(() => {
    const by = this.overview()?.qr_issues.by_health;
    if (!by) return [];
    const rows: { key: string; label: Tr; n: number }[] = [
      { key: 'damaged', label: { th: 'QR เสียหาย', en: 'Damaged' }, n: by.damaged },
      { key: 'suspicious', label: { th: 'น่าสงสัย', en: 'Suspicious' }, n: by.suspicious },
      { key: 'maybe_fake', label: { th: 'อาจเป็นของปลอม', en: 'Maybe fake' }, n: by.maybe_fake },
      { key: 'expiring', label: { th: 'ใกล้หมดอายุ', en: 'Expiring' }, n: by.expiring },
    ];
    const max = Math.max(1, ...rows.map((r) => r.n));
    return rows.map((r) => ({ ...r, pct: (r.n / max) * 100 }));
  });

  protected readonly asOf = signal('');
  protected readonly asOfIso = signal('');
  protected readonly refreshing = signal(false);

  protected async refresh(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.ngOnInit();
    } finally {
      this.refreshing.set(false);
    }
  }

  async ngOnInit(): Promise<void> {
    const [overview, boxes, pending, support, technicianRequests, firmware, fwAuto, config] = await Promise.all([
      this.api.overview().catch(() => null),
      this.api.boxes().catch(() => null),
      this.api.agencies('pending').catch(() => []),
      firstValueFrom(this.http.get<{ contact: string | null }>('/api/v1/support')).catch(() => null),
      this.api.technicianRequests('open').catch(() => []),
      this.api.firmwareList().catch(() => []),
      this.api.firmwareAuto().catch(() => null),
      this.api.config().catch(() => null),
    ]);
    this.overview.set(overview);
    this.boxes.set(boxes?.data ?? []);
    this.pending.set(pending);
    this.support.set(support?.contact ?? null);
    this.technicianRequests.set(technicianRequests.length);
    this.firmwareList.set(firmware);
    this.fwAuto.set(fwAuto?.version ?? null);
    this.configVer.set(config?.config_ver ?? null);
    const now = new Date();
    this.asOf.set(now.toLocaleTimeString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { hour: '2-digit', minute: '2-digit' }));
    this.asOfIso.set(now.toISOString());
  }

  protected editSupport(): void {
    this.supportDraft.set(this.support() ?? '');
    this.editingSupport.set(true);
  }

  /** PUT /admin/settings/support-contact { contact } */
  protected async saveSupport(): Promise<void> {
    const v = this.supportDraft().trim();
    if (!v) return;
    try {
      await firstValueFrom(this.http.put('/api/v1/admin/settings/support-contact', { contact: v }));
      this.support.set(v);
      this.editingSupport.set(false);
      this.toast.show({ th: 'บันทึกช่องทางติดต่อแล้ว', en: 'Contact saved' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    }
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
  }

  /** งานค้างเรียงตามความเร่งด่วน: ตู้ไม่ออนไลน์ → แบตต่ำ → หน่วยงาน/คำขอช่างรออนุมัติ — หายไปเมื่อจัดการแล้ว */
  protected readonly todo = computed(() => {
    const items: { key: string; tone: Tone; title: Tr; sub: Tr; path: string; query?: Record<string, string> }[] = [];
    for (const b of this.boxes().filter((x) => x.status === 'offline')) {
      const seen = seenText(b.last_seen_at);
      items.push({ key: b.id, tone: 'danger', title: { th: 'ตู้ ' + (b.house_no ?? b.id) + ' ไม่ออนไลน์', en: 'Box ' + (b.house_no ?? b.id) + ' offline' }, sub: { th: 'ติดต่อล่าสุด ' + seen.th, en: 'Last seen ' + seen.en }, path: screenUrl('D04'), query: { id: b.id } });
    }
    for (const b of this.low()) {
      items.push({ key: 'low-' + b.id, tone: 'warn', title: { th: 'แบตต่ำ · ' + (b.house_no ?? b.id), en: 'Low battery · ' + (b.house_no ?? b.id) }, sub: { th: 'เหลือ ' + b.battery!.pct + '%', en: b.battery!.pct + '% left' }, path: screenUrl('D04'), query: { id: b.id } });
    }
    for (const a of this.pending()) {
      items.push({ key: a.id, tone: 'warn', title: { th: 'หน่วยงานใหม่ · ' + a.name, en: 'New agency · ' + a.name }, sub: { th: 'รออนุมัติ', en: 'Waiting for approval' }, path: screenUrl('D02') });
    }
    if (this.technicianRequests() > 0) {
      items.push({ key: 'technician-requests', tone: 'warn', title: { th: 'มีคำขอช่างใหม่', en: 'New technician requests' }, sub: { th: `${this.technicianRequests()} รายการรอจัดการ`, en: `${this.technicianRequests()} requests waiting` }, path: screenUrl('D15') });
    }
    return items;
  });

  protected readonly levelLabel = {
    danger: { th: 'ด่วน', en: 'Urgent' } as Tr,
    warn: { th: 'รอจัดการ', en: 'Pending' } as Tr,
  };

  protected readonly menu: { code: string; icon: IconName; label: Tr }[] = [
    { code: 'D09', icon: 'user', label: { th: 'ผู้ใช้', en: 'Users' } },
    { code: 'D10', icon: 'target', label: { th: 'ค่าตั้งค่าตู้', en: 'Mailbox config' } },
    { code: 'D13', icon: 'shield', label: { th: 'หน่วยงาน', en: 'Agencies' } },
    { code: 'T01', icon: 'settings', label: { th: 'งานช่าง (ติดตั้ง)', en: 'Technician (install)' } },
    { code: 'D15', icon: 'user', label: { th: 'คำขอช่างจากเจ้าของบ้าน', en: 'Owner technician requests' } },
    { code: 'A14', icon: 'user', label: { th: 'เปลี่ยนรหัสผ่านของฉัน', en: 'Change my password' } },
  ];
}
