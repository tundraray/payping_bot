import {
  formatUsdtDisplay,
  formatWithSeparators,
  truncateAddress,
  truncateHash,
  truncateWalletForAnalytics,
} from './format.utils';

describe('format.utils', () => {
  describe('formatUsdtDisplay', () => {
    it('should format raw USDT with thousand separators', () => {
      expect(formatUsdtDisplay('1000000000000')).toBe('1,000,000.00');
      expect(formatUsdtDisplay('106600000000')).toBe('106,600.00');
    });

    it('should handle small amounts without separators', () => {
      expect(formatUsdtDisplay('1000000')).toBe('1.00');
      expect(formatUsdtDisplay('999000000')).toBe('999.00');
    });

    it('should handle zero', () => {
      expect(formatUsdtDisplay('0')).toBe('0.00');
      expect(formatUsdtDisplay(0)).toBe('0.00');
    });

    it('should handle custom decimal places', () => {
      expect(formatUsdtDisplay('1234567890000', 4)).toBe('1,234,567.8900');
      expect(formatUsdtDisplay('1000000', 0)).toBe('1');
    });

    it('should handle invalid input', () => {
      expect(formatUsdtDisplay('invalid')).toBe('0.00');
      expect(formatUsdtDisplay(Number.NaN)).toBe('0.00');
    });

    it('should return 0.00 for Infinity', () => {
      expect(formatUsdtDisplay(Number.POSITIVE_INFINITY)).toBe('0.00');
      expect(formatUsdtDisplay(Number.NEGATIVE_INFINITY)).toBe('0.00');
    });

    it('should handle negative amounts', () => {
      expect(formatUsdtDisplay('-1000000')).toBe('-1.00');
      expect(formatUsdtDisplay(-5000000)).toBe('-5.00');
    });

    it('should format large amounts correctly', () => {
      // 999999999000000 / 10^6 = 999999999.00 USDT
      expect(formatUsdtDisplay('999999999000000')).toBe('999,999,999.00');
      // Very large amount: 1234567890000000 / 10^6 = 1234567890.00 USDT
      expect(formatUsdtDisplay('1234567890000000')).toBe('1,234,567,890.00');
    });

    it('should accept number input', () => {
      expect(formatUsdtDisplay(1000000)).toBe('1.00');
      expect(formatUsdtDisplay(1500000)).toBe('1.50');
    });
  });

  describe('formatWithSeparators', () => {
    it('should add thousand separators', () => {
      expect(formatWithSeparators('1234567.89')).toBe('1,234,567.89');
      expect(formatWithSeparators('1000000.00')).toBe('1,000,000.00');
    });

    it('should handle numbers without decimals', () => {
      expect(formatWithSeparators('1234567')).toBe('1,234,567');
    });

    it('should not add separators to small numbers', () => {
      expect(formatWithSeparators('999.00')).toBe('999.00');
      expect(formatWithSeparators('1.50')).toBe('1.50');
    });
  });

  describe('truncateAddress', () => {
    it('should truncate long addresses (first 4 + last 3)', () => {
      expect(truncateAddress('TRX7nK123456789abcdef9kPm')).toBe('TRX7...kPm');
    });

    it('should not truncate short addresses (<=10 chars)', () => {
      expect(truncateAddress('TRX7nK9kPm')).toBe('TRX7nK9kPm');
    });
  });

  describe('truncateHash', () => {
    it('should truncate long hashes', () => {
      expect(truncateHash('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p68bc1')).toBe('a1b2c3d4...8bc1');
    });

    it('should not truncate short hashes', () => {
      expect(truncateHash('a1b2c3d48bc1')).toBe('a1b2c3d48bc1');
    });
  });

  describe('truncateWalletForAnalytics', () => {
    /**
     * AC-2.2: Wallet truncation first 4 + last 3
     */
    it('should truncate long addresses to first 4 + last 3 characters', () => {
      expect(truncateWalletForAnalytics('TXyzTestWalletAddress12345678901234')).toBe('TXyz...234');
      expect(truncateWalletForAnalytics('TAbcdefghijklmnopqrstuvwxyz')).toBe('TAbc...xyz');
    });

    it('should not truncate short addresses (<= 10 chars)', () => {
      expect(truncateWalletForAnalytics('TXyz123')).toBe('TXyz123');
      expect(truncateWalletForAnalytics('TXyz123abc')).toBe('TXyz123abc');
    });

    it('should handle edge case at exactly 11 characters', () => {
      // 11 chars should be truncated: first 4 + ... + last 3 = TXyz...abc
      expect(truncateWalletForAnalytics('TXyz1234abc')).toBe('TXyz...abc');
    });
  });
});
