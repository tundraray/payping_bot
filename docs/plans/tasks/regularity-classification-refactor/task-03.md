# Task 03: Update evaluateClassification() Algorithm

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 1 - Core Implementation
**Depends On**: Task 02
**Blocks**: Task 04

## Overview

Refactor the evaluateClassification() method to use regularity-based logic instead of variance-based logic. This is the core algorithm change that determines wallet classification based on payment frequency and consistency.

## Context

The current algorithm uses variance to distinguish EMPLOYEE from FREELANCER:
- Calculate variance from payment amounts
- If variance <= 20%, classify as EMPLOYEE
- If variance > 20%, classify as FREELANCER

The new algorithm uses regularity:
- Calculate regularity (unique months / span months)
- If regularity >= 70% AND span >= 3 months AND 3+ payments, classify as EMPLOYEE
- If regularity < 70% AND span >= 3 months AND 3+ payments, classify as FREELANCER
- If span < 3 months OR < 3 payments, remain ONE_TIME

## Target Files

### Files to Modify
- `libs/db/src/services/classification.service.ts`

## Implementation Details

### Step 1: Locate evaluateClassification() Method

Find the evaluateClassification() method in ClassificationService. The current implementation should be around line 50-150.

### Step 2: Replace Variance Logic with Regularity Logic

**Changes to make**:

1. **Update minimum payments check**:
   - **Old**: Check for 2+ payments
   - **New**: Check for MIN_PAYMENTS_FOR_PATTERN (3+) payments

2. **Replace variance calculation with regularity calculation**:
   - **Remove**: Call to calculateVariance()
   - **Add**: Call to calculateRegularity()

3. **Update classification decision logic**:
   - **Remove**: Variance threshold comparison
   - **Add**: Regularity threshold comparison AND span check

4. **Update logging**:
   - **Remove**: Log variance percentage
   - **Add**: Log regularity percentage, unique months, span months

**Implementation pattern**:

```typescript
// After determining totalPayments and maxAmount...

// Check if we have enough data for pattern analysis
if (totalPayments < ClassificationService.MIN_PAYMENTS_FOR_PATTERN) {
  // Handle UNKNOWN -> ONE_TIME upgrade if amount threshold met
  if (wallet.classification === 'UNKNOWN' && amount >= ClassificationService.MIN_SIGNIFICANT_AMOUNT) {
    return { classification: 'ONE_TIME', changed: true, previousClassification: 'UNKNOWN' };
  }
  return { classification: wallet.classification, changed: false };
}

// Max amount must be >= 500 USDT for EMPLOYEE/FREELANCER
if (maxAmount < ClassificationService.MIN_SIGNIFICANT_AMOUNT) {
  return { classification: wallet.classification, changed: false };
}

// Calculate regularity
const { uniqueMonths, spanMonths, regularity } = this.calculateRegularity(
  allPayments,
  wallet.firstSeenAt,
  newPayment.timestamp,
);

// Span must be >= 3 months for EMPLOYEE/FREELANCER
if (spanMonths < ClassificationService.MIN_SPAN_MONTHS) {
  if (wallet.classification === 'UNKNOWN' && maxAmount >= ClassificationService.MIN_SIGNIFICANT_AMOUNT) {
    return { classification: 'ONE_TIME', changed: true, previousClassification: 'UNKNOWN' };
  }
  return { classification: wallet.classification, changed: false };
}

// Determine classification based on regularity
const newClassification = regularity >= ClassificationService.EMPLOYEE_REGULARITY_THRESHOLD
  ? 'EMPLOYEE'
  : 'FREELANCER';

// Log classification decision
this.logger.debug('Classification decision', {
  walletAddress,
  decision: newClassification,
  reason: `${spanMonths} months span, ${uniqueMonths} unique months, regularity ${(regularity * 100).toFixed(0)}% ${regularity >= ClassificationService.EMPLOYEE_REGULARITY_THRESHOLD ? '>=' : '<'} 70%`,
});

return {
  classification: newClassification,
  changed: newClassification !== wallet.classification,
  previousClassification: newClassification !== wallet.classification
    ? wallet.classification
    : undefined,
  regularity, // Include regularity in result for logging
};
```

### Step 3: Update Pattern Analysis Logging

Find the existing pattern analysis debug log (around the variance calculation). Update it to log regularity instead:

