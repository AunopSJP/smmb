import { computed, Injectable, signal } from '@angular/core';

// ข้อมูลจำลองของหัวหน้าหน่วยงาน — รูปร่างตาม api.md §8 (Member, zone) เพื่อสลับเป็น API จริงทีหลัง

export type MemberStatus = 'pending' | 'active' | 'disabled';

export interface DemoMember {
  id: string;
  name: string;
  name_en: string;
  phone: string;
  status: MemberStatus;
  is_head: boolean;
  /** ตัวเอง (หัวหน้าที่ล็อกอินอยู่) */
  self?: boolean;
  /** เป็นเจ้าของบ้านด้วย → หัวหน้ารีเซ็ตรหัสไม่ได้ ต้องให้แอดมินทำ (api.md §8.2) */
  also_owner?: boolean;
  requested_at?: string;
  checks_this_month: number;
}

export interface DemoZone {
  id: string;
  name: string;
  houses: string[];
  /** จำนวนบ้านทั้งหมด (รายการ houses แสดงแค่ตัวอย่าง) */
  house_count: number;
  officer_ids: string[];
  windows: string[];
  /** หัวหน้าคนนี้อยู่ในโซนนี้ (ตรวจตู้ได้เฉพาะโซนที่ตัวเองอยู่ — design §18) */
  mine: boolean;
  checked_today: number;
}

export interface DemoLog {
  id: string;
  house: string;
  time: string;
  zone_id: string;
  officer_id: string;
  qr: 'front' | 'backup';
  method: 'scan' | 'code';
  result: 'pass' | 'fail' | 'not_recorded';
  note?: { th: string; en: string };
}

export type ZoneFilter = 'mine' | 'all';

@Injectable({ providedIn: 'root' })
export class HeadDemo {
  readonly agency = { name: 'สภ.เมือง', name_en: 'Mueang police' };
  /** ช่องทางติดต่อหน่วยงาน (กรอกตอนสมัคร · แก้ได้ที่ L03) — PATCH /agency { contact } */
  readonly contact = signal('สถานี 02-111-2222');

  readonly members = signal<DemoMember[]>([
    { id: 'U-0101', name: 'ส.ต.ต. สมชาย ใจกล้า', name_en: 'Pol. L/Cpl. Somchai', phone: '081-234-5678', status: 'pending', is_head: false, requested_at: '10:42', checks_this_month: 0 },
    { id: 'U-0102', name: 'ส.ต.ต. ปิติ ยินดี', name_en: 'Pol. L/Cpl. Piti', phone: '089-555-1234', status: 'pending', is_head: false, requested_at: '10:40', checks_this_month: 0 },
    { id: 'U-0090', name: 'พ.ต.ท. วีระ กล้าหาญ', name_en: 'Pol. Lt. Col. Weera', phone: '081-000-1111', status: 'active', is_head: true, self: true, checks_this_month: 12 },
    { id: 'U-0091', name: 'ส.ต.ท. ใจดี มีสุข', name_en: 'Pol. Cpl. Jaidee', phone: '089-222-3333', status: 'active', is_head: false, checks_this_month: 112 },
    { id: 'U-0092', name: 'ด.ต. มานะ ดีงาม', name_en: 'Pol. Sgt. Mana', phone: '086-444-5555', status: 'active', is_head: false, also_owner: true, checks_this_month: 98 },
    { id: 'U-0093', name: 'ส.ต.ต. สมศักดิ์ รักงาน', name_en: 'Pol. L/Cpl. Somsak', phone: '087-666-7777', status: 'active', is_head: false, checks_this_month: 87 },
    { id: 'U-0094', name: 'ส.ต.ท. อรุณ แสงทอง', name_en: 'Pol. Cpl. Arun', phone: '082-888-9999', status: 'active', is_head: false, checks_this_month: 64 },
    { id: 'U-0095', name: 'ด.ต. ประเสริฐ ใจเย็น', name_en: 'Pol. Sgt. Prasert', phone: '083-121-2121', status: 'disabled', is_head: false, checks_this_month: 0 },
  ]);

  readonly zones = signal<DemoZone[]>([
    { id: 'z1', name: 'โซน A', houses: ['99/9', '99/10', '99/7', '99/6', '99/5', '99/4', '99/3', '99/2', '99/1', '98/9'], house_count: 10, officer_ids: ['U-0090', 'U-0092', 'U-0093'], windows: ['06:00–09:00', '17:00–21:00'], mine: true, checked_today: 10 },
    { id: 'z2', name: 'โซน B', houses: ['88/1', '88/2', '88/3', '88/4', '88/5', '88/6', '88/7', '88/8', '88/9', '88/10', '88/11', '88/12'], house_count: 12, officer_ids: ['U-0091', 'U-0094'], windows: ['17:00–21:00'], mine: false, checked_today: 6 },
    { id: 'z3', name: 'โซน C', houses: ['45/1', '45/3', '45/4', '45/5', '45/6', '45/7', '45/8', '45/9'], house_count: 8, officer_ids: [], windows: ['17:00–21:00'], mine: false, checked_today: 0 },
  ]);

