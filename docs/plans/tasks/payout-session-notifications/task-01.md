# Task: Add Payout Configuration

**Task ID**: task-01
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 30 minutes
**Verification Level**: L3 (Build Success Verification)

## Overview

Add payout-related configuration values to the blockchain configuration module. These values control payout session behavior: balance threshold for session end detection, timeout duration, and periodic check interval.

## Context

PayoutSessionService requires three configuration parameters:
1. **Balance threshold**: When wallet balance drops below this value (in USDT), the payout session ends
2. **Timeout duration**: Maximum time between transactions before session is considered complete
3. **Check interval**: How often to check for timeout and balance threshold conditions

Additionally, the USDT contract address is needed for balance checking via TronGrid API.

## Target Files

### Files to Modify
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\config\blockchain.config.ts`

## Dependencies

**Depends On**: None (can start immediately)

**Blocks**:
- Task 05 (PayoutSessionService) - needs configuration values via ConfigService
- Task 06 (Timeout check) - needs timeout and interval configuration

## Implementation Steps

### Step 1: Add PayoutConfig interface

Add the following interface to `blockchain.config.ts`:

```typescript
export interface PayoutConfig {
  /** Balance threshold in USDT (default: 1000) */
  balanceThresholdUsdt: number;
  /** Timeout in minutes (default: 30) */
  timeoutMinutes: number;
  /** Check interval in milliseconds (default: 60000) */
  checkIntervalMs: number;
}
```

### Step 2: Add environment variable mappings

Add the following to the configuration factory function:

```typescript
payout: {
  balanceThresholdUsdt: parseInt(
    process.env.PAYOUT_BALANCE_THRESHOLD_USDT || '1000',
    10,
  ),
  timeoutMinutes: parseInt(
    process.env.PAYOUT_TIMEOUT_MINUTES || '30',
    10,
  ),
  checkIntervalMs: parseInt(
    process.env.PAYOUT_CHECK_INTERVAL_MS || '60000',
    10,
  ),
},
```

### Step 3: Add USDT contract address

Add USDT contract configuration:

```typescript
usdtContractAddress:
  process.env.USDT_CONTRACT_ADDRESS ||
  'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', // TRC20 USDT mainnet
```

### Step 4: Update BlockchainConfig interface

Add payout and usdtContractAddress to the main configuration interface:

```typescript
export interface BlockchainConfig {
  // ... existing fields
  payout: PayoutConfig;
  usdtContractAddress: string;
}
```

### Step 5: Verify build

```bash
pnpm build
```

## Acceptance Criteria

- [x] `PayoutConfig` interface defined with 3 fields
- [x] Environment variables mapped with default values
- [x] `PAYOUT_BALANCE_THRESHOLD_USDT` defaults to 1000
- [x] `PAYOUT_TIMEOUT_MINUTES` defaults to 30
- [x] `PAYOUT_CHECK_INTERVAL_MS` defaults to 60000
- [x] `USDT_CONTRACT_ADDRESS` defaults to mainnet address
- [x] Build succeeds: `pnpm build`
- [x] Configuration values accessible via ConfigService

## Verification Steps

1. Run build: `pnpm build`
2. Verify no TypeScript errors
3. Verify configuration schema is valid

## Edge Cases

- **Missing environment variables**: Default values should apply
- **Invalid numeric values**: parseInt should handle gracefully (falls back to NaN, should be validated in service)
- **Empty string values**: parseInt returns NaN for empty strings (service should validate)

## Notes

- **Balance threshold**: 1000 USDT is the typical minimum balance after salary payouts complete
- **Timeout**: 30 minutes is reasonable gap between transactions; longer gaps likely indicate session completion
- **Check interval**: 60 seconds (1 minute) balances responsiveness with API call frequency
- **USDT contract**: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t is the official TRC20 USDT contract on TRON mainnet

## References

- Design Doc: `docs/design/payout-session-notifications-design.md` (Contract Definitions section)
- Work Plan: `docs/plans/payout-session-notifications-plan.md` (Task 1.1)
- ADR-0004: Payout Session Detection

## Completion Checklist

- [x] PayoutConfig interface created
- [x] Environment variable mappings added
- [x] Default values set
- [x] USDT contract address added (already existed as contracts.usdt)
- [x] BlockchainConfig interface updated
- [x] Build succeeds
- [x] No TypeScript errors
