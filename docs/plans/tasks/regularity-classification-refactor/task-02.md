# Task 02: Implement calculateRegularity() Method

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 1 - Core Implementation
**Depends On**: Task 01
**Blocks**: Task 03

## Overview

Implement the calculateRegularity() private method that calculates payment regularity based on unique months with payments across a time span. This is the core algorithm change that replaces the variance-based calculation.

## Context

The regularity calculation determines what percentage of months in a time span received payments. For example:
- Payments in Jan, Feb, Mar over a 3-month span = 100% regularity (3/3)
- Payments in Jan, Mar, May over a 5-month span = 60% regularity (3/5)
- Payments in 7 unique months over a 10-month span = 70% regularity (7/10)

The calculation must:
- Extract unique months from payment timestamps using UTC
- Calculate inclusive span from first_seen_at to reference timestamp
- Return regularity as a ratio (0.0 to 1.0)

## Target Files

### Files to Modify
- `libs/db/src/services/classification.service.ts`

## Implementation Details

### Step 1: Implement calculateRegularity() Method

Add the following private method to ClassificationService:

```typescript
/**
 * Calculate payment regularity based on unique months with payments.
 *
 * Regularity = unique_months / span_months
 * - 100% regularity: payments every month
 * - 70% regularity: payments in 7 out of 10 months
 * - Lower regularity: larger gaps between payments
 *
 * @param payments - All payments to analyze (including new payment)
 * @param firstSeenAt - First payment timestamp for this wallet
 * @param referenceTimestamp - Latest payment timestamp (usually new payment)
 * @returns RegularityResult with unique months, span, and regularity ratio
 */
private calculateRegularity(
  payments: Array<{ timestamp: number }>,
  firstSeenAt: Date,
  referenceTimestamp: number,
): RegularityResult {
  // Extract unique months from all payments using UTC
  const uniqueMonthsSet = new Set(
    payments.map((p) => {
      const date = new Date(p.timestamp);
      const year = date.getUTCFullYear();
      const month = date.getUTCMonth() + 1; // 0-indexed, convert to 1-12
      return `${year}-${String(month).padStart(2, '0')}`;
    }),
  );

  // Calculate span from first_seen_at to reference timestamp (inclusive)
  const firstDate = new Date(firstSeenAt);
  const lastDate = new Date(referenceTimestamp);

  const spanMonths =
    (lastDate.getUTCFullYear() - firstDate.getUTCFullYear()) * 12 +
    (lastDate.getUTCMonth() - firstDate.getUTCMonth()) +
    1; // +1 for inclusive span

  const uniqueMonths = uniqueMonthsSet.size;
  const regularity = spanMonths > 0 ? uniqueMonths / spanMonths : 0;

  return { uniqueMonths, spanMonths, regularity };
}
```

**Location**: Add this method after the existing utility methods in ClassificationService, around line 200-250 (after checkEmploymentStatus or similar methods).

**Design Rationale**:
- **UTC timestamps**: Ensures consistent month extraction across all timezones
- **String format "YYYY-MM"**: Unambiguous month identification, works with Set deduplication
- **Inclusive span**: +1 ensures single-month span = 1, not 0
- **Division by zero protection**: Returns 0 regularity if span is 0 (should never happen)
- **Separation of concerns**: Pure calculation method, no side effects

### Step 2: Verify Implementation Matches Pseudocode

Compare your implementation to the Design Doc pseudocode (section "Algorithm Pseudocode"):

**Critical checks**:
- [ ] Uses getUTCFullYear() and getUTCMonth() (not getFullYear/getMonth)
- [ ] Month string format is "YYYY-MM" with zero-padded month
- [ ] Span calculation is: (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1
- [ ] Returns RegularityResult with all three fields
- [ ] Regularity calculation handles spanMonths = 0 edge case

### Step 3: Verify Build

Run the following command to ensure the new method compiles:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [x] calculateRegularity() method implemented as private method
- [x] Method signature matches: (payments, firstSeenAt, referenceTimestamp) => RegularityResult
- [x] UTC-based month extraction: getUTCFullYear(), getUTCMonth()
- [x] Month format: "YYYY-MM" with zero-padded month (01-12)
- [x] Unique months calculation: Set.size of month strings
- [x] Span calculation: (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1
- [x] Inclusive span: Single month span returns 1, not 0
- [x] Regularity calculation: uniqueMonths / spanMonths
- [x] Division by zero protection: Returns 0 if spanMonths = 0
- [x] Returns RegularityResult with uniqueMonths, spanMonths, regularity
- [x] JSDoc comment included explaining the algorithm
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
- **Work Plan**: Task 1.3 in Phase 1
- **Acceptance Criteria**: AC-3.2, AC-3.3, AC-3.4 (regularity calculation formula)

## Notes

### UTC Timezone Handling

All timestamp processing MUST use UTC methods:
- **Correct**: date.getUTCFullYear(), date.getUTCMonth()
- **Incorrect**: date.getFullYear(), date.getMonth()

This ensures consistent behavior across different server timezones and daylight saving time transitions.

### Span Calculation Edge Cases

- **Same month**: firstSeenAt and referenceTimestamp in same month → span = 1
- **Consecutive months**: Jan to Feb → span = 2
- **Year boundary**: Dec 2025 to Jan 2026 → span = 2 (formula handles year wrap)

### Example Calculations

**Example 1: Consecutive months**
- Payments: 2026-01, 2026-02, 2026-03
- Span: (2026-2026)*12 + (2-0) + 1 = 3 months
- Unique: 3
- Regularity: 3/3 = 1.0 (100%)

**Example 2: Every other month**
- Payments: 2026-01, 2026-03, 2026-05
- Span: (2026-2026)*12 + (4-0) + 1 = 5 months
- Unique: 3
- Regularity: 3/5 = 0.6 (60%)

**Example 3: Year boundary**
- Payments: 2025-12, 2026-01, 2026-02
- Span: (2026-2025)*12 + (1-11) + 1 = 3 months
- Unique: 3
- Regularity: 3/3 = 1.0 (100%)

### Multiple Payments Same Month

If multiple payments occur in the same month, they count as 1 unique month:
- Payments: 2026-01-05, 2026-01-15, 2026-02-01
- Unique months: ["2026-01", "2026-02"] = 2
- Span: 2 months
- Regularity: 2/2 = 1.0 (100%)
