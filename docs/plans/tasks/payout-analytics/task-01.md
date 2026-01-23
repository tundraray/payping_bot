# Task 1.1: Create recipient_wallets Schema

**Status**: Not Started
**Assignee**: TBD
**Estimated Effort**: 0.5 hours
**Phase**: 1 - Database Schema Foundation
**Depends On**: None
**Blocks**: Task 1.2, Task 2.1

## Overview

Create Drizzle schema definition for the `recipient_wallets` table with extended fields for salary tracking and employment status. This table tracks unique recipient wallet addresses with their classification, payment history, and employment metadata.

## Context

The payout analytics feature requires tracking recipient wallets as distinct entities with classification (EMPLOYEE, FREELANCER, ONE_TIME, UNKNOWN, FIRED). The schema must support:
- Automatic classification based on payment patterns
- Salary amount tracking for change detection
- Employment status tracking (hired date, fired date)
- Payment frequency tracking (months without payment counter)

## Target Files

### Files to Create
- `libs/db/src/schema/recipient-wallets.ts`

### Files to Modify
- `libs/db/src/schema/index.ts` (add export)

## Implementation Details

### Step 1: Create recipient-wallets.ts Schema File

Create `libs/db/src/schema/recipient-wallets.ts` with the following structure:

```typescript
import { integer, pgEnum, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

// Classification enum for recipient wallet types
export const classificationEnum = pgEnum('recipient_classification', [
  'UNKNOWN',
  'ONE_TIME',
  'EMPLOYEE',
  'FREELANCER',
  'FIRED',
]);

// Recipient wallets table - tracks unique recipient addresses with classification
export const recipientWallets = pgTable('recipient_wallets', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  address: varchar('address', { length: 64 }).notNull().unique(),
  classification: classificationEnum('classification').default('UNKNOWN').notNull(),

  // Payment tracking
  firstSeenAt: timestamp('first_seen_at').notNull(),
  lastPaymentAt: timestamp('last_payment_at').notNull(),
  totalPayments: integer('total_payments').default(1).notNull(),

  // Salary tracking (for EMPLOYEE classification)
  lastAmount: varchar('last_amount', { length: 78 }), // nullable - for salary change detection

  // Employment status tracking (for EMPLOYEE classification)
  hiredAt: timestamp('hired_at'), // nullable - first payment date for employees
  firedAt: timestamp('fired_at'), // nullable - set when marked as fired
  monthsWithoutPayment: integer('months_without_payment').default(0).notNull(),

  // Timestamps
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull().$onUpdateFn(() => new Date()),
});

export type RecipientWallet = typeof recipientWallets.$inferSelect;
export type NewRecipientWallet = typeof recipientWallets.$inferInsert;
```

**Key Design Decisions**:
1. **address column**: varchar(64) for TRON wallet addresses, UNIQUE constraint ensures no duplicates
2. **classification enum**: 5 possible values matching ADR-0003 specification
3. **lastAmount**: varchar(78) to store USDT amounts as strings (handles decimals precisely)
4. **Nullable fields**: lastAmount, hiredAt, firedAt are nullable as they apply only to certain classifications
5. **monthsWithoutPayment**: Counter for fired detection algorithm (2+ months → mark as fired)

### Step 2: Export from Schema Index

Update `libs/db/src/schema/index.ts` to export the new schema:

```typescript
export * from './recipient-wallets';
```

Add this line to the existing exports in the file.

### Step 3: Verify Build

Run the following command to ensure the schema compiles without errors:

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [ ] `libs/db/src/schema/recipient-wallets.ts` file created
- [ ] `classificationEnum` defined with all 5 values: UNKNOWN, ONE_TIME, EMPLOYEE, FREELANCER, FIRED
- [ ] `recipientWallets` table defined with all columns:
  - [ ] id (serial primary key)
  - [ ] address (varchar(64), unique, not null)
  - [ ] classification (enum, default 'UNKNOWN', not null)
  - [ ] firstSeenAt (timestamp, not null)
  - [ ] lastPaymentAt (timestamp, not null)
  - [ ] totalPayments (integer, default 1, not null)
  - [ ] lastAmount (varchar(78), nullable)
  - [ ] hiredAt (timestamp, nullable)
  - [ ] firedAt (timestamp, nullable)
  - [ ] monthsWithoutPayment (integer, default 0, not null)
  - [ ] createdAt (timestamp, default now, not null)
  - [ ] updatedAt (timestamp, default now, not null, with $onUpdateFn)
- [ ] Type exports: RecipientWallet and NewRecipientWallet
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
- **ADR**: docs/adr/003-payout-analytics-architecture.md (Classification Algorithm section)
- **Work Plan**: Task 1.1 in Phase 1
- **Acceptance Criteria**: AC-3.1, AC-3.2, AC-3.3, AC-3.4

## Notes

- The `$onUpdateFn` for `updatedAt` is a Drizzle ORM feature that automatically updates the timestamp on row updates
- VARCHAR(78) for amounts accommodates USDT decimal values with precision (matches existing transactions schema)
- The unique constraint on `address` prevents duplicate recipient entries
- All timestamp fields use PostgreSQL's `timestamp` type (not `timestamptz`) for consistency with existing schema
