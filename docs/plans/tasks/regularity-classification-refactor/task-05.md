# Task 05: Update Existing Test Cases

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 2 - Unit Tests Update
**Depends On**: Task 04
**Blocks**: Task 06

## Overview

Update existing test cases in classification.service.spec.ts to reflect the new regularity-based classification criteria. This includes updating test descriptions, test data, and assertions to match the new algorithm.

## Context

The existing test suite was written for variance-based classification. The tests need to be updated to:
- Use regularity-based criteria instead of variance
- Ensure 3+ payments and 3+ month span for EMPLOYEE/FREELANCER tests
- Remove calculateVariance test suite
- Update test descriptions to reference regularity

The goal is to maintain the same Acceptance Criteria coverage (AC-1.1 through AC-7.1) but with updated test data that reflects regularity patterns.

## Target Files

### Files to Modify
- `libs/db/src/services/__tests__/classification.service.spec.ts`

## Implementation Details

### Step 1: Remove calculateVariance Test Suite

Locate and delete the entire test suite for calculateVariance:

```typescript
describe('calculateVariance', () => {
  // ... DELETE THE ENTIRE DESCRIBE BLOCK
});
```

**Verification**: Search for "calculateVariance" in the test file to ensure no references remain.

### Step 2: Update AC-1.1 Test (UNKNOWN Classification)

**Test**: "should classify new wallet as UNKNOWN when first payment < 500 USDT"

**No changes needed** - This test should already be correct as UNKNOWN logic is unchanged.

**Verification**: Ensure test passes after algorithm change.

### Step 3: Update AC-2.x Tests (ONE_TIME Classification)

**AC-2.1**: "should classify as ONE_TIME when wallet has 1-2 payments"
- **Change**: No test data changes needed (still 1-2 payments)
- **Verification**: Test should pass as-is

**AC-2.2**: "should classify as ONE_TIME when span < 3 months"
- **Old description**: "should classify as ONE_TIME when span < 2 months"
- **New description**: "should classify as ONE_TIME when span < 3 months"
- **Test data change**: Update test to use 2-month span (was 1-month span)
- **Expected**: Should now stay ONE_TIME with 2-month span

**AC-2.3**: "should upgrade UNKNOWN to ONE_TIME when payment >= 500 USDT"
- **Change**: No test data changes needed
- **Verification**: Test should pass as-is

### Step 4: Update AC-3.x Tests (EMPLOYEE Classification)

**AC-3.1**: "should classify as EMPLOYEE when regularity >= 70%"
- **Old description**: "should classify as EMPLOYEE when variance <= 20%"
- **New description**: "should classify as EMPLOYEE when 3+ payments AND span >= 3 months AND regularity >= 70%"
- **Test data change**: Create payments in 3+ unique months over 3+ month span with >= 70% regularity
- **Example**: 3 payments in Jan, Feb, Mar (3/3 = 100% regularity)

**AC-3.2, AC-3.3, AC-3.4**: Regularity calculation tests (will be added in Task 06)

### Step 5: Update AC-4.x Tests (FREELANCER Classification)

**AC-4.1**: "should classify as FREELANCER when regularity < 70%"
- **Old description**: "should classify as FREELANCER when variance > 20%"
- **New description**: "should classify as FREELANCER when 3+ payments AND span >= 3 months AND regularity < 70%"
- **Test data change**: Create payments with gaps to achieve < 70% regularity
- **Example**: 3 payments in Jan, Mar, May over 5-month span (3/5 = 60% regularity)

### Step 6: Update AC-5.1 Test (FIRED Classification)

**Test**: "should maintain FIRED classification logic"

**No changes needed** - FIRED detection is handled by batch job and is unchanged.

**Verification**: Ensure test passes after algorithm change.

### Step 7: Update AC-6.x Tests (Classification Transitions)

**AC-6.1**: "should transition FREELANCER -> EMPLOYEE when regularity increases to >= 70%"
- **Old description**: "should transition FREELANCER -> EMPLOYEE when variance decreases"
- **New description**: Use regularity-based description
- **Test data change**: Start with < 70% regularity, then add payments to reach >= 70%
- **Example**: Start with 3/5 months (60%), add 2 more consecutive payments to reach 5/5 (100%)

**AC-6.2**: "should transition EMPLOYEE -> FREELANCER when regularity drops < 70%"
- **Old description**: "should transition EMPLOYEE -> FREELANCER when variance increases"
- **New description**: Use regularity-based description
- **Note**: This is an edge case (span increases without payment, regularity drops)
- **Test data change**: May need to simulate time passing without payment

