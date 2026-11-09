import type { CanActivateFn, Route, Routes } from '@angular/router';
import { guestOnly, homeRedirect, requireRole, requireSignedIn, roleEntry } from './core/session';
import { AreaShell } from './layout/area-shell';
import { AREA_PREFIX, SCREENS, type Area } from './screens/registry';

type Loader = NonNullable<Route['loadComponent']>;

/** หน้าที่ทำจริงแล้ว — ที่เหลือแสดงเป็นหน้าโครง (screen-placeholder) */
const owner = {
  sos: () => import('./pages/owner/owner-sos'),
  history: () => import('./pages/owner/owner-history'),
  settings: () => import('./pages/owner/owner-settings'),
};

const officer = {
  check: () => import('./pages/officer/officer-check'),
  sos: () => import('./pages/officer/officer-sos'),
};

const head = {
  members: () => import('./pages/head/head-members'),
  zones: () => import('./pages/head/head-zones'),
  log: () => import('./pages/head/head-log'),
};

const admin = {
  boxes: () => import('./pages/admin/admin-boxes'),
  qr: () => import('./pages/admin/admin-qr'),
  people: () => import('./pages/admin/admin-people'),
  system: () => import('./pages/admin/admin-system'),
  tech: () => import('./pages/admin/technician'),
  plans: () => import('./pages/admin/admin-plans'),
};

const rider = () => import('./pages/rider/rider');

const auth = {
  start: () => import('./pages/auth/auth-start'),
  owner: () => import('./pages/auth/auth-owner'),
  officer: () => import('./pages/auth/auth-officer'),
  account: () => import('./pages/auth/auth-account'),
};
const headSetup = () => import('./pages/head/head-setup');

