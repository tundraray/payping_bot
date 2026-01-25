# Task: E2E Tests

**Task ID**: task-16
**Phase**: Phase 4 - Integration & Testing
**Estimated Effort**: 3 hours
**Verification Level**: L1 (Functional Operation)

## Overview

Implement E2E tests verifying complete user journeys with notifications.

## Target Files

### Files to Create/Update
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\__tests__\payout-session.e2e.test.ts`

## Test Cases (from work plan Task 4.4)

1. Complete session lifecycle: start, 3 transactions, end
2. Multi-transaction session: running totals across 5 transactions
3. Localized notifications: ru, uk, fallback to en
4. Notification failure resilience: first subscriber fails, others succeed
5. Timeout scenario: 30-minute timeout ends session

## Acceptance Criteria

- [x] All 5 E2E test cases pass
- [x] Feature works end-to-end
- [x] Tests pass: `pnpm test libs/blockchain/src/__tests__/payout-session.e2e.test.ts`

## References

- Work Plan: Task 4.4

## Completion Checklist

- [x] All 5 E2E test bodies implemented
- [x] All tests pass
- [x] Test case resolution: 5/5 E2E tests
