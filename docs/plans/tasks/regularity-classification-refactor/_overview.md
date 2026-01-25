# Overall Design Document: Regularity Classification Refactor

Generation Date: 2026-01-24
Target Plan Document: regularity-classification-refactor.md

## Project Overview

### Purpose and Goals

Refactor the wallet classification algorithm from variance-based (payment amount spread) to regularity-based (payment frequency and consistency across months). The current implementation incorrectly classifies wallets based on payment amount variance, while the business requirement is to classify based on payment regularity (monthly consistency).

### Background and Context

**Business Problem**: The current variance-based classification misclassifies employees who receive variable compensation (base salary + bonuses) as FREELANCER, when they should remain EMPLOYEE due to regular monthly payments.

**Key Change**: Replace the variance calculation (coefficient of variation) with regularity calculation (unique months / span months).

**Impact**: Existing wallets may be reclassified on their next payment, which is expected behavior as the classification now reflects actual payment regularity.

## Task Division Design

### Division Policy

**Horizontal Slice Approach**: Implement layer-by-layer due to foundation dependency requirements.

**Rationale**:
- Algorithm foundation must be complete before tests can be updated
- New constants and interfaces needed before calculateRegularity() can be implemented
- calculateRegularity() must exist before evaluateClassification() can be refactored
- All implementation must complete before tests can be updated to new criteria
- Cleanup (variance removal) happens after new logic is working

**Verifiability Level Distribution**:
- Phase 1 (Core Implementation): L3 (build succeeds)
- Phase 2 (Unit Tests): L2 (tests pass)
- Phase 3 (Integration Tests): L2 (integration tests pass)
- Phase 4 (Quality Assurance): L1 (E2E functional operation) + L2 (all tests pass) + L3 (all quality checks pass)

### Inter-task Relationship Map

