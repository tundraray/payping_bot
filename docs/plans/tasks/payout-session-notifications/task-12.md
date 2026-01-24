# Task: Unit Tests for PayoutListener

**Task ID**: task-12
**Phase**: Phase 3 - Notifications
**Estimated Effort**: 2 hours
**Verification Level**: L2 (Test Operation)

## Overview

Write unit tests for PayoutListener covering all three event handlers and localization logic.

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\listeners\__tests__\payout.listener.spec.ts`

## Dependencies

**Depends On**: Task 11 (PayoutListener implementation)

## Test Cases

1. onPayoutStart() sends notification to all subscribers
2. onPayoutTransaction() sends notification with TX details
3. onPayoutEnd() sends notification with summary
4. Failure for one subscriber doesn't block others (AC-4.3)
5. Russian subscriber receives Russian message (AC-7.1)
6. Ukrainian subscriber receives Ukrainian message (AC-7.2)
7. Unknown language falls back to English (AC-7.3)
8. Recipient address is truncated correctly
9. Amount is formatted correctly (raw units to USDT)

## Acceptance Criteria

- [x] All 9 test cases pass
- [x] Coverage >= 80% for PayoutListener
- [x] Tests pass: `pnpm test libs/telegram`

## References

- Work Plan: Task 3.3

## Completion Checklist

- [x] Test file created
- [x] All 9 test cases implemented
- [x] Mocks configured
- [x] All tests pass
- [x] Coverage >= 80%
