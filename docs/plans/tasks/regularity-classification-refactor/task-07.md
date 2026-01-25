# Task 07: Add Boundary and Edge Case Tests

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 2 - Unit Tests Update
**Depends On**: Task 06
**Blocks**: Task 08 (Phase 3)

## Overview

Add boundary and edge case tests for the classification algorithm. These tests verify behavior at critical thresholds and uncommon scenarios that could cause classification errors.

## Context

Boundary and edge case testing is essential for algorithm correctness:
- **Boundary tests**: Verify behavior at exact threshold values (70% regularity, 3 months span)
- **Edge case tests**: Verify behavior in uncommon scenarios (year boundaries, span requirements)

These tests ensure the algorithm handles all scenarios correctly, not just typical cases.

## Target Files

### Files to Modify
- `libs/db/src/services/__tests__/classification.service.spec.ts`

## Implementation Details

### Step 1: Create Boundary Tests Suite

Add a new describe block for boundary tests:

```typescript
describe('Classification Boundaries', () => {
  // Boundary tests will be added in following steps
});
```

**Location**: Add this within the evaluateClassification test suite.

### Step 2: Add Test for Exactly 70% Regularity (EMPLOYEE Boundary)

**AC Coverage**: AC-3.1 (>= 70% includes boundary)

```typescript
it('should classify as EMPLOYEE at exactly 70% regularity', () => {
  // Arrange: 7 unique months over 10-month span = 70%
  const mockWallet = {
    address: 'TTest123',
    classification: 'ONE_TIME',
    firstSeenAt: new Date(Date.UTC(2026, 0, 1)), // Jan 2026
    lastPaymentAt: new Date(Date.UTC(2026, 0, 1)),
    totalPayments: 1,
  };

  const payments = [
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan (1)
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb (2)
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() },  // Mar (3)
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 3, 15)).getTime() },  // Apr (4)
    // Skip May
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 5, 15)).getTime() },  // Jun (5)
    // Skip Jul
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 7, 15)).getTime() },  // Aug (6)
    // Skip Sep
  ];

  const newPayment = {
    amount: '1000',
    timestamp: new Date(Date.UTC(2026, 9, 15)).getTime() // Oct (7)
  };
  // Span: Jan to Oct = 10 months
  // Unique: 7 months (Jan, Feb, Mar, Apr, Jun, Aug, Oct)
  // Regularity: 7/10 = 70% exactly

  mockRecipientWalletsService.findByAddress.mockResolvedValue(mockWallet);

  // Act
  const result = await service.evaluateClassification(
    'TTest123',
    payments,
    newPayment,
  );

  // Assert
  expect(result.classification).toBe('EMPLOYEE'); // >= 70% includes boundary
  expect(result.regularity).toBeCloseTo(0.70, 2);
});
```

### Step 3: Add Test for Just Below 70% Regularity (FREELANCER)

**AC Coverage**: AC-4.1 (< 70% boundary)

```typescript
it('should classify as FREELANCER just below 70% regularity', () => {
  // Arrange: 6 unique months over 10-month span = 60%
  const mockWallet = {
    address: 'TTest456',
    classification: 'ONE_TIME',
    firstSeenAt: new Date(Date.UTC(2026, 0, 1)), // Jan 2026
    lastPaymentAt: new Date(Date.UTC(2026, 0, 1)),
    totalPayments: 1,
  };

  const payments = [
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan (1)
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() },  // Mar (2)
    // Skip Apr
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 4, 15)).getTime() },  // May (3)
    // Skip Jun
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 6, 15)).getTime() },  // Jul (4)
    // Skip Aug
  ];

  const newPayment = {
    amount: '1000',
    timestamp: new Date(Date.UTC(2026, 8, 15)).getTime() // Sep (5)
  };
  // Actually only 5 payments, need 6 for proper test
  // Let me revise:

  // Better test data:
  const paymentsRevised = [
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan (1)
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb (2)
    // Skip Mar
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 3, 15)).getTime() },  // Apr (3)
    // Skip May
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 5, 15)).getTime() },  // Jun (4)
    // Skip Jul
    { amount: '1000', timestamp: new Date(Date.UTC(2026, 7, 15)).getTime() },  // Aug (5)
  ];

  const newPaymentRevised = {
    amount: '1000',
    timestamp: new Date(Date.UTC(2026, 9, 15)).getTime() // Oct (6)
  };
  // Span: Jan to Oct = 10 months
  // Unique: 6 months (Jan, Feb, Apr, Jun, Aug, Oct)
  // Regularity: 6/10 = 60% < 70%

  mockRecipientWalletsService.findByAddress.mockResolvedValue(mockWallet);

  // Act
  const result = await service.evaluateClassification(
    'TTest456',
    paymentsRevised,
    newPaymentRevised,
  );

  // Assert
  expect(result.classification).toBe('FREELANCER'); // < 70%
  expect(result.regularity).toBeCloseTo(0.60, 2);
});
```

