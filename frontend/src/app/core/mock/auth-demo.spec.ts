import { AuthDemo, DEMO_PASSWORD, normalizePhone, SIGNIN_LOCK_MS, SIGNIN_MAX_FAILS, type SignupForm } from './auth-demo';

const form = (patch: Partial<SignupForm>): SignupForm => ({
  name: 'ทดสอบ',
  phone: '0899999999',
  password: 'longenough',
  house_no: '1/1',
  area: '',
  group_code: '',
  agency_name: '',
  agency_type: 'police',
  contact: '',
  terms: true,
  ...patch,
});

describe('AuthDemo', () => {
  let d: AuthDemo;
  let now: number;
  beforeEach(() => {
    d = new AuthDemo();
    now = 5_000_000;
    d.now = () => now;
  });

  it('phone numbers are normalised (dashes, spaces, +66)', () => {
    expect(normalizePhone('081-234-5678')).toBe('0812345678');
    expect(normalizePhone('+66 81 234 5678')).toBe('0812345678');
    expect(normalizePhone('12345')).toBeNull();
  });

  it('a wrong password and an unknown phone get the same answer', () => {
    const known = d.signin('081-234-5678', 'nope');
    const unknown = d.signin('0899999999', 'nope');
    expect(known).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', left: SIGNIN_MAX_FAILS - 1 });
    expect(unknown).toEqual(known);
  });

  it('locks after too many wrong passwords, even with the right one', () => {
    for (let i = 1; i < SIGNIN_MAX_FAILS; i++) d.signin('0812345678', 'nope');
    expect(d.signin('0812345678', 'nope')).toEqual({ ok: false, code: 'ACCOUNT_LOCKED' });
    expect(d.signin('0812345678', DEMO_PASSWORD)).toEqual({ ok: false, code: 'ACCOUNT_LOCKED' });
    now += SIGNIN_LOCK_MS + 1;
    expect(d.signin('0812345678', DEMO_PASSWORD).ok).toBe(true);
  });

  it('no account is created without accepting the terms', () => {
    expect(d.signupOwner(form({ terms: false }))).toBe('TERMS_NOT_ACCEPTED');
    expect(d.ownerHouse()).toBeNull();
  });

  it('a phone that already has an account must sign in and add the role instead', () => {
    expect(d.signupOwner(form({ phone: '081-234-5678' }))).toBe('PHONE_TAKEN');
  });

  it('officer sign-up needs a real group code (any case or dashes)', () => {
    expect(d.signupOfficer(form({ group_code: 'AAAA-AAAA' }), '10:42')).toBe('GROUP_CODE_INVALID');
    expect(d.signupOfficer(form({ group_code: 'px7k-2mq9' }), '10:42')).toBeNull();
    expect(d.officerRequest()?.agency.th).toBe('สภ.เมือง');
  });

  it('an activation QR works only once', () => {
    expect(d.activate({ token: 'A7K2M9QX4T8P3W6R' })).toEqual({ ok: true, box_id: 'BX-00071' });
    expect(d.activate({ code: 'k7m2-qx9a' })).toEqual({ ok: false, code: 'QR_INVALID' });
    expect(d.activate({ token: 'B3N8V2C6X9Z4L7Q1' })).toEqual({ ok: false, code: 'BOX_ALREADY_OWNED' });
  });


  it('changing the password: wrong current counts toward the lock; afterwards only the new one works', () => {
    expect(d.changePassword('0876667777', 'nope', 'brandnew1')).toEqual({ ok: false, code: 'INVALID_CREDENTIALS', left: SIGNIN_MAX_FAILS - 1 });
    expect(d.changePassword('0876667777', DEMO_PASSWORD, 'short')).toEqual({ ok: false, code: 'INVALID' });
    expect(d.signin('0876667777', DEMO_PASSWORD)).toMatchObject({ ok: true, must_change_password: true });
    expect(d.changePassword('0876667777', DEMO_PASSWORD, 'brandnew1')).toEqual({ ok: true });
    expect(d.signin('0876667777', DEMO_PASSWORD).ok).toBe(false);
    expect(d.signin('0876667777', 'brandnew1')).toMatchObject({ ok: true, must_change_password: false });
  });

  it('adding a role: an admin cannot, and a role you already have is refused', () => {
    expect(d.addOwnerRole(['admin'], form({}))).toBe('ADMIN_ROLE_EXCLUSIVE');
    expect(d.addOwnerRole(['owner'], form({}))).toBe('ROLE_EXISTS');
    expect(d.addOwnerRole(['officer'], form({ terms: false }))).toBe('TERMS_NOT_ACCEPTED');
    expect(d.addOwnerRole(['officer'], form({}))).toBeNull();
    expect(d.joinAgency(['owner'], true, form({ group_code: 'PX7K-2MQ9' }), '10:00')).toBe('ROLE_EXISTS');
    expect(d.joinAgency(['admin'], false, form({ group_code: 'PX7K-2MQ9' }), '10:00')).toBe('ADMIN_ROLE_EXCLUSIVE');
    expect(d.joinAgency(['owner'], false, form({ group_code: 'nope' }), '10:00')).toBe('GROUP_CODE_INVALID');
    expect(d.joinAgency(['owner'], false, form({ group_code: 'px7k2mq9' }), '10:00')).toBeNull();
  });

  it('a new sign-up can sign in afterwards (pending officers are marked pending)', () => {
    d.signupOfficer(form({ phone: '0811110000', group_code: 'PX7K-2MQ9' }), '10:00');
    expect(d.signin('081-111-0000', 'longenough')).toMatchObject({ ok: true, roles: [], pending: 'officer' });
  });

  it('agency sign-up needs a contact, which people asking to join will see', () => {
    expect(d.signupAgency(form({ phone: '0822220000', agency_name: 'สภ.ทดสอบ', contact: ' ' }), '10:00')).toBe('INVALID');
    expect(d.signupAgency(form({ phone: '0822220000', agency_name: 'สภ.ทดสอบ', contact: 'สถานี 02-1' }), '10:00')).toBeNull();
    expect(d.agencyRequest()?.contact).toBe('สถานี 02-1');
    d.signupOfficer(form({ phone: '0822220001', group_code: 'PX7K-2MQ9' }), '10:00');
    expect(d.officerRequest()?.contact).toBe('สถานี 02-111-2222');
  });

  it('a short password is rejected', () => {
    expect(d.signupOwner(form({ password: 'short' }))).toBe('INVALID');
  });
});
