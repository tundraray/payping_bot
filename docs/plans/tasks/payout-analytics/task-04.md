# Task 1.5: Create salary_history Schema

**Status**: Not Started
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 1 - Database Schema Foundation
**Depends On**: Task 1.3
**Blocks**: Task 1.4

## Overview

Create Drizzle schema definition for the `salary_history` table to track salary changes over time for EMPLOYEE-classified recipients. This table records detected and confirmed salary changes, enabling audit trail and future salary change notifications.

## Context

The payout analytics feature includes automatic salary change detection (Design Doc AC-6.1, AC-6.2, AC-6.3). When an EMPLOYEE recipient's payment amount differs by more than 5% from their previous payment, a potential salary change is detected. After 2 consecutive payments at the new amount, the change is confirmed.

**Use Cases**:
- Audit trail of salary changes
- Future notification feature (out of MVP scope)
- Analysis of compensation trends

## Target Files

### Files to Create
- `libs/db/src/schema/salary-history.ts`

### Files to Modify
- `libs/db/src/schema/index.ts` (add export)

## Implementation Details

### Step 1: Create salary-history.ts Schema File

Create `libs/db/src/schema/salary-history.ts` with the following structure:

```typescript
import { decimal, integer, pgTable, timestamp, varchar, index } from 'drizzle-orm/pg-core';
import { recipientWallets } from './recipient-wallets';

// Salary history table - tracks salary changes for EMPLOYEE recipients
export const salaryHistory = pgTable('salary_history', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  recipientWalletId: integer('recipient_wallet_id')
    .notNull()
    .references(() => recipientWallets.id),

  // Salary change details
  previousAmount: varchar('previous_amount', { length: 78 }).notNull(),
  newAmount: varchar('new_amount', { length: 78 }).notNull(),
  changePercent: decimal('change_percent', { precision: 10, scale: 2 }).notNull(), // e.g., 10.50 for 10.5% increase

  // Detection and confirmation timestamps
  detectedAt: timestamp('detected_at').notNull(), // When change was first detected

  // Transaction reference
  transactionHash: varchar('transaction_hash', { length: 64 }).notNull(), // Transaction that triggered detection

  // Audit timestamp
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => [
  // Index for efficient lookups by recipient
  index('idx_salary_history_recipient').on(table.recipientWalletId),
]);

export type SalaryHistory = typeof salaryHistory.$inferSelect;
export type NewSalaryHistory = typeof salaryHistory.$inferInsert;
```

**Key Design Decisions**:
1. **previousAmount & newAmount**: varchar(78) to match recipient_wallets.lastAmount precision
2. **changePercent**: decimal(10, 2) stores percentage with 2 decimal places (e.g., 10.50 for 10.5%)
3. **Foreign key**: References `recipient_wallets.id` to link salary changes to recipients
4. **transactionHash**: References the transaction that triggered the salary change detection
5. **Index on recipientWalletId**: Enables efficient queries for a recipient's salary history
6. **detectedAt**: Timestamp when the change was first detected (not confirmed - confirmation logic simplified)

**Note**: The original work plan mentioned `confirmedAt` for 2-month confirmation, but the Design Doc v2.0 and ADR-0003 v2.0 clarify that salary changes are recorded when detected (>5% difference). The 2-month pattern is part of the classification algorithm, not the salary change confirmation logic.

### Step 2: Export from Schema Index

Update `libs/db/src/schema/index.ts` to export the new schema:

```typescript
export * from './salary-history';
```

Add this line to the existing exports in the file.

### Step 3: Verify Build

Run the following command to ensure the schema compiles without errors:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [ ] `libs/db/src/schema/salary-history.ts` file created
- [ ] `salaryHistory` table defined with all columns:
  - [ ] id (serial primary key)
  - [ ] recipientWalletId (integer, foreign key to recipient_wallets, not null)
  - [ ] previousAmount (varchar(78), not null)
  - [ ] newAmount (varchar(78), not null)
  - [ ] changePercent (decimal(10, 2), not null)
  - [ ] detectedAt (timestamp, not null)
  - [ ] transactionHash (varchar(64), not null)
  - [ ] createdAt (timestamp, default now, not null)
- [ ] Index defined on recipientWalletId
- [ ] Foreign key reference to `recipientWallets.id`
- [ ] Type exports: SalaryHistory and NewSalaryHistory
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

- **Design Doc**: docs/design/payout-analytics-design.md (Contract Definitions, Salary Tracking section)
- **ADR**: docs/adr/003-payout-analytics-architecture.md (Salary Tracking section)
- **Work Plan**: Task 1.5 in Phase 1
- **Acceptance Criteria**: AC-6.1, AC-6.2, AC-6.3 (salary tracking and detection)

## Notes

- Salary history is only relevant for EMPLOYEE-classified recipients
- The 5% threshold for salary change detection is implemented in ClassificationService (Task 2.2)
- Change percent calculation: `|newAmount - previousAmount| / previousAmount * 100`
- Positive changePercent indicates increase; negative indicates decrease
- The index on recipientWalletId enables efficient queries like "get salary history for this employee"
- VARCHAR(78) for amounts matches other tables for consistency
