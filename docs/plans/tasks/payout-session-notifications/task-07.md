# Task: Add Transaction Event Emission

**Task ID**: task-07
**Phase**: Phase 2 - Core Logic
**Estimated Effort**: 1 hour
**Verification Level**: L3 (Build Success Verification)

## Overview

Emit `payout.transaction` event for each outgoing transaction during an active payout session. For the first transaction, both `payout.start` AND `payout.transaction` events are emitted.

## Target Files

### Files to Modify
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\services\payout-session.service.ts`

## Dependencies

**Depends On**: Task 05 (PayoutSessionService), Task 02 (PayoutTransactionEvent interface)

## Implementation Steps

### Step 1: Import PayoutTransactionEvent

```typescript
import {
  PAYOUT_TRANSACTION_EVENT,
  PayoutTransactionEvent,
} from '../events';
```

### Step 2: Implement emitTransactionEvent method

```typescript
/**
 * Emit payout.transaction event for an outgoing transaction.
 *
 * @param tx - Transaction to emit event for
 */
private emitTransactionEvent(tx: Transaction): void {
  const event: PayoutTransactionEvent = {
    transactionHash: tx.hash,
    amount: tx.amount,
    recipientAddress: tx.toAddress,
    timestamp: Date.now(),
    sessionTotalAmount: this.state.totalAmount,
    transactionNumber: this.state.transactionCount,
  };

  this.eventEmitter.emit(PAYOUT_TRANSACTION_EVENT, event);

  this.logger.debug('Transaction event emitted', {
    txHash: tx.hash,
    txNumber: this.state.transactionCount,
  });
}
```

### Step 3: Update handleOutgoingTransaction to call emitTransactionEvent

```typescript
async handleOutgoingTransaction(tx: Transaction): Promise<void> {
  await this.mutex.runExclusive(async () => {
    if (!this.state.isActive) {
      // First transaction - start session
      await this.startSession(tx);
      // Also emit transaction event for first TX (AC-6.5)
      this.emitTransactionEvent(tx);
    } else {
      // Subsequent transaction - update statistics
      this.updateSession(tx);
      // Emit transaction event
      this.emitTransactionEvent(tx);
    }
  });
}
```

### Step 4: Verify build

```bash
pnpm build
```

## Acceptance Criteria

- [x] **AC-6.1**: payout.transaction event emitted for each outgoing TX
- [x] **AC-6.3**: Event contains all required fields
- [x] **AC-6.5**: First TX emits both payout.start AND payout.transaction
- [x] transactionNumber is 1-based
- [x] sessionTotalAmount is running total AFTER this TX
- [x] Build succeeds

## Verification Steps

1. Build: `pnpm build`
2. Verify emitTransactionEvent called in both branches
3. Verify event payload matches interface

## Implementation Notes

### Transaction Number

- **1-based**: First transaction = 1, not 0
- Reflects `this.state.transactionCount` which is incremented in startSession/updateSession

### Session Total Amount

- **Running total AFTER this transaction**
- State is updated before calling emitTransactionEvent
- Shows cumulative amount paid out so far

### Event Emission Order

For first transaction:
1. `startSession()` emits `payout.start`
2. `emitTransactionEvent()` emits `payout.transaction`

For subsequent transactions:
1. `updateSession()` updates state
2. `emitTransactionEvent()` emits `payout.transaction`

## References

- Design Doc: Section "Data Flow - Payout Session Lifecycle"
- Work Plan: Task 2.3
- AC-6.1, AC-6.3, AC-6.5

## Completion Checklist

- [x] PayoutTransactionEvent imported
- [x] emitTransactionEvent() method implemented
- [x] handleOutgoingTransaction() updated to call emitTransactionEvent
- [x] First TX emits both events
- [x] Subsequent TXs emit transaction event only
- [x] Build succeeds
