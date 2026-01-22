# Task: Quality Assurance - Final Verification

**Task ID**: i18n-task-11
**Phase**: Phase 5 - Quality Assurance
**Estimated Effort**: 2-3 hours
**Verification Level**: L1 (Functional Operation Verification)

## Overview

Comprehensive quality assurance to verify all acceptance criteria met, no regressions, clean build, and manual end-to-end testing with all 3 locales (en, ru, uk).

## Context

This is the final verification task before committing the i18n implementation. All previous tasks (01-10) must be completed. This task validates the entire feature works correctly through automated and manual testing.

## Dependencies

**Depends On**: ALL previous tasks (01-10) must be completed

**Blocks**: None (final task)

## Verification Checklist

### Phase 1: Automated Tests

#### Unit Tests
```bash
# Run all unit tests
pnpm test

# Specific modules
pnpm test libs/telegram/src/utils/format.utils.spec.ts
pnpm test libs/telegram/src/utils/i18n.utils.spec.ts
pnpm test libs/telegram/src/handlers/start.handler.spec.ts
pnpm test libs/telegram/src/listeners/transaction.listener.spec.ts
```

**Expected**: All tests pass, no failures

#### Integration Tests
```bash
# Database service tests
pnpm test libs/db/src/services/__tests__/users.service.int.test.ts
pnpm test libs/db/src/services/__tests__/subscriptions.service.int.test.ts
pnpm test libs/db/src/services/__tests__/transactions.service.int.test.ts
```

**Expected**: All tests pass, database operations work correctly

#### Build Verification
```bash
# TypeScript compilation
pnpm build
```

**Expected**: Build succeeds without errors

#### Linting
```bash
# Code quality check
pnpm lint
```

**Expected**: No linting errors

### Phase 2: Import Path Verification

#### Grep for Old Imports
```bash
# Should return NO results (formatUsdtDisplay moved to telegram module)
grep -r "formatUsdtDisplay.*@app/db" libs/ src/

# Should find imports from ../utils or @app/telegram
grep -r "formatUsdtDisplay.*../utils" libs/telegram/
```

**Expected**:
- No imports of `formatUsdtDisplay` from `@app/db`
- All imports from `../utils` in telegram module

#### Verify Module Exports
```bash
# Check @app/db exports (should NOT include formatUsdtDisplay)
grep -n "formatUsdtDisplay" libs/db/src/index.ts

# Check @app/telegram exports (should include formatUsdtDisplay)
grep -n "formatUsdtDisplay" libs/telegram/src/utils/index.ts
```

**Expected**:
- `formatUsdtDisplay` NOT in `libs/db/src/index.ts`
- `formatUsdtDisplay` IN `libs/telegram/src/utils/index.ts`

### Phase 3: Locale File Verification

#### Key Count Verification
```bash
# Count message keys in each locale (should all match)
grep -c "^[a-z]" libs/telegram/src/locales/en.ftl
grep -c "^[a-z]" libs/telegram/src/locales/ru.ftl
grep -c "^[a-z]" libs/telegram/src/locales/uk.ftl
```

**Expected**: All 3 files have same key count (14 keys)

#### Locale Loading Test
```bash
# Start bot and check logs for Fluent errors
pnpm start:dev
```

**Expected**: No Fluent parsing errors in startup logs

#### Message Key Verification

Verify all 14 keys exist in all 3 locale files:

- [ ] `welcome`
- [ ] `analytics-with-history`
- [ ] `analytics-no-history`
- [ ] `notification`
- [ ] `subscribe-success`
- [ ] `subscribe-already`
- [ ] `unsubscribe-success`
- [ ] `unsubscribe-not-subscribed`
- [ ] `status-subscribed`
- [ ] `status-not-subscribed`
- [ ] `btn-subscribe`
- [ ] `btn-unsubscribe`
- [ ] `error-generic`
- [ ] `error-rate-limit`

### Phase 4: Database Verification

#### Schema Verification
```bash
# Connect to database and verify schema
pnpm drizzle-kit studio
```

**Verify**:
- [ ] `users` table has `language_code` column
- [ ] Column type is `varchar(10)`
- [ ] Column is nullable

#### Manual SQL Check
```sql
-- Run in PostgreSQL client
\d users;
-- Should show: language_code | character varying(10) |

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'language_code';
-- Expected: language_code | character varying | YES
```

