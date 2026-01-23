import { bigint, integer, pgTable, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { recipientWallets } from './recipient-wallets';

// Monthly positions cache table - stores pre-calculated positions per recipient per month
export const monthlyPositions = pgTable(
  'monthly_positions',
  {
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
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    // Unique constraint: one position record per recipient per month
    unique('unique_recipient_month').on(table.recipientWalletId, table.yearMonth),
  ],
);

export type MonthlyPosition = typeof monthlyPositions.$inferSelect;
export type NewMonthlyPosition = typeof monthlyPositions.$inferInsert;
