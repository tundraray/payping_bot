# Task: Update TransactionsService (Raw Return, Fix getRollingAverage)

**Task ID**: i18n-task-07
**Phase**: Phase 3 - Service Updates
**Estimated Effort**: 1-2 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Refactor `TransactionsService.getMonthlySum()` to return raw amount instead of formatted string, following separation of concerns. Also fix `getRollingAverage()` internal calculation to work with raw amounts.

## Context

Currently, `getMonthlySum()` returns a formatted string (e.g., "1234.56"), which violates separation of concerns - the database service should return raw data, and the presentation layer should format for display. Additionally, `getRollingAverage()` depends on `getMonthlySum()`, so its internal calculation needs updating.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\db\src\services\transactions.service.ts`
- `D:\git\github\tg-bots\payping_bot\libs\db\src\services\__tests__\transactions.service.int.test.ts`

## Dependencies

**Depends On**:
- Task 01 (telegram format utils) - new formatUsdtDisplay utility exists

**Blocks**:
- Task 09 (Update StartHandler) - will use formatUsdtDisplay on raw amount
- Task 10 (Update TransactionListener) - will use formatUsdtDisplay on raw amount

## Implementation Steps

### Step 1: Update getMonthlySum to return raw amount

Locate `getMonthlySum()` method in `libs/db/src/services/transactions.service.ts` (around line 240-268).

**Before** (line 263):
```typescript
// Convert to human-readable USDT format
return formatUsdt(sumInSmallestUnit);
```

**After**:
```typescript
// Return raw amount (presentation layer formats for display)
return sumInSmallestUnit.toString();
```

**Full updated method**:
```typescript
async getMonthlySum(year: number, month: number): Promise<string> {
  try {
    // Calculate date range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59, 999);

    // Query for incoming transactions in the month
    const result = await this.db
      .select({
        amount: schema.transactions.amount,
      })
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.direction, 'incoming'),
          gte(schema.transactions.timestamp, startDate),
          lte(schema.transactions.timestamp, endDate),
        ),
      );

    // Return "0" if no transactions found
    if (result.length === 0) {
      return '0';
    }

    // Sum the amounts (stored in smallest unit, e.g., 1000000 = 1 USDT)
    let sumInSmallestUnit = 0;
    for (const row of result) {
      sumInSmallestUnit += Number.parseFloat(row.amount);
    }

    // Return raw amount (presentation layer formats for display)
    return sumInSmallestUnit.toString();
  } catch (error) {
    this.logger.error('Failed to get monthly sum', { year, month, error });
    throw error;
  }
}
```

### Step 2: Fix getRollingAverage internal calculation

Locate `getRollingAverage()` method (should be above `getMonthlySum()`).

**Before** (expected):
```typescript
async getRollingAverage(monthsCount: number): Promise<string> {
  const currentDate = new Date();
  let totalSum = 0;

  for (let i = 0; i < monthsCount; i++) {
    const targetDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - i,
      1,
    );
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;

    const monthSum = await this.getMonthlySum(year, month);
    totalSum += Number.parseFloat(monthSum); // Parsing formatted string "1234.56"
  }

  const average = totalSum / monthsCount;
  return formatUsdt(average); // Already formatted, but average is wrong
}
```

**After**:
```typescript
async getRollingAverage(monthsCount: number): Promise<string> {
  const currentDate = new Date();
  let totalSumRaw = 0; // Sum raw amounts

  for (let i = 0; i < monthsCount; i++) {
    const targetDate = new Date(
      currentDate.getFullYear(),
      currentDate.getMonth() - i,
      1,
    );
    const year = targetDate.getFullYear();
    const month = targetDate.getMonth() + 1;

    const monthSum = await this.getMonthlySum(year, month);
    totalSumRaw += Number.parseFloat(monthSum); // Parse raw amount
  }

  const averageRaw = totalSumRaw / monthsCount;
  return formatUsdt(averageRaw); // Format at the end
}
```

**Key Changes**:
- Renamed `totalSum` → `totalSumRaw` for clarity
- Now parses raw amount from `getMonthlySum()` (e.g., "1234560000")
- Calculates average on raw values
- Formats only at the end using `formatUsdt()` from `./utils/usdt.utils`

### Step 3: Update integration tests

Update `libs/db/src/services/__tests__/transactions.service.int.test.ts`:

```typescript
describe('TransactionsService', () => {
  describe('getMonthlySum', () => {
    it('should return raw amount for month with transactions', async () => {
      // Arrange: Insert transaction with raw amount 1234560000 (1234.56 USDT)
      const year = 2026;
      const month = 1;
      const timestamp = new Date(2026, 0, 15); // Jan 15, 2026

      await transactionsService.save({
        hash: 'test-hash-123',
        amount: '1234560000', // Raw amount
        direction: 'incoming',
        timestamp,
        fromAddress: 'TFromAddress',
        toAddress: 'TToAddress',
      });

      // Act
      const sum = await transactionsService.getMonthlySum(year, month);

      // Assert: Should return raw amount
      expect(sum).toBe('1234560000');
    });

    it('should return "0" for month with no transactions', async () => {
      // Act
      const sum = await transactionsService.getMonthlySum(2026, 12);

      // Assert
      expect(sum).toBe('0');
    });
  });

  describe('getRollingAverage', () => {
    it('should return formatted average', async () => {
      // Arrange: Insert transactions in multiple months
      await transactionsService.save({
        hash: 'hash-1',
        amount: '1000000', // 1 USDT
        direction: 'incoming',
        timestamp: new Date(2026, 0, 15), // Jan 2026
        fromAddress: 'TFrom',
        toAddress: 'TTo',
      });

      await transactionsService.save({
        hash: 'hash-2',
        amount: '3000000', // 3 USDT
        direction: 'incoming',
        timestamp: new Date(2025, 11, 15), // Dec 2025
        fromAddress: 'TFrom',
        toAddress: 'TTo',
      });

      // Act: Get 2-month average
      const average = await transactionsService.getRollingAverage(2);

      // Assert: Average of 1 USDT and 3 USDT = 2.00 USDT (formatted)
      expect(average).toBe('2.00');
    });
  });
});
```

### Step 4: Run integration tests

```bash
pnpm test libs/db/src/services/__tests__/transactions.service.int.test.ts
```

### Step 5: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [ ] `getMonthlySum()` returns raw amount string (e.g., "1234560000") (AC-5.1)
- [ ] `getRollingAverage()` continues to return formatted string (AC-5.3)
- [ ] `getRollingAverage()` internal calculation uses raw values (AC-5.4)
- [ ] Integration tests updated to expect raw format (AC-5.2)
- [ ] All integration tests pass
- [ ] Build succeeds
- [ ] No lint errors

## Verification Steps

1. Verify `getMonthlySum()` returns raw amount (no formatUsdt call)
2. Verify `getRollingAverage()` sums raw values, formats at end
3. Run integration tests: `pnpm test transactions.service.int.test.ts`
4. Verify test assertions expect raw format
5. Run build: `pnpm build`
6. Run lint: `pnpm lint`

## Before/After Comparison

### getMonthlySum()

| Aspect | Before | After |
|--------|--------|-------|
| Return value | "1234.56" (formatted) | "1234560000" (raw) |
| Data layer | Mixed concern (data + display) | Pure data (no formatting) |
| Caller burden | Already formatted | Must format for display |

### getRollingAverage()

| Aspect | Before | After |
|--------|--------|-------|
| Internal sum | Parses formatted "1234.56" | Parses raw "1234560000" |
| Calculation | On formatted values (incorrect) | On raw values (correct) |
| Return value | "2.00" (formatted) | "2.00" (formatted) |
| Public API | Unchanged | Unchanged |

## Edge Cases Considered

**Zero transactions**:
- `getMonthlySum()` returns "0" (raw zero)
- Caller formats as "0.00" with formatUsdtDisplay

**Large amounts**:
- Raw amount: "999999999999999"
- Presentation layer formats with separators: "999,999,999.99"

**getRollingAverage with zero months**:
- Division by zero (edge case)
- Not handled in this task (existing behavior preserved)

## Notes

- **Separation of concerns**: Database service returns raw data, telegram service formats for display
- **Backward compatibility**: getRollingAverage() public API unchanged (still returns formatted string)
- **Internal fix**: getRollingAverage calculation now correct (was parsing formatted strings)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (Data Flow section, AC-5)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 3.1)
- Task 01: Telegram format utils (formatUsdtDisplay)

## Completion Checklist

- [ ] `getMonthlySum()` returns raw amount (line 263 updated)
- [ ] `getRollingAverage()` sums raw values
- [ ] Integration tests updated (2 test cases for getMonthlySum, 1 for getRollingAverage)
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] Code reviewed for calculation correctness
