# Task 1.3: Add fromAddress Index to Transactions

**Status**: Not Started
**Assignee**: TBD
**Estimated Effort**: 0.25 hours
**Phase**: 1 - Database Schema Foundation
**Depends On**: Task 1.2
**Blocks**: Task 1.5

## Overview

Add database index on `transactions.from_address` column to optimize payout queries. The analytics feature requires efficient filtering of outgoing transactions from the monitored wallet, and this index is critical for performance.

## Context

Position calculation queries filter transactions by `fromAddress = monitored_wallet`. Without an index on this column, these queries would perform full table scans, causing unacceptable performance degradation as transaction volume grows.

**Performance Impact**: Without index, query time grows linearly with transaction count (O(n)). With index, query time is logarithmic (O(log n)).

**Query Pattern**:
```sql
SELECT * FROM transactions
WHERE from_address = 'monitored_wallet_address'
  AND timestamp >= month_start
  AND timestamp < month_end
ORDER BY timestamp ASC, hash ASC;
```

## Target Files

### Files to Modify
- `libs/db/src/schema/transactions.ts` (add index definition)

## Implementation Details

### Step 1: Update transactions.ts Schema

Locate the existing `transactions` table definition in `libs/db/src/schema/transactions.ts`.

Find the existing index definitions. The file should already have an index callback structure similar to:

```typescript
export const transactions = pgTable('transactions', {
  // ... column definitions ...
}, (table) => [
  // Note: hash column unique constraint creates an implicit index, so no explicit index needed
  index('idx_transactions_timestamp').on(table.timestamp),
]);
```

**Add the fromAddress index** to the array:

```typescript
export const transactions = pgTable('transactions', {
  // ... existing column definitions ...
}, (table) => [
  // Note: hash column unique constraint creates an implicit index, so no explicit index needed
  index('idx_transactions_timestamp').on(table.timestamp),
  index('idx_transactions_from_address').on(table.fromAddress), // NEW INDEX
]);
```

**Rationale for Index**:
- Position calculation queries filter by `fromAddress` to find all payouts from the monitored wallet
- Index enables efficient filtering without full table scans
- Index name follows existing pattern: `idx_<table>_<column>`

### Step 2: Verify Build

Run the following command to ensure the schema change compiles without errors:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [ ] Index definition added to transactions table schema
- [ ] Index name: `idx_transactions_from_address`
- [ ] Index column: `fromAddress`
- [ ] Index definition follows existing pattern in the file
- [ ] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification command:
```bash
pnpm build
```

Expected output: Build completes with no errors.

**Note**: The actual index creation in the database will happen in Task 1.4 when the migration is generated and applied.

## Related References

- **Design Doc**: docs/design/payout-analytics-design.md (Technical Dependencies section)
- **Work Plan**: Task 1.3 in Phase 1
- **Existing Code**: `libs/db/src/schema/transactions.ts` (index pattern reference)

## Notes

- This index is marked as "critical for performance" in the work plan
- The transactions table likely already has an index on `timestamp` for existing analytics queries
- The hash column has a unique constraint, which creates an implicit index
- The fromAddress index complements the timestamp index for composite filtering (WHERE fromAddress = ? AND timestamp BETWEEN ? AND ?)
- PostgreSQL query planner can use both indexes efficiently for the analytics queries
