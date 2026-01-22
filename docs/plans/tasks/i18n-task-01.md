# Task: Create Telegram Format Utils

**Task ID**: i18n-task-01
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 1-2 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Create formatting utility functions in the telegram lib for display purposes. These utilities will convert raw USDT amounts to human-readable format with thousand separators.

## Context

Currently, `formatUsdtDisplay()` exists in `@app/db` (database module), which violates separation of concerns. Database layer should return raw data, and presentation layer (telegram module) should format data for display. This task moves the formatting responsibility to the correct architectural layer.

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\utils\format.utils.ts`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\utils\index.ts`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\utils\format.utils.spec.ts`

## Dependencies

**Depends On**: None (can run in parallel with other Phase 1 tasks)

**Blocks**:
- Task 07 (TransactionsService raw return) - needs this utility to format raw amounts
- Task 08 (Remove formatUsdtDisplay from db) - must exist before removal
- Task 09 (Update StartHandler) - uses formatUsdtDisplay from this task
- Task 10 (Update TransactionListener) - uses formatUsdtDisplay from this task

## Implementation Steps

### Step 1: Create format.utils.ts

Create `libs/telegram/src/utils/format.utils.ts` with the following functions:

```typescript
/**
 * USDT TRC20 token has 6 decimal places.
 */
const USDT_DECIMALS = 6;

/**
 * Converts raw USDT amount to human-readable format with thousand separators.
 *
 * @param rawAmount - Amount in smallest unit (e.g., "1000000" = 1 USDT)
 * @param decimals - Number of decimal places to display (default: 2)
 * @returns Formatted string with separators (e.g., "1,234.56")
 *
 * @example
 * formatUsdtDisplay("1234567890000") // "1,234,567.89"
 * formatUsdtDisplay("1000000") // "1.00"
 * formatUsdtDisplay("0") // "0.00"
 */
export function formatUsdtDisplay(
  rawAmount: string | number,
  decimals = 2,
): string {
  // Convert to number if string
  const amountNum = typeof rawAmount === 'string'
    ? Number.parseFloat(rawAmount)
    : rawAmount;

  // Handle invalid input
  if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
    return '0.00';
  }

  // Convert from smallest unit to human-readable (divide by 10^6)
  const humanAmount = amountNum / Math.pow(10, USDT_DECIMALS);

  // Format with thousand separators
  return formatWithSeparators(humanAmount.toFixed(decimals));
}

/**
 * Format number string with thousand separators.
 *
 * @param value - Numeric string (e.g., "1234.56")
 * @returns Formatted string with separators (e.g., "1,234.56")
 *
 * @example
 * formatWithSeparators("1234.56") // "1,234.56"
 * formatWithSeparators("1234567.89") // "1,234,567.89"
 */
export function formatWithSeparators(value: string): string {
  const [integer, decimal] = value.split('.');
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal ? `${formattedInteger}.${decimal}` : formattedInteger;
}
```

### Step 2: Create barrel export

Create `libs/telegram/src/utils/index.ts`:

```typescript
export * from './format.utils';
```

### Step 3: Create unit tests

Create `libs/telegram/src/utils/format.utils.spec.ts`:

```typescript
import { describe, it, expect } from '@jest/globals';
import { formatUsdtDisplay, formatWithSeparators } from './format.utils';

describe('formatUsdtDisplay', () => {
  it('should format raw USDT with thousand separators', () => {
    expect(formatUsdtDisplay('1234567890000')).toBe('1,234,567.89');
  });

  it('should format 1 USDT correctly', () => {
    expect(formatUsdtDisplay('1000000')).toBe('1.00');
  });

  it('should format zero correctly', () => {
    expect(formatUsdtDisplay('0')).toBe('0.00');
  });

  it('should handle string input', () => {
    expect(formatUsdtDisplay('5000000')).toBe('5.00');
  });

  it('should handle number input', () => {
    expect(formatUsdtDisplay(5000000)).toBe('5.00');
  });

  it('should handle decimal precision parameter', () => {
    expect(formatUsdtDisplay('1234560000', 3)).toBe('1,234.560');
  });

  it('should return 0.00 for invalid input', () => {
    expect(formatUsdtDisplay('invalid')).toBe('0.00');
  });

  it('should return 0.00 for NaN', () => {
    expect(formatUsdtDisplay(Number.NaN)).toBe('0.00');
  });

  it('should return 0.00 for Infinity', () => {
    expect(formatUsdtDisplay(Number.POSITIVE_INFINITY)).toBe('0.00');
  });

  it('should handle negative amounts', () => {
    expect(formatUsdtDisplay('-1000000')).toBe('-1.00');
  });

  it('should format large amounts correctly', () => {
    expect(formatUsdtDisplay('999999999999999')).toBe('999,999,999.99');
  });
});

describe('formatWithSeparators', () => {
  it('should add thousand separators', () => {
    expect(formatWithSeparators('1234.56')).toBe('1,234.56');
  });

  it('should handle large numbers', () => {
    expect(formatWithSeparators('1234567.89')).toBe('1,234,567.89');
  });

  it('should handle numbers without decimals', () => {
    expect(formatWithSeparators('1234')).toBe('1,234');
  });

  it('should handle small numbers', () => {
    expect(formatWithSeparators('12.34')).toBe('12.34');
  });

  it('should handle zero', () => {
    expect(formatWithSeparators('0.00')).toBe('0.00');
  });
});
```

### Step 4: Run tests

```bash
pnpm test libs/telegram/src/utils/format.utils.spec.ts
```

### Step 5: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [x] `formatUsdtDisplay("1234567890000")` returns `"1,234,567.89"` (AC-4.1)
- [x] `formatUsdtDisplay("1000000")` returns `"1.00"` (AC-4.1)
- [x] `formatWithSeparators("1234.56")` returns `"1,234.56"`
- [x] All unit tests pass (16 test cases)
- [x] Build succeeds without errors
- [x] File exported from `libs/telegram/src/utils/index.ts`
- [x] No lint errors

## Verification Steps

1. Run unit tests: `pnpm test libs/telegram/src/utils/format.utils.spec.ts`
2. Verify test coverage: Should be 100% for this utility
3. Run build: `pnpm build`
4. Run lint: `pnpm lint`

## Edge Cases to Test

- Zero amount: "0" → "0.00"
- Invalid input: "invalid" → "0.00"
- NaN and Infinity → "0.00"
- Negative amounts: "-1000000" → "-1.00"
- Large amounts: "999999999999999" → "999,999,999.99"
- Different decimal precision: (rawAmount, 3) → 3 decimal places

## Notes

- **USDT_DECIMALS = 6**: TRC20 USDT uses 6 decimal places (not 18 like many ERC20 tokens)
- **Defensive coding**: Returns "0.00" for invalid input instead of throwing
- **Reusability**: `formatWithSeparators` is public for use in other contexts
- **Type flexibility**: Accepts both string and number for rawAmount

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (Contract Definitions section)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 1.1)
- Existing implementation to migrate: `libs/db/src/utils/usdt.utils.ts:formatUsdtDisplay()`

## Completion Checklist

- [x] format.utils.ts created with both functions
- [x] index.ts created with barrel export
- [x] format.utils.spec.ts created with 16 test cases
- [x] All tests pass
- [x] Build succeeds
- [x] No lint errors
- [x] Code reviewed for edge cases
- [x] Documentation comments complete
