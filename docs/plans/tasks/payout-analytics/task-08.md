# Task 2.3: Update AnalyticsService for Real-time Processing

**Status**: Not Started
**Phase**: 2 - Core Analytics Logic
**Depends On**: Task 2.2
**Blocks**: Task 2.4

## Overview

Update AnalyticsService to process transactions in real-time when saved, calculate positions within classification groups, and provide grouped analytics retrieval. Add hook into TransactionsService to trigger processing on each transaction insert.

## Target Files

- `libs/db/src/services/analytics.service.ts` (create)
- `libs/db/src/services/transactions.service.ts` (update - add hook)
- `libs/db/src/db.module.ts` (register provider)
- `libs/db/src/index.ts` (export service)

## Key Implementation Points

### AnalyticsService Methods

```typescript
interface AnalyticsService {
  // Real-time processing (called on transaction save)
  processTransaction(transaction: Transaction): Promise<ProcessingResult>;

  // Analytics display (called by handler)
  getGroupedAnalytics(yearMonth: string): Promise<GroupedAnalyticsResult>;

  // Position calculation within classification group
  calculatePositionWithinGroup(yearMonth: string, classification: Classification): Promise<void>;
}
```

### TransactionsService Hook

Add to `saveTransaction()` method:

```typescript
async saveTransaction(tx: TransactionInput): Promise<Transaction> {
  const saved = await this.insert(tx);

  // Real-time analytics processing
  if (tx.fromAddress === MONITORED_WALLET) {
    await this.analyticsService.processTransaction(saved);
  }

  return saved;
}
```

### Position Calculation Algorithm

- Query transactions WHERE fromAddress = monitored wallet AND within yearMonth
- Group by classification, then by toAddress
- Order by MIN(timestamp) ASC, then transaction_hash ASC (determinism - AC-2.5)
- Use ROW_NUMBER for position within each classification group
- Upsert to monthly_positions table

## Acceptance Criteria

- [ ] processTransaction() called on each transaction save (AC-5.1)
- [ ] Real-time classification updates working (AC-5.2)
- [ ] Position calculation orders by timestamp, then hash (AC-2.5)
- [ ] Position is within classification group, not global (AC-2.6)
- [ ] Service registered and exported
- [ ] Build succeeds

**Verification**: L3 (build succeeds)

## References

- Design Doc: AnalyticsService section
- Work Plan: Task 2.3
- AC: AC-2.3, AC-2.4, AC-2.5, AC-5.1, AC-5.2, AC-5.3
