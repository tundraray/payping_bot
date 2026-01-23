import { decimal, index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { recipientWallets } from './recipient-wallets';

// Salary history table - tracks salary changes for EMPLOYEE recipients
export const salaryHistory = pgTable(
  'salary_history',
  {
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
  },
  (table) => [
    // Index for efficient lookups by recipient
    index('idx_salary_history_recipient').on(table.recipientWalletId),
  ],
);

export type SalaryHistory = typeof salaryHistory.$inferSelect;
export type NewSalaryHistory = typeof salaryHistory.$inferInsert;
