import { resetReasonText } from './admin-box-reports';

describe('resetReasonText (D04 รายงานจากตู้)', () => {
  it('flags a brownout as a problem in Thai and English', () => {
    const r = resetReasonText({ reset_reason: 'brownout', fw: '0.2.32' });
    expect(r?.bad).toBe(true);
    expect(r?.text.th).toContain('ไฟตก');
    expect(r?.text.en).toContain('brownout');
  });

  it('flags watchdog and panic, but not a normal power on or deep-sleep wake', () => {
    expect(resetReasonText({ reset_reason: 'watchdog' })?.bad).toBe(true);
    expect(resetReasonText({ reset_reason: 'panic' })?.bad).toBe(true);
    expect(resetReasonText({ reset_reason: 'power_on' })?.bad).toBe(false);
    expect(resetReasonText({ reset_reason: 'deep_sleep' })?.bad).toBe(false);
  });

  it('shows unknown reasons as-is and skips reports without one', () => {
    expect(resetReasonText({ reset_reason: 'other' })?.text.en).toBe('Restarted: other');
    expect(resetReasonText({ rssi: -50 })).toBeNull();
  });
});
