import type { Route, Routes } from '@angular/router';
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
  O01: () => import('./pages/officer/officer-home').then((m) => m.OfficerHome),
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
  D06: () => admin.qr().then((m) => m.AdminQrFake),
  'D06-b': () => admin.qr().then((m) => m.AdminQrDamaged),
  D07: () => admin.qr().then((m) => m.AdminQrSwap),
  'D07-b': () => admin.qr().then((m) => m.AdminQrReissue),
  D08: () => admin.qr().then((m) => m.AdminQrFixed),
  D09: () => admin.people().then((m) => m.AdminUsers),
  D10: () => admin.system().then((m) => m.AdminConfig),
  D11: () => admin.system().then((m) => m.AdminLogs),
  D12: () => admin.system().then((m) => m.AdminNotifications),
  D13: () => admin.people().then((m) => m.AdminAgencies),
  D14: () => admin.plans().then((m) => m.AdminPlans),
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

function areaRoute(area: Area): Route {
  return {
    path: AREA_PREFIX[area],
    component: AreaShell,
    data: { area },
    children: SCREENS.filter((s) => s.area === area).map((s) => ({
      path: s.path,
      loadComponent: BUILT[s.code] ?? placeholder,
      data: { code: s.code },
      title: `${s.title.th} · Smart Mailbox`,
    })),
  };
}

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./pages/demo-start').then((m) => m.DemoStart),
    title: 'Smart Mailbox',
  },
  ...(['owner', 'officer', 'head', 'admin', 'rider', 'auth'] as const).map(areaRoute),
  // ลิงก์ใน QR หน้าตู้ (PUBLIC_BASE_URL/b/<token>) — กล้องมือถือเปิดแล้วไปหน้าส่งของของไรเดอร์ (api.md §5)
  { path: 'b/:token', redirectTo: ({ params }) => `/r/deliver?qr=${encodeURIComponent(params['token'])}` },
  // ลิงก์ใน QR เปิดใช้ตู้ (PUBLIC_BASE_URL/a/<16 ตัว>) → หน้าผูกตู้ A07 (api.md §4.1)
  { path: 'a/:token', redirectTo: ({ params }) => `/auth/activate?qr=${encodeURIComponent(params['token'])}` },
  { path: '**', redirectTo: '' },
];