**Old log**:
```typescript
this.logger.debug('Pattern analysis', {
  walletAddress,
  paymentsCount: totalPayments,
  variance: varianceResult.variance,
  varianceThreshold: ClassificationService.EMPLOYEE_VARIANCE_THRESHOLD,
  currentClassification: wallet.classification,
});
```

**New log**:
```typescript
this.logger.debug('Pattern analysis', {
  walletAddress,
  paymentsCount: totalPayments,
  uniqueMonths,
  spanMonths,
  regularity,
  regularityThreshold: ClassificationService.EMPLOYEE_REGULARITY_THRESHOLD,
  currentClassification: wallet.classification,
});
```

### Step 4: Verify Build

Run the following command to ensure changes compile:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [x] MIN_PAYMENTS_FOR_PATTERN (3) used for pattern analysis threshold
- [x] calculateRegularity() called instead of calculateVariance()
- [x] Span check added: spanMonths >= MIN_SPAN_MONTHS
- [x] Classification decision based on regularity >= EMPLOYEE_REGULARITY_THRESHOLD
- [x] EMPLOYEE: regularity >= 70% AND span >= 3 months AND 3+ payments
- [x] FREELANCER: regularity < 70% AND span >= 3 months AND 3+ payments
- [x] ONE_TIME: span < 3 months OR < 3 payments
- [x] Pattern analysis log includes: uniqueMonths, spanMonths, regularity, regularityThreshold
- [x] Classification decision log includes regularity percentage
- [x] ClassificationResult includes regularity field
- [x] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification command:
```bash
pnpm build
```

Expected output: Build completes with no TypeScript errors.

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Algorithm Pseudocode section)
- **Work Plan**: Task 1.4 in Phase 1
- **Acceptance Criteria**: AC-3.1, AC-4.1 (EMPLOYEE/FREELANCER classification rules)

## Notes

### Classification Decision Matrix

| Payments | Span | Max Amount | Regularity | Classification |
|----------|------|------------|-----------|----------------|
| < 3 | any | < 500 | any | UNKNOWN |
| < 3 | any | >= 500 | any | ONE_TIME |
| >= 3 | < 3 | >= 500 | any | ONE_TIME |
| >= 3 | >= 3 | >= 500 | >= 70% | EMPLOYEE |
| >= 3 | >= 3 | >= 500 | < 70% | FREELANCER |

### State Transitions (Unchanged)

- UNKNOWN -> ONE_TIME: amount >= 500 USDT
- ONE_TIME -> EMPLOYEE/FREELANCER: 3+ payments AND span >= 3 months
- FREELANCER <-> EMPLOYEE: regularity crosses 70% threshold
- EMPLOYEE -> FIRED: 2+ months without payment (batch job, no change)
- FIRED -> EMPLOYEE: new payment (rehire, no change)

### Rehire Case (No Change)

The FIRED -> EMPLOYEE rehire case should remain unchanged. This logic typically appears at the beginning of evaluateClassification():

```typescript
// Handle rehire case (FIRED -> EMPLOYEE)
if (wallet.classification === 'FIRED') {
  return {
    classification: 'EMPLOYEE',
    changed: true,
    previousClassification: 'FIRED'
  };
}
```

This check should stay exactly as-is.

### What NOT to Change

- Rehire detection (FIRED -> EMPLOYEE)
- UNKNOWN -> ONE_TIME upgrade logic
- Salary change detection (separate concern)
- Method signature (inputs and output type remain the same)
- Error handling patterns

### Example Scenarios

**Scenario 1: New EMPLOYEE**
- Wallet has 5 payments over 5 consecutive months
- Regularity: 5/5 = 100% >= 70%
- Result: EMPLOYEE

**Scenario 2: FREELANCER**
- Wallet has 5 payments over 10 months (gaps)
- Regularity: 5/10 = 50% < 70%
- Result: FREELANCER

**Scenario 3: Still ONE_TIME**
- Wallet has 3 payments over 2 months
- Span < 3 months
- Result: ONE_TIME (regardless of regularity)

**Scenario 4: Boundary Case**
- Wallet has 7 payments over 10 months
- Regularity: 7/10 = 70% (exactly at threshold)
- Result: EMPLOYEE (>= 70% includes boundary)