### Step 8: Update AC-7.1 Test (Rehire Detection)

**Test**: "should transition FIRED -> EMPLOYEE on new payment"

**No changes needed** - Rehire logic is unchanged.

**Verification**: Ensure test passes after algorithm change.

### Step 9: Run Tests and Fix Failures

Run the test suite:

```bash
pnpm test classification.service.spec.ts
```

**Expected**: Some tests will fail due to algorithm change. Update test data to match new criteria.

**Common fixes needed**:
- Change payment amounts to payment month patterns
- Ensure 3+ payments for EMPLOYEE/FREELANCER tests
- Ensure 3+ month span for EMPLOYEE/FREELANCER tests
- Adjust expected regularity percentages

### Step 10: Verify Test Coverage

Run coverage report:

```bash
pnpm test:cov -- --collectCoverageFrom='libs/db/src/services/classification.service.ts'
```

**Expected**: Coverage >= 80% (should maintain or improve from before).

## Acceptance Criteria

- [x] calculateVariance test suite removed (replaced with calculateRegularity tests)
- [x] AC-1.1 test (UNKNOWN) updated and passing
- [x] AC-2.1 test (ONE_TIME 1-2 payments) updated and passing
- [x] AC-2.2 test (ONE_TIME span < 3 months) updated and passing
- [x] AC-2.3 test (UNKNOWN upgrade) updated and passing
- [x] AC-3.1 test (EMPLOYEE regularity >= 70%) updated and passing
- [x] AC-4.1 test (FREELANCER regularity < 70%) updated and passing
- [x] AC-5.1 test (FIRED) verified passing
- [x] AC-6.1 test (FREELANCER -> EMPLOYEE) updated and passing
- [x] AC-6.2 test (EMPLOYEE -> FREELANCER) updated and passing
- [x] AC-7.1 test (Rehire) verified passing
- [x] All test descriptions reference regularity, not variance
- [x] All tests pass: `pnpm test classification.service.spec.ts`
- [x] Coverage >= 80% (achieved 85.56% statements, 85.26% lines)

## Verification Level

**L2 (Test Operation Verification)**

Verification command:
```bash
pnpm test libs/db/src/services/__tests__/classification.service.spec.ts
```

Expected output: All tests pass.

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Test Strategy section)
- **Work Plan**: Task 2.1 in Phase 2
- **Acceptance Criteria**: AC-1.1 through AC-7.1

## Notes

### Test Data Patterns for Regularity

**100% regularity (EMPLOYEE)**:
- 3 consecutive months: Jan, Feb, Mar → 3/3 = 100%
- 5 consecutive months: Jan, Feb, Mar, Apr, May → 5/5 = 100%

**70% regularity (EMPLOYEE boundary)**:
- 7 months over 10-month span: Jan, Feb, Mar, Apr, Jun, Aug, Oct → 7/10 = 70%

**60% regularity (FREELANCER)**:
- 3 months over 5-month span: Jan, Mar, May → 3/5 = 60%

**50% regularity (FREELANCER)**:
- 5 months over 10-month span: Jan, Mar, May, Jul, Sep → 5/10 = 50%

### Timestamp Creation Helper

You may want to create a helper function for generating test timestamps:

```typescript
// Helper to create timestamp for specific month
function monthTimestamp(year: number, month: number, day = 15): number {
  return new Date(Date.UTC(year, month - 1, day)).getTime();
}

// Usage:
const payments = [
  { amount: '1000', timestamp: monthTimestamp(2026, 1) }, // Jan 2026
  { amount: '1000', timestamp: monthTimestamp(2026, 2) }, // Feb 2026
  { amount: '1000', timestamp: monthTimestamp(2026, 3) }, // Mar 2026
];
```

### What NOT to Change

- Test structure (AAA pattern)
- Mock setup patterns
- Assertion patterns
- Test file organization
- Helper functions (unless variance-specific)

### Expected Test Count

After this task, the test suite should have approximately:
- 1 test for AC-1.1 (UNKNOWN)
- 3 tests for AC-2.x (ONE_TIME)
- 1 test for AC-3.1 (EMPLOYEE) - more added in Task 06
- 1 test for AC-4.1 (FREELANCER)
- 1 test for AC-5.1 (FIRED)
- 2 tests for AC-6.x (Transitions)
- 1 test for AC-7.1 (Rehire)

**Total**: ~10 tests from existing suite, more will be added in Tasks 06-07.
