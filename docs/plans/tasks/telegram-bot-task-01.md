# Task: Add getMonthlySum() to TransactionsService

**Task ID**: telegram-bot-task-01
**Phase**: 4 (Database Extensions)
**Estimated Time**: 30-45 minutes
**Dependencies**: None
**Verifiability Level**: L2 (Test operation verification)

## Overview

Add `getMonthlySum(year: number, month: number)` method to TransactionsService to calculate the total USDT amount received in a specific month. This method is required by StartHandler to display current month income analytics.

## Target Files

- `libs/db/src/services/transactions.service.ts` (modify)
- `libs/db/src/services/transactions.service.spec.ts` (modify)

## Context

The TransactionsService currently provides basic transaction persistence operations (findByHash, save, getLastTimestamp). The Telegram bot needs analytics functionality to display monthly income summaries to users via the /start command.

This method will query the transactions table for all incoming USDT transactions (where toAddress matches the monitored wallet) within a specified month and return the sum with proper precision.

## Implementation Steps

### Step 1: Add getMonthlySum() method to TransactionsService

**File**: `libs/db/src/services/transactions.service.ts`

Add the following method to the TransactionsService class:

```typescript
/**
 * Calculates the sum of incoming USDT transactions for a specific month.
 *
 * Only counts transactions where toAddress matches the monitored wallet
 * (incoming transactions only). Amount precision is preserved at 6 decimals.
 *
 * @param year - Calendar year (e.g., 2026)
 * @param month - Calendar month (1-12)
 * @returns Total USDT amount as string with 6 decimal precision, "0" if no transactions
 * @throws Error on database failure (fail-fast)
 *
 * @see AC-1.1: Supports current month income display
 * @see AC-1.4: Returns "0" when no data exists
 */
async getMonthlySum(year: number, month: number): Promise<string> {
  try {
    // Implementation here:
    // 1. Get monitored wallet address from config
    // 2. Calculate start and end timestamps for the month (UTC)
    // 3. Query transactions where:
    //    - toAddress = monitored wallet
    //    - timestamp >= start of month
    //    - timestamp < start of next month
    // 4. Sum the amounts
    // 5. Return "0" if no transactions, otherwise return sum with 6 decimal precision
  } catch (error) {
    this.logger.error('Failed to get monthly sum', { year, month, error });
    throw error;
  }
}
```

**Implementation Details:**
- Use `getMonitoredWalletAddress()` to get the wallet address
- Convert year/month to Unix timestamps (milliseconds):
  - Start: `new Date(year, month - 1, 1).getTime()`
  - End: `new Date(year, month, 1).getTime()`
- Use Drizzle ORM query with `and()`, `eq()`, `gte()`, `lt()` conditions
- Use `sum()` aggregation or manual summation in JavaScript
- Preserve USDT precision (6 decimals) in the result
- Return "0" (string) if no transactions found

**Required Imports:**
```typescript
import { and, eq, gte, lt } from 'drizzle-orm';
```

### Step 2: Add unit tests for getMonthlySum()

**File**: `libs/db/src/services/transactions.service.spec.ts`

Add the following test suite:

```typescript
describe('getMonthlySum', () => {
  it('should return "0" when no transactions exist', async () => {
    // Test empty database case
  });

  it('should return sum of incoming transactions for specified month', async () => {
    // Test with 2-3 transactions in target month
    // Verify correct sum with 6 decimal precision
  });

  it('should exclude transactions from other months', async () => {
    // Insert transactions in different months
    // Verify only target month is counted
  });

  it('should only count incoming transactions (toAddress = monitored wallet)', async () => {
    // Insert both incoming and outgoing transactions
    // Verify only incoming are counted
  });

  it('should handle month boundaries correctly', async () => {
    // Test transactions at exact month start/end boundaries
    // Verify edge cases (last second of previous month, first second of target month)
  });

  it('should preserve 6 decimal precision for USDT amounts', async () => {
    // Test with amounts like "100.123456"
    // Verify precision is maintained in sum
  });

  it('should throw error on database failure', async () => {
    // Mock database error
    // Verify error is logged and re-thrown
  });
});
```

**Test Implementation Pattern:**
- Use in-memory SQLite database for tests (already configured in project)
- Insert test transactions using `db.insert(transactions).values(...)`
- Call `getMonthlySum()` and assert on returned value
- Use structured logging assertions where applicable
- Follow existing test patterns from the file

### Step 3: Run tests and verify

```bash
pnpm run test -- transactions.service.spec.ts
```

Verify:
- All new tests pass
- Existing tests still pass
- Coverage for new method is 80%+

## Completion Criteria

- [x] `getMonthlySum(year, month)` method added to TransactionsService
- [x] Method returns "0" (string) when no transactions exist
- [x] Method correctly sums only incoming transactions (toAddress = monitored wallet)
- [x] Month boundary filtering works correctly (UTC timestamps)
- [x] Amount precision preserved at 6 decimals
- [x] All unit tests pass (7 test cases minimum)
- [x] Test coverage >= 80% for new method
- [x] Error handling follows fail-fast pattern (log + re-throw)
- [x] Structured logging includes year, month, error context

## Acceptance Criteria Traceability

- **AC-1.1**: /start displays current month income → Provides data source
- **AC-1.4**: Shows "0.00 USDT" when no data → Method returns "0" explicitly

## Testing Strategy

**Unit Tests** (L2 Verification):
- Empty database → returns "0"
- Single month with transactions → returns correct sum
- Multiple months → only target month counted
- Incoming vs outgoing → only incoming counted
- Boundary conditions → edge cases handled
- Precision preservation → 6 decimals maintained
- Error cases → fail-fast behavior

**Integration Point**: Task 03 (StartHandler enhancement) will consume this method.

## Notes

- Use UTC timezone for all date calculations to avoid timezone issues
- USDT amounts are stored as strings in the database to preserve precision
- JavaScript number arithmetic may lose precision; consider using string-based decimal library if needed (e.g., `decimal.js`)
- Month parameter is 1-indexed (1 = January, 12 = December)
- The method does not filter by transaction type (TRX vs USDT) - assumes all transactions in the table are relevant (as per current design)

## Rollback Procedure

If issues are found:
1. Revert the commit
2. Existing functionality is unaffected (new method only)
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
