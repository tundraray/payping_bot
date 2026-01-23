# Task 4.2: E2E Tests

**Status**: Completed
**Phase**: 4 - Testing & QA
**Depends On**: Task 4.1
**Blocks**: Task 4.3

## Overview

Write E2E tests for bot interaction with separate messages covering all locales and classification groups.

## Target Files

- `libs/telegram/src/__tests__/analytics.e2e.test.ts` (create)

## Test Scenarios

1. `/analytics` current month response with separate messages
2. `/analytics 2026-01` historical month response
3. `/rating` alias works
4. Navigation button clicks update all messages
5. Employees message format correct
6. Freelancers message format correct
7. One-time message format correct
8. Unknown message format correct
9. Fired message appears when applicable
10. Russian locale display
11. Ukrainian locale display

## Acceptance Criteria

- [x] E2E tests cover all command scenarios
- [x] Separate message format verified for each classification
- [x] Localization verified for all 3 languages
- [x] Fired notification tested
- [x] Tests pass (skipped by default - requires RUN_E2E_TESTS=true)

**Verification**: L1 (functional operation verified)

## References

- Work Plan: Task 4.2
