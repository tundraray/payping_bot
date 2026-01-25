# Task 06: Add Regularity Calculation Tests

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 2 - Unit Tests Update
**Depends On**: Task 05
**Blocks**: Task 07

## Overview

Add comprehensive test cases for the calculateRegularity() method. These tests verify the core regularity calculation formula, ensuring correct month extraction, span calculation, and regularity percentage computation.

## Context

The calculateRegularity() method is the foundation of the new classification algorithm. It must correctly:
- Extract unique months from payment timestamps using UTC
- Calculate inclusive span from first to last payment
- Compute regularity as uniqueMonths / spanMonths
- Handle edge cases (same month, year boundaries, multiple payments same month)

These tests directly verify AC-3.2, AC-3.3, and AC-3.4 from the Design Doc.

## Target Files

### Files to Modify
- `libs/db/src/services/__tests__/classification.service.spec.ts`

## Implementation Details

### Step 1: Create calculateRegularity Test Suite

Add a new describe block for calculateRegularity tests:

```typescript
describe('calculateRegularity', () => {
  // Tests will be added in following steps
});
```

**Location**: Add this after the evaluateClassification test suite, before the closing describe of the file.

### Step 2: Add Test for 100% Regularity (Consecutive Months)

**AC Coverage**: AC-3.2 (regularity calculation formula)

```typescript
it('should calculate 100% regularity for consecutive months', () => {
  // Arrange
  const firstSeenAt = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
  const payments = [
    { timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() }, // Jan 2026
    { timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() }, // Feb 2026
    { timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() }, // Mar 2026
  ];
  const referenceTimestamp = new Date(Date.UTC(2026, 2, 15)).getTime(); // Mar 2026

  // Act
  const result = service['calculateRegularity'](payments, firstSeenAt, referenceTimestamp);

  // Assert
  expect(result.uniqueMonths).toBe(3);
  expect(result.spanMonths).toBe(3);
  expect(result.regularity).toBe(1.0); // 3/3 = 100%
});
```

**Note**: Use `service['calculateRegularity']` syntax to access private method in tests.

### Step 3: Add Test for 60% Regularity (Gaps Between Months)

**AC Coverage**: AC-3.2 (regularity calculation with gaps)

```typescript
it('should calculate 60% regularity for payments with gaps', () => {
  // Arrange
  const firstSeenAt = new Date(Date.UTC(2026, 0, 15)); // Jan 15, 2026
  const payments = [
    { timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() }, // Jan 2026
    { timestamp: new Date(Date.UTC(2026, 2, 15)).getTime() }, // Mar 2026
    { timestamp: new Date(Date.UTC(2026, 4, 15)).getTime() }, // May 2026
  ];
  const referenceTimestamp = new Date(Date.UTC(2026, 4, 15)).getTime(); // May 2026

  // Act
  const result = service['calculateRegularity'](payments, firstSeenAt, referenceTimestamp);

  // Assert
  expect(result.uniqueMonths).toBe(3);
  expect(result.spanMonths).toBe(5); // Jan to May = 5 months
  expect(result.regularity).toBeCloseTo(0.6, 2); // 3/5 = 60%
});
```

### Step 4: Add Test for Single Month Span

**AC Coverage**: AC-3.3 (span calculation for same month)

```typescript
it('should handle single month span correctly', () => {
  // Arrange
  const firstSeenAt = new Date(Date.UTC(2026, 0, 5)); // Jan 5, 2026
  const payments = [
    { timestamp: new Date(Date.UTC(2026, 0, 5)).getTime() },  // Jan 5, 2026
    { timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() }, // Jan 15, 2026
    { timestamp: new Date(Date.UTC(2026, 0, 25)).getTime() }, // Jan 25, 2026
  ];
  const referenceTimestamp = new Date(Date.UTC(2026, 0, 25)).getTime(); // Jan 25, 2026

  // Act
  const result = service['calculateRegularity'](payments, firstSeenAt, referenceTimestamp);

  // Assert
  expect(result.uniqueMonths).toBe(1); // All in same month
  expect(result.spanMonths).toBe(1);   // Inclusive span = 1, not 0
  expect(result.regularity).toBe(1.0); // 1/1 = 100%
});
```

### Step 5: Add Test for Multiple Payments Same Month

**AC Coverage**: AC-3.4 (unique month counting)

