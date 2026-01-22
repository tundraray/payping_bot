import { bigint, integer, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  username: varchar('username', { length: 255 }),
  firstName: varchar('first_name', { length: 255 }),
  lastName: varchar('last_name', { length: 255 }),
  languageCode: varchar('language_code', { length: 10 }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  // Note: $onUpdateFn is a runtime-only feature (not reflected in DDL).
  // Updates must use Drizzle's update methods for this to work.
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .notNull()
    .$onUpdateFn(() => new Date()),
});
// Note: No explicit index on telegram_id - unique constraint creates implicit index