### Phase 5: Acceptance Criteria Verification

Go through all ACs from Design Doc:

#### AC-1: English Messages User-Friendly
- [ ] AC-1.1: Transaction notification starts with "🎉 Payment Received!"
- [ ] AC-1.2: Welcome message explains salary monitoring ("I help you track salary payments...")
- [ ] AC-1.3: Subscribe confirmation is warm ("✅ Subscribed! You'll now receive...")

**Verification**: Check `libs/telegram/src/locales/en.ftl` content

#### AC-2: Russian Messages User-Friendly
- [ ] AC-2.1: Messages are celebratory (same criteria as AC-1)
- [ ] AC-2.2: Grammatically correct Russian (manual review)

**Verification**: Check `libs/telegram/src/locales/ru.ftl` content

#### AC-3: Ukrainian Locale Added
- [ ] AC-3.1: uk.ftl file exists
- [ ] AC-3.2: All keys from en.ftl present in uk.ftl
- [ ] AC-3.3: Grammatically correct Ukrainian (manual review)

**Verification**: Check `libs/telegram/src/locales/uk.ftl` exists and has all keys

#### AC-4: Formatting Utilities Relocated
- [ ] AC-4.1: `formatUsdtDisplay` exists in `libs/telegram/src/utils/format.utils.ts`
- [ ] AC-4.2: `formatUsdtDisplay` NOT exported from `@app/db`
- [ ] AC-4.3: TransactionListener imports from `../utils`

**Verification**: File checks and grep

#### AC-5: TransactionsService Returns Raw Data
- [ ] AC-5.1: `getMonthlySum()` returns raw amount (check line 263 in transactions.service.ts)
- [ ] AC-5.2: Integration tests updated to expect raw format
- [ ] AC-5.3: `getRollingAverage()` returns formatted string (public API unchanged)
- [ ] AC-5.4: `getRollingAverage()` internal calculation uses raw values

**Verification**: Code review + integration test run

#### AC-6: StartHandler Uses New Utilities
- [ ] AC-6.1: Private `formatWithSeparators()` removed
- [ ] AC-6.2: Handler imports `formatUsdtDisplay` from `../utils`
- [ ] AC-6.3: Handler saves user language on /start

**Verification**: Code review of start.handler.ts

#### AC-7: Users Table Has Language Code
- [ ] AC-7.1: `users` table has `language_code` column (varchar, nullable)
- [ ] AC-7.2: `UsersService` has `updateLanguage()` method
- [ ] AC-7.3: Fallback to 'en' for null language (code review)

**Verification**: Database check + code review

#### AC-8: TransactionListener Localized
- [ ] AC-8.1: `getActiveSubscribers()` returns `languageCode` field
- [ ] AC-8.2: Notifications localized per subscriber's language
- [ ] AC-8.3: Fluent loaded via `i18n.utils.ts`
- [ ] AC-8.4: Fallback to 'en' if languageCode null

**Verification**: Code review + unit tests

### Phase 6: Manual End-to-End Testing

#### Test Scenario 1: English User
```
1. Start bot with language_code = 'en'
2. Send /start command
3. Verify welcome message in English
4. Verify analytics display correct formatting (thousand separators)
5. Trigger transaction event (mock or real)
6. Verify notification in English with celebratory tone
```

**Expected**:
- Welcome: "👋 Welcome to PayPing!"
- Notification: "🎉 Payment Received!"
- Amount: "1,234.56 USDT" (with separators)

#### Test Scenario 2: Russian User
```
1. Start bot with language_code = 'ru'
2. Send /start command
3. Verify welcome message in Russian
4. Trigger transaction event
5. Verify notification in Russian
```

**Expected**:
- Welcome: "👋 Добро пожаловать в PayPing!"
- Notification: "🎉 Платёж получен!"

#### Test Scenario 3: Ukrainian User
```
1. Start bot with language_code = 'uk'
2. Send /start command
3. Verify welcome message in Ukrainian
4. Trigger transaction event
5. Verify notification in Ukrainian
```

**Expected**:
- Welcome: "👋 Ласкаво просимо до PayPing!"
- Notification: "🎉 Платіж отримано!"

