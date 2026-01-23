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
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});

export type RecipientWallet = typeof recipientWallets.$inferSelect;
export type NewRecipientWallet = typeof recipientWallets.$inferInsert;
