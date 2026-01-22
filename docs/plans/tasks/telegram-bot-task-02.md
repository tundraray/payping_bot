# Task: Add getRollingAverage() to TransactionsService

**Task ID**: telegram-bot-task-02
**Phase**: 4 (Database Extensions)
**Estimated Time**: 30-45 minutes
**Dependencies**: Task 01 (uses getMonthlySum internally)
**Verifiability Level**: L2 (Test operation verification)

## Overview

Add `getRollingAverage(months: number)` method to TransactionsService to calculate the average monthly income over the last N months. This method is required by StartHandler to display expected income based on historical data.

## Target Files

- `libs/db/src/services/transactions.service.ts` (modify)
- `libs/db/src/services/transactions.service.spec.ts` (modify)

## Context

Building on Task 01's `getMonthlySum()` method, this task adds analytics functionality to calculate rolling averages. The bot needs to display "expected income" to users based on the last 3 months of data, helping them anticipate future income.

The method must handle cases where fewer than N months of data exist (use available months) and return "0" when no data is available.

## Implementation Steps

### Step 1: Add getRollingAverage() method to TransactionsService

**File**: `libs/db/src/services/transactions.service.ts`

Add the following method to the TransactionsService class:

```typescript
/**
 * Calculates the rolling average of monthly income over the last N months.
 *
 * Uses available months if fewer than N months of data exist. For example,
 * if requesting 3-month average but only 2 months have data, returns average
 * of those 2 months.
 *
 * @param months - Number of months to include in rolling average (e.g., 3)
 * @returns Average monthly USDT amount as string with 2 decimal precision, "0.00" if no data
 * @throws Error on database failure (fail-fast)
 *
 * @see AC-1.2: Displays expected income from 3-month average
 * @see AC-1.3: Uses available months if < 3 months data
 * @see AC-1.4: Returns "0.00" when no data exists
 */
async getRollingAverage(months: number): Promise<string> {
  try {
    // Implementation here:
    // 1. Calculate current year/month
    // 2. Loop backwards through last N months
    // 3. Call getMonthlySum() for each month
    // 4. Sum all monthly totals and count months with data
    // 5. Calculate average: totalSum / monthsWithData
    // 6. Return "0.00" if no data, otherwise return average with 2 decimal precision
  } catch (error) {
    this.logger.error('Failed to get rolling average', { months, error });
    throw error;
  }
}
```

**Implementation Details:**
- Calculate the current date to determine which months to query
- Loop backwards from current month: `for (let i = 0; i < months; i++)`
- For each iteration, calculate year and month: `new Date(now.getFullYear(), now.getMonth() - i, 1)`
- Call `await this.getMonthlySum(year, month)` for each month
- Parse returned string amounts to numbers for calculation (use `parseFloat()`)
- Count months with non-zero data
- Calculate average: `totalSum / monthsWithData`
- Return "0.00" if `monthsWithData === 0`
- Otherwise, return average formatted to 2 decimal places: `average.toFixed(2)`

**Edge Cases to Handle:**
- Fewer than N months of data: use available months only
- All months have zero transactions: return "0.00"
- Some months have data, some don't: average only months with data OR average all N months (including zeros) - **decision needed, recommend averaging all N months for consistency**

**Required Imports:**
None (uses existing imports)

### Step 2: Add unit tests for getRollingAverage()

**File**: `libs/db/src/services/transactions.service.spec.ts`

Add the following test suite:

```typescript
describe('getRollingAverage', () => {
  it('should return "0.00" when no transactions exist', async () => {
    // Test empty database case
  });

  it('should calculate average from all N months when data exists', async () => {
    // Insert transactions in last 3 months
    // Verify average is calculated correctly
    // Example: 100, 200, 300 → average = 200.00
  });

  it('should use available months when fewer than N months have data', async () => {
    // Insert transactions in only 1 month
    // Request 3-month average
    // Verify average uses only available month
  });

  it('should format result with 2 decimal precision', async () => {
    // Insert transactions that result in decimal average
    // Example: 100.50, 150.75 → average = 125.625 → "125.63" (rounded)
    // Verify formatting is correct
  });

  it('should handle months with zero transactions', async () => {
    // Insert transactions in month 1 and month 3, but not month 2
    // Verify month 2 contributes 0 to average
  });

  it('should calculate across year boundaries correctly', async () => {
    // Test case where rolling window crosses from December to January
    // Example: December 2025, January 2026, February 2026
    // Verify correct month selection
  });

  it('should call getMonthlySum for each month in range', async () => {
    // Spy on getMonthlySum method
    // Call getRollingAverage(3)
    // Verify getMonthlySum was called 3 times with correct year/month pairs
  });

  it('should throw error when getMonthlySum fails', async () => {
    // Mock getMonthlySum to throw error
    // Verify error is logged and re-thrown
  });
});
```