const BUILT: Record<string, Loader> = {
  H03: () => import('./pages/owner-home').then((m) => m.OwnerHome),
  H09: () => owner.sos().then((m) => m.SosWaiting),
  H08: () => owner.sos().then((m) => m.SosNoOfficer),
  H10: () => owner.sos().then((m) => m.SosCancel),
  H11: () => owner.sos().then((m) => m.SosAccepted),
  'H11-b': () => owner.sos().then((m) => m.SosClosed),
  H12: () => owner.history().then((m) => m.OwnerHistory),
  'H12-b': () => owner.history().then((m) => m.OwnerInspection),
  'H12-c': () => owner.history().then((m) => m.OwnerDelivery),
  'H12-d': () => owner.history().then((m) => m.OwnerOffline),
  'H12-e': () => owner.history().then((m) => m.OwnerRange),
  H13: () => owner.settings().then((m) => m.OwnerSettings),
  'H13-b': () => owner.settings().then((m) => m.OwnerWifi),
  'H13-c': () => owner.settings().then((m) => m.OwnerTechnician),
  'H13-d': () => owner.settings().then((m) => m.OwnerDisplay),
  H14: () => import('./pages/owner/owner-notifications').then((m) => m.OwnerNotifications),
  H16: () => import('./pages/owner/owner-agencies').then((m) => m.OwnerAgencies),
  L10: () => import('./pages/head/head-agency-profile').then((m) => m.HeadAgencyProfile),
  L11: () => import('./pages/head/head-settings').then((m) => m.HeadSettings),
  O01: () => import('./pages/officer/officer-home').then((m) => m.OfficerHome),
  O15: () => import('./pages/officer/officer-history').then((m) => m.OfficerHistory),
  O16: () => import('./pages/officer/officer-box-detail').then((m) => m.OfficerBoxDetailPage),
  O02: () => officer.check().then((m) => m.OfficerScan),
  'O02-b': () => officer.check().then((m) => m.OfficerCode),
  'O02-c': () => officer.check().then((m) => m.OfficerCamera),
  O03: () => officer.check().then((m) => m.OfficerQrCondition),
  O04: () => officer.check().then((m) => m.OfficerNotSystem),
  'O04-b': () => officer.check().then((m) => m.OfficerDenied),
  O05: () => officer.check().then((m) => m.OfficerWake),
  O06: () => officer.check().then((m) => m.OfficerBadge),
  'O06-c': () => officer.check().then((m) => m.OfficerBadgeFailed),
  O08: () => officer.check().then((m) => m.OfficerDone),
  O12: () => officer.sos().then((m) => m.OfficerSosList),
  O09: () => officer.sos().then((m) => m.OfficerSosCase),
  O10: () => officer.sos().then((m) => m.OfficerSosHandling),
  O11: () => officer.sos().then((m) => m.OfficerSosClose),
  O13: () => import('./pages/officer/officer-account').then((m) => m.OfficerAccount),
  O14: () => import('./pages/officer/officer-notifications').then((m) => m.OfficerNotifications),
  'O13-b': () => owner.settings().then((m) => m.OwnerDisplay),
  L04: () => import('./pages/head-home').then((m) => m.HeadHome),
  L05: () => head.members().then((m) => m.HeadMembers),
  'L05-b': () => head.members().then((m) => m.HeadMember),
  L06: () => head.zones().then((m) => m.HeadZones),
  L07: () => head.zones().then((m) => m.HeadZoneEdit),
  'L07-b': () => head.zones().then((m) => m.HeadZonePicker),
  'L07-c': () => head.zones().then((m) => m.HeadZonePicker),
  L08: () => head.log().then((m) => m.HeadLog),
  L09: () => head.log().then((m) => m.HeadNotifications),
  D01: () => import('./pages/admin-home').then((m) => m.AdminHome),
  D02: () => admin.people().then((m) => m.AdminAgencyRequests),
  D03: () => admin.boxes().then((m) => m.AdminBoxes),
  D04: () => admin.boxes().then((m) => m.AdminBox),
  D05: () => admin.qr().then((m) => m.AdminQr),
  // ทุกขั้นของเคส QR อยู่หน้าเดียว (รหัสหน้าเดิมยังใช้ได้เพื่อลิงก์เก่า)
  D06: () => admin.qr().then((m) => m.AdminQrCase),
  'D06-b': () => admin.qr().then((m) => m.AdminQrCase),
  D07: () => admin.qr().then((m) => m.AdminQrCase),
  'D07-b': () => admin.qr().then((m) => m.AdminQrCase),
  D08: () => admin.qr().then((m) => m.AdminQrCase),
  D09: () => admin.people().then((m) => m.AdminUsers),
  D10: () => admin.system().then((m) => m.AdminConfig),
  D11: () => admin.system().then((m) => m.AdminLogs),
  D12: () => admin.system().then((m) => m.AdminNotifications),
  D13: () => admin.people().then((m) => m.AdminAgencies),
  D14: () => admin.plans().then((m) => m.AdminPlans),
  D15: () => import('./pages/admin/admin-technician-requests').then((m) => m.AdminTechnicianRequests),
  D16: () => import('./pages/admin/admin-hub').then((m) => m.AdminHub),
  D17: () => import('./pages/admin/admin-firmware').then((m) => m.AdminFirmware),
  T01: () => admin.tech().then((m) => m.TechChecklist),
  T02: () => admin.tech().then((m) => m.TechWifi),
  'T02-b': () => admin.tech().then((m) => m.TechLights),
  'T02-c': () => admin.tech().then((m) => m.TechWifiFailed),
  R01: () => rider().then((m) => m.RiderCode),
  R02: () => rider().then((m) => m.RiderDeliver),
  R03: () => rider().then((m) => m.RiderInvalid),
  'R03-b': () => rider().then((m) => m.RiderClosed),
  'R03-c': () => rider().then((m) => m.RiderLimited),
  R04: () => rider().then((m) => m.RiderDone),
  A01: () => auth.start().then((m) => m.AuthLine),
  A02: () => auth.start().then((m) => m.AuthInstall),
  A03: () => auth.start().then((m) => m.AuthNotifications),
  A04: () => auth.start().then((m) => m.AuthSignin),
  A05: () => auth.start().then((m) => m.AuthChoose),
  A06: () => auth.owner().then((m) => m.AuthSignupOwner),
  A07: () => auth.owner().then((m) => m.AuthActivate),
  A08: () => auth.owner().then((m) => m.AuthNameBox),
  A09: () => auth.owner().then((m) => m.AuthOwnerDone),
  A10: () => auth.officer().then((m) => m.AuthSignupOfficer),
  A11: () => auth.officer().then((m) => m.AuthWaitingHead),
  A12: () => auth.officer().then((m) => m.AuthPushRequired),
  A13: () => auth.officer().then((m) => m.AuthTerms),
  A14: () => auth.account().then((m) => m.AuthChangePassword),
  A15: () => auth.account().then((m) => m.AuthAddOwner),
  A16: () => auth.account().then((m) => m.AuthJoinAgency),
  L01: () => headSetup().then((m) => m.HeadSignup),
  L02: () => headSetup().then((m) => m.HeadPending),
  L03: () => headSetup().then((m) => m.HeadApproved),
};

/** ใช้ในเทสต์: หน้าที่ทำแล้วทุกหน้าต้องมีอยู่ใน registry */
export const BUILT_CODES = Object.keys(BUILT);

const placeholder: Loader = () => import('./screens/screen-placeholder').then((m) => m.ScreenPlaceholder);

