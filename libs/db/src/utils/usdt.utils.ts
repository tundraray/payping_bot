/**
 * USDT TRC20 token has 6 decimal places.
 * Amounts are stored in smallest unit (like "sun" for TRX).
 * Example: 1000000 = 1.000000 USDT
 */
const USDT_DECIMALS = 6;

/**
 * Converts raw USDT amount (smallest unit) to human-readable format.
 * For data conversion, not display formatting (no thousand separators).
 *
 * @param rawAmount - Amount in smallest unit (e.g., "1000000" = 1 USDT)
 * @param decimals - Number of decimal places in output (default: 2)
 * @returns Formatted string (e.g., "1.00")
 *
 * @example
 * formatUsdt("1000000") // "1.00"
 * formatUsdt("1500000") // "1.50"
 * formatUsdt("1234567890") // "1234.57"
 * formatUsdt("1000000", 6) // "1.000000"
 */
export function formatUsdt(rawAmount: string | number, decimals = 2): string {
  const raw = typeof rawAmount === 'string' ? Number.parseFloat(rawAmount) : rawAmount;

  if (Number.isNaN(raw)) {
    return (0).toFixed(decimals);
  }

  const usdt = raw / 10 ** USDT_DECIMALS;
  return usdt.toFixed(decimals);
}

/**
 * Converts human-readable USDT to raw amount (smallest unit).
 *
 * @param usdtAmount - Human-readable amount (e.g., "1.50")
 * @returns Raw amount as string (e.g., "1500000")
 *
 * @example
 * toRawUsdt("1.50") // "1500000"
 * toRawUsdt(1.5) // "1500000"
 */
export function toRawUsdt(usdtAmount: string | number): string {
  const usdt = typeof usdtAmount === 'string' ? Number.parseFloat(usdtAmount) : usdtAmount;

  if (Number.isNaN(usdt)) {
    return '0';
  }

  const raw = Math.round(usdt * 10 ** USDT_DECIMALS);
  return raw.toString();
}
