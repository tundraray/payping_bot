import { bigint, index, integer, jsonb, pgTable, timestamp, varchar } from 'drizzle-orm/pg-core';

export const transactions = pgTable(
  'transactions',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    hash: varchar('hash', { length: 64 }).notNull().unique(),
    type: varchar('type', { length: 10 }).notNull(), // Maps to TransactionType enum ('USDT')
    fromAddress: varchar('from_address', { length: 64 }).notNull(),
    toAddress: varchar('to_address', { length: 64 }).notNull(),
    amount: varchar('amount', { length: 78 }).notNull(), // String for precision
    timestamp: bigint('timestamp', { mode: 'number' }).notNull(),
    blockNumber: bigint('block_number', { mode: 'number' }).notNull(),
    contractAddress: varchar('contract_address', { length: 64 }).notNull(),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    // Note: hash column unique constraint creates an implicit index, so no explicit index needed
    index('idx_transactions_timestamp').on(table.timestamp),
    index('idx_transactions_from_address').on(table.fromAddress),
  ],
);
