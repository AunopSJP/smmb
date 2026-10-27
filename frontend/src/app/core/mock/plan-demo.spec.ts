import { PlanDemo } from './plan-demo';

describe('PlanDemo', () => {
  let d: PlanDemo;
  const by = { th: 'แอดมิน', en: 'Admin' };
  beforeEach(() => {
    d = new PlanDemo();
    d.today = () => '2026-10-27';
  });

  it('every owner starts on the free plan with no end date', () => {
    expect(d.current('U-0001')?.plan_code).toBe('free');
    expect(d.status('U-0001')).toBe('active');
  });

  it('changing a plan closes the old row and keeps the history', () => {
    d.addPlan('plus', { th: 'พลัส', en: 'Plus' }, null);
    expect(d.setPlan('U-0001', true, 'plus', null, 'ทดลอง', by)).toBeNull();
    expect(d.current('U-0001')?.plan_code).toBe('plus');
    const h = d.history('U-0001');
    expect(h).toHaveLength(2);
    expect(h[1]).toMatchObject({ plan_code: 'free', ends_at: '2026-10-27' });
  });

  it('only owners have plans, and inactive plans cannot be given', () => {
    expect(d.setPlan('U-0101', false, 'free', null, '', by)).toBe('NOT_OWNER');
    d.addPlan('old', { th: 'เก่า', en: 'Old' }, null);
    d.setActive('old', false);
    expect(d.setPlan('U-0001', true, 'old', null, '', by)).toBe('PLAN_INACTIVE');
  });

  it('an end date within 7 days shows as expiring; an end date in the past is refused', () => {
    expect(d.setPlan('U-0002', true, 'free', '2026-10-27', '', by)).toBe('BAD_END');
    d.setPlan('U-0002', true, 'free', '2026-11-01', '', by);
    expect(d.status('U-0002')).toBe('expiring');
  });

  it('the default plan cannot be switched off, and a new default replaces the old one', () => {
    d.setActive('free', false);
    expect(d.plan('free')?.is_active).toBe(true);
    d.addPlan('plus', { th: 'พลัส', en: 'Plus' }, null);
    d.setDefault('plus');
    expect(d.plans().filter((p) => p.is_default).map((p) => p.code)).toEqual(['plus']);
  });

  it('plan codes are unique, lower-case and cannot be blank', () => {
    expect(d.addPlan('free', { th: 'x', en: 'x' }, null)).toBe('CODE_TAKEN');
    expect(d.addPlan('Bad Code', { th: 'x', en: 'x' }, null)).toBe('CODE_INVALID');
    expect(d.addPlan('ok', { th: '', en: 'x' }, null)).toBe('NAME_REQUIRED');
  });
});