**Test Implementation Pattern:**
- Use in-memory SQLite database for tests
- Insert test transactions with specific timestamps for different months
- Call `getRollingAverage(N)` and assert on returned value
- Use `jest.spyOn()` to verify method calls where applicable
- Follow existing test patterns from the file

### Step 3: Run tests and verify

```bash
pnpm run test -- transactions.service.spec.ts
```

Verify:
- All new tests pass
- Existing tests still pass (including Task 01 tests)
- Coverage for new method is 80%+

## Completion Criteria

- [x] `getRollingAverage(months)` method added to TransactionsService
- [x] Method returns "0.00" (string) when no transactions exist
- [x] Method calculates average correctly using available months
- [x] Result formatted to 2 decimal precision
- [x] Handles year boundary crossings (e.g., Dec 2025 → Jan 2026)
- [x] Calls `getMonthlySum()` for each month in rolling window
- [x] All unit tests pass (8 test cases minimum)
- [x] Test coverage >= 80% for new method
- [x] Error handling follows fail-fast pattern (log + re-throw)
- [x] Structured logging includes months parameter and error context

## Acceptance Criteria Traceability

- **AC-1.2**: /start displays expected income from 3-month average → Provides data source
- **AC-1.3**: Uses available months if < 3 months data → Explicitly handles this case
- **AC-1.4**: Shows "0.00 USDT" when no data → Method returns "0.00" explicitly

## Design Decision: Zero-Month Handling

**Question**: When calculating 3-month average, if one month has no transactions, should it contribute 0 to the average?

**Decision**: **Yes, include zero months in the average calculation.**

**Rationale**:
- Represents true average monthly income (some months may genuinely have no income)
- Prevents artificially inflated averages
- Consistent with user expectations ("average over last 3 months")

**Example**:
- Month 1: 100 USDT
- Month 2: 0 USDT
- Month 3: 200 USDT
- Average: (100 + 0 + 200) / 3 = 100.00 USDT

**Alternative** (NOT chosen): Only average months with non-zero data
- Would result in: (100 + 200) / 2 = 150.00 USDT
- Could mislead users about consistent income

## Testing Strategy

**Unit Tests** (L2 Verification):
- Empty database → returns "0.00"
- Full N months with data → correct average
- Fewer than N months → uses available months only
- Decimal precision → formatted to 2 decimals
- Zero months included → contributes 0 to average
- Year boundaries → correct month selection
- Method calls → verifies getMonthlySum called correctly
- Error cases → fail-fast behavior

**Integration Point**: Task 03 (StartHandler enhancement) will consume this method.

## Notes

- Current month is included in the rolling window (e.g., 3-month average includes current month + previous 2 months)
- Use JavaScript `Date` object for month calculations
- Handle month underflow: `new Date(2026, -1, 1)` correctly returns `December 2025`
- Precision: `getMonthlySum()` returns 6 decimals, but rolling average returns 2 decimals for display
- Consider edge case: user calls getRollingAverage(0) - should return "0.00" or throw error? **Recommend return "0.00"**

## Rollback Procedure

If issues are found:
1. Revert the commit
2. Task 01 (getMonthlySum) remains functional
3. No database schema changes to rollback

## Verification Commands

```bash
# Run unit tests
pnpm run test -- transactions.service.spec.ts

# Check test coverage
pnpm run test:cov -- transactions.service.spec.ts

# Verify lint and type checks
pnpm run lint
pnpm run check
```

## Success Indicators

- ✅ All unit tests pass
- ✅ Test coverage >= 80%
- ✅ Zero lint errors
- ✅ Zero type errors
- ✅ Method signature matches specification
- ✅ Fail-fast error handling implemented
- ✅ Structured logging present
- ✅ Integrates correctly with Task 01's getMonthlySum()
