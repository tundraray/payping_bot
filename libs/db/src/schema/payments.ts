import { index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const paymentStatusEnum = ['pending', 'completed', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof paymentStatusEnum)[number];

export const payments = pgTable(
  'payments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    telegramPaymentChargeId: varchar('telegram_payment_charge_id', { length: 255 })
      .notNull()
      .unique(),
    amount: integer('amount').notNull(), // Telegram Stars amount (integer)
    currency: varchar('currency', { length: 3 }).notNull().default('XTR'), // XTR for Telegram Stars
    status: varchar('status', { length: 20 }).notNull().$type<PaymentStatus>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('idx_payments_user_id').on(table.userId),
    // Note: No explicit index on telegram_payment_charge_id - unique constraint creates implicit index
  ],
);
