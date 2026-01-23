/**
 * Display formatting utilities for Telegram messages.
 * These functions handle presentation-layer formatting only.
 */

/**
 * USDT TRC20 token has 6 decimal places.
 */
const USDT_DECIMALS = 6;

/**
 * Converts raw USDT amount (smallest unit) to human-readable format.
 *
 * @param rawAmount - Amount in smallest unit (e.g., "1000000" = 1 USDT)
 * @param decimals - Number of decimal places in output (default: 2)
 * @returns Formatted string (e.g., "1.00")
 *
 * @example
 * formatUsdt("1000000") // "1.00"
 * formatUsdt("1500000") // "1.50"
 * formatUsdt("1234567890") // "1234.57"
 */
function formatUsdt(rawAmount: string | number, decimals = 2): string {
  const raw = typeof rawAmount === 'string' ? Number.parseFloat(rawAmount) : rawAmount;

  if (Number.isNaN(raw) || !Number.isFinite(raw)) {
    return (0).toFixed(decimals);
  }

  const usdt = raw / 10 ** USDT_DECIMALS;
  return usdt.toFixed(decimals);
}

/**
 * Converts raw USDT amount to human-readable format with thousand separators.
 *
 * @param rawAmount - Amount in smallest unit (e.g., "1000000" = 1 USDT)
 * @param decimals - Number of decimal places (default: 2)
 * @returns Formatted string with separators (e.g., "1,234.56")
 *
 * @example
 * formatUsdtDisplay("1234567890000") // "1,234,567.89"
 * formatUsdtDisplay("1000000") // "1.00"
 */
export function formatUsdtDisplay(rawAmount: string | number, decimals = 2): string {
  const formatted = formatUsdt(rawAmount, decimals);
  return formatWithSeparators(formatted);
}

/**
 * Adds thousand separators to a number string.
 *
 * @param value - Number string (e.g., "1234.56")
 * @returns Formatted string with separators (e.g., "1,234.56")
 *
 * @example
 * formatWithSeparators("1234567.89") // "1,234,567.89"
 * formatWithSeparators("999.00") // "999.00"
 */
export function formatWithSeparators(value: string): string {
  const [whole, decimal] = value.split('.');
  const withSeparators = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal ? `${withSeparators}.${decimal}` : withSeparators;
}

/**
 * Truncates a blockchain address for display.
 * Shows first 6 and last 4 characters.
 *
 * @param address - Full address string
 * @returns Truncated address (e.g., "TRX7nK...9kPm")
 */
export function truncateAddress(address: string): string {
  if (address.length <= 13) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Truncates a blockchain address for analytics display.
 * Shows first 4 and last 3 characters.
 *
 * @param address - Full address string
 * @returns Truncated address (e.g., "TRX7...kPm")
 *
 * @see AC-2.2: Wallet truncation first 4 + last 3
 */
export function truncateWalletForAnalytics(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

/**
 * Truncates a transaction hash for display.
 * Shows first 8 and last 4 characters.
 *
 * @param hash - Full transaction hash
 * @returns Truncated hash (e.g., "a1b2c3d4...8bc1")
 */
export function truncateHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}
