# Overall Design Document: i18n User-Friendly Messages

Generation Date: 2026-01-22
Target Plan Document: `docs/plans/i18n-user-friendly-messages-work-plan.md`
Design Document: `docs/design/i18n-user-friendly-messages-design.md`

## Project Overview

### Purpose and Goals
Implement user-friendly, celebratory messages for PayPing bot (salary payment monitoring context), add Ukrainian locale support, and refactor formatting utilities architecture to follow proper separation of concerns (presentation layer vs. database layer).

### Background and Context
PayPing bot currently uses generic transaction messages that don't reflect the celebratory nature of salary payments. The formatting utilities are misplaced in the database module (`@app/db`) instead of the presentation layer (`@app/telegram`). Ukrainian locale is missing despite being a target user language. Additionally, the database service returns formatted data instead of raw data, violating separation of concerns.

## Task Division Design

### Division Policy
**Horizontal Slice (Foundation-driven)** approach is used because:
- Database schema changes (languageCode column) must be applied before handlers can save user language
- Utility functions (formatUsdtDisplay, i18n utils) must exist before handlers can import them
- Locale files must be updated before TransactionListener can send localized notifications
- Service layer changes (raw data return) must complete before presentation layer updates

### Verifiability Level Distribution
- **L1 (Functional Operation)**: Task 11 (QA verification) - Manual E2E test
- **L2 (Test Operation)**: Tasks 1, 2, 5, 6, 7, 9, 10 - Unit/integration tests pass
- **L3 (Build Success)**: Tasks 3, 4, 8 - Build succeeds, no import errors

### Inter-task Relationship Map
```
Phase 1: Foundation (Parallel execution)
├─ Task 01: Create telegram format utils → Deliverable: libs/telegram/src/utils/format.utils.ts
├─ Task 02: Create i18n utils → Deliverable: libs/telegram/src/utils/i18n.utils.ts
└─ Task 03: Update locale files (en/ru/uk) → Deliverable: libs/telegram/src/locales/*.ftl

Phase 2: Database Layer (Sequential within phase)
├─ Task 04: Add languageCode to users schema → Deliverable: Migration file
├─ Task 05: Add updateLanguage to UsersService → Deliverable: Method in users.service.ts
└─ Task 06: Update getActiveSubscribers → Deliverable: Updated return type

Phase 3: Service Updates (Sequential)
├─ Task 07: Update TransactionsService (raw return) → Deliverable: Updated getMonthlySum, getRollingAverage
└─ Task 08: Remove formatUsdtDisplay from db → Deliverable: Clean @app/db exports

Phase 4: Handler Updates (Sequential, depends on Phase 1-3)
├─ Task 09: Update StartHandler → Uses Task 01 deliverable + Task 05 deliverable
└─ Task 10: Update TransactionListener → Uses Task 01, 02, 03, 06 deliverables

Phase 5: QA (Sequential, depends on all previous)
└─ Task 11: Quality Assurance → Verifies all acceptance criteria
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|-------------------|-------------------|
| TransactionsService.getMonthlySum() returns "1234.56" | Returns "1234560000" (raw) | Yes (callers use formatUsdtDisplay) | Task 07 |
| formatUsdtDisplay from @app/db | formatUsdtDisplay from @app/telegram/utils | Yes (import path change) | Task 08 |
| StartHandler.formatWithSeparators() (private) | Use formatUsdtDisplay from utils | Yes (remove private method) | Task 09 |
| getActiveSubscribers() returns {telegramId} | Returns {telegramId, languageCode} | Yes (add field to return type) | Task 06 |
| TransactionListener.formatNotificationMessage(tx) | formatNotificationMessage(tx, lang) | Yes (add languageCode param) | Task 10 |

### Common Processing Points

**Formatting Utilities** (Task 01):
- `formatUsdtDisplay(rawAmount, decimals)` - Converts raw USDT to display format with separators
- `formatWithSeparators(value)` - Adds thousand separators to formatted numbers
- Design policy: Create once in libs/telegram/src/utils, reuse across StartHandler and TransactionListener

**i18n Translation** (Task 02):
- `translate(languageCode, key, params)` - Loads Fluent bundles outside grammY context
- Design policy: Single i18n utility for event handlers (TransactionListener) that don't have grammY context

**Language Fallback** (Tasks 09, 10):
- When user languageCode is null, fallback to 'en'
- When requested locale file doesn't exist, fallback to 'en'
- Design policy: Consistent fallback across all handlers and listeners

## Implementation Considerations

### Principles to Maintain Throughout

1. **Separation of Concerns**: Database layer returns raw data, presentation layer formats for display
2. **DRY (Don't Repeat Yourself)**: Formatting logic exists in one place (libs/telegram/src/utils)
3. **Fail-Fast**: Database migration applied before code changes, fail early if schema not ready
4. **Backward Compatibility**: getRollingAverage() still returns formatted string (public API unchanged)
5. **Test Coverage**: Every task has unit or integration tests, minimum 80% coverage
6. **Localization Consistency**: All 3 locales (en, ru, uk) have same message keys

### Risks and Countermeasures

**Risk 1: Missed import path update**
- Impact: Build fails when formatUsdtDisplay is imported from wrong module
- Countermeasure: Task 11 includes grep check for old import path `@app/db.*formatUsdtDisplay`
- Prevention: Task 08 removes export before Task 09/10 update imports

**Risk 2: getRollingAverage() regression**
- Impact: Wrong calculation when getMonthlySum() returns raw amounts
- Countermeasure: Task 07 includes integration test verifying formatted output
- Prevention: Update internal calculation to sum raw values before formatting at end

**Risk 3: Ukrainian translation quality**
- Impact: Grammatically incorrect or confusing Ukrainian messages
- Countermeasure: Manual review by native speaker (if available)
- Prevention: Use approved message structure from Design Doc, focus on clarity

**Risk 4: Fluent bundle loading fails**
- Impact: TransactionListener notifications fail for non-English users
- Countermeasure: Task 02 includes unit tests for translate() function
- Prevention: Fallback to 'en' if bundle loading fails

**Risk 5: Database migration fails**
- Impact: Application crashes on startup, languageCode column missing
- Countermeasure: Test migration on dev environment first (Task 04)
- Prevention: Make column nullable with default null (backward compatible)

### Impact Scope Management

**Allowed change scope**:
- libs/telegram/src/locales/*.ftl (message content)
- libs/telegram/src/utils/ (new files)
- libs/telegram/src/handlers/start.handler.ts (import, save language)
- libs/telegram/src/listeners/transaction.listener.ts (localization)
- libs/db/src/schema/users.ts (languageCode column)
- libs/db/src/services/users.service.ts (updateLanguage method)
- libs/db/src/services/subscriptions.service.ts (return languageCode)
- libs/db/src/services/transactions.service.ts (raw return, fix getRollingAverage)
- libs/db/src/utils/usdt.utils.ts (remove formatUsdtDisplay)

**No-change areas**:
- libs/blockchain/* (no changes to blockchain monitoring)
- libs/telegram/src/handlers/subscribe.handler.ts (no changes to subscription logic)
- libs/telegram/src/telegram.service.ts (no changes to bot startup)
- libs/db/src/db.module.ts (no changes to database connection)

## Execution Order and Dependencies

### Parallel Execution Opportunities

**Phase 1 tasks (01, 02, 03)** can run in parallel:
- No interdependencies
- All create new files or update isolated locale files
- Can be executed by different team members simultaneously

**Phase 2 tasks (04, 05, 06)** have sequential dependencies:
- Task 05 depends on Task 04 (schema must exist before service method)
- Task 06 can run parallel to Task 05 (different service)

### Critical Path

```
Task 04 (schema) → Task 05 (updateLanguage) → Task 09 (StartHandler saves language)
                                              ↓