  /** บ้านที่เพิ่มเข้าโซนได้ (หน้า L07-b) */
  readonly housePool = [
    { house: '99/11', zone: null as string | null, bound: true },
    { house: '99/12', zone: null as string | null, bound: true },
    { house: '88/3', zone: 'โซน B', bound: true },
    { house: '45/2', zone: null as string | null, bound: false },
  ];

  readonly logs: DemoLog[] = [
    { id: 'l1', house: '99/9', time: '22:15', zone_id: 'z1', officer_id: 'U-0093', qr: 'front', method: 'scan', result: 'pass' },
    { id: 'l2', house: '99/10', time: '22:09', zone_id: 'z1', officer_id: 'U-0093', qr: 'front', method: 'code', result: 'pass' },
    { id: 'l3', house: '99/7', time: '21:58', zone_id: 'z1', officer_id: 'U-0092', qr: 'backup', method: 'scan', result: 'fail' },
    { id: 'l4', house: '88/1', time: '21:40', zone_id: 'z2', officer_id: 'U-0092', qr: 'front', method: 'scan', result: 'not_recorded', note: { th: 'ไม่ใช่โซน', en: 'Not their zone' } },
    { id: 'l5', house: '88/4', time: '20:12', zone_id: 'z2', officer_id: 'U-0091', qr: 'front', method: 'scan', result: 'pass' },
    { id: 'l6', house: '88/5', time: '19:55', zone_id: 'z2', officer_id: 'U-0094', qr: 'front', method: 'scan', result: 'pass' },
  ];

  /** ตัวกรองหน้าภาพรวม/ประวัติ — เป็นตัวกรอง ไม่ใช่สิทธิ์ (api.md §8) */
  readonly zoneFilter = signal<ZoneFilter>('mine');

  readonly pending = computed(() => this.members().filter((m) => m.status === 'pending'));
  readonly team = computed(() => this.members().filter((m) => m.status !== 'pending'));
  readonly activeOfficers = computed(() => this.members().filter((m) => m.status === 'active'));
  readonly visibleZones = computed(() =>
    this.zoneFilter() === 'mine' ? this.zones().filter((z) => z.mine) : this.zones(),
  );

  /** โซนที่กำลังแก้ (หน้า L07 + ตัวเลือก L07-b/c) — บันทึกแล้วค่อยเขียนกลับ */
  readonly draft = signal<DemoZone | null>(null);

  member(id: string | undefined): DemoMember | undefined {
    return this.members().find((m) => m.id === id);
  }

  memberName(id: string, lang: 'th' | 'en'): string {
    const m = this.member(id);
    return m ? (lang === 'th' ? m.name : m.name_en) : id;
  }

  zoneOf(memberId: string): string[] {
    return this.zones()
      .filter((z) => z.officer_ids.includes(memberId))
      .map((z) => z.name);
  }

  setStatus(id: string, status: MemberStatus): void {
    this.members.update((list) =>
      list.map((m) => (m.id === id ? { ...m, status, is_head: status === 'disabled' ? false : m.is_head } : m)),
    );
    if (status === 'disabled') {
      // ปิดสิทธิ์ = ถอดออกจากทุกโซน (api.md §8.2)
      this.zones.update((zs) => zs.map((z) => ({ ...z, officer_ids: z.officer_ids.filter((o) => o !== id) })));
    }
  }

  reject(id: string): void {
    this.members.update((list) => list.filter((m) => m.id !== id));
  }

  setHead(id: string, isHead: boolean): void {
    this.members.update((list) => list.map((m) => (m.id === id ? { ...m, is_head: isHead } : m)));
  }

  editZone(id: string | undefined): void {
    const z = this.zones().find((x) => x.id === id);
    this.draft.set(
      z
        ? structuredClone(z)
        : { id: `z${Date.now()}`, name: `โซน ${String.fromCharCode(65 + this.zones().length)}`, houses: [], house_count: 0, officer_ids: [], windows: [], mine: false, checked_today: 0 },
    );
  }

  saveDraft(): void {
    const d = this.draft();
    if (!d) return;
    // "โซนที่ฉันอยู่" = หัวหน้าที่ล็อกอินอยู่มีชื่อในเจ้าหน้าที่ของโซน
    const selfId = this.members().find((m) => m.self)?.id;
    const fixed = { ...d, house_count: d.houses.length, mine: selfId ? d.officer_ids.includes(selfId) : false };
    this.zones.update((zs) => (zs.some((z) => z.id === d.id) ? zs.map((z) => (z.id === d.id ? fixed : z)) : [...zs, fixed]));
  }
}
