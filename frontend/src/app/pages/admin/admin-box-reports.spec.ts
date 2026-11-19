import { MIN_QR_PX, resetReasonText, scanDiagHint } from './admin-box-reports';

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

describe('scanDiagHint (scan_diag from a real inspection)', () => {
  const base = { type: 'scan_diag', attempt: 1, frames: 90, qr_shapes: 0, widest_px: 0, brightness: 120, decode_err: '' };

  it('is null for anything that is not a scan_diag', () => {
    expect(scanDiagHint({ type: 'camera_error' })).toBeNull();
    expect(scanDiagHint({ reset_reason: 'power_on' })).toBeNull();
  });

  it('says the camera gave no frames', () => {
    expect(scanDiagHint({ ...base, frames: 0 })?.th).toContain('ไม่ส่งภาพ');
  });

  it('tells apart no QR in view, too dark and blown out', () => {
    expect(scanDiagHint(base)?.th).toContain('ไม่เห็นรูปทรง QR');
    expect(scanDiagHint({ ...base, brightness: 20 })?.th).toContain('มืด');
    expect(scanDiagHint({ ...base, brightness: 250 })?.th).toContain('สว่างจ้า');
  });

  it('says too small when the QR is seen but under the minimum width', () => {
    const hint = scanDiagHint({ ...base, qr_shapes: 12, widest_px: MIN_QR_PX - 1 });
    expect(hint?.th).toContain('เล็กเกินไป');
    expect(hint?.en).toContain('too small');
  });

  it('blames blur or glare when the QR is big enough but will not decode', () => {
    const hint = scanDiagHint({ ...base, qr_shapes: 12, widest_px: 160, decode_err: 'ECC failure' });
    expect(hint?.th).toContain('ถอดรหัสไม่ได้');
    expect(hint?.th).toContain('ECC failure');
  });
});
