import { index, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptionStatusEnum = ['active', 'expired', 'cancelled'] as const;
export type SubscriptionStatus = (typeof subscriptionStatusEnum)[number];

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: varchar('status', { length: 20 }).notNull().$type<SubscriptionStatus>(),
    startsAt: timestamp('starts_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Note: $onUpdateFn is a runtime-only feature (not reflected in DDL).
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index('idx_subscriptions_user_id').on(table.userId),
    index('idx_subscriptions_expires_at').on(table.expiresAt),
  ],
);
