# Task 04: Remove Variance-Based Code

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.25 hours
**Phase**: 1 - Core Implementation
**Depends On**: Task 03
**Blocks**: Tasks 05-07 (Phase 2)

## Overview

Remove all variance-based code and constants from ClassificationService. This cleanup task eliminates the old algorithm implementation now that the regularity-based logic is in place.

## Context

After implementing the regularity-based algorithm (Tasks 01-03), the following variance-related code is no longer needed:
- EMPLOYEE_VARIANCE_THRESHOLD constant
- calculateVariance() method
- Any variance-related comments or documentation

This cleanup ensures the codebase only contains the active algorithm, reducing confusion for future maintainers.

## Target Files

### Files to Modify
- `libs/db/src/services/classification.service.ts`

## Implementation Details

### Step 1: Remove EMPLOYEE_VARIANCE_THRESHOLD Constant

Locate and delete the following constant:

```typescript
private static readonly EMPLOYEE_VARIANCE_THRESHOLD = 0.20; // DELETE THIS LINE
```

**Location**: This constant should be near MIN_SIGNIFICANT_AMOUNT (around line 20-30).

**Verification**: Search for "VARIANCE_THRESHOLD" in the file to ensure no references remain.

### Step 2: Remove calculateVariance() Method

Locate and delete the entire calculateVariance() method:

```typescript
/**
 * Calculate variance (coefficient of variation) for payment amounts.
 * ... (entire method comment)
 */
private calculateVariance(...) {
  // ... (entire method body)
}
// DELETE THE ENTIRE METHOD
```

**Location**: This method should be in the utility methods section (around line 200-250).

**Verification**: Search for "calculateVariance" in the file to ensure no references remain.

### Step 3: Update Class JSDoc Comment

Update the ClassificationService class-level JSDoc comment to reflect the regularity-based algorithm:

**Old comment** (find and replace):
```typescript
/**
 * ClassificationService handles wallet classification logic.
 *
 * Classification rules:
 * - EMPLOYEE: Regular payments with low variance (<= 20%)
 * - FREELANCER: Regular payments with high variance (> 20%)
 * ...
 */
```

**New comment**:
```typescript
/**
 * ClassificationService handles wallet classification logic.
 *
 * Classification rules:
 * - EMPLOYEE: Regular payments with high regularity (>= 70%) over 3+ months
 * - FREELANCER: Regular payments with low regularity (< 70%) over 3+ months
 * - ONE_TIME: 1-2 payments OR span < 3 months
 * - UNKNOWN: First payment < 500 USDT
 * - FIRED: Was EMPLOYEE AND 2+ months without payment
 */
```

**Location**: Top of the ClassificationService class definition (around line 10-20).

### Step 4: Search for Any Remaining Variance References

Run a file-wide search for variance-related terms to ensure complete removal:

**Search terms**:
- "variance"
- "VARIANCE"
- "coefficient of variation"
- "CV" (if used as abbreviation)

**Expected result**: Zero matches after cleanup.

### Step 5: Verify Build

Run the following command to ensure the file still compiles after deletions:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [x] EMPLOYEE_VARIANCE_THRESHOLD constant removed
- [x] calculateVariance() method completely removed
- [x] Class JSDoc comment updated to describe regularity-based algorithm
- [x] No references to "variance" remain in the file
- [x] No references to "coefficient of variation" remain in the file
- [x] File compiles without errors
- [x] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification commands:
```bash
# Verify no variance references remain
grep -i "variance" libs/db/src/services/classification.service.ts
# Expected: No matches

# Verify build succeeds
pnpm build
# Expected: Build completes with no errors
```

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Supersedes section)
- **Work Plan**: Task 1.5 in Phase 1
- **ADR**: docs/adr/003-payout-analytics-architecture.md (will need update to reflect new algorithm)

## Notes

### What to Remove

**Constants**:
- EMPLOYEE_VARIANCE_THRESHOLD = 0.20

**Methods**:
- calculateVariance() (entire method including JSDoc)

**Comments/Documentation**:
- Any class-level or method-level comments mentioning variance
- Any inline comments explaining variance calculation

### What NOT to Remove

**Keep these**:
- MIN_SIGNIFICANT_AMOUNT (still used)
- Any other constants added in Task 01
- calculateRegularity() method (new algorithm)
- Any regularity-related code

### Why Complete Removal is Important

1. **Reduces confusion**: Future developers won't wonder which algorithm is active
2. **Eliminates dead code**: Unused code accumulates technical debt
3. **Simplifies maintenance**: Only one algorithm to understand and maintain
4. **Git preserves history**: The old implementation is still accessible via git history if needed

### Future Reference

If the old variance-based algorithm needs to be referenced:
- Check git history before this task's commit
- Refer to ADR-0003 v1.0 (before this refactor)
- The Design Doc documents why variance was replaced

### Post-Cleanup File Structure

After this task, ClassificationService should contain:
- Constants: MIN_SIGNIFICANT_AMOUNT, EMPLOYEE_REGULARITY_THRESHOLD, MIN_SPAN_MONTHS, MIN_PAYMENTS_FOR_PATTERN
- Main method: evaluateClassification() (regularity-based)
- Helper method: calculateRegularity()
- Helper methods: checkEmploymentStatus(), detectSalaryChange() (unchanged)
- No variance-related code