#### Test Scenario 4: User Without Language
```
1. Start bot with language_code = undefined
2. Send /start command
3. Verify fallback to English
4. Verify language saved as 'en' in database
```

**Expected**:
- Messages in English (fallback)
- Database: language_code = 'en'

#### Test Scenario 5: Language Update
```
1. User starts with language_code = 'en'
2. User changes Telegram language to 'uk'
3. User sends /start again
4. Verify language updated in database
5. Verify next notification in Ukrainian
```

**Expected**:
- Database: language_code updated to 'uk'
- Subsequent notifications in Ukrainian

### Phase 7: Regression Testing

Verify existing functionality still works:

- [ ] Subscribe/unsubscribe commands work
- [ ] Transaction monitoring still active
- [ ] Database persistence unchanged (except new languageCode field)
- [ ] Analytics calculation correct (getRollingAverage)
- [ ] No console errors during operation

### Phase 8: Performance Check

- [ ] Bot startup time unchanged
- [ ] /start response time acceptable
- [ ] Notification sending not significantly slower
- [ ] Database queries performant (JOIN on indexed column)

## Completion Criteria

- [ ] All automated tests pass (unit + integration)
- [ ] Build succeeds without errors
- [ ] No lint errors
- [ ] All 8 acceptance criteria groups verified
- [ ] Manual E2E tests pass for all 3 locales
- [ ] No regressions in existing features
- [ ] Import paths correct (no @app/db formatUsdtDisplay)
- [ ] Locale files load without errors
- [ ] Database schema correct
- [ ] Performance acceptable

## Verification Report Template

Create file `docs/plans/tasks/i18n-qa-report.md`:

```markdown
# i18n Implementation QA Report

Date: YYYY-MM-DD
Tester: [Name]

## Automated Tests
- [ ] Unit tests: PASS/FAIL
- [ ] Integration tests: PASS/FAIL
- [ ] Build: SUCCESS/FAIL
- [ ] Lint: PASS/FAIL

## Import Verification
- [ ] No @app/db formatUsdtDisplay imports
- [ ] All telegram module imports correct

## Locale Files
- [ ] en.ftl: 14 keys
- [ ] ru.ftl: 14 keys
- [ ] uk.ftl: 14 keys
- [ ] No Fluent parsing errors

## Database
- [ ] language_code column exists
- [ ] Migration applied successfully

## Manual E2E Tests
- [ ] English user: PASS/FAIL
- [ ] Russian user: PASS/FAIL
- [ ] Ukrainian user: PASS/FAIL
- [ ] Fallback to 'en': PASS/FAIL
- [ ] Language update: PASS/FAIL

## Acceptance Criteria
- [ ] AC-1: English messages user-friendly
- [ ] AC-2: Russian messages user-friendly
- [ ] AC-3: Ukrainian locale added
- [ ] AC-4: Formatting utilities relocated
- [ ] AC-5: TransactionsService returns raw
- [ ] AC-6: StartHandler uses new utils
- [ ] AC-7: Users table has languageCode
- [ ] AC-8: TransactionListener localized

## Regressions
- [ ] No regressions found

## Issues Found
(List any issues discovered)

## Sign-off
All criteria met: YES/NO
Ready for commit: YES/NO
```

## Commands Summary

```bash
# Automated tests
pnpm test
pnpm build
pnpm lint

# Import verification
grep -r "formatUsdtDisplay.*@app/db" libs/ src/

# Locale verification
grep -c "^[a-z]" libs/telegram/src/locales/*.ftl

# Database verification
pnpm drizzle-kit studio

# Manual testing
pnpm start:dev
# Then interact with bot via Telegram
```

## Notes

- **Manual testing required**: Automated tests can't verify Telegram message appearance
- **Translation quality**: Native speakers ideal for reviewing Russian/Ukrainian
- **Performance**: Should not degrade significantly (Fluent bundles cached)
- **Rollback plan**: If critical issues found, revert all changes (Git helps)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (All ACs)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 5.1)
- All previous tasks (01-10)

## Completion Checklist

- [ ] All automated tests run and pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] Import verification passed
- [ ] Locale files verified
- [ ] Database schema correct
- [ ] All 8 AC groups verified
- [ ] Manual E2E tests completed for all 3 locales
- [ ] No regressions found
- [ ] Performance acceptable
- [ ] QA report created and filled
- [ ] Ready for commit sign-off
