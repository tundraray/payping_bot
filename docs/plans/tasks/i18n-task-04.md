# Task: Add languageCode to Users Schema

**Task ID**: i18n-task-04
**Phase**: Phase 2 - Database Layer
**Estimated Effort**: 30 minutes
**Verification Level**: L3 (Build Success Verification)

## Overview

Add `languageCode` column to the users table schema to store user language preferences. This allows the bot to remember each user's language and send localized notifications.

## Context

Currently, the bot detects user language from Telegram's `ctx.from.language_code` on every request, but doesn't persist it. For event-driven notifications (TransactionListener), we need to store the user's preferred language in the database.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\db\src\schema\users.ts`

## Dependencies

**Depends On**: None

**Blocks**:
- Task 05 (UsersService.updateLanguage) - needs column to exist
- Task 06 (getActiveSubscribers returns languageCode) - needs column to exist

## Implementation Steps

### Step 1: Update users schema

Update `libs/db/src/schema/users.ts`:

```typescript
import { pgTable, serial, bigint, timestamp, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  telegramId: bigint('telegram_id', { mode: 'number' }).notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  languageCode: varchar('language_code', { length: 10 }), // NEW COLUMN
});
```

**Key Points**:
- Column name: `language_code` (snake_case for database)
- Type: `varchar(10)` - sufficient for language codes like 'en', 'ru', 'uk', 'en-US'
- Nullable: Yes (default null) - backward compatible with existing users
- No default value specified (null is implicit default)

### Step 2: Generate migration

Run Drizzle Kit to generate migration:

```bash
pnpm drizzle-kit generate
```

This creates a new migration file in `drizzle/migrations/` with SQL like:

```sql
ALTER TABLE "users" ADD COLUMN "language_code" varchar(10);
```

### Step 3: Review migration

Check the generated migration file to ensure it's correct:
- Column type is `varchar(10)`
- Column is nullable (no `NOT NULL` constraint)
- No default value clause

### Step 4: Apply migration

Apply migration to development database:

```bash
pnpm drizzle-kit push
```

Verify success in output logs.

### Step 5: Verify in database

Connect to PostgreSQL and verify column exists:

```sql
\d users;
-- Should show language_code | character varying(10) |
```

Or using Drizzle Studio:

```bash
pnpm drizzle-kit studio
```

## Acceptance Criteria

- [ ] `users` table has `language_code` column (AC-7.1)
- [ ] Column type is `varchar(10)` (AC-7.1)
- [ ] Column is nullable, default null (AC-7.1)
- [ ] Migration generated successfully
- [ ] Migration applies without errors
- [ ] Build succeeds

## Verification Steps

1. Generate migration: `pnpm drizzle-kit generate`
2. Review migration file in `drizzle/migrations/`
3. Apply migration: `pnpm drizzle-kit push`
4. Verify column exists in database
5. Run build: `pnpm build`

## Database Schema After Change

```
users table:
  id              serial PRIMARY KEY
  telegram_id     bigint NOT NULL UNIQUE
  created_at      timestamp with time zone NOT NULL DEFAULT now()
  language_code   varchar(10)  <--- NEW
```

## Edge Cases Considered

**Existing users**:
- Column is nullable, so existing rows get `NULL` value
- Fallback to 'en' handled in application code (Task 09, 10)

**Long language codes**:
- `varchar(10)` handles standard codes ('en', 'ru', 'uk', 'en-US', 'zh-CN')
- Longer codes will be truncated (acceptable, we normalize to 2-letter codes)

**NULL handling**:
- Application layer falls back to 'en' if `language_code IS NULL`
- Users without language set get English messages (safe default)

## Migration Rollback (if needed)

If migration needs to be reverted:

```sql
ALTER TABLE "users" DROP COLUMN "language_code";
```

## Notes

- **Backward compatible**: Existing users unaffected (NULL is acceptable)
- **No data migration needed**: New column, no existing data to migrate
- **Application handles NULL**: Fallback logic in handlers (Task 09, 10)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (Data Contract section)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 2.1)
- Drizzle ORM Docs: https://orm.drizzle.team/docs/column-types/pg

## Completion Checklist

- [ ] `languageCode` field added to users schema
- [ ] Migration generated
- [ ] Migration file reviewed
- [ ] Migration applied successfully
- [ ] Column verified in database
- [ ] Build succeeds
- [ ] No errors in migration logs
