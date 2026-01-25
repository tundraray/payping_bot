# Task: Hook into TransactionProcessorService

**Task ID**: task-08
**Phase**: Phase 2 - Core Logic
**Estimated Effort**: 1 hour
**Verification Level**: L3 (Build Success)

## Overview

Integrate PayoutSessionService with TransactionProcessorService to detect outgoing transactions and trigger payout session handling.

## Target Files

- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\services\transaction-processor.service.ts`

## Dependencies

**Depends On**: Task 05 (PayoutSessionService must exist)

## Implementation

### Step 1: Inject PayoutSessionService

```typescript
constructor(
  // ... existing dependencies
  private readonly payoutSessionService: PayoutSessionService,
) {}
```

### Step 2: Add hook in processUSDTTransactions

```typescript
// After detecting outgoing transaction (fromAddress = monitored wallet)
if (tx.fromAddress === this.monitoredWallet) {
  // Outgoing transaction detected
  try {
    await this.payoutSessionService.handleOutgoingTransaction(tx);
  } catch (error) {
    this.logger.error('Payout session handling failed', {
      error,
      txHash: tx.hash
    });
    // Continue processing - don't block on payout session errors
  }
}
```

## Acceptance Criteria

- [x] PayoutSessionService injected
- [x] Outgoing transactions trigger handleOutgoingTransaction()
- [x] Error handling prevents blocking
- [x] Build succeeds

## References

- Work Plan: Task 2.4
- Design Doc: Integration Point 1

## Completion Checklist

- [x] Service injected in constructor
- [x] Hook added after outgoing TX detection
- [x] Error handling with try-catch
- [x] Build succeeds
