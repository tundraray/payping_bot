# Task 03: Define Database Schema Tables

Metadata:
- Phase: Phase 2 - Schema Definitions
- Dependencies: Task 02 (configuration files must exist)
- Provides: libs/db/src/schema/*.ts (transactions, users, subscriptions, payments, relations, index)
- Size: Medium (5 files)

## Implementation Content

Define database table schemas as TypeScript source of truth using Drizzle ORM schema definitions. This establishes the data model for all four domain tables with proper relationships.

**Schema files to create**:
1. `transactions.ts` - Transaction storage with hash index
2. `users.ts` - Telegram user records with telegram_id unique constraint
3. `subscriptions.ts` - Subscription status with foreign key to users
4. `payments.ts` - Payment history with foreign key to users
5. `relations.ts` - Table relationships (users -> subscriptions, payments)
6. `index.ts` - Aggregated schema exports

## Target Files
- [x] libs/db/src/schema/transactions.ts
- [x] libs/db/src/schema/users.ts
- [x] libs/db/src/schema/subscriptions.ts
- [x] libs/db/src/schema/payments.ts
- [x] libs/db/src/schema/relations.ts
- [x] libs/db/src/schema/index.ts (NOTE: This is the 6th file, making this task Medium size)

## Implementation Steps

### 1. Create transactions.ts Schema (AC-1.1)
- [x] Import pgTable, integer, varchar, text, bigint, timestamp, jsonb, index from drizzle-orm/pg-core
- [x] Define transactions table with columns:
  - id: integer().primaryKey().generatedAlwaysAsIdentity()
  - hash: varchar(64).notNull().unique()
  - type: varchar(10).notNull() (maps to TransactionType enum)
  - fromAddress: varchar(64).notNull()
  - toAddress: varchar(64).notNull()
  - amount: varchar(78).notNull() (string for precision)
  - timestamp: bigint(mode: number).notNull()
  - blockNumber: bigint(mode: number).notNull()
  - contractAddress: varchar(64).notNull()
  - raw: jsonb()
  - createdAt: timestamp().defaultNow().notNull()
- [x] Add index on timestamp column: idx_transactions_timestamp
- [x] Note: hash unique constraint creates implicit index, no explicit index needed
- [x] Reference Design Doc contract definitions section

### 2. Create users.ts Schema (AC-1.2)
- [x] Import pgTable, integer, bigint, varchar, timestamp from drizzle-orm/pg-core
- [x] Define users table with columns:
  - id: integer().primaryKey().generatedAlwaysAsIdentity()
  - telegramId: bigint(mode: number).notNull().unique()
  - username: varchar(255)
  - firstName: varchar(255)
  - lastName: varchar(255)
  - createdAt: timestamp().defaultNow().notNull()
  - updatedAt: timestamp().defaultNow().notNull().$onUpdateFn(() => new Date())
- [x] Note: telegram_id unique constraint creates implicit index
- [x] Reference Design Doc contract definitions section

### 3. Create subscriptions.ts Schema (AC-1.3)
- [x] Import pgTable, integer, varchar, timestamp, index from drizzle-orm/pg-core
- [x] Import users from './users'
- [x] Define subscriptionStatusEnum as const array: ['active', 'expired', 'cancelled']
- [x] Export SubscriptionStatus type
- [x] Define subscriptions table with columns:
  - id: integer().primaryKey().generatedAlwaysAsIdentity()
  - userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' })
  - status: varchar(20).notNull().$type<SubscriptionStatus>()
  - startsAt: timestamp().notNull()
  - expiresAt: timestamp().notNull()
  - createdAt: timestamp().defaultNow().notNull()
  - updatedAt: timestamp().defaultNow().notNull().$onUpdateFn(() => new Date())
- [x] Add index on userId: idx_subscriptions_user_id
- [x] Add index on expiresAt: idx_subscriptions_expires_at
- [x] Reference Design Doc contract definitions section

### 4. Create payments.ts Schema (AC-1.4)
- [x] Import pgTable, integer, varchar, bigint, timestamp, index from drizzle-orm/pg-core
- [x] Import users from './users'
- [x] Define paymentStatusEnum as const array: ['pending', 'completed', 'failed', 'refunded']
- [x] Export PaymentStatus type
- [x] Define payments table with columns:
  - id: integer().primaryKey().generatedAlwaysAsIdentity()
  - userId: integer().notNull().references(() => users.id, { onDelete: 'cascade' })
  - telegramPaymentChargeId: varchar(255).notNull().unique()
  - amount: integer().notNull() (Telegram Stars amount)
  - currency: varchar(3).notNull().default('XTR')
  - status: varchar(20).notNull().$type<PaymentStatus>()
  - createdAt: timestamp().defaultNow().notNull()
- [x] Add index on userId: idx_payments_user_id
- [x] Note: telegram_payment_charge_id unique constraint creates implicit index
- [x] Reference Design Doc contract definitions section

### 5. Create relations.ts
- [x] Import relations from 'drizzle-orm'
- [x] Import users, subscriptions, payments from respective files
- [x] Define usersRelations: users has many subscriptions and payments
- [x] Define subscriptionsRelations: subscription belongs to one user
- [x] Define paymentsRelations: payment belongs to one user
- [x] Reference Design Doc contract definitions section

### 6. Create index.ts
- [x] Export all tables: transactions, users, subscriptions, payments
- [x] Export all relations: usersRelations, subscriptionsRelations, paymentsRelations
- [x] Export type definitions: SubscriptionStatus, PaymentStatus
- [x] This becomes the single import point for schema

## Completion Criteria
- [x] All 6 schema files created and compile without errors
- [x] All tables use generatedAlwaysAsIdentity() for primary keys (AC-1.5)
- [x] Foreign key relationships properly defined
- [x] Relations avoid circular dependencies
- [x] `pnpm run build` succeeds
- [x] Operation verified: L3 (Build Success) - schema compiles and can be imported

## Notes
- Impact scope: Schema definitions only, no runtime code
- Constraints: Do not create services or providers yet
- Schema structure must match Design Doc exactly for migration compatibility
- Use identity columns (not serial) as per AC-1.5 and ADR-0002
- $onUpdateFn is runtime-only (not reflected in DDL), updates use Drizzle methods
- Unique constraints automatically create indexes, no explicit index needed