### Step 4: Add Test for Span < 3 Months Stays ONE_TIME

**AC Coverage**: AC-2.2 (span requirement)

```typescript
it('should stay ONE_TIME when span < 3 months regardless of regularity', () => {
  // Arrange: 2 payments in 2 consecutive months (100% regularity but span < 3)
  const mockWallet = {
    address: 'TTest789',
    classification: 'ONE_TIME',
    firstSeenAt: new Date(Date.UTC(2026, 0, 1)), // Jan 2026
    lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
    totalPayments: 1,
  };

  const payments = [
    { amount: '600', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan
  ];

  const newPayment = {
    amount: '600',
    timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() // Feb
  };
  // Span: Jan to Feb = 2 months (< 3)
  // Regularity: 2/2 = 100%
  // But span < 3 months, so should stay ONE_TIME

  mockRecipientWalletsService.findByAddress.mockResolvedValue(mockWallet);

  // Act
  const result = await service.evaluateClassification(
    'TTest789',
    payments,
    newPayment,
  );

  // Assert
  expect(result.classification).toBe('ONE_TIME'); // Span < 3 months
  expect(result.changed).toBe(false);
});
```

### Step 5: Add Test for 3+ Payments But Span < 3 Months

**AC Coverage**: AC-2.2 (span requirement with multiple payments)

```typescript
it('should stay ONE_TIME when 3+ payments but span < 3 months', () => {
  // Arrange: 3 payments in 2-month span
  const mockWallet = {
    address: 'TTest999',
    classification: 'ONE_TIME',
    firstSeenAt: new Date(Date.UTC(2026, 0, 1)), // Jan 2026
    lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
    totalPayments: 2,
  };

  const payments = [
    { amount: '600', timestamp: new Date(Date.UTC(2026, 0, 5)).getTime() },   // Jan 5
    { amount: '600', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan 15
  ];

  const newPayment = {
    amount: '600',
    timestamp: new Date(Date.UTC(2026, 1, 10)).getTime() // Feb 10
  };
  // 3 payments total
  // Span: Jan to Feb = 2 months (< 3)
  // Should stay ONE_TIME despite 3+ payments

  mockRecipientWalletsService.findByAddress.mockResolvedValue(mockWallet);

  // Act
  const result = await service.evaluateClassification(
    'TTest999',
    payments,
    newPayment,
  );

  // Assert
  expect(result.classification).toBe('ONE_TIME'); // Span < 3 months
  expect(result.changed).toBe(false);
});
```

### Step 6: Add Test for Year Boundary Span Calculation

**AC Coverage**: AC-3.3 (year boundary edge case)