```
Phase 1: Core Implementation
Task 01: Add constants and RegularityResult interface → Deliverable: classification.service.ts (modified)
  ↓ (constants needed by calculateRegularity)
Task 02: Implement calculateRegularity() method → Deliverable: classification.service.ts (modified)
  ↓ (calculateRegularity needed by evaluateClassification)
Task 03: Update evaluateClassification() algorithm → Deliverable: classification.service.ts (modified)
  ↓ (new logic working)
Task 04: Remove variance-based code → Deliverable: classification.service.ts (modified)
  ↓ (all implementation complete)

Phase 2: Unit Tests Update
Task 05: Update existing test cases → Deliverable: classification.service.spec.ts (modified)
  ↓ (parallel with new tests)
Task 06: Add regularity calculation tests → Deliverable: classification.service.spec.ts (modified)
  ↓ (parallel with boundary tests)
Task 07: Add boundary and edge case tests → Deliverable: classification.service.spec.ts (modified)
  ↓ (all unit tests complete)

Phase 3: Integration Tests
Task 08: Implement integration tests → Deliverable: classification-regularity.int.test.ts (created)
  ↓ (all tests ready for QA)

Phase 4: Quality Assurance
Phase4-completion.md: Final verification
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|-------------------|-------------------|
| EMPLOYEE_VARIANCE_THRESHOLD | EMPLOYEE_REGULARITY_THRESHOLD | Yes (replacement) | Task 01 |
| calculateVariance() | calculateRegularity() | Yes (replacement) | Tasks 02, 04 |
| ClassificationResult.variance? | ClassificationResult.regularity? | Yes (field rename) | Task 01 |
| evaluateClassification() logic | evaluateClassification() logic | Yes (algorithm change) | Task 03 |

**Critical Path**: Task 01 → Task 02 → Task 03 → Task 04 → Tasks 05-07 → Task 08 → Phase 4

### Common Processing Points

**Month Extraction Pattern**:
- Both calculateRegularity() and evaluateClassification() extract months from timestamps
- Use UTC-based extraction: getUTCFullYear(), getUTCMonth()
- Format: "YYYY-MM" string for Set storage
- **Design Policy**: Apply UTC extraction consistently in Tasks 02 and 03

**Span Calculation Pattern**:
- Formula: (lastYear - firstYear) * 12 + (lastMonth - firstMonth) + 1
- Inclusive calculation (includes both first and last months)
- Used in calculateRegularity() and evaluateClassification()
- **Design Policy**: Implement this formula consistently in Task 02

**Test Structure Pattern**:
- AAA pattern (Arrange-Act-Assert)
- Each AC generates at least one test case
- Reference AC IDs in test descriptions for traceability
- **Design Policy**: Apply consistently in Tasks 05, 06, 07, 08

## Implementation Considerations

### Principles to Maintain Throughout

1. **UTC Timezone Consistency**: All timestamp processing uses UTC methods to avoid timezone ambiguity
2. **Inclusive Span Calculation**: Span includes both first and last months (span of same month = 1)
3. **Deterministic Classification**: Same input always produces same output
4. **Fail-Fast Error Handling**: No silent fallbacks; errors propagate with context
5. **TDD Approach**: Tests verify new criteria, not implementation details

### Risks and Countermeasures

**Risk: Existing wallets reclassified unexpectedly**
- Impact: Medium (users may see classification changes)
- Countermeasure: Expected behavior; wallet will correct on next payment based on actual regularity
- No migration needed

**Risk: Edge cases in span calculation (year boundaries, same month)**
- Impact: Low (may cause incorrect classification)
- Countermeasure: Comprehensive unit and integration tests in Tasks 06, 07, 08
- Specific tests: Dec→Jan boundary, single month span

**Risk: Regularity calculation performance**
- Impact: Low (additional computation required)
- Countermeasure: Reuse existing data structures; no additional DB queries needed
- Performance test in Phase 4 (< 50ms requirement)

**Risk: Test updates reveal additional edge cases**
- Impact: Low (may extend timeline slightly)
- Countermeasure: Design Doc already defines comprehensive test cases
- All ACs mapped to test cases

### Impact Scope Management

**Allowed Change Scope**:
- libs/db/src/services/classification.service.ts (algorithm refactor)
- libs/db/src/services/__tests__/classification.service.spec.ts (test updates)
- libs/db/src/services/__tests__/classification-regularity.int.test.ts (new integration tests)

**No-Change Areas**:
- Database schema (recipient_wallets, monthly_positions, salary_history)
- AnalyticsService processing flow
- RecipientWalletsService CRUD operations
- Salary change detection logic (>5% threshold)
- FIRED detection batch job
- Telegram handlers (start, subscribe, analytics)
- Localization strings

**Boundary Clarification**:
- ClassificationService is the only changed component
- AnalyticsService calls evaluateClassification() with unchanged interface
- ClassificationResult interface adds optional regularity field (backward compatible)

## Design Decisions from ADR and Design Doc

### From ADR-0003 v2.0 (Superseded by this refactor)

**Original Decision**: Variance-based classification with 20% threshold
- **Why Superseded**: Variance doesn't reflect business reality (employees can have variable compensation)
- **New Decision**: Regularity-based classification with 70% threshold
- **Validation**: 70% threshold validated against historical payment data patterns

### From Design Doc v1.1

**Core Algorithm Change**: Regularity calculation
- **Formula**: regularity = unique_months / span_months
- **Threshold**: 70% for EMPLOYEE classification
- **Span Requirement**: >= 3 months for pattern analysis
- **Payment Count**: >= 3 payments for pattern analysis

**UTC Timezone Specification**:
- All timestamps processed in UTC
- Month extraction uses getUTCFullYear() and getUTCMonth()
- No timezone conversion performed
- Ensures consistent behavior across environments

**Boundary Handling**:
- Exactly 70% regularity → EMPLOYEE (>= 70% includes boundary)
- Below 70% → FREELANCER (< 70%)
- Span < 3 months → stays ONE_TIME regardless of regularity

## Task Size Analysis

| Phase | Task | Files Modified | Size | Rationale |
|-------|------|---------------|------|-----------|
| 1 | 01 | 1 | Small | Constants and interface additions |
| 1 | 02 | 1 | Small | New method implementation |
| 1 | 03 | 1 | Small | Algorithm logic update |
| 1 | 04 | 1 | Small | Code removal |
| 2 | 05 | 1 | Small | Existing test updates |
| 2 | 06 | 1 | Small | New test cases |
| 2 | 07 | 1 | Small | Edge case tests |
| 3 | 08 | 1 | Small | Integration tests |

**Granularity Assessment**: All tasks are 1 file each. Phase 1 tasks are sequential due to dependencies. Phase 2 tasks can be done together as one commit. Phase 3 is separate commit for integration tests.

**Expected Commits**:
- Commit 1: Tasks 01-04 (Phase 1 complete)
- Commit 2: Tasks 05-07 (Phase 2 complete)
- Commit 3: Task 08 (Phase 3 complete)
- Commit 4: Phase 4 verification (if fixes needed)

## Testing Strategy by Phase

**Phase 1 (Core Implementation)**: L3 verification
- Build succeeds after each task
- TypeScript compilation passes
- No runtime verification yet (tests will verify)

**Phase 2 (Unit Tests)**: L2 verification
- All AC test cases implemented (AC-1.1 through AC-7.1)
- calculateRegularity tests cover 100%, 60%, boundary cases
- Edge cases: year boundary, same month, multiple payments same month
- Coverage target: 80% minimum

**Phase 3 (Integration Tests)**: L2 verification
- Real database interactions
- Classification transitions verified
- UTC timezone handling verified
- Span calculation edge cases verified

**Phase 4 (Quality Assurance)**: L1 + L2 + L3 verification
- All unit tests pass
- All integration tests pass
- Performance benchmark (< 50ms)
- Full quality checks (lint, build, coverage)
- All ACs verified

## Common Pitfalls to Avoid

1. **Non-UTC Month Extraction**: Always use getUTCFullYear() and getUTCMonth(), not getFullYear() and getMonth()
2. **Exclusive Span Calculation**: Span MUST include both first and last months (span = 1 for same month)
3. **Boundary Condition Errors**: Exactly 70% regularity should classify as EMPLOYEE (>= 70%)
4. **Skipping Span Check**: Must verify span >= 3 months before EMPLOYEE/FREELANCER classification
5. **Test Implementation Details**: Tests should verify behavior (classifications), not internal calculations
6. **Incomplete Variance Removal**: Must remove EMPLOYEE_VARIANCE_THRESHOLD constant and calculateVariance() method
7. **Missing Regularity Field**: ClassificationResult should include optional regularity field for logging

## Deliverable Checklist

Phase 1:
- [x] EMPLOYEE_REGULARITY_THRESHOLD = 0.70 constant added
- [x] MIN_SPAN_MONTHS = 3 constant added
- [x] MIN_PAYMENTS_FOR_PATTERN = 3 constant added
- [x] RegularityResult interface defined
- [x] ClassificationResult.regularity? field added
- [x] calculateRegularity() method implemented
- [x] evaluateClassification() uses regularity logic
- [x] EMPLOYEE_VARIANCE_THRESHOLD constant removed
- [x] calculateVariance() method removed

Phase 2:
- [ ] AC-1.1 through AC-7.1 test cases implemented/updated
- [ ] calculateRegularity tests (100%, 60%, single month, same month)
- [ ] Boundary tests (exactly 70%, below 70%)
- [ ] Edge case tests (year boundary, span < 3 months)
- [ ] All unit tests pass
- [ ] Coverage >= 80%

Phase 3:
- [ ] Integration test file created
- [ ] Regularity calculation edge cases tested
- [ ] Classification transitions tested
- [ ] Span calculation edge cases tested
- [ ] UTC timezone handling tested
- [ ] All integration tests pass

Phase 4:
- [ ] All ACs verified (AC-1.1 through AC-7.1)
- [ ] Lint passes
- [ ] Build passes
- [ ] All tests pass
- [ ] Coverage >= 80%
- [ ] Performance < 50ms verified

## References

- Source Plan: docs/plans/regularity-classification-refactor.md
- Design Doc: docs/design/regularity-classification-refactor-design.md v1.1
- ADR: docs/adr/003-payout-analytics-architecture.md (supersedes variance criteria)
- Implementation: libs/db/src/services/classification.service.ts
