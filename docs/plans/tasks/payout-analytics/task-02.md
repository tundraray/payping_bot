# Task 1.2: Create monthly_positions Schema

**Status**: Not Started
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 1 - Database Schema Foundation
**Depends On**: Task 1.1 (recipient_wallets schema)
**Blocks**: Task 1.3, Task 2.3

## Overview

Create Drizzle schema definition for the `monthly_positions` table to cache position calculations. This table stores pre-calculated positions for each recipient within their classification group for each month, enabling instant `/analytics` command responses without calculation overhead.

## Context

The real-time processing architecture (ADR-0003 v2.0) requires storing calculated positions immediately when transactions are saved. The `monthly_positions` table serves as a write-through cache:
- Position is calculated and stored on transaction insert
- `/analytics` command reads pre-calculated data (simple SELECT)
- Position is within classification group, not global

## Target Files

### Files to Create
- `libs/db/src/schema/monthly-positions.ts`

### Files to Modify
- `libs/db/src/schema/index.ts` (add export)

## Implementation Details

### Step 1: Create monthly-positions.ts Schema File

Create `libs/db/src/schema/monthly-positions.ts` with the following structure:

```typescript
import { bigint, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { recipientWallets } from './recipient-wallets';

// Monthly positions cache table - stores pre-calculated positions per recipient per month
export const monthlyPositions = pgTable('monthly_positions', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  recipientWalletId: integer('recipient_wallet_id')
    .notNull()
    .references(() => recipientWallets.id),
  yearMonth: varchar('year_month', { length: 7 }).notNull(), // Format: 'YYYY-MM' (e.g., '2026-01')
  position: integer('position').notNull(), // Position within classification group
  transactionHash: varchar('transaction_hash', { length: 64 }).notNull(),
  amount: varchar('amount', { length: 78 }).notNull(), // Cumulative amount for the month
  paymentTimestamp: bigint('payment_timestamp', { mode: 'number' }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdateFn(() => new Date()),
}, (table) => [
  // Unique constraint: one position record per recipient per month
  unique('unique_recipient_month').on(table.recipientWalletId, table.yearMonth),
]);

export type MonthlyPosition = typeof monthlyPositions.$inferSelect;
export type NewMonthlyPosition = typeof monthlyPositions.$inferInsert;
```

**Key Design Decisions**:
1. **yearMonth format**: 'YYYY-MM' string for easy filtering and display (e.g., '2026-01')
2. **Foreign key**: References `recipient_wallets.id` to link positions to wallets
3. **Unique constraint**: (recipientWalletId, yearMonth) ensures one position per recipient per month
4. **position**: Integer representing position within classification group (1, 2, 3, ...)
5. **transactionHash**: References the transaction that determined this position (for audit trail)
6. **amount**: Cumulative amount if multiple payments to same recipient in the month
7. **paymentTimestamp**: Bigint matching transactions table timestamp format

### Step 2: Export from Schema Index

Update `libs/db/src/schema/index.ts` to export the new schema:

```typescript
export * from './monthly-positions';
```

Add this line to the existing exports in the file.

### Step 3: Verify Build

Run the following command to ensure the schema compiles without errors:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [ ] `libs/db/src/schema/monthly-positions.ts` file created
- [ ] `monthlyPositions` table defined with all columns:
  - [ ] id (serial primary key)
  - [ ] recipientWalletId (integer, foreign key to recipient_wallets, not null)
  - [ ] yearMonth (varchar(7), not null)
  - [ ] position (integer, not null)
  - [ ] transactionHash (varchar(64), not null)
  - [ ] amount (varchar(78), not null)
  - [ ] paymentTimestamp (bigint, not null)
  - [ ] createdAt (timestamp, default now, not null)
  - [ ] updatedAt (timestamp, default now, not null, with $onUpdateFn)
- [ ] Unique constraint defined: (recipientWalletId, yearMonth)
- [ ] Foreign key reference to `recipientWallets.id`
- [ ] Type exports: MonthlyPosition and NewMonthlyPosition
- [ ] Schema exported from `libs/db/src/schema/index.ts`
- [ ] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification command:
```bash
pnpm build
```

Expected output: Build completes with no errors.

## Related References

- **Design Doc**: docs/design/payout-analytics-design.md (Contract Definitions section)
- **ADR**: docs/adr/003-payout-analytics-architecture.md (Data Model Reference section)
- **Work Plan**: Task 1.2 in Phase 1
- **Acceptance Criteria**: AC-5.3 (cache persistence)

## Notes

- The unique constraint on (recipientWalletId, yearMonth) prevents duplicate position records
- Position calculation happens in AnalyticsService (Task 2.3) when transactions are inserted
- The cache completeness logic differentiates past months (immutable) from current month (recalculated)
- VARCHAR(78) for amounts matches recipient_wallets and transactions schema
- paymentTimestamp as bigint matches the transactions table format for consistency
