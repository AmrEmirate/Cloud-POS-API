import { sanitizePhoneNumber, isValidIndonesianMobilePhone } from '../../utils/phoneSanitizer';

describe('White Box Testing: phoneSanitizer.ts', () => {
  describe('sanitizePhoneNumber() Logic & Branches', () => {
    it('Branch: should handle empty, null, or undefined phone input', () => {
      expect(sanitizePhoneNumber('')).toBe('');
      expect(sanitizePhoneNumber(null as any)).toBe('');
      expect(sanitizePhoneNumber(undefined as any)).toBe('');
    });

    it('Branch: should convert "08..." to "628..."', () => {
      expect(sanitizePhoneNumber('081234567890')).toBe('6281234567890');
      expect(sanitizePhoneNumber('085712345678')).toBe('6285712345678');
    });

    it('Branch: should convert bare "8..." to "628..."', () => {
      expect(sanitizePhoneNumber('81234567890')).toBe('6281234567890');
    });

    it('Branch: should convert "6208..." to "628..."', () => {
      expect(sanitizePhoneNumber('62081234567890')).toBe('6281234567890');
    });

    it('Branch: should keep valid "628..." unchanged', () => {
      expect(sanitizePhoneNumber('6281234567890')).toBe('6281234567890');
    });

    it('Branch: should strip spaces, hyphens, and non-numeric characters', () => {
      expect(sanitizePhoneNumber('+62 812-3456-7890')).toBe('6281234567890');
      expect(sanitizePhoneNumber('(0812) 3456.7890')).toBe('6281234567890');
      expect(sanitizePhoneNumber('  0812 3456 7890  ')).toBe('6281234567890');
    });
  });

  describe('isValidIndonesianMobilePhone() Regex & Invariants', () => {
    it('should validate valid Indonesian mobile phone numbers', () => {
      expect(isValidIndonesianMobilePhone('081234567890')).toBe(true);
      expect(isValidIndonesianMobilePhone('6281234567890')).toBe(true);
      expect(isValidIndonesianMobilePhone('+62 812-3456-7890')).toBe(true);
      expect(isValidIndonesianMobilePhone('81234567890')).toBe(true);
    });

    it('should reject invalid or non-mobile phone numbers', () => {
      // Landline area code (021 / Jakarta)
      expect(isValidIndonesianMobilePhone('0215551234')).toBe(false);
      // Too short (< 10 digits)
      expect(isValidIndonesianMobilePhone('081234')).toBe(false);
      // Too long (> 15 digits)
      expect(isValidIndonesianMobilePhone('081234567890123456')).toBe(false);
      // Non-Indonesian country code
      expect(isValidIndonesianMobilePhone('+14155552671')).toBe(false);
      // Empty input
      expect(isValidIndonesianMobilePhone('')).toBe(false);
    });
  });
});

