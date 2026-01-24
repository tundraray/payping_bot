# Task: Integration Tests

**Task ID**: task-15
**Phase**: Phase 4 - Integration & Testing
**Estimated Effort**: 3 hours
**Verification Level**: L2 (Test Operation)

## Overview

Implement integration tests verifying the complete payout session flow from transaction detection to event emission.

## Target Files

### Files to Create/Update
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\__tests__\payout-session.int.test.ts`

## Test Cases (from work plan Task 4.3)

1. AC-1.1/AC-1.2/AC-1.4/AC-6.1/AC-6.5: First TX emits both start and transaction events
2. AC-1.3/AC-6.1: Subsequent TXs update stats and emit only transaction event
3. AC-2.1/AC-2.2: Session ends with BALANCE_THRESHOLD
4. AC-2.3: Balance check failure logs error, session continues
5. AC-3.1/AC-3.2: Session ends with TIMEOUT
6. AC-3.3: Timeout without balance decrease continues session
7. AC-8.1/AC-8.2: Service restart initializes to IDLE
8. AC-6.3: Transaction event contains all required fields

## Acceptance Criteria

- [x] All 8 integration test cases pass
- [x] Tests pass: `pnpm test libs/blockchain/src/__tests__/payout-session.int.test.ts`

## References

- Work Plan: Task 4.3
- Test skeletons already exist in plan

## Completion Checklist

- [x] All 8 test bodies implemented
- [x] All tests pass
- [x] Test case resolution: 8/9 integration tests
