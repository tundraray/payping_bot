# Phase 1 Completion: Core Implementation

**Phase**: 1 - Core Implementation
**Status**: Not Started
**Estimated Time**: 1.5 hours (Tasks 01-04 combined)

## Overview

Phase 1 implements the foundation of the regularity-based classification algorithm by adding constants, implementing the regularity calculation method, updating the evaluation logic, and removing the old variance-based code.

## Phase Objectives

- Add new constants and RegularityResult interface
- Implement calculateRegularity() method with UTC-based month extraction
- Update evaluateClassification() to use regularity-based logic
- Remove all variance-based code and constants

## Completed Tasks

- [ ] Task 01: Add constants and RegularityResult interface
- [ ] Task 02: Implement calculateRegularity() method
- [ ] Task 03: Update evaluateClassification() algorithm
- [ ] Task 04: Remove variance-based code

## Deliverables

### Files Modified
- `libs/db/src/services/classification.service.ts`

### Implementation Components

**Constants Added**:
- EMPLOYEE_REGULARITY_THRESHOLD = 0.70
- MIN_SPAN_MONTHS = 3
- MIN_PAYMENTS_FOR_PATTERN = 3

**Interfaces Added**:
- RegularityResult { uniqueMonths, spanMonths, regularity }
- ClassificationResult.regularity? field

**Methods Added**:
- calculateRegularity(payments, firstSeenAt, referenceTimestamp)

**Methods Updated**:
- evaluateClassification() - now uses regularity logic

**Removed**:
- EMPLOYEE_VARIANCE_THRESHOLD constant
- calculateVariance() method
- Variance-related class documentation

## Phase Completion Criteria

### Functional Verification

- [ ] Constants defined correctly:
  - [ ] EMPLOYEE_REGULARITY_THRESHOLD = 0.70
  - [ ] MIN_SPAN_MONTHS = 3
  - [ ] MIN_PAYMENTS_FOR_PATTERN = 3

- [ ] RegularityResult interface complete:
  - [ ] uniqueMonths field
  - [ ] spanMonths field
  - [ ] regularity field

- [ ] calculateRegularity() implementation correct:
  - [ ] Uses getUTCFullYear() and getUTCMonth()
  - [ ] Month format: "YYYY-MM" with zero-padding
  - [ ] Span calculation: (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1
  - [ ] Returns RegularityResult with all fields
  - [ ] Handles division by zero (spanMonths = 0)

- [ ] evaluateClassification() updated correctly:
  - [ ] Uses MIN_PAYMENTS_FOR_PATTERN (3) instead of 2
  - [ ] Calls calculateRegularity() instead of calculateVariance()
  - [ ] Checks span >= MIN_SPAN_MONTHS
  - [ ] Classification based on regularity >= EMPLOYEE_REGULARITY_THRESHOLD
  - [ ] Logs regularity, uniqueMonths, spanMonths
  - [ ] Includes regularity in ClassificationResult

- [ ] Variance code removed:
  - [ ] EMPLOYEE_VARIANCE_THRESHOLD constant deleted
  - [ ] calculateVariance() method deleted
  - [ ] No "variance" references remain in file
  - [ ] Class JSDoc updated to describe regularity algorithm

### Build Verification

- [ ] TypeScript compilation succeeds: `pnpm build`
- [ ] No type errors in classification.service.ts
- [ ] No linting errors: `pnpm run lint`

## Operational Verification Procedures

### Step 1: Verify TypeScript Compiles

```bash
pnpm run build
```

**Expected**: Build completes with no errors.

### Step 2: Verify No Type Errors

```bash
# Check specific file
npx tsc --noEmit libs/db/src/services/classification.service.ts
```

**Expected**: No errors reported.

### Step 3: Manual Code Review

Review `libs/db/src/services/classification.service.ts`:

1. **Constants section** (around line 20-40):
   - [ ] EMPLOYEE_REGULARITY_THRESHOLD = 0.70 present
   - [ ] MIN_SPAN_MONTHS = 3 present
   - [ ] MIN_PAYMENTS_FOR_PATTERN = 3 present
   - [ ] EMPLOYEE_VARIANCE_THRESHOLD removed

2. **Interfaces** (around line 10-20):
   - [ ] RegularityResult interface defined
   - [ ] ClassificationResult has regularity? field

3. **calculateRegularity() method** (around line 200-250):
   - [ ] Uses getUTCFullYear(), getUTCMonth()
   - [ ] Returns RegularityResult
   - [ ] Span calculation formula matches pseudocode

4. **evaluateClassification() method** (around line 50-150):
   - [ ] Calls calculateRegularity()
   - [ ] Checks spanMonths >= MIN_SPAN_MONTHS
   - [ ] Uses EMPLOYEE_REGULARITY_THRESHOLD for classification
   - [ ] No calls to calculateVariance()

5. **Cleanup verification**:
   - [ ] Search for "variance": zero matches
   - [ ] Search for "VARIANCE": zero matches
   - [ ] calculateVariance method gone

### Step 4: Lint Check

```bash
pnpm run lint
```

**Expected**: No linting errors.

## Known Issues and Resolutions

| Issue | Resolution | Status |
|-------|------------|--------|
| None expected | - | N/A |

## Notes

### Critical Implementation Details

**UTC Timezone**:
- All month extraction MUST use UTC methods
- Format: "YYYY-MM" with zero-padded month
- Example: January 2026 = "2026-01"

**Span Calculation**:
- Inclusive calculation (includes both first and last months)
- Formula: (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1
- Same month span = 1, not 0

**Regularity Threshold**:
- EMPLOYEE: regularity >= 0.70 (includes 70.0% exactly)
- FREELANCER: regularity < 0.70

### What NOT to Change

Do not modify in this phase:
- Database schema
- AnalyticsService
- RecipientWalletsService
- Telegram handlers
- Test files (tests updated in Phase 2)

### Testing Status

Tests are expected to fail after this phase because they still use variance-based criteria. Phase 2 will update tests to match the new algorithm.

## Phase Sign-off

- [ ] All tasks completed (Tasks 01-04)
- [ ] All deliverables verified
- [ ] Build succeeds
- [ ] Code review complete
- [ ] Ready for Phase 2 (Unit Tests Update)

**Completed By**: _______________
**Date**: _______________
**Commit Hash**: _______________
