import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { OwnerApi, type BoxAddress, type BoxDetail, type BoxSummary, type PlanInfo, type ZoneRequest } from '../../core/owner-api';
import { Session } from '../../core/session';
import { SelectedBox } from '../../core/selected-box';
import { Toast } from '../../core/toast';
import { DisplaySettings, type TextSize, type UiMode } from '../../core/display-settings';
import { I18n, type Tr } from '../../core/i18n';
import { screenUrl } from '../../screens/registry';
import { BoxPicker } from '../../shared/box-picker';
import { MapPin, type LatLng } from '../../shared/map-pin';
import { Icon, type IconName } from '../../shared/icon';
import { PageHeader } from '../../shared/page-header';
import { LoadError } from '../../shared/state-view';
import { PushStatus } from '../../shared/push-status';
import { AccountActions } from '../auth/auth-account';
import { extrasFromProfile, extrasPayload, extrasValid, ProfileExtras } from '../../shared/profile-extras';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { bkkClock } from '../../core/time';

@Component({
  selector: 'app-owner-settings',
  imports: [RouterLink, PageHeader, Icon, AccountActions, PushStatus, MapPin, ProfileExtras, BoxPicker, LoadError],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-page-header
      [caption]="box() ? i18n.t({ th: 'บ้านเลขที่ ', en: 'House ' }) + (box()!.house_no ?? '') + (display.advancedMode() ? ' · ' + box()!.id : '') : i18n.t({ th: 'ยังไม่ได้ผูกตู้', en: 'No mailbox yet' })"
      [title]="i18n.t({ th: 'ตั้งค่า', en: 'Settings' })"
      [bell]="url('H14')"
    />
    <div class="stack grow">
      @if (failed()) {
        <app-load-error (retry)="retry()" />
      }
      <!-- 1) เรื่องที่ต้องทำก่อน -->
      <app-push-status class="easy-hide" [compact]="true" />
      @for (r of zoneRequests(); track r.id) {
        <section class="card stack request" role="status">
          <strong>{{ i18n.t({ th: 'หน่วยงานขอดูแลบ้านของคุณ', en: 'An agency asks to cover your house' }) }}</strong>
          <span>{{ r.agency.name }} · {{ i18n.t({ th: 'โซน ', en: 'zone ' }) }}{{ r.zone_name }}</span>
          <span class="muted small">{{ r.box.name }} · {{ i18n.t({ th: 'บ้านเลขที่ ', en: 'house ' }) }}{{ r.box.house_no }}</span>
          <span class="muted small">{{ i18n.t({ th: 'ยอมรับแล้ว เจ้าหน้าที่ของหน่วยงานนี้จะมาตรวจตู้ในเวลาตรวจ และได้รับ SOS ของบ้านนี้', en: 'If you accept, this agency’s officers will check your mailbox during patrol hours and receive your SOS' }) }}</span>
          <div class="two">
            <button type="button" class="btn secondary" [disabled]="deciding() === r.id" (click)="decide(r.id, false)">{{ i18n.t({ th: 'ปฏิเสธ', en: 'Decline' }) }}</button>
            <button type="button" class="btn" [disabled]="deciding() === r.id" (click)="decide(r.id, true)">{{ i18n.t({ th: 'ยอมรับ', en: 'Accept' }) }}</button>
          </div>
        </section>
      }
      @if (loaded() && !failed() && !boxes().length) {
        <section class="card nobox" role="status">
          <strong>{{ i18n.t({ th: 'ยังไม่ได้ผูกตู้', en: 'No mailbox linked yet' }) }}</strong>
          <span class="muted small">{{ i18n.t({ th: 'โปรดผูกตู้ก่อน จึงจะตั้งค่าตู้ได้ — สแกน QR เปิดใช้ตู้ที่อยู่ด้านในตู้', en: 'Link your mailbox first to change its settings — scan the activation QR inside the box' }) }}</span>
          <a class="btn" [routerLink]="url('A07')" [queryParams]="{ from: 'H13' }">{{ i18n.t({ th: 'ผูกตู้', en: 'Link a mailbox' }) }}</a>
        </section>
      }
      @if (boxes().length > 1) {
        <app-box-picker [boxes]="boxes()" [value]="box()?.id ?? null" (pick)="switchBox($event)" />
      }

      @if (display.easyMode()) {
        <!-- SettingsEasy: เมนูสั้น 4 อย่าง -->
        <h2 class="group">{{ i18n.t({ th: 'เมนู', en: 'Menu' }) }}</h2>
        <nav class="list easy-menu">
          <a class="row" routerLink="/settings/notifications">
            <span class="icon-bubble"><app-icon name="bell" [size]="22" /></span>
            <span class="grow">
              <strong>{{ i18n.t({ th: 'การแจ้งเตือน', en: 'Notifications' }) }}</strong>
              <span class="chip" [class.ok]="pushOn()" [class.warn]="!pushOn()">{{ pushOn() ? i18n.t({ th: 'เปิดอยู่', en: 'On' }) : i18n.t({ th: 'ยังไม่เปิด', en: 'Off' }) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="20" />
          </a>
          <a class="row" [routerLink]="url('H13-d')">
            <span class="icon-bubble"><app-icon name="settings" [size]="22" /></span>
            <span class="grow">
              <strong>{{ i18n.t({ th: 'แบบการใช้งาน', en: 'Display mode' }) }}</strong>
              <span class="muted small block">{{ i18n.t(displaySummary()) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="20" />
          </a>
          <a class="row" [routerLink]="url('H13-c')" [queryParams]="boxQuery()">
            <span class="icon-bubble"><app-icon name="user" [size]="22" /></span>
            <span class="grow">
              <strong>{{ i18n.t({ th: 'ขอให้ช่างมาดู', en: 'Ask a technician' }) }}</strong>
              <span class="muted small block">{{ i18n.t({ th: 'ตู้เสีย หรืออยากเปลี่ยน Wi-Fi', en: 'Broken box, or want to change Wi-Fi' }) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="20" />
          </a>
          <button type="button" class="row" (click)="openDetails()">
            <span class="icon-bubble"><app-icon name="pin" [size]="22" /></span>
            <span class="grow">
              <strong>{{ i18n.t({ th: 'ที่อยู่และข้อมูลของฉัน', en: 'My address and details' }) }}</strong>
              <span class="chip" [class.ok]="addressReady()" [class.warn]="!addressReady()">{{ addressReady() ? i18n.t({ th: 'กรอกแล้ว', en: 'Filled in' }) : i18n.t({ th: 'ยังกรอกไม่ครบ', en: 'Not complete' }) }}</span>
            </span>
            <app-icon name="chevronRight" [size]="20" />
          </button>
        </nav>
        <p class="muted small">{{ i18n.t({ th: 'อยากเห็นข้อมูลของตู้มากขึ้น? เปลี่ยนแบบการใช้งานเป็น "ปกติ" หรือ "ละเอียด" ได้ที่ข้อสอง', en: 'Want more detail about the box? Switch the display mode to “normal” or “detailed” in the second item.' }) }}</p>
      }

      <!-- 2) ตู้ของฉัน -->
      @if (box(); as b) {
        <h2 class="group easy-hide">{{ i18n.t({ th: 'ตู้ของฉัน', en: 'My mailbox' }) }}</h2>
        <section class="card easy-hide">
          <dl class="kv">
            <dt>{{ i18n.t({ th: 'ชื่อตู้', en: 'Name' }) }}</dt>
            <dd>
              @if (renaming()) {
                <input class="name-input" maxlength="50" [value]="draft()" (input)="draft.set($any($event.target).value)" />
                <span class="rename-actions">
                  <button type="button" class="link" (click)="renaming.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
                  <button type="button" class="link strong" [disabled]="!draft().trim()" (click)="rename()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
                </span>
              } @else {
                {{ b.name }} <button type="button" class="link" (click)="startRename()">{{ i18n.t({ th: 'แก้ไข', en: 'Edit' }) }}</button>
              }
            </dd>
            <dt>{{ i18n.t({ th: 'หมู่บ้าน / ย่าน', en: 'Village / area' }) }}</dt>
            <dd>
              @if (editingArea()) {
                <input class="name-input" maxlength="100" [value]="areaDraft()" (input)="areaDraft.set($any($event.target).value)" />
                <span class="rename-actions">
                  <button type="button" class="link" (click)="editingArea.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
                  <button type="button" class="link strong" (click)="saveArea()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
                </span>
              } @else {
                {{ b.area || '—' }} <button type="button" class="link" (click)="startArea()">{{ i18n.t({ th: 'แก้ไข', en: 'Edit' }) }}</button>
              }
            </dd>
            <dt class="adv-only">{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd class="adv-only">{{ b.id }}</dd>
            <dt class="easy-hide">{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</dt>
            <dd class="easy-hide">{{ b.battery ? b.battery.pct + '%' : '—' }}{{ b.battery?.charging ? i18n.t({ th: ' · ชาร์จอยู่', en: ' · charging' }) : '' }}</dd>
            <dt>{{ i18n.t({ th: 'ผู้ดูแล', en: 'Covered by' }) }}</dt>
            <dd>{{ b.coverage.agency_names.join(', ') || i18n.t({ th: 'ยังไม่มีเจ้าหน้าที่ดูแล', en: 'No agency yet' }) }}</dd>
            <dt>{{ i18n.t({ th: 'เวลาตรวจ', en: 'Patrol hours' }) }}</dt>
            <dd>{{ windows(b) }}</dd>
            <dt class="easy-hide">{{ i18n.t({ th: 'แพ็กเกจ', en: 'Plan' }) }}</dt>
            <dd class="easy-hide">
              @if (plan(); as p) {
                {{ p.name || '—' }}
                <span class="muted small block" [class.warn-text]="p.status === 'expiring' || p.status === 'expired'">{{ planNote(p) }}</span>
              } @else {
                —
              }
            </dd>
          </dl>
        </section>
        <a class="btn secondary easy-hide" [routerLink]="url('A07')" [queryParams]="{ from: 'H13' }">{{ i18n.t({ th: '+ ผูกตู้เพิ่ม', en: '+ Link another mailbox' }) }}</a>

        @if (display.advancedMode()) {
          <!-- SettingsAdv: ข้อมูลทางเทคนิคที่มีใน API จริง (ไม่มีข้อมูลเฟิร์มแวร์/เครื่องที่เข้าสู่ระบบ) -->
          <h2 class="group">{{ i18n.t({ th: 'ข้อมูลทางเทคนิค', en: 'Technical details' }) }}</h2>
          <section class="card">
            <dl class="kv">
              <dt>{{ i18n.t({ th: 'รหัสตู้', en: 'Box ID' }) }}</dt><dd class="mono">{{ b.id }}</dd>
              <dt>{{ i18n.t({ th: 'สถานะ', en: 'State' }) }}</dt><dd class="mono">{{ b.status }}</dd>
              <dt>{{ i18n.t({ th: 'ติดต่อล่าสุด', en: 'Last contact' }) }}</dt><dd class="mono">{{ b.last_seen_at ? exact(b.last_seen_at) : '—' }}</dd>
              <dt>{{ i18n.t({ th: 'แบตเตอรี่', en: 'Battery' }) }}</dt><dd class="mono">{{ b.battery ? b.battery.pct + '%' : '—' }}{{ b.battery ? ' · ' + (b.battery.charging ? i18n.t({ th: 'กำลังชาร์จ', en: 'charging' }) : i18n.t({ th: 'ไม่ได้ชาร์จ', en: 'not charging' })) : '' }}</dd>
              <dt>{{ i18n.t({ th: 'รายงานแบตเมื่อ', en: 'Battery reported' }) }}</dt><dd class="mono">{{ b.battery?.reported_at ? exact(b.battery!.reported_at!) : '—' }}</dd>
              <dt>{{ i18n.t({ th: 'คำสั่ง Wi-Fi', en: 'Wi-Fi command' }) }}</dt><dd class="mono">{{ b.wifi_reset.status }} · {{ b.wifi_reset.ap_name }}</dd>
              @if (b.wifi_reset.requested_at) { <dt>{{ i18n.t({ th: 'สั่งเมื่อ', en: 'Requested' }) }}</dt><dd class="mono">{{ exact(b.wifi_reset.requested_at) }}</dd> }
              @if (b.wifi_reset.done_at) { <dt>{{ i18n.t({ th: 'ตู้รับคำสั่ง', en: 'Received' }) }}</dt><dd class="mono">{{ exact(b.wifi_reset.done_at) }}</dd> }
              @if (b.qr_task) {
                <dt>{{ i18n.t({ th: 'เคส QR', en: 'QR case' }) }}</dt><dd class="mono">{{ b.qr_task.case_id }} · {{ b.qr_task.health }} · {{ exact(b.qr_task.requested_at) }}</dd>
              }
              @if (b.open_sos) {
                <dt>{{ i18n.t({ th: 'SOS ที่เปิดอยู่', en: 'Open SOS' }) }}</dt><dd class="mono">{{ b.open_sos.id }} · {{ b.open_sos.stage }} · {{ b.open_sos.status }}</dd>
              }
            </dl>
          </section>
        }

        <!-- 3) ข้อมูลที่กรอกไว้ (พับเก็บ แตะเพื่อแก้) -->
        <h2 class="group" id="owner-details">{{ i18n.t({ th: 'ข้อมูลที่กรอกไว้', en: 'Your details' }) }}</h2>
        <div class="folds">
          <details class="fold" [open]="showAddr()" (toggle)="showAddr.set($any($event.target).open)">
            <summary>
              <span class="icon-bubble"><app-icon name="pin" [size]="20" /></span>
              <span class="grow">
                <strong>{{ i18n.t({ th: 'ที่อยู่และหมุดบ้าน', en: 'Address and house pin' }) }}</strong>
                <span class="muted small block">{{ addressText(b) || i18n.t({ th: 'ยังไม่ได้กรอกที่อยู่', en: 'No address yet' }) }}</span>
              </span>
              <app-icon name="chevronRight" [size]="18" class="chev" />
            </summary>
            <div class="fold-body stack">
              @if (editingAddr()) {
                @if (copySources().length) {
                  <label class="field">
                    <span>{{ i18n.t({ th: 'ใช้ที่อยู่เดียวกับตู้อื่น', en: 'Use the same address as another mailbox' }) }}</span>
                    <select (change)="copyAddrFrom($any($event.target).value)">
                      <option value="">{{ i18n.t({ th: '— เลือกตู้ที่จะคัดลอก —', en: '— Pick a mailbox to copy from —' }) }}</option>
                      @for (o of copySources(); track o.id) {
                        <option [value]="o.id">{{ o.house_no }} · {{ o.name || o.id }}</option>
                      }
                    </select>
                    <small>{{ i18n.t({ th: 'คัดลอกที่อยู่และหมุดบ้านมาให้ ตรวจแล้วกดบันทึก', en: 'Copies the address and house pin — review, then save' }) }}</small>
                  </label>
                }
                @if (copiedFrom(); as c) {
                  <p class="copied small" role="status">
                    <app-icon name="check" [size]="16" />
                    {{ i18n.t({ th: 'คัดลอกจากบ้านเลขที่ ', en: 'Copied from house ' }) }}{{ c }}
                  </p>
                }
                <label class="field"><span>{{ i18n.t({ th: 'ที่อยู่ (ซอย / ถนน / หมู่)', en: 'Address (soi / road / moo)' }) }}</span>
                  <input maxlength="200" [value]="addr().line" (input)="setAddr('line', $any($event.target).value)" /></label>
                <div class="two">
                  <label class="field"><span>{{ i18n.t({ th: 'แขวง / ตำบล', en: 'Subdistrict' }) }}</span>
                    <input maxlength="100" [value]="addr().subdistrict" (input)="setAddr('subdistrict', $any($event.target).value)" /></label>
                  <label class="field"><span>{{ i18n.t({ th: 'เขต / อำเภอ', en: 'District' }) }}</span>
                    <input maxlength="100" [value]="addr().district" (input)="setAddr('district', $any($event.target).value)" /></label>
                </div>
                <label class="field"><span>{{ i18n.t({ th: 'จังหวัด', en: 'Province' }) }}</span>
                  <input maxlength="100" [value]="addr().province" (input)="setAddr('province', $any($event.target).value)" /></label>
                <app-map-pin [editable]="true" [(value)]="pin" />
                <div class="two">
                  <button type="button" class="btn secondary" (click)="editingAddr.set(false)">{{ i18n.t({ th: 'ยกเลิก', en: 'Cancel' }) }}</button>
                  <button type="button" class="btn" [disabled]="savingAddr()" (click)="saveAddr()">{{ i18n.t({ th: 'บันทึก', en: 'Save' }) }}</button>
                </div>
              } @else {
                @if (b.location) {
                  <app-map-pin [value]="b.location" [height]="180" />
                } @else {
                  <p class="muted small">{{ i18n.t({ th: 'ยังไม่ได้ปักหมุด — ปักไว้ช่วยให้เจ้าหน้าที่มาถึงเร็วขึ้นตอน SOS', en: 'No pin yet — a pin helps officers reach you faster during an SOS' }) }}</p>
                }
                @if (suggestSource(); as s) {
                  <p class="muted small">
                    {{ i18n.t({ th: 'มีที่อยู่ของบ้านเลขที่ ', en: 'House ' }) }}{{ s.house_no || s.name }}{{ i18n.t({ th: ' อยู่แล้ว — กดแก้ไข ระบบจะเติมที่อยู่และหมุดเดียวกันให้', en: ' already has an address — tap edit to fill in the same address and pin' }) }}
                  </p>
                }
                <button type="button" class="btn secondary" (click)="startAddr()">{{ i18n.t({ th: 'แก้ไขที่อยู่และหมุด', en: 'Edit address and pin' }) }}</button>
              }
            </div>
          </details>

          <details class="fold" [open]="showExtras()" (toggle)="showExtras.set($any($event.target).open)">
            <summary>
              <span class="icon-bubble"><app-icon name="user" [size]="20" /></span>
              <span class="grow">
                <strong>{{ i18n.t({ th: 'ข้อมูลของฉันและรายละเอียดบ้าน', en: 'My details and house details' }) }}</strong>
                <span class="muted small block">{{ extrasSummary() }}</span>
              </span>
              <app-icon name="chevronRight" [size]="18" class="chev" />
            </summary>
            <div class="fold-body stack">
              <app-profile-extras kind="owner" [(value)]="extras" [tried]="triedExtras()" />
              <button type="button" class="btn" [disabled]="savingExtras()" (click)="saveExtras()">{{ i18n.t({ th: 'บันทึกข้อมูล', en: 'Save details' }) }}</button>
            </div>
          </details>
        </div>
      }

      <!-- 4) เมนูตั้งค่า -->
      <h2 class="group easy-hide">{{ i18n.t({ th: 'ตั้งค่าและบริการ', en: 'Settings and services' }) }}</h2>
      <nav class="list easy-hide">
        @for (m of menu(); track m.code) {
          @if (m.needsBox && loaded() && !boxes().length) {
            <div class="row disabled" aria-disabled="true">
              <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
              <span class="grow">
                <strong>{{ i18n.t(m.title) }}</strong>
                <span class="muted small block">{{ i18n.t({ th: 'ผูกตู้ก่อนจึงจะใช้ได้', en: 'Link a mailbox first' }) }}</span>
              </span>
            </div>
          } @else {
          <a class="row" [routerLink]="url(m.code)" [queryParams]="m.needsBox ? boxQuery() : null">
            <span class="icon-bubble"><app-icon [name]="m.icon" [size]="20" /></span>
            <span class="grow">
              <strong>{{ i18n.t(m.title) }}</strong>
              <span class="muted small block">{{ i18n.t(m.sub) }}</span>
            </span>
            @if (m.badge) {
              <span class="chip ok">{{ i18n.t(m.badge) }}</span>
            } @else {
              <app-icon name="chevronRight" [size]="18" />
            }
          </a>
          }
        }
        <a class="row" routerLink="/settings/notifications">
          <span class="icon-bubble"><app-icon name="bell" [size]="20" /></span>
          <span class="grow">
            <strong>{{ i18n.t({ th: 'ตั้งค่าการแจ้งเตือน', en: 'Notification settings' }) }}</strong>
            <span class="muted small block">{{ pushOn() ? i18n.t({ th: 'เครื่องนี้รับแจ้งเตือนอยู่ · เลือกชนิดที่รับ · ทดสอบ', en: 'On for this device · choose what to receive · test' }) : i18n.t({ th: 'เครื่องนี้ยังไม่ได้เปิด — แตะเพื่อเปิด', en: 'Off on this device — tap to turn on' }) }}</span>
          </span>
          <span class="chip" [class.ok]="pushOn()" [class.warn]="!pushOn()">{{ pushOn() ? i18n.t({ th: 'เปิด', en: 'On' }) : i18n.t({ th: 'ปิด', en: 'Off' }) }}</span>
          <app-icon name="chevronRight" [size]="18" />
        </a>
      </nav>

      <!-- 5) บัญชี -->
      <app-account-actions class="easy-hide" current="owner" from="H13" />

      <button type="button" class="btn secondary signout" (click)="signout()">
        {{ i18n.t({ th: 'ออกจากระบบ', en: 'Sign out' }) }}
      </button>
    </div>
  `,
  styles: `
    .request {
      border: 2px solid var(--brand);
    }
    .sec {
      font-size: 1rem;
    }
    .group {
      margin: 12px 4px 0;
      font-size: 0.8125rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: var(--text-muted);
    }
    .folds {
      display: flex;
      flex-direction: column;
      border-radius: var(--radius);
      background: var(--surface);
      box-shadow: var(--shadow);
      overflow: hidden;
    }
    /* SettingsEasy: แถวใหญ่ กดง่าย */
    .easy-menu .row {
      min-block-size: 96px;
      gap: 16px;
    }
    .easy-menu .icon-bubble {
      inline-size: 54px;
      block-size: 54px;
      border-radius: 16px;
    }
    .easy-menu strong {
      font-size: 1.1875rem;
    }
    .easy-menu .chip {
      margin-block-start: 4px;
    }
    /* แถวที่เป็นปุ่ม (เดิมใช้ <a href="#...">) — ให้หน้าตาเหมือนลิงก์แถวเดิม */
    .easy-menu button.row {
      inline-size: 100%;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }
    /* เผื่อหัวข้อถูก header บังตอนเลื่อนด้วย scrollIntoView */
    #owner-details {
      scroll-margin-block-start: 16px;
    }
    .fold + .fold {
      border-block-start: 1px solid var(--line);
    }
    .fold summary {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 16px;
      min-block-size: 56px;
      cursor: pointer;
      list-style: none;
    }
    .fold summary::-webkit-details-marker {
      display: none;
    }
    .fold .chev {
      transition: transform 0.15s;
    }
    .fold[open] .chev {
      transform: rotate(90deg);
    }
    .fold-body {
      padding: 4px 16px 16px;
    }
    .two {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .copied {
      display: flex;
      align-items: center;
      gap: 6px;
      margin: 0;
      color: var(--ok);
      font-weight: 700;
    }
    .nobox {
      display: flex;
      flex-direction: column;
      gap: 8px;
      border-color: var(--brand-text);
    }
    .row.disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .grow {
      flex: 1;
      min-inline-size: 0;
    }
    .block {
      display: block;
    }
    .name-input {
      inline-size: 100%;
      min-block-size: 44px;
      padding: 6px 10px;
      border-radius: var(--radius-sm);
      border: 1.5px solid var(--line);
      background: var(--surface);
      color: var(--text);
      font: inherit;
    }
    .rename-actions {
      display: flex;
      gap: 12px;
      margin-block-start: 4px;
    }
    .link {
      border: 0;
      background: none;
      padding: 6px;
      margin: -6px;
      font: inherit;
      color: var(--brand-text);
      cursor: pointer;
    }
    .link.strong {
      font-weight: 700;
    }
    .signout {
      margin-block-start: auto;
      color: var(--brand-text);
      box-shadow: inset 0 0 0 1.5px var(--line);
    }
  `,
})
export class OwnerSettings {
  protected readonly i18n = inject(I18n);
  protected readonly url = screenUrl;
  protected readonly display = inject(DisplaySettings);
  /** สรุปค่าการแสดงผลปัจจุบัน (โหมด · ขนาดตัวอักษร) อ่านจาก DisplaySettings จริง */
  protected readonly displaySummary = computed<Tr>(() => {
    const mode: Record<UiMode, Tr> = { easy: { th: 'ง่าย', en: 'easy' }, default: { th: 'ปกติ', en: 'default' }, advanced: { th: 'ละเอียด', en: 'advanced' } };
    const size: Record<TextSize, Tr> = { normal: { th: 'ตัวปกติ', en: 'normal text' }, large: { th: 'ตัวใหญ่', en: 'large text' }, xlarge: { th: 'ตัวใหญ่มาก', en: 'extra-large text' } };
    const m = mode[this.display.mode()];
    const z = size[this.display.textSize()];
    return { th: `ตอนนี้: ${m.th} · ${z.th}`, en: `Now: ${m.en} · ${z.en}` };
  });
  private readonly api = inject(OwnerApi);
  private readonly session = inject(Session);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(Toast);
  private readonly remembered = inject(SelectedBox);
  protected readonly boxes = signal<BoxSummary[]>([]);
  protected readonly box = signal<BoxDetail | null>(null);
  protected readonly renaming = signal(false);
  protected readonly draft = signal('');
  /** ส่ง ?box= ต่อให้หน้าลูก (Wi-Fi/ช่าง) — null = ไม่มีตู้ */
  protected boxQuery(): { box: string } | null {
    const id = this.box()?.id;
    return id ? { box: id } : null;
  }
  protected readonly plan = signal<PlanInfo | null>(null);
  protected readonly editingArea = signal(false);
  protected readonly areaDraft = signal('');
  protected readonly editingAddr = signal(false);
  protected readonly zoneRequests = signal<ZoneRequest[]>([]);
  protected readonly deciding = signal<string | null>(null);
  protected readonly savingAddr = signal(false);
  protected readonly addr = signal<BoxAddress>({ line: '', subdistrict: '', district: '', province: '' });
  protected readonly pin = signal<LatLng | null>(null);
  private readonly http = inject(HttpClient);
  protected readonly extras = signal(extrasFromProfile(inject(Session).me()?.profile));
  protected readonly savingExtras = signal(false);
  protected readonly showExtras = signal(false);
  protected readonly showAddr = signal(false);
  /** คัดลอกที่อยู่จากตู้ใบอื่นแล้ว — บอกว่ามาจากบ้านไหน */
  protected readonly copiedFrom = signal<string | null>(null);
  /** ตู้ใบอื่นที่มีที่อยู่/หมุดแล้ว (ใช้เป็นต้นแบบคัดลอก) */
  protected readonly copySources = computed(() =>
    this.boxes().filter((x) => x.id !== this.box()?.id && (!!x.address?.line || !!x.address?.subdistrict || !!x.address?.district || !!x.address?.province || !!x.location)),
  );
  /** ตู้ที่ควรใช้เป็นต้นแบบอัตโนมัติ เมื่อตู้ปัจจุบันยังไม่มีที่อยู่/หมุด (เลือกบ้านเลขที่เดียวกันก่อน) */
  protected readonly suggestSource = computed(() => {
    const b = this.box();
    if (!b) return null;
    const a = b.address;
    if (a?.line || a?.subdistrict || a?.district || a?.province || b.location) return null;
    const list = this.copySources();
    return list.find((x) => x.house_no && x.house_no === b.house_no) ?? list[0] ?? null;
  });
  /** ลำดับคำขอโหลดตู้ — สลับตู้เร็ว ๆ แล้วคำตอบเก่าห้ามทับ */
  private openSeq = 0;
  /** บรรทัดสรุปตอนพับอยู่ — บอกว่ากรอกครบหรือยัง */
  protected readonly extrasSummary = computed(() => {
    const f = this.extras();
    if (!extrasValid(f, 'owner')) return this.i18n.t({ th: 'ยังกรอกไม่ครบ — แตะ "แก้ไข" เพื่อเติม', en: 'Not complete yet — tap “Edit” to finish' });
    return this.i18n.t({ th: 'กรอกครบแล้ว', en: 'Complete' });
  });
  protected readonly triedExtras = signal(false);
  /** โหลดรายการตู้เสร็จแล้ว — ยังไม่มีตู้ = ตั้งค่าตู้ไม่ได้ ให้ผูกตู้ก่อน */
  protected readonly loaded = signal(false);
  protected readonly failed = signal(false);
  /** เครื่องนี้เปิดแจ้งเตือนแล้ว (ใช้ในเมนูโหมดง่าย) */
  protected readonly pushOn = computed(() => this.session.me()?.push.subscribed === true);
  /** ที่อยู่กรอกครบหรือยัง (ใช้ป้ายในเมนูโหมดง่าย) */
  protected readonly addressReady = computed(() => {
    const a = this.box()?.address;
    return !!a && !!(a.line && a.subdistrict && a.district && a.province);
  });

  constructor() {
    void this.api.plan().then((p) => this.plan.set(p)).catch(() => undefined);
    void this.loadRequests();
    void this.loadBoxes();
  }

  protected retry(): void {
    void this.loadBoxes();
  }

  private async loadBoxes(): Promise<void> {
    try {
      const b = await this.api.boxes();
      this.boxes.set(b);
      this.loaded.set(true);
      this.failed.set(false);
      // ?box= → ตู้ที่เลือกไว้ล่าสุด (กลับจากหน้าลูก / มาจากแท็บล่าง) → ตู้แรก
      const wanted = this.route.snapshot.queryParamMap.get('box') ?? this.remembered.id();
      const initial = b.find((x) => x.id === wanted) ?? b[0];
      if (initial) await this.open(initial.id);
    } catch {
      this.loaded.set(true);
      this.failed.set(true);
    }
  }

  protected async open(id: string): Promise<void> {
    const seq = ++this.openSeq;
    try {
      const detail = await this.api.box(id);
      if (seq !== this.openSeq) return;
      this.box.set(detail);
      this.remembered.id.set(detail.id);
      this.failed.set(false);
    } catch {
      if (seq === this.openSeq) this.failed.set(true);
    }
  }

  /** เปลี่ยนตู้จากตัวเลือก — ปิดฟอร์มที่แก้ค้างของตู้เดิม กันกดบันทึกข้ามตู้ */
  protected async switchBox(id: string): Promise<void> {
    this.copiedFrom.set(null);
    this.editingAddr.set(false);
    this.showAddr.set(false);
    this.renaming.set(false);
    this.editingArea.set(false);
    await this.open(id);
  }

  /** คัดลอกที่อยู่ + หมุดจากตู้อื่น (เจ้าของมีหลายตู้อยู่บ้านเดียวกัน) */
  protected copyAddrFrom(id: string): void {
    if (!id) return;
    const src = this.boxes().find((x) => x.id === id);
    if (!src) return;
    this.addr.set({ ...src.address });
    this.pin.set(src.location);
    this.copiedFrom.set(src.house_no || src.name || src.id);
  }

  protected windows(b: BoxDetail): string {
    return b.patrol.windows.map((w) => w.join('–')).join(' · ') || '—';
  }

  /** เวลาแบบมีวินาที (โหมดละเอียด) */
  protected exact(iso: string): string {
    return bkkClock(iso);
  }

  /**
   * โหมดง่าย: แตะ "ที่อยู่และข้อมูลของฉัน" แล้วเลื่อนไปส่วนข้อมูลในหน้าเดิม
   * ห้ามใช้ href="#owner-details" — Angular router ตีความเป็น path ว่าง (+fragment)
   * แล้ว route '' (homeRedirect) จะพาไปหน้าหลัก
   */
  protected openDetails(): void {
    this.showAddr.set(true);
    // ไม่ใช้ behavior:'smooth' — บาง WebView/เบราว์เซอร์ฝังตัวยกเลิก smooth scroll เงียบ ๆ
    document.getElementById('owner-details')?.scrollIntoView({ block: 'start' });
  }

  protected startRename(): void {
    this.draft.set(this.box()?.name ?? '');
    this.renaming.set(true);
  }

  /** ข้อความใต้ชื่อแพ็ก: ไม่มีวันหมดอายุ / ถึงวันที่ / ใกล้หมด / หมดแล้ว */
  protected planNote(p: PlanInfo): string {
    const date = p.ends_at ? new Date(p.ends_at).toLocaleDateString(this.i18n.lang() === 'th' ? 'th-TH' : 'en-GB', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }) : '';
    if (p.status === 'expired') return this.i18n.t({ th: `หมดอายุเมื่อ ${date}`, en: `Expired on ${date}` });
    if (p.status === 'expiring') return this.i18n.t({ th: `ใกล้หมดอายุ · ถึง ${date}`, en: `Expiring soon · until ${date}` });
    return p.ends_at ? this.i18n.t({ th: `ใช้ได้ถึง ${date}`, en: `Valid until ${date}` }) : this.i18n.t({ th: 'ไม่มีวันหมดอายุ', en: 'No end date' });
  }

  private async loadRequests(): Promise<void> {
    this.zoneRequests.set(await this.api.zoneRequests().catch(() => []));
  }

  /** ยอมรับ / ปฏิเสธคำขอของหน่วยงาน (api.md §4.6) */
  protected async decide(id: string, accept: boolean): Promise<void> {
    if (this.deciding()) return;
    this.deciding.set(id);
    try {
      await this.api.decideZoneRequest(id, accept);
      this.toast.show(accept ? { th: 'ยอมรับแล้ว', en: 'Accepted' } : { th: 'ปฏิเสธแล้ว', en: 'Declined' });
      const b = this.box();
      if (b && accept) await this.open(b.id);
    } catch {
      this.toast.show({ th: 'ทำรายการไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t do that — try again' });
    } finally {
      this.deciding.set(null);
      await this.loadRequests();
    }
  }

  /** PATCH /me { profile } — รายละเอียดบ้าน/ข้อมูลส่วนตัว */
  protected async saveExtras(): Promise<void> {
    this.triedExtras.set(true);
    if (this.savingExtras()) return;
    if (!extrasValid(this.extras(), 'owner')) {
      this.toast.show({ th: 'กรอกประเภทบ้าน รหัสไปรษณีย์ และจำนวนผู้อยู่อาศัยให้ครบ', en: 'Fill in house type, postal code and number of residents' });
      return;
    }
    this.savingExtras.set(true);
    try {
      await firstValueFrom(this.http.patch('/api/v1/me', { profile: extrasPayload(this.extras(), 'owner') }));
      await this.session.refresh();
      this.toast.show({ th: 'บันทึกข้อมูลแล้ว', en: 'Saved' });
      this.showExtras.set(false);
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    } finally {
      this.savingExtras.set(false);
    }
  }

  protected addressText(b: BoxDetail): string {
    const a = b.address;
    return [a.line, a.subdistrict, a.district, a.province].filter((x) => x).join(' ');
  }

  protected startAddr(): void {
    const b = this.box();
    if (!b) return;
    // ตู้ใหม่ที่ยังไม่มีที่อยู่: เติมจากบ้านเลขที่เดียวกันให้ก่อน (กดครั้งเดียวจบ)
    const src = this.suggestSource();
    if (src) {
      this.addr.set({ ...src.address });
      this.pin.set(src.location);
      this.copiedFrom.set(src.house_no || src.name || src.id);
    } else {
      this.addr.set({ ...b.address });
      this.pin.set(b.location);
      this.copiedFrom.set(null);
    }
    this.editingAddr.set(true);
  }

  protected setAddr(key: keyof BoxAddress, v: string): void {
    this.addr.update((a) => ({ ...a, [key]: v }));
  }

  /** PATCH /boxes/:box_id ที่อยู่ + หมุด */
  protected async saveAddr(): Promise<void> {
    const b = this.box();
    if (!b || this.savingAddr()) return;
    this.savingAddr.set(true);
    try {
      await this.api.setAddress(b.id, this.addr(), this.pin());
      this.editingAddr.set(false);
      this.copiedFrom.set(null);
      // อัปเดตรายการตู้ด้วย — ตู้ใบอื่นจะได้คัดลอกที่อยู่ใหม่นี้ได้ทันที
      const a = this.addr();
      this.boxes.update((list) =>
        list.map((x) =>
          x.id === b.id
            ? { ...x, address: { line: a.line.trim(), subdistrict: a.subdistrict.trim(), district: a.district.trim(), province: a.province.trim() }, location: this.pin() }
            : x,
        ),
      );
      await this.open(b.id);
      this.toast.show({ th: 'บันทึกที่อยู่แล้ว', en: 'Address saved' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    } finally {
      this.savingAddr.set(false);
    }
  }

  protected startArea(): void {
    this.areaDraft.set(this.box()?.area ?? '');
    this.editingArea.set(true);
  }

  /** PATCH /boxes/:box_id { area } — เจ้าหน้าที่/หัวหน้าเห็นย่านนี้ตอนเพิ่มบ้านเข้าโซน */
  protected async saveArea(): Promise<void> {
    const b = this.box();
    if (!b) return;
    const area = this.areaDraft().trim();
    try {
      await this.api.setArea(b.id, area);
      this.editingArea.set(false);
      await this.open(b.id);
      this.toast.show({ th: 'บันทึกย่านแล้ว', en: 'Area saved' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    }
  }

  /** PATCH /boxes/:box_id { name } */
  protected async rename(): Promise<void> {
    const b = this.box();
    if (!b || !this.draft().trim()) return;
    try {
      await this.api.rename(b.id, this.draft().trim());
      this.renaming.set(false);
      await this.open(b.id);
      this.boxes.update((list) => list.map((x) => (x.id === b.id ? { ...x, name: this.draft().trim() } : x)));
      this.toast.show({ th: 'เปลี่ยนชื่อตู้แล้ว', en: 'Renamed' });
    } catch {
      this.toast.show({ th: 'บันทึกไม่สำเร็จ ลองอีกครั้ง', en: 'Couldn’t save' });
    }
  }

  protected signout(): void {
    void this.session.signout().then(() => this.router.navigateByUrl(screenUrl('A04'), { replaceUrl: true }));
  }
  protected readonly menu = computed<{ code: string; icon: IconName; title: Tr; sub: Tr; badge?: Tr; needsBox?: boolean }[]>(() => {
    return [
    { code: 'H16', icon: 'pin', title: { th: 'หน่วยงานใกล้บ้านบนแผนที่', en: 'Agencies near you on the map' }, sub: { th: 'ดูว่าอยู่ตรงไหน แล้วเลือกว่าให้ใครดูแลบ้าน', en: 'See where each agency is and pick who looks after you' } },
    { code: 'H13-b', icon: 'layers', title: { th: 'เปลี่ยน Wi-Fi บ้าน', en: 'Change home Wi-Fi' }, sub: { th: 'กดสั่งจากเว็บ ตู้จะเข้าโหมดตั้งค่าเอง', en: 'Tap here — the mailbox enters setup mode by itself' }, needsBox: true },
    { code: 'H13-c', icon: 'user', title: { th: 'แจ้งช่าง', en: 'Request a technician' }, sub: { th: 'ให้ช่างนัดมาตั้งค่า / ซ่อม', en: 'A technician will set up or repair' }, needsBox: true },
    { code: 'H14', icon: 'bell', title: { th: 'แจ้งเตือนย้อนหลัง', en: 'Notification history' }, sub: { th: 'ดูแจ้งเตือนที่เคยได้รับทั้งหมด', en: 'Everything you have been notified about' } },
    { code: 'H13-d', icon: 'settings', title: { th: 'การแสดงผล', en: 'Display' }, sub: { th: 'ธีม · ภาษา · ขนาดตัวอักษร', en: 'Theme · language · text size' } },
  ];
  });
}

// ── H13-b · เปลี่ยน Wi-Fi บ้าน (สั่งจากเว็บ → ตู้ตัด Wi-Fi เดิมแล้วกลับเข้าโหมดตั้งค่า) ─────────────