```typescript
it('should handle year boundary correctly in classification', () => {
  // Arrange: Payments spanning Dec 2025 to Feb 2026 (3 months across year)
  const mockWallet = {
    address: 'TTestYear',
    classification: 'ONE_TIME',
    firstSeenAt: new Date(Date.UTC(2025, 11, 1)), // Dec 1, 2025
    lastPaymentAt: new Date(Date.UTC(2025, 11, 15)),
    totalPayments: 1,
  };

  const payments = [
    { amount: '700', timestamp: new Date(Date.UTC(2025, 11, 15)).getTime() }, // Dec 2025
    { amount: '700', timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan 2026
  ];

  const newPayment = {
    amount: '700',
    timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() // Feb 2026
  };
  // 3 payments
  // Span: Dec 2025 to Feb 2026 = 3 months
  // Regularity: 3/3 = 100%
  // Should classify as EMPLOYEE

  mockRecipientWalletsService.findByAddress.mockResolvedValue(mockWallet);

  // Act
  const result = await service.evaluateClassification(
    'TTestYear',
    payments,
    newPayment,
  );

  // Assert
  expect(result.classification).toBe('EMPLOYEE');
  expect(result.regularity).toBeCloseTo(1.0, 2);
});
```

### Step 7: Run Tests

Run the test suite to verify all boundary and edge case tests pass:

```bash
pnpm test classification.service.spec.ts
```

**Expected**: All new tests pass.

### Step 8: Verify Overall Test Coverage

Run coverage report:

```bash
pnpm test:cov -- --collectCoverageFrom='libs/db/src/services/classification.service.ts'
```

**Expected**: Coverage >= 80% for classification.service.ts.

## Acceptance Criteria

- [x] Boundary test suite created
- [x] Test: Exactly 70% regularity → EMPLOYEE (boundary included)
- [x] Test: Below 70% regularity (60%) → FREELANCER
- [x] Test: Span < 3 months → stays ONE_TIME (regardless of regularity)
- [x] Test: 3+ payments but span < 3 months → stays ONE_TIME
- [x] Test: Year boundary (Dec → Feb) span calculation correct
- [x] All boundary and edge case tests pass
- [x] Overall test coverage >= 80%
- [x] All tests pass: `pnpm test classification.service.spec.ts`

## Verification Level

**L2 (Test Operation Verification)**

Verification command:
```bash
pnpm test libs/db/src/services/__tests__/classification.service.spec.ts
```

Expected output: All tests pass, including boundary and edge case tests.

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Edge Case Tests section)
- **Work Plan**: Task 2.3 in Phase 2
- **Acceptance Criteria**: AC-2.2 (span requirement), AC-3.1 (70% boundary)

## Notes

### Why Boundary Testing is Critical

**70% Boundary**:
- EMPLOYEE: >= 70% (includes 70.0%)
- FREELANCER: < 70% (excludes 70.0%)
- Off-by-one errors are common with boundary conditions

**3-Month Span**:
- Ensures pattern has enough history
- Prevents premature EMPLOYEE classification
- Edge case: 3 payments in 2 months should stay ONE_TIME

**Year Boundary**:
- Common bug: incorrect month counting across year wrap
- Ensures span formula handles year changes correctly
- Example: Dec 2025 to Jan 2026 = 2 months, not 13 or 1

### Expected Test Results Summary

| Test Case | Payments | Span | Unique | Regularity | Classification |
|-----------|----------|------|--------|-----------|----------------|
| Exactly 70% | 7 | 10 | 7 | 70% | EMPLOYEE |
| Below 70% | 6 | 10 | 6 | 60% | FREELANCER |
| Span < 3, 2 payments | 2 | 2 | 2 | 100% | ONE_TIME |
| Span < 3, 3 payments | 3 | 2 | 2 | 100% | ONE_TIME |
| Year boundary | 3 | 3 | 3 | 100% | EMPLOYEE |

### Common Edge Case Bugs to Prevent

1. **Exclusive boundary**: Using > 70% instead of >= 70%
2. **Exclusive span**: Using > 3 instead of >= 3
3. **Zero-indexed months**: Forgetting to add +1 to getUTCMonth()
4. **Year wrap**: Incorrect span calculation across year boundary
5. **Multiple conditions**: Missing AND logic (3+ payments AND span >= 3)

### Test Maintenance

When updating these tests:
- Keep boundary values exact (70.0%, not 70.1%)
- Use clear comments showing calculation
- Maintain UTC timestamp creation
- Keep test names descriptive
