# Task 4.1: Integration Tests

**Status**: Completed
**Phase**: 4 - Testing & QA
**Depends On**: Phase 3 completion
**Blocks**: Task 4.2

## Overview

Write integration tests for analytics feature with real database covering position calculation, timestamp tie ordering, cache verification, and real-time classification.

## Target Files

- `libs/db/src/__tests__/analytics.int.test.ts` (create)

## Test Scenarios

1. Position calculation with real transactions in database
2. Timestamp tie ordering with actual data (AC-2.5)
3. Cache write-through verification
4. Month comparison with real monthly_positions data
5. Recipient wallet creation during calculation
6. Real-time classification update on transaction save
7. Salary change detection and history recording
8. Fired status detection batch job

## Acceptance Criteria

- [x] Integration tests cover position calculation flow
- [x] Timestamp tie test with real data passes
- [x] Cache persistence verified
- [x] Real-time processing integration verified
- [x] Classification logic integration verified
- [x] Salary change recording verified
- [x] Tests pass: `pnpm test libs/db/src/__tests__/analytics.int.test.ts` (skipped without DATABASE_URL)

**Verification**: L2 (tests pass)

## References

- Work Plan: Task 4.1
