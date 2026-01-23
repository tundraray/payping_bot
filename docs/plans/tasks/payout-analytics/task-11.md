# Task 3.2: Create AnalyticsHandler with Separate Messages

**Status**: Completed
**Phase**: 3 - Telegram Integration
**Depends On**: Task 3.1
**Blocks**: Task 3.3

## Overview

Implement handler for /analytics and /rating commands with separate messages per classification group, inline keyboard navigation, and month parameter parsing.

## Target Files

- `libs/telegram/src/handlers/analytics.handler.ts` (create)
- `libs/telegram/src/handlers/analytics.handler.spec.ts` (create)
- `libs/telegram/src/telegram.module.ts` (register handler)

## Implementation Points

### Command Handling

```typescript
handleAnalytics(ctx: BotContext):
  1. Parse month parameter (/analytics 2026-01 or /analytics Jan)
  2. Validate month within 6-month range (AC-7.4)
  3. Call AnalyticsService.getGroupedAnalytics()
  4. Send separate messages per classification:
     a. Employees message
     b. Freelancers message
     c. One-time message
     d. Unknown message
     e. Fired message (if any)
  5. Include inline keyboard on last message

handleNavigation(ctx: BotContext):
  - Handle analytics:prev and analytics:next callbacks
  - Edit/delete existing messages
  - Send new messages for target month
  - Disable buttons at boundaries (AC-8.3, AC-8.4)
```

### Message Format

Each classification group gets own message with table format:
```
Employees (3) - January 2026
Position changes from December 2025

 #  | Wallet       | Prev | Change
----+--------------+------+--------
 1  | TXyz...abc   |  1   |   =
 2  | TAbc...def   |  3   |   ^
 3  | TQrs...ghi   | NEW  |  NEW

Total: 15,000.00 USDT
```

## Acceptance Criteria

- [x] /analytics sends separate messages per classification (AC-1.4, AC-10.1)
- [x] Empty groups skipped (AC-1.5)
- [x] /rating works as alias (AC-1.2)
- [x] Table format matches design (AC-2.1)
- [x] Wallet truncation first 4 + last 3 (AC-2.2)
- [x] Month parameter parsing works (AC-7.1, AC-7.2)
- [x] 6-month range validated (AC-7.4)
- [x] Inline keyboard navigation (AC-8.1, AC-8.2, AC-8.3, AC-8.4)
- [x] Position within classification group (AC-2.6)
- [x] Unit tests pass
- [x] Build succeeds

**Verification**: L2 (tests pass)

## References

- Work Plan: Task 3.2
- Design Doc: AnalyticsHandler section, Message formats
- AC: AC-1.x, AC-2.x, AC-7.x, AC-8.x, AC-10.1, AC-10.6