/** ทุกพื้นที่ใช้ข้อมูลจริง ต้องล็อกอินด้วยบัญชีที่มีบทบาทนั้น (ไรเดอร์ / สมัคร-ล็อกอินไม่ต้อง) */
const GUARD: Partial<Record<Area, CanActivateFn>> = {
  owner: requireRole('owner'),
  officer: requireRole('officer'),
  head: requireRole('head'),
  admin: requireRole('admin'),
};
/** หน้าที่ต้องล็อกอินแต่ยังไม่มีบทบาทก็เข้าได้ */
const SIGNED_IN_ONLY = new Set(['L02']);
/** หน้าก่อนล็อกอิน — ล็อกอินอยู่แล้วเข้าไม่ได้ (เด้งไปหน้าของบทบาท) */
const GUEST_ONLY = new Set(['A01', 'A02', 'A03', 'A04', 'A05']);

function areaRoute(area: Area): Route {
  return {
    path: AREA_PREFIX[area],
    component: AreaShell,
    data: { area },
    children: SCREENS.filter((s) => s.area === area).map((s) => ({
      path: s.path,
      loadComponent: BUILT[s.code] ?? placeholder,
      ...(SIGNED_IN_ONLY.has(s.code)
        ? { canActivate: [requireSignedIn] }
        : GUEST_ONLY.has(s.code)
          ? { canActivate: [guestOnly] }
          : GUARD[area]
            ? { canActivate: [GUARD[area]] }
            : {}),
      data: { code: s.code },
      title: `${s.title.th} · Smart Mailbox`,
    })),
  };
}

export const routes: Routes = [
  // หน้าแรก: ล็อกอินอยู่ → หน้าของบทบาท · ไม่งั้น → เข้าสู่ระบบ
  { path: '', pathMatch: 'full', canActivate: [homeRedirect], children: [] },
  // หน้าเลือกบัญชี seed จาก backend สำหรับเดโม พร้อมตั้งค่าการแสดงผล
  {
    path: 'demo',
    loadComponent: () => import('./pages/demo-start').then((m) => m.DemoStart),
    title: 'Smart Mailbox · demo',
  },
  ...(['owner', 'officer', 'head', 'admin', 'rider', 'auth'] as const).map(areaRoute),
  // ลิงก์ใน QR หน้าตู้ (PUBLIC_BASE_URL/b/<token>) — กล้องมือถือเปิดแล้วไปหน้าส่งของของไรเดอร์ (api.md §5)
  { path: 'in/:role', canActivate: [roleEntry], children: [] },
  { path: 'b/:token', redirectTo: ({ params }) => `/r/deliver?qr=${encodeURIComponent(params['token'])}` },
  // ลิงก์ใน QR เปิดใช้ตู้ (PUBLIC_BASE_URL/a/<16 ตัว>) → หน้าผูกตู้ A07 (api.md §4.1)
  { path: 'a/:token', redirectTo: ({ params }) => `/auth/activate?qr=${encodeURIComponent(params['token'])}` },
  // หน้า error สาธารณะ (ไม่ผ่าน AreaShell) — ตามแคนวาส ErrOffline / ErrNoAccess / ErrSession
  { path: 'error/offline', loadComponent: () => import('./pages/error-screen').then((m) => m.ErrorScreen), data: { kind: 'offline' }, title: 'ไม่มีอินเทอร์เน็ต · Smart Mailbox' },
  { path: 'error/session', loadComponent: () => import('./pages/error-screen').then((m) => m.ErrorScreen), data: { kind: 'session' }, title: 'หมดเวลาเข้าสู่ระบบ · Smart Mailbox' },
  { path: 'error/not-found', loadComponent: () => import('./pages/error-screen').then((m) => m.ErrorScreen), data: { kind: 'not-found' }, title: 'ไม่พบหน้านี้ · Smart Mailbox' },
  // ตั้งค่าการแจ้งเตือน (ทุกบทบาท) — ตามแคนวาส NotifSettings.dc.html
  {
    path: 'settings/notifications',
    canActivate: [requireSignedIn],
    loadComponent: () => import('./pages/notif-settings').then((m) => m.NotifSettings),
    title: 'ตั้งค่าการแจ้งเตือน · Smart Mailbox',
  },
  // เลือกโหมดการแสดงผล (ทุกบทบาท) — ตามแคนวาส ModePicker.dc.html
  {
    path: 'settings/display',
    canActivate: [requireSignedIn],
    loadComponent: () => import('./pages/owner/owner-settings').then((m) => m.OwnerDisplay),
    data: { shared: true },
    title: 'แบบการใช้งาน · Smart Mailbox',
  },
  { path: '**', redirectTo: '' },
];
