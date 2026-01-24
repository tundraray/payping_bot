# Task: Create PayoutListener

**Task ID**: task-11
**Phase**: Phase 3 - Notifications
**Estimated Effort**: 2 hours
**Verification Level**: L3 (Build Success)

## Overview

Implement PayoutListener to handle payout events and send notifications to all active subscribers with localized messages.

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\listeners\payout.listener.ts`

## Dependencies

**Depends On**: Task 02 (events), Task 10 (localization)

**Blocks**: Task 12 (unit tests)

## Implementation

### Class Structure

```typescript
@Injectable()
export class PayoutListener {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly telegramService: TelegramService,
  ) {}

  @OnEvent(PAYOUT_START_EVENT)
  async onPayoutStart(event: PayoutStartEvent): Promise<void> {
    // Get subscribers, format message, send to each
  }

  @OnEvent(PAYOUT_TRANSACTION_EVENT)
  async onPayoutTransaction(event: PayoutTransactionEvent): Promise<void> {
    // Format TX message, send to each subscriber
  }

  @OnEvent(PAYOUT_END_EVENT)
  async onPayoutEnd(event: PayoutEndEvent): Promise<void> {
    // Format summary message, send to each subscriber
  }
}
```

### Key Points

- Get active subscribers for each event
- Format amounts: raw units to USDT with 2 decimals
- Truncate recipient address: first 4 + "..." + last 4
- Individual failure handling: log and continue with others
- Localize based on subscriber.languageCode

## Acceptance Criteria

- [x] **AC-4.1, AC-5.1, AC-6.2**: Notifications sent for all 3 events
- [x] **AC-4.2, AC-5.3, AC-6.4**: Messages localized
- [x] **AC-4.3**: Individual failures don't block others
- [x] Build succeeds

## References

- Work Plan: Task 3.2
- Design Doc: PayoutListener section

## Completion Checklist

- [x] payout.listener.ts created
- [x] All 3 event handlers implemented
- [x] Format methods implemented
- [x] Error handling for individual failures
- [x] Build succeeds
