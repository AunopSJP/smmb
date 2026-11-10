import { ChangeDetectionStrategy, Component, computed, inject, input, OnDestroy, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { apiError } from '../core/api';
import { DisplaySettings } from '../core/display-settings';
import { I18n } from '../core/i18n';
import { hhmm } from '../core/inspection-api';
import { type BoxDetail, minutesAgo, OwnerApi, type Sos } from '../core/owner-api';
import { screenUrl } from '../screens/registry';
import { Icon } from '../shared/icon';
import { PageHeader } from '../shared/page-header';
import { LoadingRows } from '../shared/state-view';
import { Toast } from '../core/toast';
import { Session } from '../core/session';
import { liveRefresh } from '../core/live-refresh';

/** ต้องกดค้างกี่วินาทีถึงส่ง SOS (กันกดโดนโดยไม่ตั้งใจ ✅) */
const HOLD_SEC = 3;
/** รีเฟรชหน้าหลักทุกกี่วินาที */
const REFRESH_MS = 10_000;

/** H03 หน้าหลักเจ้าของบ้าน (api.md §4.2) · H03-L แบบเรียบง่าย · H03-e กดค้าง SOS — ข้อมูลจริง */
@Component({
  selector: 'app-owner-home',
  imports: [RouterLink, PageHeader, Icon, LoadingRows],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (noBox()) {
      <app-page-header [caption]="greeting()" [title]="i18n.t({ th: 'เริ่มใช้งานตู้ของคุณ', en: 'Set up your mailbox' })" />
      <div class="stack page onboard">
        <section class="hero" aria-hidden="true">
          <svg viewBox="0 0 240 170" class="art">
            <ellipse cx="120" cy="158" rx="78" ry="8" class="shadow" />
            <rect x="96" y="96" width="14" height="60" rx="3" class="post" />
            <path d="M60 60a40 40 0 0 1 40-40h70a28 28 0 0 1 28 28v56H60z" class="body" />
            <path d="M60 60a40 40 0 0 1 80 0v44H60z" class="door" />
            <rect x="78" y="58" width="44" height="6" rx="3" class="slot" />
            <g class="qr" transform="translate(150 50)">
              <rect width="34" height="34" rx="5" class="qr-bg" />
              <path d="M6 6h9v9H6zM19 6h9v9h-9zM6 19h9v9H6zM20 20h3v3h-3zM25 20h3v3h-3zM20 25h3v3h-3zM25 25h3v3h-3z" class="qr-ink" />
            </g>
            <path d="M198 40v34" class="flag-pole" />
            <path d="M198 40h22l-6 8 6 8h-22z" class="flag" />
            <circle cx="40" cy="36" r="4" class="spark" />
            <circle cx="214" cy="112" r="3" class="spark" />
            <circle cx="30" cy="118" r="2.5" class="spark" />
          </svg>
        </section>

        <section class="intro">
          <h2>{{ i18n.t({ th: 'ยังไม่ได้ผูกตู้กับบัญชีนี้', en: 'No mailbox linked to this account' }) }}</h2>
          <p class="muted">{{ i18n.t({ th: 'ผูกตู้ครั้งเดียว แล้วจะรู้ทันทีเมื่อเจ้าหน้าที่มาตรวจ มีของมาส่ง และกด SOS ขอความช่วยเหลือได้', en: 'Link it once to know right away when an officer checks in or a parcel arrives — and to send SOS' }) }}</p>
        </section>

        <ol class="steps">
          <li>
            <span class="num">1</span>
            <span><strong>{{ i18n.t({ th: 'เปิดฝาตู้', en: 'Open the mailbox' }) }}</strong><small>{{ i18n.t({ th: 'QR เปิดใช้ตู้ติดอยู่ด้านใน', en: 'The activation QR is inside' }) }}</small></span>
          </li>
          <li>
            <span class="num">2</span>
            <span><strong>{{ i18n.t({ th: 'สแกน QR เปิดใช้ตู้', en: 'Scan the activation QR' }) }}</strong><small>{{ i18n.t({ th: 'หรือพิมพ์รหัส 8 ตัวใต้ QR', en: 'or type the 8-character code below it' }) }}</small></span>
          </li>
          <li>
            <span class="num">3</span>
            <span><strong>{{ i18n.t({ th: 'ตั้งชื่อตู้', en: 'Name your mailbox' }) }}</strong><small>{{ i18n.t({ th: 'เช่น ตู้หน้าบ้าน — พร้อมใช้งานทันที', en: 'e.g. Front gate — ready to use' }) }}</small></span>
          </li>
        </ol>

        <div class="stack push-end">
          <a class="btn big" [routerLink]="url('A07')">
            <app-icon name="scan" [size]="20" />
            {{ i18n.t({ th: 'ผูกตู้ตอนนี้', en: 'Link my mailbox' }) }}
          </a>
          <p class="muted small center">{{ i18n.t({ th: 'ไม่พบ QR ในตู้? ติดต่อผู้ติดตั้งหรือผู้ดูแลระบบ', en: 'No QR inside? Contact your installer or the admin' }) }}</p>
        </div>
      </div>
    } @else if (!b()) {
      <app-page-header [caption]="greeting()" [title]="i18n.t({ th: 'หน้าหลัก', en: 'Home' })" />
      <div class="stack page">
        <app-loading-rows [rows]="4" [label]="i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' })" />
      </div>
    } @else if (b(); as b) {
      <app-page-header
        [caption]="i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + b.house_no + (display.mode() === 'advanced' ? ' · ' + b.id : '')"
        [title]="b.name || b.id"
        [bell]="url('H14')"
      />

      <div class="stack page">
        @if (boxes().length > 1) {
          <div class="segmented chips" role="group" [attr.aria-label]="i18n.t({ th: 'เลือกตู้', en: 'Choose a mailbox' })">
            @for (x of boxes(); track x.id) {
              <button type="button" [attr.aria-pressed]="b.id === x.id" (click)="select(x.id)">{{ x.house_no }} · {{ x.name || x.id }}</button>
            }
          </div>
        }
        @if (b.open_sos; as s) {
          <a class="card sos-open" [routerLink]="url(s.status === 'accepted' ? 'H11' : 'H09')" [queryParams]="{ id: s.id }">
            <app-icon name="alert" [size]="22" />
            <strong class="grow">{{ s.status === 'accepted' ? i18n.t({ th: 'มีเจ้าหน้าที่รับ SOS แล้ว', en: 'An officer took your SOS' }) : i18n.t({ th: 'SOS ของคุณยังเปิดอยู่', en: 'Your SOS is still open' }) }}</strong>
            <span>{{ i18n.t({ th: 'เปิด', en: 'Open' }) }}</span>
          </a>
        }
        @if (b.qr_task) {
          <section class="card warn-card stack">
            <strong>{{ i18n.t({ th: 'QR หน้าตู้ชำรุด', en: 'Front QR is damaged' }) }}</strong>
            <span class="small">{{ i18n.t({ th: 'นำ QR สำรองที่เก็บด้านในมาติดหน้าตู้ แล้วกดยืนยัน ระบบจะปิด QR ใบเก่าและออกใบสำรองใหม่ให้ผู้ดูแลระบบจัดส่ง', en: 'Move the backup QR inside the box to the front, then confirm. The old QR will be disabled and a replacement backup issued.' }) }}</span>
            <button type="button" class="btn secondary" [disabled]="confirmingQr()" (click)="confirmBackup(b.id)">
              {{ confirmingQr() ? i18n.t({ th: 'กำลังบันทึก…', en: 'Saving…' }) : i18n.t({ th: 'ติด QR สำรองแล้ว', en: 'Backup QR is in place' }) }}
            </button>
          </section>
        }
        @if (!b.coverage.has_officer) {
          <p class="card warn-card">
            <strong>{{ i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่ดูแลบ้านนี้', en: 'No officer covers this house yet' }) }}</strong><br />
            <span class="small">{{ i18n.t({ th: 'กด SOS ระบบจะบอกให้โทร 191 / 1669 ทันที', en: 'SOS will tell you to call 191 / 1669 straight away' }) }}</span>
          </p>
        }

        @if (b.status === 'offline') {
          <section class="card offline stack" role="status">
            <strong>{{ i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' }) }}</strong>
            <span class="small">{{ i18n.t({ th: 'เจ้าหน้าที่จะตรวจตู้ไม่ได้จนกว่าตู้จะกลับมาออนไลน์', en: 'Officers cannot check the mailbox until it is back online' }) }}</span>
            <ol class="checks small easy-hide">
              <li>{{ i18n.t({ th: 'แบตตู้อาจหมด — แผงโซลาร์โดนแดดไหม', en: 'The battery may be empty — is the solar panel in sun?' }) }}</li>
              <li>{{ i18n.t({ th: 'Wi-Fi บ้านใช้งานได้ไหม', en: 'Is your home Wi-Fi working?' }) }}</li>
              <li>{{ i18n.t({ th: 'เพิ่งเปลี่ยนรหัส Wi-Fi ใช่ไหม', en: 'Did you just change the Wi-Fi password?' }) }}</li>
            </ol>
            <div class="two">
              <a class="btn secondary" [routerLink]="url('H13-b')">{{ i18n.t({ th: 'ตั้ง Wi-Fi ใหม่', en: 'Set up Wi-Fi' }) }}</a>
              <a class="btn" [routerLink]="url('H13-c')">{{ i18n.t({ th: 'แจ้งช่าง', en: 'Get a technician' }) }}</a>
            </div>
          </section>
        }

        @if (easy()) {
          <!-- H03-L โหมดง่าย: สถานะใหญ่ + เวลาตรวจล่าสุด + ปุ่มใหญ่ 2 ปุ่ม (ตาม HomeEasy) -->
          <section class="card easy-hero" [class.warn]="b.status === 'offline' || b.status === 'service_closed'" role="status">
            <span class="big-ok" [class.warn]="b.status === 'offline' || b.status === 'service_closed'">
              <app-icon [name]="b.status === 'offline' || b.status === 'service_closed' ? 'alert' : 'check'" [size]="42" />
            </span>
            <strong>{{ easyHeadline(b) }}</strong>
            <span class="easy-sub">{{ easySubtitle(b) }}</span>
          </section>
          <section class="card easy-last">
            <span class="label">{{ i18n.t({ th: 'เจ้าหน้าที่มาตรวจล่าสุด', en: 'Last officer check' }) }}</span>
            <strong>{{ lastCheck(b) }}</strong>
            <span class="muted small">{{ i18n.t({ th: 'ตู้ส่งผลมาทุกครั้งที่มีคนมาตรวจ', en: 'The mailbox reports every check' }) }}</span>
          </section>
          <div class="easy-two">
            <a class="btn secondary easy-big" [routerLink]="url('H12')">
              <app-icon name="list" [size]="26" />
              <span>{{ i18n.t({ th: 'ดูประวัติ', en: 'See history' }) }}</span>
            </a>
            <a class="btn secondary easy-big" [routerLink]="url('H12')" [queryParams]="{ type: 'delivered' }">
              <app-icon name="box" [size]="26" />
              <span>{{ i18n.t({ th: 'ของมาส่ง', en: 'Parcels' }) }}<small>{{ i18n.t({ th: 'วันนี้ ', en: 'today ' }) }}{{ deliveriesToday(b) }} {{ i18n.t({ th: 'ครั้ง', en: '' }) }}</small></span>
            </a>
          </div>
        } @else {
        <section class="card stack">
          <div class="hero-row">
            <span class="okc" [class.warn]="b.status === 'offline' || b.status === 'service_closed'">
              <app-icon [name]="b.status === 'offline' || b.status === 'service_closed' ? 'alert' : 'check'" [size]="28" />
            </span>
            <div>
              <b>{{ statusTitle(b) }}</b>
              @if (lastInspection(b); as li) {
                <span>{{ i18n.t({ th: 'เจ้าหน้าที่ตรวจล่าสุด ', en: 'Last officer check ' }) }}{{ li }}</span>
              }
            </div>
          </div>
          <div class="stats easy-hide">
            <div class="mini">
              <span class="label">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</span>
              @if (b.battery) {
                <strong class="value">{{ b.battery.pct }}%</strong>
                <span class="bar"><span [style.width.%]="b.battery.pct"></span></span>
                <span class="label adv-only">{{ chargingText(b) }}</span>
              } @else {
                <strong class="value muted">{{ i18n.t({ th: 'รอข้อมูล', en: 'No report yet' }) }}</strong>
                <span class="label">{{ i18n.t({ th: 'ตู้ยังไม่ส่งระดับแบต', en: 'The mailbox has not reported yet' }) }}</span>
              }
            </div>
            <div class="mini">
              <span class="label">{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</span>
              @if (ago(b.last_seen_at); as m) {
                <strong class="value">{{ m }} {{ i18n.t({ th: 'นาที', en: 'min' }) }}</strong>
                <span class="label">{{ i18n.t({ th: 'ที่แล้ว', en: 'ago' }) }}</span>
              } @else if (b.last_seen_at) {
                <strong class="value">{{ i18n.t({ th: 'เมื่อสักครู่', en: 'just now' }) }}</strong>
              } @else {
                <strong class="value muted">{{ i18n.t({ th: 'รอข้อมูล', en: 'No report yet' }) }}</strong>
                <span class="label">{{ i18n.t({ th: 'ยังไม่เคยติดต่อ', en: 'Never connected' }) }}</span>
              }
              @if (b.last_seen_at) {
                <span class="label adv-only mono">{{ timeSec(b.last_seen_at) }}</span>
              }
            </div>
            <div class="mini cover-cell">
              <span class="label">{{ i18n.t({ th: 'ดูแลโดย', en: 'Covered by' }) }}</span>
              @if (b.coverage.agency_names.length) {
                <strong class="value agency">{{ b.coverage.agency_names.join(' · ') }}</strong>
              } @else {
                <strong class="value muted">{{ i18n.t({ th: 'ยังไม่มีหน่วยงาน', en: 'No agency yet' }) }}</strong>
                <a class="see-all" [routerLink]="url('H16')">{{ i18n.t({ th: 'ดูหน่วยงานใกล้บ้าน', en: 'Find an agency' }) }}</a>
              }
            </div>
          </div>
          <!-- HomeAdv: ตัวเลขทางเทคนิคที่ API ส่งมาจริง -->
          <div class="adv-grid adv-only">
            <div class="cell">
              <span class="label">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</span>
              <strong class="value">{{ b.battery ? b.battery.pct + '%' : '—' }}</strong>
              <span class="label">{{ b.battery ? chargingText(b) : '—' }}</span>
            </div>
            <div class="cell">
              <span class="label">{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</span>
              <strong class="value mono">{{ b.last_seen_at ? timeSec(b.last_seen_at) : '—' }}</strong>
            </div>
            <div class="cell">
              <span class="label">{{ i18n.t({ th: 'รายงานแบตเมื่อ', en: 'Battery reported' }) }}</span>
              <strong class="value mono">{{ b.battery?.reported_at ? timeSec(b.battery!.reported_at!) : '—' }}</strong>
            </div>
            <div class="cell">
              <span class="label">{{ i18n.t({ th: 'เวลาตรวจที่ตู้ใช้', en: 'Patrol at the box' }) }}</span>
              <strong class="value">{{ b.patrol.in_window ? i18n.t({ th: 'อยู่ในเวลาตรวจ', en: 'In patrol hours' }) : i18n.t({ th: 'นอกเวลาตรวจ', en: 'Outside patrol hours' }) }}</strong>
            </div>
            <div class="cell">
              <span class="label">{{ i18n.t({ th: 'สถานะ', en: 'State' }) }}</span>
              <strong class="value mono">{{ b.status }}</strong>
            </div>
            <div class="cell">
              <span class="label">{{ i18n.t({ th: 'QR หน้าตู้', en: 'Front QR' }) }}</span>
              <strong class="value mono">{{ b.qr_task ? b.qr_task.health : i18n.t({ th: 'ปกติ', en: 'OK' }) }}</strong>
            </div>
          </div>
          @if (b.patrol.windows.length) {
            <div class="patrol adv-only">
              <div class="label-row">
                <span class="label">{{ i18n.t({ th: 'เวลาตรวจวันนี้', en: 'Patrol hours today' }) }}</span>
                <span class="label mono">{{ windowsText(b) }} · {{ nowText() }}</span>
              </div>
              <div class="strip" role="img" [attr.aria-label]="windowsText(b)">
                @for (w of stripWindows(b); track $index) {
                  <i [style.left.%]="w.left" [style.width.%]="w.width"></i>
                }
                <span class="now" [style.left.%]="nowPct()"></span>
              </div>
              <div class="ticks"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>
              <span class="label">{{ b.patrol.in_window ? i18n.t({ th: 'ตอนนี้อยู่ในเวลาตรวจ', en: 'Currently in patrol hours' }) : i18n.t({ th: 'ตอนนี้นอกเวลาตรวจ', en: 'Currently outside patrol hours' }) }}</span>
            </div>
          }
          @if (b.coverage.agency_names.length) {
            <p class="muted small adv-only">{{ i18n.t({ th: 'ตรวจในรายการล่าสุด ', en: 'Checks in recent activity: ' }) }}{{ inspectedRecent(b) }} {{ i18n.t({ th: 'ครั้ง', en: '' }) }}</p>
          }
        </section>
        }

        @if (!easy()) {
        <div class="title-row">
          <h2 class="section-title">{{ i18n.t({ th: 'เหตุการณ์ล่าสุด', en: 'Recent activity' }) }}</h2>
          <a class="see-all" [routerLink]="url('H12')">{{ i18n.t({ th: 'ดูทั้งหมด', en: 'See all' }) }}</a>
        </div>
        @if (!b.latest_events.length) {
          <section class="empty">
            <strong>{{ i18n.t({ th: 'ยังไม่มีเหตุการณ์', en: 'No activity yet' }) }}</strong>
            <span class="muted small">{{ i18n.t({ th: 'การตรวจและการส่งของจะขึ้นที่นี่', en: 'Inspections and deliveries will show here' }) }}</span>
          </section>
        } @else {
          <ul class="list">
            @for (e of eventsFor(b); track e.id) {
              <li>
               <a class="row" [routerLink]="url(e.type === 'inspected' ? 'H12-b' : 'H12-c')" [queryParams]="{ id: e.id }">
                @if (e.type === 'inspected') {
                  <span class="icon-bubble"><app-icon name="shield" [size]="20" /></span>
                  <span class="grow">
                    <strong>{{ i18n.t({ th: 'เจ้าหน้าที่มาตรวจ', en: 'Officer checked' }) }}</strong>
                    <span class="muted small block">{{ e.officer?.agency_name }} · {{ e.officer?.display_name }}</span>
                    @if (e.has_photo) {
                      <span class="muted small block adv-only">{{ i18n.t({ th: 'มีรูปยืนยันการตรวจ', en: 'Inspection photo available' }) }}</span>
                    }
                  </span>
                } @else {
                  <span class="icon-bubble warn"><app-icon name="box" [size]="20" /></span>
                  <span class="grow">
                    <strong>{{ i18n.t({ th: 'มีของมาส่ง', en: 'Parcel delivered' }) }}</strong>
                    <span class="muted small block">{{ e.method === 'code' ? i18n.t({ th: 'ไรเดอร์พิมพ์รหัส', en: 'Rider typed the code' }) : i18n.t({ th: 'ไรเดอร์สแกน QR', en: 'Rider scanned the QR' }) }}</span>
                  </span>
                }
                @if (display.advancedMode()) {
                  <span class="muted small adv-only mono">{{ timeSec(e.at) }}</span>
                } @else {
                  <span class="muted small">{{ day(e.at) }} {{ time(e.at) }}</span>
                }
                <app-icon name="chevronRight" [size]="18" />
               </a>
              </li>
            }
          </ul>
        }
        }
        @if (error()) {
          <p class="muted small center">{{ i18n.t({ th: 'อัปเดตไม่สำเร็จ · กำลังลองอีกครั้ง', en: 'Couldn’t refresh · retrying' }) }}</p>
        }
      </div>

      <div class="sos-bar">
        <button
          type="button"
          class="btn big sos"
          [class.simple-sos]="easy()"
          [disabled]="sending()"
          (pointerdown)="startHold($event)"
          (pointerup)="stopHold()"
          (pointerleave)="stopHold()"
          (pointercancel)="stopHold()"
          (keydown.enter)="startHold($event)"
          (keydown.space)="startHold($event)"
          (keyup.enter)="stopHold()"
          (keyup.space)="stopHold()"
          (contextmenu)="$event.preventDefault()"
        >
          <span class="sos-text">
            {{ sending() ? i18n.t({ th: 'กำลังส่ง SOS…', en: 'Sending SOS…' }) : i18n.t({ th: 'SOS ขอความช่วยเหลือ', en: 'SOS — Get help' }) }}
            <small>
              {{ easy() ? i18n.t({ th: 'แตะ แล้วยืนยันอีกครั้ง', en: 'Tap, then confirm' }) : i18n.t({ th: 'กดค้างไว้ 3 วินาที', en: 'Press and hold 3 seconds' }) }}
              @if (b.status === 'offline') {
                · {{ i18n.t({ th: 'ใช้ได้แม้ตู้ไม่ออนไลน์', en: 'works while offline' }) }}
              }
            </small>
          </span>
        </button>
      </div>
      @if (sosError()) {
        <p class="card err" role="alert">{{ i18n.t({ th: 'ส่ง SOS ไม่สำเร็จ — โปรดโทร 191 / 1669 ทันที', en: 'Couldn’t send the SOS — call 191 / 1669 now' }) }}</p>
      }

      @if (holding()) {
        <!-- H03-e: นับถอยหลังระหว่างกดค้าง · ปล่อยก่อน = ยกเลิก -->
        <div class="hold" role="alert" aria-live="assertive">
          <p>{{ i18n.t({ th: 'กดค้างไว้ อย่าเพิ่งปล่อย', en: 'Keep holding' }) }}</p>
          <div class="ring" [style.--p]="progress()">
            <span>SOS</span>
            <strong>{{ remaining() }}</strong>
            <small>{{ i18n.t({ th: 'วินาที', en: 'sec' }) }}</small>
          </div>
          <p class="small">
            {{ i18n.t({ th: 'ครบ 3 วินาที ระบบจะส่ง SOS ทันที', en: 'At 3 seconds the SOS is sent' }) }}<br />
            {{ i18n.t({ th: 'ปล่อยนิ้วก่อน = ยกเลิก ไม่ส่ง', en: 'Let go before that = cancelled' }) }}
          </p>
        </div>
      }

      @if (confirmSos()) {
        <!-- โหมดง่าย: แตะ 1 ครั้ง → ยืนยันอีกครั้ง (ไม่ต้องกดค้าง เหมาะกับผู้ที่มือไม่มั่นคง) -->
        <div class="hold confirm" role="alertdialog" aria-modal="true" aria-labelledby="sos-confirm-title">
          <h2 id="sos-confirm-title">{{ i18n.t({ th: 'ส่ง SOS เลยไหม', en: 'Send SOS now?' }) }}</h2>
          <p class="small">{{ i18n.t({ th: 'เจ้าหน้าที่จะได้รับแจ้งทันที กดยืนยันเพื่อส่ง', en: 'Officers are alerted right away. Confirm to send.' }) }}</p>
          <button type="button" id="sos-confirm-send" class="btn sos" [disabled]="sending()" (click)="sendConfirmed()">
            {{ i18n.t({ th: 'ยืนยัน ส่ง SOS', en: 'Yes, send SOS' }) }}
          </button>
          <button type="button" class="btn secondary" (click)="cancelSos()">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
        </div>
      }
    } @else if (error()) {
      <div class="stack page">
        <p class="card err" role="alert">{{ i18n.t({ th: 'โหลดข้อมูลไม่สำเร็จ', en: 'Couldn’t load' }) }}</p>
        <button type="button" class="btn secondary" (click)="load()">{{ i18n.t({ th: 'ลองอีกครั้ง', en: 'Retry' }) }}</button>
      </div>
    } @else {
      <p class="muted center page">{{ i18n.t({ th: 'กำลังโหลด…', en: 'Loading…' }) }}</p>
    }
  `,
  styleUrl: './owner-home.scss',
  styles: `
    /* แถบ SOS — ลอยเหนือแท็บล่างตลอดเวลา เพื่อให้กดถึงได้แม้เลื่อนอยู่กลางหน้า */
    .sos-bar {
      position: sticky;
      inset-block-end: calc(76px + env(safe-area-inset-bottom, 0px));
      z-index: 5;
      margin-block-start: auto;
      padding-block: 8px;
    }
    .sos {
      background: var(--sos-bg);
      color: var(--sos-fg);
    }
    .sos-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      align-items: center;
      line-height: 1.25;
    }
    .sos-text small {
      font-size: 0.8125rem;
      font-weight: 500;
      opacity: 0.92;
    }
    /* กดค้าง / ยืนยัน SOS — ลอยเต็มจอเหนือเนื้อหา */
    .hold {
      position: fixed;
      inset: 0;
      z-index: 80;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      padding: 24px;
      background: rgb(10 12 14 / 78%);
      color: #fff;
      text-align: center;

      p {
        margin: 0;
        font-size: 1.125rem;
        font-weight: 700;
      }
    }
    .ring {
      position: relative;
      display: grid;
      place-content: center;
      justify-items: center;
      inline-size: 176px;
      block-size: 176px;
      border-radius: 50%;
      background: conic-gradient(#fff calc(var(--p, 0) * 1turn), rgb(255 255 255 / 20%) 0);

      &::before {
        content: '';
        position: absolute;
        inset: 12px;
        border-radius: 50%;
        background: #15181c;
      }
      > * {
        position: relative;
      }
      span {
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.18em;
        opacity: 0.8;
      }
      strong {
        font-size: 3rem;
        line-height: 1.05;
      }
      small {
        font-size: 0.75rem;
        opacity: 0.75;
      }
    }
    .hold.confirm {
      gap: 12px;

      h2 {
        margin: 0;
        font-size: 1.5rem;
      }
      .btn {
        inline-size: min(100%, 360px);
      }
    }
    .sos-open {
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--sos-bg);
      color: var(--sos-fg);
      text-decoration: none;
    }
    .warn-card {
      background: var(--warn-bg);
      color: var(--warn);
      box-shadow: none;
    }
    .err {
      background: var(--danger-bg);
      color: var(--sos);
      box-shadow: none;
    }
    .hero-row {
      display: flex;
      align-items: center;
      gap: 14px;
      b {
        display: block;
        font-size: 1.1875rem;
      }
      span:not(.okc) {
        font-size: 0.875rem;
        color: var(--text-muted);
      }
    }
    .okc {
      display: grid;
      place-items: center;
      flex: none;
      inline-size: 52px;
      block-size: 52px;
      border-radius: 50%;
      background: var(--ib-ok-bg);
      color: var(--ib-ok-fg);
      &.warn {
        background: var(--ib-warn-bg);
        color: var(--ib-warn-fg);
      }
    }
    .cover {
      align-self: flex-start;
      gap: 6px;
      font-size: 0.8125rem;
      font-weight: 400;
      padding: 6px 12px;
    }
    .offline {
      border: 2px solid var(--brand);
      box-shadow: none;
      .checks {
        margin: 0;
        padding-inline-start: 20px;
        color: var(--text-muted);
      }
      .two {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 10px;
      }
    }
    .center {
      text-align: center;
    }
    .block {
      display: block;
    }
  `,
})
export class OwnerHome implements OnDestroy {
  protected readonly i18n = inject(I18n);
  protected readonly display = inject(DisplaySettings);
  private readonly api = inject(OwnerApi);
  private readonly router = inject(Router);
  private readonly toast = inject(Toast);
  protected readonly url = screenUrl;
  protected readonly time = hhmm;
  protected readonly ago = minutesAgo;
  /** ?box=BX-00042 เมื่อมีหลายตู้ (ไม่ใส่ = ตู้แรก) */
  readonly box = input<string>();
  protected readonly b = signal<BoxDetail | null>(null);
  protected readonly boxes = signal<{ id: string; name: string; house_no: string }[]>([]);
  protected readonly noBox = signal(false);
  private readonly me = inject(Session).me;
  protected readonly greeting = computed(() => {
    const n = this.me()?.display_name;
    return n ? this.i18n.t({ th: `สวัสดี คุณ${n}`, en: `Hello, ${n}` }) : '';
  });
  /** หน้าหลักแบบง่าย: โหมดง่าย หรือผู้ใช้เปิด "หน้าหลักแบบเรียบง่าย" ไว้เดิม */
  protected readonly easy = computed(() => this.display.easyMode() || this.display.simpleHome());
  protected readonly error = signal(false);
  protected readonly sending = signal(false);
  protected readonly sosError = signal(false);
  protected readonly confirmingQr = signal(false);

  protected readonly holding = signal(false);
  protected readonly confirmSos = signal(false);
  private readonly heldMs = signal(0);
  private timer: ReturnType<typeof setInterval> | null = null;
  protected readonly progress = computed(() => Math.min(1, this.heldMs() / (HOLD_SEC * 1000)));
  protected readonly remaining = computed(() => Math.max(1, HOLD_SEC - Math.floor(this.heldMs() / 1000)));

  constructor() {
    void this.load();
    liveRefresh(() => this.load(), REFRESH_MS);
  }

  async load(): Promise<void> {
    try {
      let id = this.box() ?? this.b()?.id;
      if (!id || !this.boxes().length) {
        const boxes = await this.api.boxes();
        if (!boxes.length) {
          this.noBox.set(true);
          return;
        }
        this.boxes.set(boxes);
        id ??= boxes[0].id;
      }
      this.b.set(await this.api.box(id));
      this.error.set(false);
    } catch {
      this.error.set(true);
    }
  }

  /** สลับตู้ (เจ้าของมีหลายตู้) — จำใน ?box= ให้รีเฟรชแล้วยังอยู่ตู้เดิม */
  protected async select(id: string): Promise<void> {
    if (id === this.b()?.id) return;
    await this.router.navigate([], { queryParams: { box: id }, replaceUrl: true });
    await this.load();
  }

  protected async confirmBackup(boxId: string): Promise<void> {
    if (this.confirmingQr()) return;
    this.confirmingQr.set(true);
    try {
      await this.api.confirmQrBackupPlaced(boxId);
      await this.load();
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ · โหลดหน้าใหม่', en: 'Could not save · reload and try again' });
    } finally {
      this.confirmingQr.set(false);
    }
  }

  protected statusTitle(b: BoxDetail): string {
    if (b.status === 'offline') return this.i18n.t({ th: 'ตู้ไม่ออนไลน์', en: 'Mailbox offline' });
    if (b.status === 'service_closed') return this.i18n.t({ th: 'ตู้ปิดบริการอยู่', en: 'Mailbox not in service' });
    if (b.status === 'sleeping') return this.i18n.t({ th: 'ตู้พักอยู่ (นอกเวลาตรวจ) ปกติดี', en: 'Asleep outside patrol hours · all good' });
    return this.i18n.t({ th: 'ตู้ออนไลน์ ปกติดี', en: 'Online · all good' });
  }

  /** HomeEasy: ประโยคใหญ่ที่บอกว่าบ้านปลอดภัยหรือไม่ */
  protected easyHeadline(b: BoxDetail): string {
    if (b.status === 'offline') return this.i18n.t({ th: 'ตู้ติดต่อไม่ได้', en: 'The mailbox is offline' });
    if (b.status === 'service_closed') return this.i18n.t({ th: 'ตู้ปิดบริการอยู่', en: 'The mailbox is not in service' });
    if (b.status === 'sleeping') return this.i18n.t({ th: 'ตู้พักอยู่ ปกติดี', en: 'Asleep · all good' });
    return this.i18n.t({ th: 'บ้านคุณปลอดภัยดี', en: 'Your home is safe' });
  }

  protected easySubtitle(b: BoxDetail): string {
    if (b.status === 'offline') {
      return this.i18n.t({ th: 'ตอนนี้ตรวจตู้และรับของไม่ได้ แต่ปุ่ม SOS ยังใช้ได้ตามปกติ', en: 'Checks and parcels cannot be recorded right now, but SOS still works' });
    }
    if (b.status === 'service_closed') {
      return this.i18n.t({ th: 'ติดต่อผู้ดูแลระบบหากต้องการเปิดใช้ตู้อีกครั้ง', en: 'Contact the admin if you want the mailbox back in service' });
    }
    if (b.status === 'sleeping') {
      return this.i18n.t({ th: 'นอกเวลาตรวจ ตู้จะตื่นเองเมื่อถึงเวลาตรวจ', en: 'Outside patrol hours — it wakes by itself for the next patrol' });
    }
    return this.i18n.t({ th: b.name + ' ทำงานปกติ', en: b.name + ' is working normally' });
  }

  /** สถานะการชาร์จ (null = ตู้ไม่รายงาน) */
  protected chargingText(b: BoxDetail): string {
    if (!b.battery || b.battery.charging === null) return '—';
    return b.battery.charging ? this.i18n.t({ th: 'โซลาร์ · กำลังชาร์จ', en: 'Solar · charging' }) : this.i18n.t({ th: 'ไม่ได้ชาร์จ', en: 'Not charging' });
  }

  /** HomeAdv: นับการตรวจในรายการล่าสุด (ข้อมูลเท่าที่ API ส่งมา ไม่เดายอดทั้ง 7 วัน) */
  protected inspectedRecent(b: BoxDetail): number {
    return b.latest_events.filter((e) => e.type === 'inspected').length;
  }

  /** โหมดปกติแสดง 4 รายการล่าสุด · โหมดละเอียดแสดงทั้งหมด */
  protected eventsFor(b: BoxDetail): BoxDetail['latest_events'] {
    return this.display.advancedMode() ? b.latest_events : b.latest_events.slice(0, 4);
  }

  /** เวลาแบบมีวินาทีสำหรับโหมดละเอียด */
  protected timeSec(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
  }

  /** เวลาปัจจุบันของเวลาตรวจ (มีวินาที) */
  protected nowText(): string {
    return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Bangkok' });
  }

  /** ข้อความเวลาตรวจล่าสุด หรือ '' ถ้ายังไม่เคยมี */
  protected lastInspection(b: BoxDetail): string {
    const e = b.latest_events.find((x) => x.type === 'inspected');
    return e ? this.day(e.at) + ' ' + hhmm(e.at) : '';
  }

  /** เวลาตรวจล่าสุดแบบอ่านง่าย (โหมดง่าย) */
  protected lastCheck(b: BoxDetail): string {
    const e = b.latest_events.find((x) => x.type === 'inspected');
    return e ? `${this.day(e.at)} ${this.i18n.t({ th: 'เวลา', en: 'at' })} ${hhmm(e.at)}` : this.i18n.t({ th: 'ยังไม่มี', en: 'None yet' });
  }

  protected deliveriesToday(b: BoxDetail): number {
    const ymd = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    const t = ymd(new Date().toISOString());
    return b.latest_events.filter((x) => x.type !== 'inspected' && ymd(x.at) === t).length;
  }

  protected windowsText(b: BoxDetail): string {
    return b.patrol.windows.map(([a, z]) => `${a}–${z}`).join(' · ');
  }

  /** แถบ 24 ชม.: ช่วงตรวจเป็นแถบเข้ม */
  protected stripWindows(b: BoxDetail): { left: number; width: number }[] {
    const m = (t: string) => {
      const [h, mm] = t.split(':').map(Number);
      return h * 60 + mm;
    };
    return b.patrol.windows.map(([a, z]) => ({ left: (m(a) / 1440) * 100, width: (Math.max(m(z) - m(a), 0) / 1440) * 100 }));
  }

  protected nowPct(): number {
    const [h, m] = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number);
    return ((h * 60 + m) / 1440) * 100;
  }

  protected day(iso: string): string {
    const d = new Date(iso);
    const today = new Date();
    const same = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) === today.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
    return same ? this.i18n.t({ th: 'วันนี้', en: 'Today' }) : d.toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  }

  protected startHold(event: Event): void {
    event.preventDefault();
    if (this.timer || this.sending()) return; // ปุ่มคีย์บอร์ดค้างส่ง keydown ซ้ำ
    // โหมดง่าย: กดค้าง 3 วินาทียากสำหรับผู้สูงอายุ/มือไม่มั่นคง → แตะแล้วยืนยันอีกครั้ง
    if (this.easy()) {
      this.openSosConfirm();
      return;
    }
    // ล็อกการสัมผัสไว้กับปุ่ม: นิ้วเลื่อนเล็กน้อยก็ไม่ถูกนับว่าออกจากปุ่ม
    if (event instanceof PointerEvent) (event.currentTarget as Element | null)?.setPointerCapture?.(event.pointerId);
    const started = Date.now();
    this.heldMs.set(0);
    this.holding.set(true);
    this.timer = setInterval(() => {
      this.heldMs.set(Date.now() - started);
      if (this.heldMs() >= HOLD_SEC * 1000) {
        this.stopHold();
        void this.sendSos();
      }
    }, 50);
  }

  protected stopHold(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.holding.set(false);
  }

  /** โหมดง่าย: เปิดกล่องยืนยัน SOS แทนการกดค้าง 3 วินาที */
  private openSosConfirm(): void {
    this.confirmSos.set(true);
    setTimeout(() => document.getElementById('sos-confirm-send')?.focus(), 0);
  }

  protected cancelSos(): void {
    this.confirmSos.set(false);
  }

  protected sendConfirmed(): void {
    this.confirmSos.set(false);
    void this.sendSos();
  }

  /** POST /sos → H09 รอเจ้าหน้าที่ · ไม่มีโซน → H08 โทรเอง · มีอยู่แล้ว → หน้าเดิม */
  private async sendSos(): Promise<void> {
    const b = this.b();
    if (!b) return;
    this.sending.set(true);
    this.sosError.set(false);
    try {
      const r = await this.api.startSos(b.id);
      if ('code' in r) void this.router.navigateByUrl(screenUrl('H08'));
      else void this.router.navigate([screenUrl('H09')], { queryParams: { id: r.id } });
    } catch (err) {
      const e = apiError(err);
      const existing = e.body['sos'] as Sos | undefined;
      if (e.code === 'SOS_ALREADY_OPEN' && existing) {
        void this.router.navigate([screenUrl(existing.status === 'accepted' ? 'H11' : 'H09')], { queryParams: { id: existing.id } });
      } else {
        this.sosError.set(true);
      }
    } finally {
      this.sending.set(false);
    }
  }

  ngOnDestroy(): void {
    this.stopHold();
  }
}
