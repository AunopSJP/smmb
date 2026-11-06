import { emptyExtras, extrasFromProfile, extrasPayload, extrasValid } from './profile-extras';

describe('profile extras', () => {
  it('owners must give house type, 5-digit postal code and residents; everyone else is optional', () => {
    const f = emptyExtras();
    expect(extrasValid(f, 'owner')).toBe(false);
    expect(extrasValid(f, 'officer')).toBe(true);
    expect(extrasValid({ ...f, house_type: 'house', postal_code: '10900', residents: '3' }, 'owner')).toBe(true);
    expect(extrasValid({ ...f, house_type: 'house', postal_code: '1090', residents: '3' }, 'owner')).toBe(false);
    expect(extrasValid({ ...f, email: 'not-an-email' }, 'head')).toBe(false);
  });

  it('sends only what is filled in and only what the role needs', () => {
    const f = { ...emptyExtras(), first_name: ' ก ', house_type: 'condo', residents: '2', care: ['elderly'], rank: 'ร.ต.อ.' };
    expect(extrasPayload(f, 'owner')).toEqual({ first_name: 'ก', house_type: 'condo', residents: 2, care: ['elderly'] });
    expect(extrasPayload(f, 'officer')).toEqual({ first_name: 'ก', rank: 'ร.ต.อ.' });
  });

  it('reads Me.profile back into the form', () => {
    const f = extrasFromProfile({ residents: 4, care: ['pets'], landmark: 'ประตูฟ้า', junk: 1 });
    expect(f.residents).toBe('4');
    expect(f.care).toEqual(['pets']);
    expect(f.landmark).toBe('ประตูฟ้า');
  });
});
