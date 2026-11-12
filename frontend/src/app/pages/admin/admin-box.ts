import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, input, signal, type OnInit } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiConfig } from '../../core/api';
import { AdminApi, type AdminBoxDetail, type BoxConfigOverride } from '../../core/admin-api';
import { I18n, type Tr } from '../../core/i18n';
import { Toast } from '../../core/toast';
import { screenUrl } from '../../screens/registry';
import { BoxSetupQr } from '../../shared/box-setup-qr';
import { BoxTest } from '../../shared/box-test';
import { Confirm } from '../../shared/confirm-dialog';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { QrImage } from '../../shared/qr-image';
import { EmptyState } from '../../shared/state-view';
import { AdminBoxDiagnostics } from './admin-box-diagnostics';
import { AdminBoxFirmware } from './admin-box-firmware';
import { AdminBoxReports } from './admin-box-reports';
import { LOW_BATTERY_PCT, boxBadge, seenText, SLOT_LABEL } from './admin-box-shared';

@Component({
  selector: 'app-admin-box',
  imports: [RouterLink, PageHeader, QrImage, BoxTest, BoxSetupQr, Icon, EmptyState, AdminBoxFirmware, AdminBoxDiagnostics, AdminBoxReports],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header [caption]="id() ?? ''" [title]="i18n.t({ th: 'ตู้ ', en: 'Mailbox ' }) + (box()?.house_no ?? id() ?? '')" [back]="url('D03')" />
    @if (box(); as b) {
      @let badge = boxBadge(b);
      <section class="kpis" [attr.aria-label]="i18n.t({ th: 'สรุปตู้', en: 'Box summary' })">
        <div class="kpi">
          <span class="kpi-label">{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</span>
          <span class="kpi-value"><span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span></span>
          <span class="kpi-hint">{{ i18n.t(seen(b.last_seen_at)) }}</span>
        </div>
        <div class="kpi">
          <span class="kpi-label">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</span>
          <span class="kpi-value" [class.warn]="!!b.battery && b.battery.pct < lowPct">{{ b.battery ? b.battery.pct + '%' : '—' }}</span>
          <span class="kpi-hint">{{ !b.battery ? i18n.t({ th: 'ยังไม่มีข้อมูล', en: 'No data yet' }) : b.battery.charging ? i18n.t({ th: 'ชาร์จอยู่', en: 'charging' }) : i18n.t({ th: 'ไม่ได้ชาร์จ', en: 'not charging' }) }}</span>
        </div>
        <button type="button" class="kpi click" (click)="tab.set('settings')">
          <span class="kpi-label">{{ i18n.t({ th: 'บริการ', en: 'Service' }) }}</span>
          <span class="kpi-value" [class.danger]="!b.service_active">{{ b.service_active ? i18n.t({ th: 'เปิด', en: 'On' }) : i18n.t({ th: 'ปิด', en: 'Off' }) }}</span>
          <span class="kpi-hint">{{ i18n.t({ th: 'กดเพื่อเปลี่ยน', en: 'tap to change' }) }}</span>
        </button>
        <button type="button" class="kpi click easy-hide" (click)="tab.set('firmware')">
          <span class="kpi-label">{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</span>
          <span class="kpi-value">{{ b.fw ?? '—' }}</span>
          <span class="kpi-hint" [class.warn-text]="b.fw_stuck">{{ b.fw_stuck ? i18n.t({ th: 'อัปเดตค้าง · กดดู', en: 'update stuck · tap' }) : b.fw_target ? i18n.t({ th: 'รออัปเดตเป็น ', en: 'updating to ' }) + b.fw_target : b.fw ? i18n.t({ th: 'กดเพื่ออัปเดต', en: 'tap to update' }) : i18n.t({ th: 'ยังไม่มีข้อมูล', en: 'No data yet' }) }}</span>
        </button>
        <div class="kpi easy-hide">
          <span class="kpi-label">{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</span>
          <span class="kpi-value" [class.warn]="!b.config.in_sync">{{ b.config.in_sync ? i18n.t({ th: 'ล่าสุด', en: 'Current' }) : i18n.t({ th: 'รอดึงค่า', en: 'Pending' }) }}</span>
          <span class="kpi-hint">{{ b.config.in_sync ? i18n.t({ th: 'ตู้มีค่าตั้งค่าล่าสุดแล้ว', en: 'the box has the latest settings' }) : i18n.t({ th: 'รอตู้ดึงค่าใหม่ตอนติดต่อรอบหน้า', en: 'it picks them up on its next contact' }) }}</span>
        </div>
      </section>

      <div class="tabs" role="tablist" [attr.aria-label]="i18n.t({ th: 'หมวดของตู้', en: 'Box sections' })">
        @for (t of tabs; track t.v) {
          <button type="button" role="tab" [attr.aria-selected]="tab() === t.v" [class.on]="tab() === t.v" [class.easy-hide]="t.v === 'test' || t.v === 'firmware' || t.v === 'danger'" (click)="tab.set(t.v)">
            <app-icon [name]="t.icon" [size]="16" />{{ i18n.t(t.label) }}
          </button>
        }
      </div>

      <!-- โหมดง่าย (AdmBoxDetail_E): สรุปสถานะ + ปุ่มงานหลัก -->
      <section class="card easy-only easy-box">
        <strong class="easy-house">{{ b.bound ? b.house_no : i18n.t({ th: 'ยังไม่ผูกบ้าน', en: 'Not bound to a house' }) }}</strong>
        <span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span>
        <span class="easy-meta">{{ b.battery ? i18n.t({ th: 'แบต ', en: 'Battery ' }) + b.battery.pct + '%' : '—' }} · {{ i18n.t({ th: 'เฟิร์มแวร์ ', en: 'Firmware ' }) }}{{ b.fw ?? '—' }}</span>
      </section>
      <div class="easy-actions easy-only">
        <button type="button" class="btn big" (click)="openPrint()">{{ i18n.t({ th: 'พิมพ์ QR', en: 'Print QR' }) }}</button>
        <button type="button" class="btn secondary big" (click)="tab.set('settings')">{{ i18n.t({ th: 'ตั้งค่า / เปิด-ปิดบริการ', en: 'Settings / service' }) }}</button>
      </div>

      @if (b.wifi_reset.status === 'pending' || b.wifi_reset.status === 'expired') {
        <div class="info-box" role="status">
          @if (b.wifi_reset.status === 'pending') {
            <strong>{{ i18n.t({ th: 'รอตู้รับคำสั่งลืม Wi-Fi', en: 'Waiting for the box to forget its Wi-Fi' }) }}</strong>
            <span class="small block">{{ i18n.t({ th: 'ตู้ต้องออนไลน์ถึงจะรับ (หมดอายุใน 24 ชั่วโมง) · รับแล้วตู้จะเปิด Wi-Fi ', en: 'The box must be online to take it (expires in 24 h) · then it opens the Wi-Fi ' }) }}<code>{{ b.wifi_reset.ap_name }}</code></span>
            <button type="button" class="btn secondary fw-act" [disabled]="resetBusy()" (click)="cancelWifiReset()">{{ i18n.t({ th: 'ยกเลิกคำสั่ง', en: 'Cancel the request' }) }}</button>
          } @else {
            <strong class="warn-text">{{ i18n.t({ th: 'คำสั่งลืม Wi-Fi หมดอายุ — ไม่มีตู้รับภายใน 24 ชั่วโมง', en: 'The Wi-Fi reset expired — the box did not take it within 24 h' }) }}</strong>
            <button type="button" class="btn secondary fw-act" [disabled]="resetBusy()" (click)="requestWifiReset()">{{ i18n.t({ th: 'สั่งใหม่', en: 'Send again' }) }}</button>
          }
        </div>
      }

      <div class="stack grow">
        @if (tab() === 'overview') {
        <section class="card">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'สถานะ', en: 'Status' }) }}</dt>
            <dd><span class="chip" [class.ok]="badge.tone === 'ok'" [class.warn]="badge.tone === 'warn'" [class.danger]="badge.tone === 'danger'">{{ i18n.t(badge.label) }}</span></dd>
            <dt class="adv-only">{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd class="adv-only">{{ b.id }}</dd>
            <dt>{{ i18n.t({ th: 'บ้าน', en: 'House' }) }}</dt>
            <dd>{{ b.bound ? (b.house_no + (b.name ? ' · ' + b.name : '')) : i18n.t({ th: 'ยังไม่ผูก', en: 'not bound' }) }}</dd>
            <dt>{{ i18n.t({ th: 'แบต', en: 'Battery' }) }}</dt>
            <dd>{{ b.battery ? b.battery.pct + '%' + (b.battery.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '') : '—' }}</dd>
            <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last seen' }) }}</dt>
            <dd>{{ i18n.t(seen(b.last_seen_at)) }}</dd>
            <dt class="easy-hide">{{ i18n.t({ th: 'ถือ long-poll ล่าสุด', en: 'Last long-poll' }) }}</dt>
            <dd class="easy-hide">{{ i18n.t(seen(b.last_poll_at)) }}</dd>
            <dt>{{ i18n.t({ th: 'เฟิร์มแวร์', en: 'Firmware' }) }}</dt>
            <dd>{{ b.fw ?? '—' }}</dd>
            <dt class="easy-hide">{{ i18n.t({ th: 'ค่าตั้งค่า', en: 'Config' }) }}</dt>
            <dd class="easy-hide" [class.warn-text]="!b.config.in_sync">
              {{ b.config.in_sync ? i18n.t({ th: 'ตู้มีค่าล่าสุด', en: 'up to date' }) : i18n.t({ th: 'รอตู้ดึงค่าใหม่', en: 'waiting for the box' }) }}
            </dd>
            <dt class="adv-only">{{ i18n.t({ th: 'ลงทะเบียนเมื่อ', en: 'Registered' }) }}</dt><dd class="adv-only">{{ fwDate(b.registered_at) }}</dd>
            @if (b.service_reason) {
              <dt class="adv-only">{{ i18n.t({ th: 'เหตุผลปิดบริการ', en: 'Service reason' }) }}</dt><dd class="adv-only">{{ b.service_reason }}</dd>
            }
            <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
            <dd>{{ windows(b) }}</dd>
          </dl>
        </section>
        }
        @if (tab() === 'settings') {
        <section class="card">
          <details class="override easy-hide" open>
            <summary>{{ i18n.t({ th: 'ตั้งค่าเฉพาะตู้นี้ (ทับค่ากลาง)', en: 'This box only (overrides the shared settings)' }) }}</summary>
            <p class="muted small">{{ i18n.t({ th: 'เว้นว่าง = ใช้ค่ากลาง · เช่น ตู้สัญญาณแย่ให้ long-poll สั้นลง', en: 'Leave blank to use the shared value · e.g. shorten long-poll for a weak-signal box' }) }}</p>
            <label class="field">
              <span>{{ i18n.t({ th: 'เวลารายงานรายวัน', en: 'Daily report time' }) }} · {{ b.config.config.report_at }}</span>
              <input type="time" [value]="ovReport()" (input)="ovReport.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'เวลาสแกน QR ต่อครั้ง (วินาที 10–60)', en: 'QR scan time per try (s, 10–60)' }) }} · {{ b.config.config.scan_timeout_s }}</span>
              <input inputmode="numeric" [value]="ovScan()" (input)="ovScan.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'ลองสแกนได้กี่ครั้ง (1–5)', en: 'Scan attempts (1–5)' }) }} · {{ b.config.config.max_attempts }}</span>
              <input inputmode="numeric" [value]="ovAttempts()" (input)="ovAttempts.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'รอ long-poll ต่อรอบ (วินาที 20–55)', en: 'Long-poll wait (s, 20–55)' }) }} · {{ b.config.config.longpoll_wait_s }}</span>
              <input inputmode="numeric" [value]="ovLongpoll()" (input)="ovLongpoll.set($any($event.target).value)" />
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'เปิดไฟแฟลชเมื่อมืด', en: 'Flash when dark' }) }} · {{ b.config.config.flash_when_dark ? i18n.t({ th: 'เปิด', en: 'on' }) : i18n.t({ th: 'ปิด', en: 'off' }) }}</span>
              <select [value]="ovFlash()" (change)="ovFlash.set($any($event.target).value)">
                <option value="">{{ i18n.t({ th: 'ใช้ค่ากลาง', en: 'Shared value' }) }}</option>
                <option value="on">{{ i18n.t({ th: 'เปิด', en: 'On' }) }}</option>
                <option value="off">{{ i18n.t({ th: 'ปิด', en: 'Off' }) }}</option>
              </select>
            </label>
            <label class="field">
              <span>{{ i18n.t({ th: 'ประหยัดไฟ Wi-Fi ของตู้', en: 'Wi-Fi power saving' }) }} · {{ b.config.config['wifi_power_save'] ? i18n.t({ th: 'เปิด', en: 'on' }) : i18n.t({ th: 'ปิด', en: 'off' }) }}</span>
              <select [value]="ovPs()" (change)="ovPs.set($any($event.target).value)">
                <option value="">{{ i18n.t({ th: 'ใช้ค่ากลาง (ปิด)', en: 'Shared value (off)' }) }}</option>
                <option value="on">{{ i18n.t({ th: 'เปิด — ตู้ที่สัญญาณ Wi-Fi ดี (กินไฟน้อยลงมาก)', en: 'On — boxes with a good Wi-Fi signal (much lower power)' }) }}</option>
                <option value="off">{{ i18n.t({ th: 'ปิด — ตู้ที่สัญญาณอ่อน (เสถียรกว่า)', en: 'Off — boxes with a weak signal (more stable)' }) }}</option>
              </select>
              <small>{{ i18n.t({ th: 'ตู้ยังตื่นทันทีเมื่อสแกน · ถ้าเปิดแล้วตู้หลุดออนไลน์บ่อย ให้ปิด', en: 'The box still wakes on a scan · turn it off if the box drops offline' }) }}</small>
            </label>
            @if (ovError(); as e) {
              <p class="danger-text small" role="alert">{{ i18n.t(e) }}</p>
            }
            <button type="button" class="btn" [disabled]="savingOverride()" (click)="saveOverride()">{{ i18n.t({ th: 'บันทึกค่าเฉพาะตู้', en: 'Save box settings' }) }}</button>
          </details>
          <p class="muted small easy-hide">{{ i18n.t({ th: 'คืนค่าการตั้งค่าเฉพาะตู้นี้ เช่น เวลารายงาน การอ่าน QR และ long-poll ให้ใช้ค่ากลาง · เวลาตรวจยังมาจากโซน', en: 'Restore this box’s report, QR scan, and long-poll settings to shared defaults · patrol hours still come from its zones' }) }}</p>
          <button type="button" class="btn secondary easy-hide" [disabled]="resettingConfig()" (click)="resetConfig()">
            {{ resettingConfig() ? i18n.t({ th: 'กำลังรีเซ็ต…', en: 'Resetting…' }) : i18n.t({ th: 'คืนค่าการตั้งค่าตู้นี้', en: 'Restore this box’s settings' }) }}
          </button>
        </section>

        <h2 class="section-title">{{ i18n.t({ th: 'การให้บริการ', en: 'Service' }) }}</h2>
        <section class="card stack">
          <div class="fw-now">
            <span class="muted">{{ i18n.t({ th: 'สถานะบริการ', en: 'Service status' }) }}</span>
            <span class="chip" [class.ok]="b.service_active" [class.danger]="!b.service_active">
              {{ b.service_active ? i18n.t({ th: 'เปิดบริการ', en: 'In service' }) : i18n.t({ th: 'ปิดบริการ', en: 'Switched off' }) }}
            </span>
          </div>
          @if (!b.service_active && b.service_reason) {
            <p class="small">{{ i18n.t({ th: 'เหตุผล: ', en: 'Reason: ' }) }}{{ b.service_reason }}</p>
          }
          @if (b.service_active) {
            <p class="muted small">{{ i18n.t({ th: 'ปิดแล้วเจ้าหน้าที่ตรวจตู้นี้ไม่ได้ ไรเดอร์เห็นหน้า "ตู้ปิดบริการ" และเจ้าของบ้านได้รับแจ้งเตือน', en: 'Officers cannot check a switched-off box, riders see “out of service”, and the owner is notified' }) }}</p>
            <label class="field">
              <span>{{ i18n.t({ th: 'เหตุผล (ไม่บังคับ)', en: 'Reason (optional)' }) }}</span>
              <input maxlength="200" [value]="serviceReason()" (input)="serviceReason.set($any($event.target).value)" />
            </label>
            <button type="button" class="btn secondary danger-outline" [disabled]="serviceBusy()" (click)="setService(false)">
              {{ i18n.t({ th: 'ปิดบริการตู้นี้', en: 'Switch this box off' }) }}
            </button>
          } @else {
            <button type="button" class="btn" [disabled]="serviceBusy()" (click)="setService(true)">
              {{ i18n.t({ th: 'เปิดบริการตู้นี้อีกครั้ง', en: 'Switch this box back on' }) }}
            </button>
          }
        </section>

        }
        @if (tab() === 'danger') {
        <div class="easy-hide">
        @if (returned(); as r) {
          <section class="card stack done" role="status">
            <h2 class="section-title">{{ i18n.t({ th: 'คืนตู้เป็นตู้ใหม่แล้ว — ทำต่อที่หน้างานตามนี้', en: 'The box is back to “new” — finish on site' }) }}</h2>
            <ol class="checklist">
              @if (r.wifi_reset) {
                <li>{{ i18n.t({ th: 'รอให้ตู้ออนไลน์ แล้วตู้จะรับคำสั่งลืม Wi-Fi และเปิด Wi-Fi ', en: 'Wait for the box to be online — it takes the command and opens the Wi-Fi ' }) }}<code>{{ r.ap_name }}</code> <span class="muted small">({{ i18n.t({ th: 'ดูสถานะที่แถบด้านบน', en: 'status is shown at the top' }) }})</span></li>
                <li>{{ i18n.t({ th: 'ต่อมือถือเข้า Wi-Fi นั้น แล้วตั้ง Wi-Fi บ้านใหม่ในหน้าตั้งค่าที่เปิดขึ้นเอง', en: 'Join that Wi-Fi with a phone and set the new home Wi-Fi on the page that opens' }) }}</li>
              } @else {
                <li>{{ i18n.t({ th: 'ตู้ยังใช้ Wi-Fi เดิมอยู่ — ถ้าต้องเปลี่ยน ให้กด "สั่งตู้ลืม Wi-Fi" ด้านล่าง', en: 'The box keeps its old Wi-Fi — press “Make the box forget its Wi-Fi” below if it must change' }) }}</li>
              }
              <li>{{ i18n.t({ th: 'พิมพ์ QR เปิดใช้ตู้ใบใหม่ (แท็บ "QR และบอร์ด") ให้เจ้าของคนใหม่', en: 'Print the new activation QR (tab “QR & board”) for the new owner' }) }}</li>
              <li>{{ i18n.t({ th: 'เจ้าของใหม่สมัคร/เข้าสู่ระบบแล้วสแกน QR เปิดใช้ตู้ และกรอกบ้านเลขที่', en: 'The new owner signs in, scans the activation QR and enters the house number' }) }}</li>
            </ol>
            <div class="actions">
              <button type="button" class="btn" (click)="tab.set('qr'); returned.set(null)">{{ i18n.t({ th: 'ไปพิมพ์ QR เปิดใช้ตู้', en: 'Go print the activation QR' }) }}</button>
              <button type="button" class="btn secondary" (click)="returned.set(null)">{{ i18n.t({ th: 'ปิด', en: 'Dismiss' }) }}</button>
            </div>
          </section>
        }

        @if (b.bound) {
          <h2 class="section-title">{{ i18n.t({ th: 'คืนตู้เป็นตู้ใหม่ (ขายบ้าน / ย้ายออก)', en: 'Return the box as new (house sold / moved out)' }) }}</h2>
          <section class="card stack">
            <p class="small"><strong>{{ i18n.t({ th: 'กดแล้วเกิดอะไรขึ้น', en: 'What happens' }) }}</strong></p>
            <ul class="effects">
              <li>{{ i18n.t({ th: 'ตู้กลับเป็น "ยังไม่ผูก" — เจ้าของเดิมไม่เห็นตู้นี้อีกและได้รับแจ้งเตือน', en: 'The box becomes “not bound” — the old owner no longer sees it and is notified' }) }}</li>
              <li>{{ i18n.t({ th: 'ถอดออกจากทุกโซน · ล้างบ้านเลขที่ ชื่อ ย่าน · ล้างค่าที่ตั้งเฉพาะตู้ (ใช้ค่ากลาง)', en: 'Removed from every zone · house, name and area cleared · per-box settings cleared (shared values)' }) }}</li>
              <li>{{ i18n.t({ th: 'ออก QR เปิดใช้ตู้ใบใหม่ให้เจ้าของคนใหม่ (QR หน้าตู้ที่ติดอยู่ใช้ต่อได้) · ประวัติเก่ายังอยู่', en: 'A new activation QR is issued for the next owner (the front QR stickers keep working) · history is kept' }) }}</li>
              <li [class.off]="!unbindResetWifi()">{{ i18n.t({ th: 'ตู้ลืม Wi-Fi และเปิดโหมดตั้งค่า (ตู้ต้องออนไลน์ถึงจะรับ · ยังจำรหัสตู้ ไม่ต้องต่อสาย)', en: 'The box forgets its Wi-Fi and opens setup mode (it must be online · it keeps its identity — no cable needed)' }) }}</li>
            </ul>
            <label class="field">
              <span>{{ i18n.t({ th: 'เหตุผล', en: 'Reason' }) }}</span>
              <input maxlength="200" [placeholder]="i18n.t({ th: 'เช่น ขายบ้าน', en: 'e.g. house sold' })" [value]="unbindReason()" (input)="unbindReason.set($any($event.target).value)" />
            </label>
            <label class="check">
              <input type="checkbox" [checked]="unbindResetWifi()" (change)="unbindResetWifi.set($any($event.target).checked)" />
              <span>{{ i18n.t({ th: 'ให้ตู้ลืม Wi-Fi ด้วย (แนะนำ — เจ้าของใหม่ใช้ Wi-Fi ของตัวเอง)', en: 'Also make the box forget its Wi-Fi (recommended — the new owner uses their own)' }) }}</span>
            </label>
            <button type="button" class="btn danger" [disabled]="unbinding() || !unbindReason().trim()" (click)="unbind()">
              {{ unbinding() ? i18n.t({ th: 'กำลังทำรายการ…', en: 'Working…' }) : i18n.t({ th: 'คืนตู้เป็นตู้ใหม่', en: 'Return the box as new' }) }}
            </button>
          </section>
        } @else {
          <h2 class="section-title">{{ i18n.t({ th: 'ล้าง Wi-Fi ของตู้', en: 'Reset the box Wi-Fi' }) }}</h2>
          <section class="card stack">
            <p class="muted small">{{ i18n.t({ th: 'ตู้นี้ยังไม่ผูกเจ้าของ — สั่งให้ตู้ลืม Wi-Fi แล้วเปิดโหมดตั้งค่าได้ (ตู้ต้องออนไลน์ถึงจะรับ) ใช้เมื่อย้ายตู้ไปติดตั้งที่ใหม่', en: 'This box has no owner — make it forget its Wi-Fi and open setup mode (it must be online). Use it when moving the box to a new place.' }) }}</p>
            <button type="button" class="btn secondary danger-outline" [disabled]="resetBusy() || b.wifi_reset.status === 'pending'" (click)="requestWifiReset()">
              {{ i18n.t({ th: 'สั่งตู้ลืม Wi-Fi', en: 'Make the box forget its Wi-Fi' }) }}
            </button>
            @if (b.wifi_reset.status === 'done') {
              <p class="small">{{ i18n.t({ th: 'ครั้งล่าสุด: ตู้ล้าง Wi-Fi แล้ว ', en: 'Last time: the box cleared its Wi-Fi ' }) }}{{ fwDate(b.wifi_reset.done_at!) }}</p>
            }
          </section>
        }

        <!-- โหมดละเอียด: สิ่งที่ระบบจะทำจริง (ตาม AdmUnbind_A) — ใช้ข้อมูลที่มีจริงเท่านั้น -->
        <section class="card adv-only stack">
          <dl class="kv small">
            <dt>{{ i18n.t({ th: 'สถานะผูก', en: 'Bound' }) }}</dt><dd>{{ b.bound ? i18n.t({ th: 'ผูกอยู่', en: 'Bound' }) : i18n.t({ th: 'ยังไม่ผูก', en: 'Not bound' }) }}</dd>
            <dt>{{ i18n.t({ th: 'QR เปิดใช้ตู้', en: 'Activation QR' }) }}</dt>
            <dd>{{ activationVersion() !== null ? 'v' + activationVersion() : '—' }}</dd>
          </dl>
          <p class="muted small">{{ i18n.t({ th: 'ทุกการเพิกถอน QR ถูกบันทึก · การเปิดดูรหัสลับถูกบันทึกไว้ด้วย', en: 'Every QR revocation is logged · revealing the device secret is recorded too' }) }}</p>
        </section>
        </div>
        }
        @if (tab() === 'firmware') {
        <app-admin-box-firmware class="easy-hide" [box]="b" (changed)="reload()" />
        }
        @if (tab() === 'test') {
        <div class="easy-hide">
        <h2 class="section-title">{{ i18n.t({ th: 'ทดสอบปลุกตู้', en: 'Wake test' }) }}</h2>
        <app-box-test [boxId]="b.id" (finished)="reload()" />

        <app-admin-box-diagnostics [box]="b" (changed)="reload()" />
        </div>
        }
        @if (tab() === 'qr') {
        <h2 class="section-title">{{ i18n.t({ th: 'QR ที่ใช้งานอยู่', en: 'QR codes in use' }) }}</h2>
        <div class="qr-grid">
          @for (q of activeQr(); track q.id) {
            <figure class="card">
              <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
              <figcaption class="small">
                <strong>{{ i18n.t(slot(q.slot)) }}</strong><br />
                {{ q.print_code }}
                @if (q.slot === 'activate') {
                  <br /><span class="chip ok">{{ i18n.t({ th: 'ยังไม่ใช้', en: 'unused' }) }}</span>
                }
              </figcaption>
            </figure>
          } @empty {
            <app-empty-state compact [title]="i18n.t({ th: 'ยังไม่มี QR ที่ใช้งานอยู่', en: 'No QR code is in use yet' })" />
          }
        </div>
        <button type="button" class="btn secondary" (click)="print()">{{ i18n.t({ th: 'พิมพ์ QR ที่ใช้งานอยู่', en: 'Print the QR codes in use' }) }}</button>

        @if (pastQr().length) {
          <details class="card past-qr easy-hide">
            <summary>
              <strong>{{ i18n.t({ th: 'QR ที่ใช้แล้วหรือยกเลิกแล้ว', en: 'Used or revoked QR codes' }) }}</strong>
              <span class="chip">{{ pastQr().length }}</span>
            </summary>
            <p class="muted small">{{ i18n.t({ th: 'เก็บไว้ดูประวัติ — ใบเหล่านี้สแกนไม่ได้แล้ว', en: 'Kept for history — these can no longer be scanned' }) }}</p>
            <div class="list">
              @for (q of pastQr(); track q.id) {
                <div class="row past">
                  <span class="grow">
                    <strong>{{ i18n.t(slot(q.slot)) }}</strong> <span class="muted small">v{{ q.version }} · {{ q.print_code }}</span>
                    <span class="muted small block">{{ fwDate(q.issued_at) }}</span>
                    @if (pastShown() === q.id) {
                      <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
                    }
                  </span>
                  <span class="chip" [class.warn]="q.status === 'revoked'">{{ q.status === 'revoked' ? i18n.t({ th: 'ยกเลิกแล้ว', en: 'revoked' }) : i18n.t({ th: 'ใช้แล้ว', en: 'used' }) }}</span>
                  <button type="button" class="btn secondary small" (click)="pastShown.set(pastShown() === q.id ? null : q.id)">{{ pastShown() === q.id ? i18n.t({ th: 'ซ่อน', en: 'Hide' }) : i18n.t({ th: 'ดู QR', en: 'View' }) }}</button>
                </div>
              }
            </div>
          </details>
        }

        <h2 class="section-title">{{ i18n.t({ th: 'ตั้งค่าบอร์ดที่หน้างาน', en: 'Set up the board on site' }) }}</h2>
        <section class="card stack">
          <app-box-setup-qr [boxId]="b.id" [serverUrl]="apiUrl" />
          <p class="muted small">{{ i18n.t({ th: 'ใช้ตอนติดตั้ง: มือถือต่อ Wi-Fi ของตู้แล้วสแกน QR นี้ — หน้า portal จะกรอก URL เซิร์ฟเวอร์ รหัสตู้ และรหัสลับให้เอง · QR ไม่ถูกเก็บไว้และหายเองใน 2 นาที', en: 'For installation: join the box Wi-Fi on the phone and scan this QR — the portal fills in the server URL, box ID and secret · the QR is not stored and disappears after 2 minutes.' }) }}</p>
        </section>

        <h2 class="section-title easy-hide">{{ i18n.t({ th: 'เขียนลงบอร์ด', en: 'Board provisioning' }) }}</h2>
        <section class="card stack easy-hide">
          <dl class="kv small">
            <dt>{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd><code>{{ b.id }}</code></dd>
            <dt>{{ i18n.t({ th: 'URL เซิร์ฟเวอร์', en: 'Server URL' }) }}</dt><dd><code>{{ apiUrl }}</code></dd>
            @if (secret(); as s) {
              <dt>{{ i18n.t({ th: 'รหัสลับประจำตู้', en: 'Device secret' }) }}</dt><dd><code class="secret">{{ s }}</code></dd>
            }
          </dl>
          @if (!secret()) {
            <button type="button" class="btn secondary" (click)="reveal()">{{ i18n.t({ th: 'ดูรหัสลับประจำตู้ (บันทึกการเปิดดู)', en: 'Show device secret (access is logged)' }) }}</button>
          } @else {
            <button type="button" class="btn secondary" (click)="copy(secret()!)">{{ i18n.t({ th: 'คัดลอกรหัสลับ', en: 'Copy secret' }) }}</button>
          }
          <p class="muted small">{{ i18n.t({ th: 'ตู้ต้องเซ็นทุกคำขอด้วยรหัสนี้ (โปรโตคอล §1.1) · ห้ามส่งในแชต', en: 'The box signs every request with it (protocol §1.1) · never paste it in chat' }) }}</p>
        </section>

        }
        @if (tab() === 'overview') {
        <app-admin-box-reports [box]="b" />
        }
        @if (tab() === 'danger') {
        <a class="btn secondary" [routerLink]="url('T01')" [queryParams]="{ id: b.id, from: 'D04' }">{{ i18n.t({ th: 'เปิดเช็กลิสต์ติดตั้ง (ช่าง)', en: 'Open install checklist' }) }}</a>
        @if (b.can_delete) {
          <section class="card stack delete-box">
            <p class="small">{{ i18n.t({ th: 'ตู้นี้ยังไม่เปิดใช้และไม่มีประวัติการทำงาน', en: 'This box is unused and has no activity history' }) }}</p>
            <button type="button" class="btn danger" (click)="deleteUnusedBox()">{{ i18n.t({ th: 'ลบตู้นี้', en: 'Delete this box' }) }}</button>
          </section>
        }
        }
      </div>

      <!-- ใบพิมพ์ QR (ซ่อนบนจอ) — ให้ปุ่ม "พิมพ์ QR" ใน D04 พิมพ์ได้จริง ไม่ใช่กระดาษเปล่า -->
      <div class="print-sheet" aria-hidden="true">
        <p class="print-title" style="grid-column: 1 / -1; margin: 0 0 6mm; font-size: 18pt">
          {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) }}{{ b.house_no }} · {{ b.id }}
        </p>
        @for (q of b.qr; track q.id) {
          @if (q.status === 'active') {
            <figure style="margin: 0; text-align: center">
              <app-qr-image [text]="q.url" level="H" [label]="i18n.t(slot(q.slot))" />
              <figcaption style="margin-block-start: 3mm; font-size: 11pt">
                <strong>{{ i18n.t(slot(q.slot)) }}</strong><br />
                {{ q.print_code }}
              </figcaption>
            </figure>
          }
        }
      </div>
    } @else {
      <p class="muted">{{ notFound() ? i18n.t({ th: 'ไม่พบตู้นี้', en: 'Mailbox not found' }) : i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styleUrl: './admin-box.scss',
})
export class AdminBox implements OnInit {
  protected readonly lowPct = LOW_BATTERY_PCT;
  protected readonly tab = signal<'overview' | 'test' | 'settings' | 'firmware' | 'qr' | 'danger'>('overview');
  protected readonly tabs: { v: 'overview' | 'test' | 'settings' | 'firmware' | 'qr' | 'danger'; icon: IconName; label: Tr }[] = [
    { v: 'overview', icon: 'home', label: { th: 'ภาพรวม', en: 'Overview' } },
    { v: 'test', icon: 'target', label: { th: 'ทดสอบ', en: 'Test' } },
    { v: 'settings', icon: 'settings', label: { th: 'ตั้งค่า', en: 'Settings' } },
    { v: 'firmware', icon: 'layers', label: { th: 'เฟิร์มแวร์', en: 'Firmware' } },
    { v: 'qr', icon: 'scan', label: { th: 'QR และบอร์ด', en: 'QR & board' } },
    { v: 'danger', icon: 'alert', label: { th: 'ขั้นสูง', en: 'Advanced' } },
  ];
  protected readonly i18n = inject(I18n);
  private readonly router = inject(Router);
  private readonly api = inject(AdminApi);
  private readonly toast = inject(Toast);
  private readonly confirm = inject(Confirm);
  protected readonly url = screenUrl;
  protected readonly boxBadge = boxBadge;
  protected readonly seen = seenText;
  protected readonly slot = (s: string | number) => SLOT_LABEL[String(s)];
  readonly id = input<string>();
  protected readonly box = signal<AdminBoxDetail | null>(null);
  protected readonly notFound = signal(false);
  protected readonly secret = signal<string | null>(null);
  protected readonly resettingConfig = signal(false);
  protected readonly ovReport = signal('');
  protected readonly ovScan = signal('');
  protected readonly ovAttempts = signal('');
  protected readonly ovLongpoll = signal('');
  protected readonly ovFlash = signal('');
  protected readonly ovPs = signal('');
  protected readonly ovError = signal<Tr | null>(null);
  protected readonly savingOverride = signal(false);
  private ovLoadedFor: string | null = null;
  protected readonly unbindReason = signal('');
  /** ติ๊ก "ให้ตู้ลืม Wi-Fi ด้วย" (ค่าเริ่มต้น เปิด) */
  protected readonly unbindResetWifi = signal(true);
  /** ผลหลังกด "คืนตู้เป็นตู้ใหม่" → ขึ้นเช็กลิสต์ให้ไปทำต่อหน้างาน */
  protected readonly returned = signal<{ wifi_reset: boolean; ap_name: string } | null>(null);
  protected readonly resetBusy = signal(false);
  protected readonly unbinding = signal(false);
  protected readonly serviceReason = signal('');
  protected readonly serviceBusy = signal(false);
  /** QR ที่ใช้งานอยู่ตอนนี้ (สถานะ active เท่านั้น — QR เปิดใช้ตู้ที่ใช้แล้วย้ายไปรายการประวัติ) */
  protected readonly activeQr = computed(() => (this.box()?.qr ?? []).filter((q) => q.status === 'active'));
  /** เวอร์ชัน QR เปิดใช้ตู้ล่าสุด (มีจริงในข้อมูลตู้) */
  protected readonly activationVersion = computed(() => {
    const list = (this.box()?.qr ?? []).filter((q) => q.slot === 'activate');
    return list.length ? Math.max(...list.map((q) => q.version)) : null;
  });
  /** ที่ใช้แล้ว/ถูกยกเลิก/รุ่นเก่า — พับเก็บไว้ ใหม่สุดก่อน */
  protected readonly pastQr = computed(() =>
    (this.box()?.qr ?? []).filter((q) => q.status !== 'active').sort((a, b) => b.issued_at.localeCompare(a.issued_at)),
  );
  protected readonly pastShown = signal<string | null>(null);
  /** URL ที่ตู้ใช้ = origin + apiBase ของเว็บนี้ (ไม่ฮาร์ดโค้ดโดเมน) */
  protected readonly apiUrl = location.origin + inject(ApiConfig).apiBase();

  constructor() {
    const t = setInterval(() => void this.reload(), 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
  }

  ngOnInit(): void {
    void this.reload();
  }

  async reload(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      const box = await this.api.box(id);
      this.box.set(box);
      // เติมฟอร์มค่าเฉพาะตู้จากค่าที่ทับอยู่ — ครั้งแรกที่โหลดตู้นี้เท่านั้น (ไม่ทับสิ่งที่แอดมินกำลังพิมพ์)
      if (this.ovLoadedFor !== id) {
        this.ovLoadedFor = id;
        this.fillOverride(box.config.override ?? {});
      }
    } catch {
      if (!this.box()) this.notFound.set(true);
    }
  }

  protected fwDate(iso: string): string {
    return new Date(iso).toLocaleString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' });
  }

  private fillOverride(o: Partial<BoxConfigOverride>): void {
    this.ovReport.set(o.report_at ?? '');
    this.ovScan.set(o.scan_timeout_s === undefined ? '' : String(o.scan_timeout_s));
    this.ovAttempts.set(o.max_attempts === undefined ? '' : String(o.max_attempts));
    this.ovLongpoll.set(o.longpoll_wait_s === undefined ? '' : String(o.longpoll_wait_s));
    this.ovFlash.set(o.flash_when_dark === undefined ? '' : o.flash_when_dark ? 'on' : 'off');
    this.ovPs.set(o.wifi_power_save === undefined ? '' : o.wifi_power_save ? 'on' : 'off');
  }

  /** PUT /admin/boxes/:id/config — ส่งเฉพาะช่องที่กรอก (ช่องว่าง = ใช้ค่ากลาง) · ตู้ได้ค่าใหม่ทันทีที่ long-poll */
  protected async saveOverride(): Promise<void> {
    const id = this.id();
    if (!id || this.savingOverride()) return;
    const body: Partial<BoxConfigOverride> = {};
    const num = (raw: string, min: number, max: number): number | undefined | null => {
      const t = raw.trim();
      if (!t) return undefined;
      const n = Number(t);
      return Number.isInteger(n) && n >= min && n <= max ? n : null;
    };
    const scan = num(this.ovScan(), 10, 60);
    const attempts = num(this.ovAttempts(), 1, 5);
    const longpoll = num(this.ovLongpoll(), 20, 55);
    if (scan === null || attempts === null || longpoll === null) {
      this.ovError.set({ th: 'ตัวเลขอยู่นอกช่วง — สแกน 10–60 · ลอง 1–5 · long-poll 20–55', en: 'A number is out of range — scan 10–60 · tries 1–5 · long-poll 20–55' });
      return;
    }
    this.ovError.set(null);
    if (this.ovReport()) body.report_at = this.ovReport();
    if (scan !== undefined) body.scan_timeout_s = scan;
    if (attempts !== undefined) body.max_attempts = attempts;
    if (longpoll !== undefined) body.longpoll_wait_s = longpoll;
    if (this.ovFlash()) body.flash_when_dark = this.ovFlash() === 'on';
    if (this.ovPs()) body.wifi_power_save = this.ovPs() === 'on';
    this.savingOverride.set(true);
    try {
      await this.api.setBoxConfig(id, body);
      await this.reload();
      this.toast.show({ th: 'บันทึกแล้ว · ตู้ได้ค่าใหม่ทันทีที่ติดต่อ', en: 'Saved · the box picks it up at its next contact' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not save — check your connection and try again' });
    } finally {
      this.savingOverride.set(false);
    }
  }

  protected async unbind(): Promise<void> {
    const id = this.id();
    const reason = this.unbindReason().trim();
    if (!id || !reason || this.unbinding()) return;
    if (
      !(await this.confirm.ask({
        title: { th: `คืน ${id} เป็นตู้ใหม่ใช่ไหม?`, en: `Return ${id} as new?` },
        body: {
          th: `เจ้าของเดิมจะไม่เห็นตู้นี้อีก ตู้ถูกถอดออกจากทุกโซนและล้างค่าเฉพาะตู้${this.unbindResetWifi() ? ' · ตู้จะลืม Wi-Fi และต้องตั้งใหม่ที่หน้างาน' : ''}`,
          en: `The owner will no longer see it, it leaves every zone and its per-box settings are cleared${this.unbindResetWifi() ? ' · it forgets its Wi-Fi and must be set up on site' : ''}.`,
        },
        confirm: { th: 'คืนตู้เป็นตู้ใหม่', en: 'Return as new' },
        danger: true,
      }))
    )
      return;
    this.unbinding.set(true);
    try {
      const r = await this.api.unbind(id, reason, this.unbindResetWifi());
      this.unbindReason.set('');
      await this.reload();
      this.returned.set({ wifi_reset: r.wifi_reset, ap_name: r.ap_name });
      this.toast.show({ th: 'คืนตู้เป็นตู้ใหม่แล้ว · ทำตามเช็กลิสต์ด้านบน', en: 'Box returned as new · follow the checklist above' });
    } catch (err) {
      const code = (err as { error?: { code?: string } })?.error?.code;
      this.toast.show(code === 'SOS_OPEN'
        ? { th: 'มี SOS ค้างอยู่ — ปิดเคสก่อน จึงจะยกเลิกการผูกได้', en: 'An SOS is open — close it first' }
        : { th: 'ยกเลิกการผูกไม่สำเร็จ', en: 'Could not unlink' });
    } finally {
      this.unbinding.set(false);
    }
  }

  protected async requestWifiReset(): Promise<void> {
    const id = this.id();
    if (!id || this.resetBusy()) return;
    if (
      !(await this.confirm.ask({
        title: { th: `สั่ง ${id} ลืม Wi-Fi ใช่ไหม?`, en: `Make ${id} forget its Wi-Fi?` },
        body: {
          th: 'ตู้จะหลุดจากเครือข่ายเดิมและต้องตั้งค่า Wi-Fi ใหม่ที่หน้างาน',
          en: 'It leaves the current network and must be set up again on site.',
        },
        confirm: { th: 'สั่งลืม Wi-Fi', en: 'Forget Wi-Fi' },
        danger: true,
      }))
    )
      return;
    this.resetBusy.set(true);
    try {
      await this.api.requestWifiReset(id);
      await this.reload();
      this.toast.show({ th: 'ส่งคำสั่งแล้ว · รอตู้ออนไลน์เพื่อรับ', en: 'Request sent · waiting for the box to be online' });
    } catch {
      this.toast.show({ th: 'สั่งไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not send — check your connection and try again' });
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected async cancelWifiReset(): Promise<void> {
    const id = this.id();
    if (!id || this.resetBusy()) return;
    this.resetBusy.set(true);
    try {
      await this.api.cancelWifiReset(id);
      await this.reload();
      this.toast.show({ th: 'ยกเลิกคำสั่งแล้ว', en: 'Request cancelled' });
    } catch {
      this.toast.show({ th: 'ยกเลิกไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not cancel — check your connection and try again' });
    } finally {
      this.resetBusy.set(false);
    }
  }

  protected async setService(active: boolean): Promise<void> {
    const id = this.id();
    if (!id || this.serviceBusy()) return;
    if (
      !active &&
      !(await this.confirm.ask({
        title: { th: `ปิดบริการ ${id} ใช่ไหม?`, en: `Switch ${id} off?` },
        body: {
          th: 'เจ้าหน้าที่จะตรวจตู้นี้ไม่ได้จนกว่าจะเปิดใหม่',
          en: 'Officers cannot check it until it is switched back on.',
        },
        confirm: { th: 'ปิดบริการ', en: 'Switch off' },
        danger: true,
      }))
    )
      return;
    this.serviceBusy.set(true);
    try {
      await this.api.setService(id, active, this.serviceReason().trim());
      this.serviceReason.set('');
      await this.reload();
      this.toast.show(active ? { th: 'เปิดบริการแล้ว', en: 'Switched on' } : { th: 'ปิดบริการแล้ว · แจ้งเจ้าของบ้านแล้ว', en: 'Switched off · the owner was notified' });
    } catch {
      this.toast.show({ th: 'ทำรายการไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง', en: 'Could not change it — check your connection and try again' });
    } finally {
      this.serviceBusy.set(false);
    }
  }

  protected windows(b: AdminBoxDetail): string {
    const w = b.config.config.windows ?? [];
    return w.length ? w.map((x) => x.join('–')).join(' · ') : this.i18n.t({ th: 'ยังไม่อยู่ในโซนไหน', en: 'not in any zone' });
  }

  protected async reveal(): Promise<void> {
    const id = this.id();
    if (!id) return;
    try {
      this.secret.set((await this.api.revealSecret(id)).device_secret);
    } catch {
      this.toast.show({ th: 'เปิดดูไม่สำเร็จ — ตรวจอินเทอร์เน็ตแล้วกดอีกครั้ง', en: 'Couldn’t load it — check your connection and tap again' });
    }
  }

  protected copy(text: string): void {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    this.toast.show({ th: 'คัดลอกแล้ว', en: 'Copied' });
  }

  protected print(): void {
    window.print();
  }

  /** โหมดง่าย: เปิดแท็บ QR ก่อนแล้วค่อยพิมพ์ (ให้เนื้อหาถูกวาดก่อน) */
  protected openPrint(): void {
    this.tab.set('qr');
    setTimeout(() => this.print(), 60);
  }

  protected async deleteUnusedBox(): Promise<void> {
    const id = this.id();
    if (!id || !this.box()?.can_delete) return;
    const confirmed = await this.confirm.ask({
      title: { th: `ยืนยันลบตู้ ${id}?`, en: `Delete box ${id}?` },
      body: {
        th: 'QR และข้อมูลตู้ที่ยังไม่เปิดใช้จะถูกลบถาวร',
        en: 'Its unused QR codes and box record will be permanently removed.',
      },
      confirm: { th: 'ลบตู้', en: 'Delete the box' },
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.api.deleteBox(id);
      this.toast.show({ th: 'ลบตู้แล้ว', en: 'Box deleted' });
      await this.router.navigateByUrl(this.url('D03'));
    } catch {
      this.toast.show({ th: 'ลบไม่สำเร็จ · ตู้อาจถูกเปิดใช้หรือมีประวัติแล้ว', en: 'Could not delete · the box may be activated or have activity' });
      await this.reload();
    }
  }

  protected async resetConfig(): Promise<void> {
    const id = this.id();
    if (!id || this.resettingConfig()) return;
    const confirmed = await this.confirm.ask({
      title: { th: `คืนค่าการตั้งค่าของ ${id} เป็นค่ากลางใช่ไหม?`, en: `Restore ${id} to shared settings?` },
      body: {
        th: 'เวลาตรวจยังมาจากโซน และระบบจะเก็บ Wi-Fi, รหัสบอร์ด, เจ้าของ, QR และประวัติไว้',
        en: 'Patrol hours stay with its zones. Wi-Fi, board credentials, ownership, QR codes, and history are kept.',
      },
      confirm: { th: 'คืนค่า', en: 'Restore' },
      danger: true,
    });
    if (!confirmed) return;
    this.resettingConfig.set(true);
    try {
      const result = await this.api.resetBoxConfig(id);
      this.ovLoadedFor = null; // ให้ reload เติมช่อง override ใหม่ (ไม่ค้างค่าเก่า)
      await this.reload();
      const synced = this.box()?.config.config_ver === result.config_ver && this.box()?.config.in_sync;
      this.toast.show(synced
        ? { th: 'คืนค่าแล้ว · บอร์ดรับค่ากลางแล้ว', en: 'Restored · the board has applied shared settings' }
        : { th: 'คืนค่าแล้ว · รอบอร์ด sync เมื่อเชื่อมต่อครั้งถัดไป', en: 'Restored · waiting for the board to sync on its next connection' });
    } catch {
      this.toast.show({ th: 'รีเซ็ตไม่สำเร็จ · โปรดโหลดข้อมูลตู้ใหม่', en: 'Could not reset · reload the box and try again' });
    } finally {
      this.resettingConfig.set(false);
    }
  }
}
