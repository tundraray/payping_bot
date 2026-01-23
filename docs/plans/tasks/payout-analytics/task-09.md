# Task 2.4: Unit Tests for Classification and Salary Logic

**Status**: Not Started
**Phase**: 2 - Core Analytics Logic
**Depends On**: Task 2.3
**Blocks**: Phase 3

## Overview

Write comprehensive unit tests for ClassificationService, AnalyticsService, and RecipientWalletsService covering all classification logic, salary change detection, and position calculation.

## Target Files

- `libs/db/src/services/__tests__/recipient-wallets.service.spec.ts` (create)
- `libs/db/src/services/__tests__/classification.service.spec.ts` (create)
- `libs/db/src/services/__tests__/analytics.service.spec.ts` (create)

## Test Coverage Requirements

### RecipientWalletsService Tests
- findByAddress() returns wallet or null
- upsertMany() creates new and updates existing
- updateLastPayment() updates fields correctly
- markAsFired() sets firedAt timestamp
- incrementMonthsWithoutPayment() increments counter

### ClassificationService Tests
- evaluateClassification() with 1 payment < 500 returns UNKNOWN
- evaluateClassification() with 1 payment >= 500 returns ONE_TIME
- evaluateClassification() with regular amounts (≤20% variance) returns EMPLOYEE
- evaluateClassification() with varying amounts (>20% variance) returns FREELANCER
- evaluateClassification() with FIRED + new payment returns EMPLOYEE
- detectSalaryChange() returns null for <5% change
- detectSalaryChange() returns result for >=5% change
- checkEmploymentStatus() identifies wallets without recent payments

### AnalyticsService Tests
- processTransaction() creates new recipient wallet
- processTransaction() updates existing wallet classification
- processTransaction() detects and records salary change
- Position calculation with single transaction per recipient
- Position calculation with multiple transactions to same recipient (AC-2.4)
- Timestamp tie ordering by hash (AC-2.5)
- Position within classification group (AC-2.6)

## Acceptance Criteria

- [ ] Unit tests cover all service methods
- [ ] Classification logic tests cover all 4 types + transitions
- [ ] Salary change detection tests cover edge cases
- [ ] Fired detection tests cover batch job logic
- [ ] Timestamp tie test case implemented (AC-2.5)
- [ ] Tests pass: `pnpm test libs/db`
- [ ] Coverage >= 80% for new services

**Verification**: L2 (tests pass)

## References

- Work Plan: Task 2.4
- Testing Principles: AAA pattern, mock dependencies
- AC: All classification and salary ACs
