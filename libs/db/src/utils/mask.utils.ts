/**
 * Masking utilities for sensitive data in logs and displays.
 */

/**
 * Masks a wallet address, showing only start and end characters.
 * Format: first 4 + "..." + last 3 (e.g., "TRX7...kPm")
 *
 * @param address - Full wallet address
 * @returns Masked address
 *
 * @example
 * maskWalletAddress("TRX7nKgH9kPm") // "TRX7...kPm"
 * maskWalletAddress("short") // "short" (no masking if too short)
 */
export function maskWalletAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 4)}...${address.slice(-3)}`;
}

/**
 * Masks a transaction hash, showing only start and end characters.
 * Format: first 8 + "..." + last 4 (e.g., "a1b2c3d4...8bc1")
 *
 * @param hash - Full transaction hash
 * @returns Masked hash
 */
export function maskTransactionHash(hash: string): string {
  if (hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}
