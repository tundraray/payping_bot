# Task 01: Add Constants and RegularityResult Interface

**Status**: Completed
**Assignee**: TBD
**Estimated Effort**: 0.25 hours
**Phase**: 1 - Core Implementation
**Depends On**: None
**Blocks**: Task 02

## Overview

Add new constants for regularity-based classification and define the RegularityResult interface. This task establishes the foundation for the regularity calculation algorithm by defining the threshold values and return type structure.

## Context

The variance-based classification used a single threshold (EMPLOYEE_VARIANCE_THRESHOLD = 0.20). The regularity-based approach requires three new constants:
- **EMPLOYEE_REGULARITY_THRESHOLD**: Minimum regularity (70%) for EMPLOYEE classification
- **MIN_SPAN_MONTHS**: Minimum time span (3 months) required for pattern analysis
- **MIN_PAYMENTS_FOR_PATTERN**: Minimum payment count (3) required for pattern analysis

Additionally, we need a new interface to return regularity calculation results with unique months, span months, and the calculated regularity percentage.

## Target Files

### Files to Modify
- `libs/db/src/services/classification.service.ts`

## Implementation Details

### Step 1: Add New Constants

Add the following private static readonly constants to the ClassificationService class:

```typescript
// Minimum regularity for EMPLOYEE classification (70%)
private static readonly EMPLOYEE_REGULARITY_THRESHOLD = 0.70;

// Minimum span in months for EMPLOYEE/FREELANCER classification
private static readonly MIN_SPAN_MONTHS = 3;

// Minimum payment count for pattern analysis
private static readonly MIN_PAYMENTS_FOR_PATTERN = 3;
```

**Location**: Add these constants near the existing MIN_SIGNIFICANT_AMOUNT constant (around line 20-30).

**Design Rationale**:
- 70% threshold validated against historical payment data patterns
- 3-month span ensures sufficient data for pattern recognition
- 3 payment minimum prevents premature classification

### Step 2: Define RegularityResult Interface

Add the following interface definition near the top of the file (after imports, before the ClassificationService class):

```typescript
export interface RegularityResult {
  uniqueMonths: number;   // Count of distinct months with payments
  spanMonths: number;      // Total span from first to last payment in months
  regularity: number;      // Regularity percentage (0.0 to 1.0)
}
```

**Design Rationale**:
- Exported for potential reuse in tests or other services
- All fields are numbers for easy calculation and comparison
- Regularity is 0.0 to 1.0 for consistency with threshold comparison

### Step 3: Update ClassificationResult Interface

Add an optional regularity field to the existing ClassificationResult interface:

```typescript
export interface ClassificationResult {
  classification: Classification;
  changed: boolean;
  previousClassification?: Classification;
  salaryChange?: SalaryChangeResult;
  regularity?: number; // NEW: Include regularity for logging
}
```

**Location**: This interface should already exist in the file. Add the regularity field as the last optional field.

**Design Rationale**:
- Optional field maintains backward compatibility
- Used for logging regularity percentage in debug messages
- Replaces the variance field that will be removed in Task 04

### Step 4: Verify Build

Run the following command to ensure changes compile without errors:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [x] EMPLOYEE_REGULARITY_THRESHOLD constant added with value 0.70
- [x] MIN_SPAN_MONTHS constant added with value 3
- [x] MIN_PAYMENTS_FOR_PATTERN constant added with value 3
- [x] RegularityResult interface defined with three fields:
  - [x] uniqueMonths: number
  - [x] spanMonths: number
  - [x] regularity: number
- [x] ClassificationResult interface updated with regularity? field
- [x] All constants are private static readonly
- [x] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification command:
```bash
pnpm build
```

Expected output: Build completes with no TypeScript errors.

## Related References

- **Design Doc**: docs/design/regularity-classification-refactor-design.md (Contract Definitions section)
- **Work Plan**: Task 1.1 in Phase 1
- **Acceptance Criteria**: AC-3.2, AC-3.3, AC-3.4 (regularity calculation foundation)

## Notes

- Do not remove variance-related constants yet (that happens in Task 04)
- The regularity field in ClassificationResult is optional to maintain backward compatibility
- These constants will be used by calculateRegularity() (Task 02) and evaluateClassification() (Task 03)
- Values are based on Design Doc specifications and validated against historical data