Task 01 (format utils) → Task 07 (raw return) → Task 09 (StartHandler uses utils)
                                              ↓
Task 02 (i18n utils) + Task 03 (locales) + Task 06 (getActiveSubscribers) → Task 10 (TransactionListener localization)
                                              ↓
Task 11 (QA verification)
```

### Recommended Execution Order

1. Execute Phase 1 (Tasks 01, 02, 03) in parallel
2. Execute Task 04, then Task 05
3. Execute Task 06 in parallel with Task 07
4. Execute Task 08 after Task 07
5. Execute Task 09 after Tasks 01, 05, 07, 08 complete
6. Execute Task 10 after Tasks 01, 02, 03, 06, 08 complete
7. Execute Task 11 after all previous tasks complete

## Deliverables Summary

| Task | Primary Deliverable | Secondary Deliverables |
|------|-------------------|----------------------|
| 01 | libs/telegram/src/utils/format.utils.ts | index.ts, spec file |
| 02 | libs/telegram/src/utils/i18n.utils.ts | spec file |
| 03 | libs/telegram/src/locales/uk.ftl | Updated en.ftl, ru.ftl |
| 04 | drizzle migration file | Updated users schema |
| 05 | UsersService.updateLanguage() method | Integration test |
| 06 | Updated getActiveSubscribers() return type | Integration test |
| 07 | Updated getMonthlySum(), getRollingAverage() | Updated integration tests |
| 08 | Clean @app/db exports | Updated spec file |
| 09 | Updated StartHandler | Updated spec file |
| 10 | Updated TransactionListener | Updated spec file |
| 11 | All ACs verified | Manual E2E test report |

## Quality Standards

**Test Coverage**:
- Minimum 80% code coverage for all new utilities
- All existing integration tests pass
- New integration tests for updateLanguage and getActiveSubscribers

**Build Requirements**:
- Zero lint errors (pnpm lint)
- Zero build errors (pnpm build)
- All unit tests pass (pnpm test)

**Acceptance Criteria**:
- All 8 AC groups (AC-1 through AC-8) verified
- Manual E2E test passes for all 3 locales (en, ru, uk)
- Import grep check passes (no @app/db formatUsdtDisplay references)

## Next Steps

1. Execute tasks in recommended order (see Execution Order section)
2. After each task completion, update Work Plan progress tracking
3. Run verification checks specified in task completion criteria
4. Proceed to Task 11 only after all previous tasks complete
5. Final commit after Task 11 QA verification passes
