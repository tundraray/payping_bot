import { formatUsdt, toRawUsdt } from './usdt.utils';

describe('usdt.utils', () => {
  describe('formatUsdt', () => {
    it('should convert 1 USDT (1000000 raw) to "1.00"', () => {
      expect(formatUsdt('1000000')).toBe('1.00');
      expect(formatUsdt(1000000)).toBe('1.00');
    });

    it('should convert fractional amounts correctly', () => {
      expect(formatUsdt('1500000')).toBe('1.50');
      expect(formatUsdt('1234567')).toBe('1.23');
    });

    it('should handle large amounts', () => {
      expect(formatUsdt('1000000000000')).toBe('1000000.00');
      expect(formatUsdt('106600000000')).toBe('106600.00');
    });

    it('should return "0.00" for zero', () => {
      expect(formatUsdt('0')).toBe('0.00');
      expect(formatUsdt(0)).toBe('0.00');
    });

    it('should handle custom decimal places', () => {
      expect(formatUsdt('1234567', 6)).toBe('1.234567');
      expect(formatUsdt('1000000', 0)).toBe('1');
      expect(formatUsdt('1555555', 4)).toBe('1.5556');
    });

    it('should handle NaN input', () => {
      expect(formatUsdt('invalid')).toBe('0.00');
    });
  });

  describe('toRawUsdt', () => {
    it('should convert 1.00 USDT to 1000000 raw', () => {
      expect(toRawUsdt('1.00')).toBe('1000000');
      expect(toRawUsdt(1)).toBe('1000000');
    });

    it('should convert fractional amounts', () => {
      expect(toRawUsdt('1.50')).toBe('1500000');
      expect(toRawUsdt(0.5)).toBe('500000');
    });

    it('should handle zero', () => {
      expect(toRawUsdt('0')).toBe('0');
      expect(toRawUsdt(0)).toBe('0');
    });

    it('should handle NaN input', () => {
      expect(toRawUsdt('invalid')).toBe('0');
    });
  });
});
