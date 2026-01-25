# Task 08: Implement Integration Tests

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 1 hour
**Phase**: 3 - Integration Tests Implementation
**Depends On**: Task 07
**Blocks**: Phase 4 (Quality Assurance)

## Overview

Create integration tests in a new file `classification-regularity.int.test.ts` that verify the regularity-based classification algorithm with real database interactions. These tests ensure the algorithm works correctly in a production-like environment with actual data persistence.

## Context

Integration tests verify behavior beyond unit tests by:
- Using real database connections
- Testing actual data persistence and retrieval
- Verifying classification transitions across multiple operations
- Testing UTC timezone handling with real timestamps
- Ensuring span calculation works with database-stored timestamps

The integration test file will be separate from unit tests to allow selective execution (integration tests require DATABASE_URL).

## Target Files

### Files to Create
- `libs/db/src/services/__tests__/classification-regularity.int.test.ts`

## Implementation Details

### Step 1: Create Integration Test File

Create `libs/db/src/services/__tests__/classification-regularity.int.test.ts` with the following structure:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ClassificationService } from '../classification.service';
import { RecipientWalletsService } from '../recipient-wallets.service';
import * as schema from '../../schema';

describe('ClassificationService Integration Tests - Regularity', () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let classificationService: ClassificationService;
  let recipientWalletsService: RecipientWalletsService;

  beforeAll(async () => {
    // Skip if DATABASE_URL not set
    if (!process.env.DATABASE_URL) {
      console.log('DATABASE_URL not set, skipping integration tests');
      return;
    }

    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });

    recipientWalletsService = new RecipientWalletsService(db);
    classificationService = new ClassificationService(recipientWalletsService);
  });

  afterAll(async () => {
    if (pool) {
      await pool.end();
    }
  });

  beforeEach(async () => {
    if (!db) return;

    // Clean up test data
    await db.delete(schema.recipientWallets);
  });

  // Test cases will be added in following steps
});
```

**Note**: Integration tests should check for DATABASE_URL and skip gracefully if not available.

### Step 2: Add Regularity Calculation Edge Cases Tests

**Test Group**: Regularity Calculation Edge Cases

```typescript
describe('Regularity Calculation Edge Cases', () => {
  it('should classify as EMPLOYEE at exactly 70% regularity', async () => {
    if (!db) return; // Skip if no database

    // Arrange: Create wallet with payments achieving exactly 70% regularity
    const walletAddress = 'TBoundary70Percent123';

    // Create initial wallet
    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
      totalPayments: 1,
      lastAmount: '1000',
    });

    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() },  // Mar
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 3, 15)).getTime() },  // Apr
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 5, 15)).getTime() },  // Jun (skip May)
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 7, 15)).getTime() },  // Aug (skip Jul)
    ];

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 9, 15)).getTime() // Oct (skip Sep)
    };
    // 7 unique months over 10-month span = 70%

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('EMPLOYEE');
    expect(result.regularity).toBeCloseTo(0.70, 2);
  });

  it('should classify as FREELANCER just below 70% regularity', async () => {
    if (!db) return;

    // Arrange: 6 unique months over 10-month span = 60%
    const walletAddress = 'TBelow70Percent456';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
      totalPayments: 1,
      lastAmount: '1000',
    });

    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 3, 15)).getTime() },  // Apr (skip Mar)
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 5, 15)).getTime() },  // Jun (skip May)
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 7, 15)).getTime() },  // Aug (skip Jul)
    ];

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 9, 15)).getTime() // Oct (skip Sep)
    };
    // 6 unique months over 10-month span = 60%

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('FREELANCER');
    expect(result.regularity).toBeCloseTo(0.60, 2);
  });

  it('should count multiple payments in same month as 1 unique month', async () => {
    if (!db) return;

    // Arrange: Multiple payments in same months
    const walletAddress = 'TMultipleSameMonth789';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 5)),
      totalPayments: 1,
      lastAmount: '1000',
    });

    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 5)).getTime() },   // Jan 5
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan 15
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 10)).getTime() },  // Feb 10
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 20)).getTime() },  // Feb 20
    ];

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() // Mar 15
    };
    // 5 payments total, but only 3 unique months (Jan, Feb, Mar)
    // Span: 3 months
    // Regularity: 3/3 = 100%

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('EMPLOYEE');
    expect(result.regularity).toBe(1.0);
  });
});
```

### Step 3: Add Classification Transitions Tests

**Test Group**: Classification Transitions

```typescript
describe('Classification Transitions', () => {
  it('should transition FREELANCER to EMPLOYEE when regularity increases', async () => {
    if (!db) return;

    const walletAddress = 'TTransition123';

    // Create wallet classified as FREELANCER
    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'FREELANCER',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 8, 15)),
      totalPayments: 5,
      lastAmount: '1000',
    });

    // Initial state: 5 payments over 9 months = 55.6% (FREELANCER)
    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() },  // Mar
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 4, 15)).getTime() },  // May
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 6, 15)).getTime() },  // Jul
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 8, 15)).getTime() },  // Sep
    ];

    // Add consecutive payments to increase regularity
    const newPayments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 9, 15)).getTime() },  // Oct
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 10, 15)).getTime() }, // Nov
    ];

    // After adding Oct and Nov: 7 unique months over 11-month span = 63.6% (still FREELANCER)
    let result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayments[0],
    );
    expect(result.classification).toBe('FREELANCER');

    // Add one more to push over 70%
    const finalPayment = { amount: '1000', timestamp: new Date(Date.UTC(2026, 11, 15)).getTime() }; // Dec
    // Now: 8 unique months over 12-month span = 66.7% (still < 70%)

    // Need to add more for transition - let's add Jan next year
    const jan2027Payment = { amount: '1000', timestamp: new Date(Date.UTC(2027, 0, 15)).getTime() };
    // Now: 9 unique months over 13-month span = 69.2% (close but still < 70%)

    // Actually, let's revise to ensure transition:
    // Better approach: add payments to fill gaps
    const fillGapPayments = [
      ...payments,
      ...newPayments,
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb (fill gap)
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 3, 15)).getTime() },  // Apr (fill gap)
    ];
    // Now: 9 unique months over 9-month span (Jan-Sep) = 100% -> EMPLOYEE

    const transitionPayment = { amount: '1000', timestamp: new Date(Date.UTC(2026, 9, 15)).getTime() };

    result = await classificationService.evaluateClassification(
      walletAddress,
      fillGapPayments,
      transitionPayment,
    );

    // Assert
    expect(result.classification).toBe('EMPLOYEE');
    expect(result.changed).toBe(true);
    expect(result.previousClassification).toBe('FREELANCER');
  });

  it('should transition ONE_TIME to EMPLOYEE with 3+ payments, span >= 3mo, regularity >= 70%', async () => {
    if (!db) return;

    const walletAddress = 'TOneTimeToEmployee456';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
      totalPayments: 1,
      lastAmount: '1000',
    });

    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb
    ];

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() // Mar
    };
    // 3 payments, 3-month span, 100% regularity

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('EMPLOYEE');
    expect(result.changed).toBe(true);
    expect(result.previousClassification).toBe('ONE_TIME');
  });

  it('should transition FIRED to EMPLOYEE on new payment (rehire)', async () => {
    if (!db) return;

    const walletAddress = 'TRehire789';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'FIRED',
      firstSeenAt: new Date(Date.UTC(2025, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2025, 11, 15)),
      totalPayments: 12,
      lastAmount: '1000',
      firedAt: new Date(Date.UTC(2026, 2, 1)),
    });

    const payments = []; // No payment history needed for rehire test

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 3, 15)).getTime() // New payment after being fired
    };

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('EMPLOYEE');
    expect(result.changed).toBe(true);
    expect(result.previousClassification).toBe('FIRED');
  });
});
```

### Step 4: Add Span Calculation Edge Cases Tests

**Test Group**: Span Calculation Edge Cases

```typescript
describe('Span Calculation Edge Cases', () => {
  it('should calculate span inclusively (first and last month included)', async () => {
    if (!db) return;

    const walletAddress = 'TInclusiveSpan123';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
      totalPayments: 1,
      lastAmount: '1000',
    });

    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb
    ];

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() // Mar
    };
    // Span should be 3 (Jan, Feb, Mar inclusive), not 2

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert: Should classify (span = 3 >= 3)
    expect(result.classification).toBe('EMPLOYEE');
  });

  it('should stay ONE_TIME when span < 3 months', async () => {
    if (!db) return;

    const walletAddress = 'TSpanLessThan3';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
      totalPayments: 1,
      lastAmount: '800',
    });

    const payments = [
      { amount: '800', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
    ];

    const newPayment = {
      amount: '800',
      timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() // Feb
    };
    // Span: 2 months (< 3)

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('ONE_TIME');
    expect(result.changed).toBe(false);
  });

  it('should handle single month span (all payments in same month)', async () => {
    if (!db) return;

    const walletAddress = 'TSingleMonthSpan';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 5)),
      totalPayments: 1,
      lastAmount: '500',
    });

    const payments = [
      { amount: '500', timestamp: new Date(Date.UTC(2026, 0, 5)).getTime() },   // Jan 5
      { amount: '500', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan 15
    ];

    const newPayment = {
      amount: '500',
      timestamp: new Date(Date.UTC(2026, 0, 25)).getTime() // Jan 25
    };
    // 3 payments, but all in same month (span = 1)

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('ONE_TIME'); // Span < 3
  });

  it('should handle year boundary correctly', async () => {
    if (!db) return;

    const walletAddress = 'TYearBoundary';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2025, 11, 1)),
      lastPaymentAt: new Date(Date.UTC(2025, 11, 15)),
      totalPayments: 1,
      lastAmount: '900',
    });

    const payments = [
      { amount: '900', timestamp: new Date(Date.UTC(2025, 11, 15)).getTime() }, // Dec 2025
      { amount: '900', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan 2026
    ];

    const newPayment = {
      amount: '900',
      timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() // Feb 2026
    };
    // Span: Dec 2025 to Feb 2026 = 3 months

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert
    expect(result.classification).toBe('EMPLOYEE');
  });
});
```

### Step 5: Add UTC Timezone Handling Test

**Test Group**: UTC Timezone Handling

```typescript
describe('UTC Timezone Handling', () => {
  it('should extract months using UTC, not local timezone', async () => {
    if (!db) return;

    const walletAddress = 'TUTCTimezone';

    await recipientWalletsService.create({
      address: walletAddress,
      classification: 'ONE_TIME',
      firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
      lastPaymentAt: new Date(Date.UTC(2026, 0, 1, 0, 0)),
      totalPayments: 1,
      lastAmount: '1000',
    });

    // Payments at month boundaries in UTC
    const payments = [
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0)).getTime() },  // Jan 1 00:00 UTC
      { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 31, 23, 59)).getTime() }, // Jan 31 23:59 UTC
    ];

    const newPayment = {
      amount: '1000',
      timestamp: new Date(Date.UTC(2026, 1, 1, 0, 0)).getTime() // Feb 1 00:00 UTC
    };

    // Act
    const result = await classificationService.evaluateClassification(
      walletAddress,
      payments,
      newPayment,
    );

    // Assert: Should be 2 unique months (Jan, Feb) in 2-month span
    // Both Jan payments should count as same month in UTC
    expect(result.classification).toBe('ONE_TIME'); // Span < 3
  });
});
```

### Step 6: Run Integration Tests

Run integration tests with DATABASE_URL set:

```bash
DATABASE_URL=<your-test-db-url> pnpm test classification-regularity.int.test.ts
```

**Expected**: All integration tests pass.

### Step 7: Verify Test Cleanup

Ensure tests clean up properly:
- Check that beforeEach deletes test data
- Verify afterAll closes database connection
- No leftover test data in database after run

## Acceptance Criteria

- [x] Integration test file created: `classification-regularity.int.test.ts`
- [x] Tests skip gracefully when DATABASE_URL not set
- [x] Database connection and cleanup properly configured
- [x] Regularity calculation edge cases tested:
  - [x] Exactly 70% regularity → EMPLOYEE
  - [x] Below 70% regularity → FREELANCER
  - [x] Multiple payments same month counted correctly
- [x] Classification transitions tested:
  - [x] FREELANCER → EMPLOYEE on regularity increase
  - [x] ONE_TIME → EMPLOYEE with 3+ payments, span >= 3mo, regularity >= 70%
  - [x] FIRED → EMPLOYEE on new payment (rehire)
- [x] Span calculation edge cases tested:
  - [x] Inclusive span calculation
  - [x] Span < 3 months stays ONE_TIME
  - [x] Single month span handled correctly
  - [x] Year boundary handled correctly
- [x] UTC timezone handling tested:
  - [x] Month extraction uses UTC, not local timezone
- [x] All integration tests pass with DATABASE_URL
- [x] Tests clean up data properly (no leftover test data)

## Verification Level

**L2 (Test Operation Verification)**

Verification command:
```bash
DATABASE_URL=<test-db-url> pnpm test classification-regularity.int.test.ts
```

Expected output: All integration tests pass.

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Test Strategy section)
- **Work Plan**: Task 3.1 in Phase 3
- **Acceptance Criteria**: All ACs (integration test perspective)

## Notes

### Why Integration Tests Matter

Integration tests verify:
1. **Real Database Interactions**: Ensures queries work with actual PostgreSQL
2. **Data Persistence**: Verifies wallet state persists correctly between operations
3. **Timestamp Handling**: Ensures database timestamp storage/retrieval works correctly
4. **UTC Consistency**: Verifies UTC handling works end-to-end

### Test Database Setup

For local development:
```bash
# Start test database (Docker)
docker compose up -d postgres

# Set DATABASE_URL
export DATABASE_URL=postgresql://user:password@localhost:5432/payping_test

# Run migrations
pnpm drizzle-kit push

# Run integration tests
pnpm test classification-regularity.int.test.ts
```

### Cleanup Best Practices

- **beforeEach**: Delete all test data before each test
- **afterAll**: Close database connections
- **Isolation**: Each test is independent
- **No Shared State**: Tests don't depend on execution order

### Expected Test Count

Integration test file should have approximately:
- 3 regularity calculation edge case tests
- 3 classification transition tests
- 4 span calculation edge case tests
- 1 UTC timezone handling test

**Total**: ~11 integration tests

### Performance Consideration

Integration tests are slower than unit tests:
- Unit tests: < 100ms each
- Integration tests: < 1s each
- Full suite: Should complete in < 30s

This is acceptable for integration test verification level.