```typescript
it('should count multiple payments in same month as 1 unique month', () => {
  // Arrange
  const firstSeenAt = new Date(Date.UTC(2026, 0, 5)); // Jan 5, 2026
  const payments = [
    { timestamp: new Date(Date.UTC(2026, 0, 5)).getTime() },  // Jan 5, 2026
    { timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() }, // Jan 15, 2026
    { timestamp: new Date(Date.UTC(2026, 1, 10)).getTime() }, // Feb 10, 2026
    { timestamp: new Date(Date.UTC(2026, 1, 20)).getTime() }, // Feb 20, 2026
  ];
  const referenceTimestamp = new Date(Date.UTC(2026, 1, 20)).getTime(); // Feb 20, 2026

  // Act
  const result = service['calculateRegularity'](payments, firstSeenAt, referenceTimestamp);

  // Assert
  expect(result.uniqueMonths).toBe(2); // Jan and Feb
  expect(result.spanMonths).toBe(2);   // Jan to Feb
  expect(result.regularity).toBe(1.0); // 2/2 = 100%
});
```

### Step 6: Add Test for Year Boundary Handling

**AC Coverage**: AC-3.3 (span calculation across year boundary)

```typescript
it('should handle year boundary correctly in span calculation', () => {
  // Arrange
  const firstSeenAt = new Date(Date.UTC(2025, 11, 15)); // Dec 15, 2025
  const payments = [
    { timestamp: new Date(Date.UTC(2025, 11, 15)).getTime() }, // Dec 2025
    { timestamp: new Date(Date.UTC(2026, 0, 15)).getTime() },  // Jan 2026
    { timestamp: new Date(Date.UTC(2026, 1, 15)).getTime() },  // Feb 2026
  ];
  const referenceTimestamp = new Date(Date.UTC(2026, 1, 15)).getTime(); // Feb 2026

  // Act
  const result = service['calculateRegularity'](payments, firstSeenAt, referenceTimestamp);

  // Assert
  expect(result.uniqueMonths).toBe(3);
  expect(result.spanMonths).toBe(3); // Dec to Feb = 3 months across year boundary
  expect(result.regularity).toBe(1.0);
});
```

### Step 7: Run Tests

Run the test suite to verify all new tests pass:

```bash
pnpm test classification.service.spec.ts
```

**Expected**: All calculateRegularity tests pass.

### Step 8: Verify Coverage

Run coverage report:

```bash
pnpm test:cov -- --collectCoverageFrom='libs/db/src/services/classification.service.ts'
```

**Expected**: calculateRegularity method has 100% coverage.

## Acceptance Criteria

- [x] calculateRegularity test suite created
- [x] Test: 100% regularity for consecutive months (AC-3.2)
- [x] Test: 60% regularity for payments with gaps (AC-3.2)
- [x] Test: Single month span returns span = 1 (AC-3.3)
- [x] Test: Multiple payments same month count as 1 unique (AC-3.4)
- [x] Test: Year boundary handling (Dec → Jan) (AC-3.3)
- [x] All regularity calculation tests pass
- [x] calculateRegularity method has 100% test coverage
- [x] All tests pass: `pnpm test classification.service.spec.ts`

## Verification Level

**L2 (Test Operation Verification)**

Verification command:
```bash
pnpm test libs/db/src/services/__tests__/classification.service.spec.ts
```

Expected output: All tests pass, including new calculateRegularity tests.

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Test Cases for Regularity Calculation section)
- **Work Plan**: Task 2.2 in Phase 2
- **Acceptance Criteria**: AC-3.2, AC-3.3, AC-3.4

## Notes

### Accessing Private Methods in Tests

Since calculateRegularity is a private method, access it in tests using bracket notation:

```typescript
const result = service['calculateRegularity'](payments, firstSeenAt, referenceTimestamp);
```

TypeScript will allow this pattern for testing private methods.

### UTC Timestamp Creation

All test timestamps MUST use UTC to match the implementation:

```typescript
// Correct: UTC timestamp
new Date(Date.UTC(2026, 0, 15)).getTime()

// Incorrect: Local timezone (may vary by environment)
new Date(2026, 0, 15).getTime()
```

### Expected Test Results Summary

| Test Case | Unique Months | Span Months | Regularity |
|-----------|---------------|-------------|------------|
| Consecutive months (Jan-Mar) | 3 | 3 | 1.0 (100%) |
| Gaps (Jan, Mar, May) | 3 | 5 | 0.6 (60%) |
| Single month (3 payments in Jan) | 1 | 1 | 1.0 (100%) |
| Multiple same month (2 in Jan, 2 in Feb) | 2 | 2 | 1.0 (100%) |
| Year boundary (Dec-Feb) | 3 | 3 | 1.0 (100%) |

### Why These Tests Matter

1. **Consecutive months**: Verifies basic calculation for typical EMPLOYEE pattern
2. **Gaps**: Verifies typical FREELANCER pattern with irregular payments
3. **Single month**: Verifies edge case (span = 1, not 0) for new wallets
4. **Multiple same month**: Verifies Set deduplication works correctly
5. **Year boundary**: Verifies span calculation formula handles year wrap correctly

### Additional Test Ideas (Optional)

If time permits, consider adding:
- Test with 10+ month span to verify large spans
- Test with 0 payments (edge case, should handle gracefully)
- Test with exactly 70% regularity (7 months over 10-month span)
