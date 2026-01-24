# Task: Add getUSDTBalance to TronGridClient

**Task ID**: task-03
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 2 hours
**Verification Level**: L3 (Build Success Verification)

## Overview

Implement USDT balance query capability in TronGridClient using TronGrid's `triggerconstantcontract` API. This method queries the TRC20 USDT smart contract's `balanceOf` function to retrieve the current balance for a given wallet address.

## Context

Payout session end detection requires checking wallet USDT balance:
- **Balance threshold detection**: Session ends when balance < 1000 USDT
- **Timeout confirmation**: Session ends after 30 min only if balance decreased

The TronGrid API provides `triggerconstantcontract` endpoint for read-only smart contract calls without consuming energy. This is perfect for querying USDT balance.

## Target Files

### Files to Modify
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\clients\trongrid.client.ts`

## Dependencies

**Depends On**:
- Task 01 (Config) - needs USDT contract address from configuration

**Blocks**:
- Task 04 (Balance API tests) - needs implementation to test
- Task 05 (PayoutSessionService) - needs balance checking capability
- Task 06 (Timeout check) - needs balance checking capability

## Implementation Steps

### Step 1: Add getUSDTBalance method signature

Add the following method to TronGridClient class:

```typescript
/**
 * Get USDT balance for a wallet address.
 *
 * Uses TronGrid triggerconstantcontract API to call USDT contract's balanceOf function.
 *
 * @param address - TRON wallet address (34 chars, starts with T)
 * @returns USDT balance in raw units (6 decimals, as string)
 * @throws {TronGridApiError} If API call fails or returns invalid response
 *
 * @example
 * const balance = await client.getUSDTBalance('TXyz...');
 * // Returns "5000000000" (5000.00 USDT)
 */
async getUSDTBalance(address: string): Promise<string> {
  // Implementation in next steps
}
```

### Step 2: Implement address hex encoding

TRON addresses must be converted to hex format for the `parameter` field:

```typescript
/**
 * Convert TRON base58 address to hex format.
 *
 * @param address - Base58-encoded TRON address
 * @returns Hex-encoded address (without '0x' prefix)
 */
private encodeAddressParameter(address: string): string {
  // TRON addresses are base58-encoded with checksum
  // For balanceOf parameter, we need 32-byte hex (64 chars)
  // Format: 24 zeros + 20-byte address hex

  // Use tronweb or manual decoding
  const decoded = this.decodeBase58Address(address);
  return '0'.repeat(24) + decoded;
}

private decodeBase58Address(address: string): string {
  // Decode base58 address to hex (41 prefix + 20 bytes + 4 checksum)
  // Remove 41 prefix and checksum, return 20-byte hex
  // Implementation using existing TRON libraries or base58 decoding
}
```

### Step 3: Implement API call

```typescript
async getUSDTBalance(address: string): Promise<string> {
  const usdtContract = this.configService.get<string>(
    'blockchain.usdtContractAddress',
  );

  const payload = {
    contract_address: usdtContract,
    function_selector: 'balanceOf(address)',
    parameter: this.encodeAddressParameter(address),
    owner_address: address,
    visible: true,
  };

  try {
    const response = await this.axiosInstance.post(
      '/wallet/triggerconstantcontract',
      payload,
      {
        timeout: 10000, // 10 second timeout
      },
    );

    return this.parseBalanceResponse(response.data);
  } catch (error) {
    throw new TronGridApiError(
      'Failed to fetch USDT balance',
      { address, contract: usdtContract },
      error,
    );
  }
}
```

### Step 4: Implement response parsing

```typescript
/**
 * Parse USDT balance from TronGrid response.
 *
 * @param data - Response data from triggerconstantcontract
 * @returns Balance as string (raw units)
 * @throws {TronGridApiError} If response is invalid
 */
private parseBalanceResponse(data: any): string {
  if (!data.constant_result || data.constant_result.length === 0) {
    throw new TronGridApiError('Invalid balance response: missing constant_result');
  }

  const hexBalance = data.constant_result[0];

  // Convert hex to decimal string
  // Remove '0x' prefix if present
  const cleanHex = hexBalance.startsWith('0x')
    ? hexBalance.slice(2)
    : hexBalance;

  // Convert to BigInt for precision, then to string
  const balance = BigInt('0x' + cleanHex).toString();

  return balance;
}
```

### Step 5: Add retry logic

Use existing retry pattern from TronGridClient:

```typescript
// Wrap API call with retry logic (3 attempts with exponential backoff)
const response = await this.retryWithBackoff(
  () => this.axiosInstance.post('/wallet/triggerconstantcontract', payload),
  3,
  1000,
);
```

### Step 6: Verify build

```bash
pnpm build
```

## Acceptance Criteria

- [x] Method signature matches interface (AC-2.1)
- [x] Address hex encoding implemented correctly
- [x] API payload includes all required fields
- [x] Response parsing handles hex to decimal conversion
- [x] Error handling with TronGridApiError
- [x] Retry logic applied (3 attempts)
- [x] Timeout set to 10 seconds
- [x] Build succeeds: `pnpm build`

## Verification Steps

1. Run build: `pnpm build`
2. Verify no TypeScript errors
3. Verify method signature is correct
4. Verify error handling is comprehensive

## Edge Cases

- **Zero balance**: Should return "0"
- **Very large balance**: Use BigInt to avoid precision loss
- **Invalid address format**: Should throw error
- **API timeout**: Should retry 3 times, then throw
- **Missing constant_result**: Should throw TronGridApiError
- **Network error**: Should retry, then throw

## Implementation Notes

### TRON Address Encoding

TRON addresses are base58-encoded with checksum:
1. Decode base58 to get hex (41 prefix + 20 bytes + 4 checksum)
2. Remove 41 prefix and checksum
3. Pad to 32 bytes (64 hex chars) with leading zeros

### API Response Format

```json
{
  "result": {
    "result": true
  },
  "constant_result": ["0000000000000000000000000000000000000000000000000000012a05f200"],
  "transaction": { ... }
}
```

The balance is in `constant_result[0]` as hex string.

### Precision Handling

- Use `BigInt` for conversion to avoid JavaScript number limitations
- Return as string to preserve precision throughout application
- USDT has 6 decimals: "1000000" = 1.00 USDT

## Notes

- **API endpoint**: POST /wallet/triggerconstantcontract
- **USDT contract**: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t (mainnet)
- **Function selector**: balanceOf(address)
- **No energy cost**: Read-only contract call
- **Response time**: Typically < 500ms

## References

- Design Doc: `docs/design/payout-session-notifications-design.md` (TronGridClient section)
- Work Plan: `docs/plans/payout-session-notifications-plan.md` (Task 1.3)
- ADR-0004: Payout Session Detection (Balance API section)
- TronGrid API: https://developers.tron.network/docs/trc20-contract-interaction
- Community Examples: https://gist.github.com/andelf/bdd18734d40774a721d0c4cbcec67037

## Completion Checklist

- [x] getUSDTBalance method added
- [x] Address hex encoding implemented
- [x] API call with correct payload
- [x] Response parsing with hex to decimal
- [x] Error handling with TronGridApiError
- [x] Retry logic applied
- [x] Timeout configured (10s)
- [x] JSDoc comments complete
- [x] Build succeeds
