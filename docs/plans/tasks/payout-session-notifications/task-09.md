# Task: Unit Tests for PayoutSessionService

**Task ID**: task-09
**Phase**: Phase 2 - Core Logic
**Estimated Effort**: 3 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Write comprehensive unit tests for PayoutSessionService covering state machine transitions, event emission, balance checking, and timeout logic.

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\services\__tests__\payout-session.service.spec.ts`

## Dependencies

**Depends On**: Tasks 05-08 (complete service implementation)

## Test Cases

1. **AC-1.1**: First outgoing TX transitions IDLE -> ACTIVE
2. **AC-1.2**: Start info recorded (timestamp, balance, hash)
3. **AC-1.3**: Subsequent TXs update statistics only
4. **AC-1.4**: payout.start event emitted with correct payload
5. **AC-2.2**: Session ends when balance < 1000 USDT
6. **AC-2.3**: Balance check failure logs error, session continues
7. **AC-3.1**: Session ends after 30 min + balance decreased
8. **AC-3.3**: Session does NOT end if balance not decreased
9. **AC-6.1**: payout.transaction event emitted for each TX
10. **AC-6.3**: Transaction event contains all required fields
11. **AC-6.5**: First TX emits both start AND transaction events
12. **AC-8.1**: New instance initializes to IDLE state

## Implementation

Mock dependencies: TronGridClient, EventEmitter2, ConfigService
Use jest.useFakeTimers() for timeout testing

## Acceptance Criteria

- [x] All 12 test cases implemented and passing
- [x] Coverage >= 80% for PayoutSessionService
- [x] Tests pass: `pnpm test libs/blockchain`

## References

- Work Plan: Task 2.5
- Testing Principles: AAA pattern

## Completion Checklist

- [x] Test file created with all 12 cases
- [x] Mocks configured
- [x] All tests pass
- [x] Coverage >= 80%
