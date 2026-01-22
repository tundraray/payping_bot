# Overall Design Document: Telegram Bot Implementation

Generation Date: 2026-01-22
Target Plan Document: `docs/plans/telegram-bot-work-plan.md`

## Project Overview

### Purpose and Goals
Implement the Telegram bot user interface that enables users to subscribe to real-time USDT transaction notifications, view income analytics, and interact with the bot via commands and inline buttons.

### Background and Context
The blockchain monitoring infrastructure (Phase 1-3 of the broader project) is complete and operational. The bot infrastructure has been partially implemented:

**Completed Work:**
- Phase 1: Foundation (Config, Types, i18n English locale) - COMPLETE
- Phase 2: Infrastructure (TelegramService with lifecycle) - COMPLETE
- Phase 3: Basic StartHandler - COMPLETE
- SubscriptionsService.cancel() method - COMPLETE

**Remaining Work:**
- Phase 4: TransactionsService analytics methods (getMonthlySum, getRollingAverage)
- Phase 5: Enhanced StartHandler with analytics display
- Phase 6: SubscribeHandler (commands + button callbacks)
- Phase 7: TransactionListener for notifications
- Phase 8: Module wiring + Russian translations
- Phase 9: Quality assurance

## Task Division Design

### Division Policy
Tasks are divided using a **Vertical Slice** approach for handlers (each handler is a complete user-facing feature) and a **Horizontal Slice** approach for database extensions (infrastructure shared across features).

**Verifiability Level Distribution:**
- Database extensions (Phase 4): **L2** - Test operation verification (unit tests must pass)
- StartHandler enhancement (Phase 5): **L1** - Functional operation verification (analytics visible in /start)
- SubscribeHandler (Phase 6): **L1** - Functional operation verification (subscription flows work)
- TransactionListener (Phase 7): **L1** - Functional operation verification (notifications delivered)
- Module integration (Phase 8): **L1** - Functional operation verification (full E2E flow works)
- Quality assurance (Phase 9): **L1+L2+L3** - All verification levels

### Inter-task Relationship Map

```
Phase 4 (Database Extensions) → Deliverable: analytics methods in TransactionsService
  ↓
Phase 5 (StartHandler + Analytics) → Deliverable: enhanced /start with analytics display
  ↓
Phase 8 (Module Wiring)

Phase 4 (Database Extensions) → Deliverable: cancel() method in SubscriptionsService
  ↓
Phase 6 (SubscribeHandler) → Deliverable: subscription management flows
  ↓
Phase 8 (Module Wiring)

Phase 2 (TelegramService) [COMPLETED] → Deliverable: bot lifecycle management
  ↓
Phase 7 (TransactionListener) → Deliverable: transaction notification system
  ↓
Phase 8 (Module Wiring)

Phase 8 (Module Wiring) → Deliverable: fully integrated TelegramModule
  ↓
Phase 9 (Quality Assurance) → Deliverable: verified acceptance criteria
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|---------------------|-------------------|
| TransactionsService (no analytics) | TransactionsService.getMonthlySum() | Yes - add method | Task 01 |
| TransactionsService (no analytics) | TransactionsService.getRollingAverage() | Yes - add method | Task 02 |
| StartHandler (basic) | StartHandler (with analytics) | Yes - enhance logic | Task 03 |
| TelegramModule (empty) | TelegramModule (all providers) | Yes - add providers | Task 07 |
| No SubscribeHandler | SubscribeHandler (new class) | No - new implementation | Task 04, 05 |
| No TransactionListener | TransactionListener (new class) | No - new implementation | Task 06 |
| English only | English + Russian | Yes - add ru.ftl | Task 08 |

### Common Processing Points

**Shared Functionality:**
- **i18n system**: Already configured in TelegramService (Phase 2 complete), used by all handlers
- **Error handling pattern**: All handlers follow same pattern (log + continue for notifications, log + throw for commands)
- **Database service access**: All handlers inject DbModule services (UsersService, SubscriptionsService, TransactionsService)
- **Inline keyboard pattern**: StartHandler established pattern with InlineKeyboard + CALLBACK_ACTIONS

**Design Policy to Avoid Duplication:**
- Handlers should not duplicate keyboard building logic - extract to shared utility if needed (but not yet, Rule of Three)
- Analytics formatting (thousands separator, 2 decimals) should be consistent across handlers
- Notification formatting should follow same pattern as analytics display

## Implementation Considerations

### Principles to Maintain Throughout

1. **Fail-Fast Error Handling**: All database operations should log errors and re-throw (no silent failures)
2. **Structured Logging**: All handlers and services should log with structured context (userId, telegramId, action, etc.)
3. **i18n Completeness**: Every user-facing string must use i18n keys (no hardcoded strings)
4. **Test Coverage**: Maintain 80%+ coverage for all new code
5. **Rate Limit Awareness**: TransactionListener must respect Telegram's 30 msg/sec limit

### Risks and Countermeasures

**Risk: Analytics queries slow with large dataset**
- Countermeasure: Use indexed columns (timestamp, toAddress), test with realistic data volume
- Fallback: Add caching if queries exceed 500ms

**Risk: Notification delivery failures under high subscriber volume**
- Countermeasure: Batch sending with error isolation (log + continue on individual failures)
- Monitoring: Log notification count and timing for each event

**Risk: Russian translation accuracy**
- Countermeasure: Ensure all message keys are present, verify with native speaker if possible
- Quality check: Test with Russian language user in Phase 8

### Impact Scope Management

**Allowed Change Scope:**
- `libs/telegram/src/**` - All Telegram module files (handlers, listeners, services)
- `libs/db/src/services/transactions.service.ts` - Add analytics methods only
- `libs/db/src/services/transactions.service.spec.ts` - Add tests for analytics methods
- `libs/telegram/src/locales/**` - Add Russian translations
- `src/app.module.ts` - Wire TelegramModule
- `CLAUDE.md` - Update architecture documentation

**No-Change Areas:**
- `libs/blockchain/**` - Blockchain monitoring infrastructure (already complete)
- `libs/db/src/schema/**` - Database schema (no schema changes needed)
- `libs/db/src/services/subscriptions.service.ts` - Already has cancel() method (Phase 3 complete)
- `libs/db/src/services/users.service.ts` - No changes needed
- Core NestJS configuration files

## Task Breakdown Strategy

### Phase 4: Database Extensions (2 tasks)
- **Task 01**: Add `getMonthlySum()` to TransactionsService (1 file)
- **Task 02**: Add `getRollingAverage()` to TransactionsService (1 file)
- **Rationale**: Separated because each method has distinct logic and test cases; allows parallel work if needed

### Phase 5: Enhanced StartHandler (1 task)
- **Task 03**: Inject TransactionsService and display analytics in StartHandler (1 file modified)
- **Rationale**: Single logical change - enhance existing handler with analytics display

### Phase 6: SubscribeHandler (2 tasks)
- **Task 04**: Create SubscribeHandler with /subscribe and /unsubscribe commands (2 files: handler + test)
- **Task 05**: Wire callback actions in StartHandler and SubscribeHandler (2 files modified)
- **Rationale**: Separated to isolate command logic from button callback wiring; allows independent testing

### Phase 7: TransactionListener (1 task)
- **Task 06**: Create TransactionListener with notification logic (2 files: listener + test)
- **Rationale**: Single responsibility - handle transaction.new events and notify subscribers

### Phase 8: Module Integration and Russian Translations (2 tasks)
- **Task 07**: Wire all components in TelegramModule and AppModule (2 files modified)
- **Task 08**: Add Russian translations (1 file created: ru.ftl)
- **Rationale**: Separated because translation is independent work; integration must happen first

### Phase 9: Quality Assurance (1 task)
- **Task 09**: Run full test suite, verify acceptance criteria, update documentation (multiple verification steps)
- **Rationale**: Final verification phase with structured checklist from work plan

## Task Granularity Summary

| Task | Files Changed | Size | Verifiability Level |
|------|---------------|------|---------------------|
| 01: getMonthlySum | 2 (service + test) | Small | L2 (tests pass) |
| 02: getRollingAverage | 2 (service + test) | Small | L2 (tests pass) |
| 03: StartHandler + Analytics | 2 (handler + test) | Small | L1 (analytics visible) |
| 04: SubscribeHandler | 2 (handler + test) | Medium | L1 (commands work) |
| 05: Callback Actions | 2 (handler modifications) | Small | L1 (buttons work) |
| 06: TransactionListener | 2 (listener + test) | Medium | L1 (notifications sent) |
| 07: Module Wiring | 2 (modules) | Small | L1 (app starts) |
| 08: Russian Translations | 1 (ru.ftl) | Small | L1 (Russian text shown) |
| 09: Quality Assurance | 0 (verification only) | N/A | L1+L2+L3 (all criteria met) |

**Total: 9 tasks, 15 file changes**

All tasks meet the recommended granularity criteria (1-5 files per task).

## Execution Order Justification

**Sequential Dependencies:**
1. Tasks 01-02 (analytics methods) must complete before Task 03 (StartHandler enhancement)
2. Task 04 (SubscribeHandler) must complete before Task 05 (callback wiring)
3. Tasks 03-06 must complete before Task 07 (module wiring)
4. Task 07 must complete before Task 08 (translations - requires working bot)
5. Task 08 must complete before Task 09 (quality assurance - requires full implementation)

**Parallel Opportunities:**
- Tasks 01-02 can run in parallel (independent methods)
- Tasks 04 and 06 can run in parallel (independent components)

**Recommended Execution Order:**
1. Task 01, 02 (parallel) → Phase 4 complete
2. Task 03 → Phase 5 complete
3. Task 04, 06 (parallel) → Phase 6-7 partial
4. Task 05 → Phase 6 complete
5. Task 07 → Phase 8 partial
6. Task 08 → Phase 8 complete
7. Task 09 → Phase 9 complete, project complete

## Deliverable Path Mapping

| Phase | Deliverable | Path | Consumer Tasks |
|-------|-------------|------|----------------|
| 4 | getMonthlySum() | libs/db/src/services/transactions.service.ts | Task 03 |
| 4 | getRollingAverage() | libs/db/src/services/transactions.service.ts | Task 03 |
| 5 | Enhanced StartHandler | libs/telegram/src/handlers/start.handler.ts | Task 07 |
| 6 | SubscribeHandler | libs/telegram/src/handlers/subscribe.handler.ts | Task 05, 07 |
| 7 | TransactionListener | libs/telegram/src/listeners/transaction.listener.ts | Task 07 |
| 8 | TelegramModule wired | libs/telegram/src/telegram.module.ts | Task 08, 09 |
| 8 | Russian translations | libs/telegram/src/locales/ru.ftl | Task 09 |

## Integration Points and Verification

**Integration Point 1: StartHandler + TransactionsService**
- When: Task 03 completion
- Verification: /start command displays current month sum and 3-month rolling average
- E2E Test: Send /start, verify analytics section present with correct values

**Integration Point 2: SubscribeHandler + SubscriptionsService**
- When: Task 04 completion
- Verification: /subscribe and /unsubscribe commands work correctly
- E2E Test: Subscribe → verify status changes, unsubscribe → verify status changes

**Integration Point 3: Callback Actions Integration**
- When: Task 05 completion
- Verification: Inline buttons trigger correct subscription flows
- E2E Test: Click Subscribe button → verify subscribed, click Unsubscribe button → verify unsubscribed

**Integration Point 4: TransactionListener + TelegramService + SubscriptionsService**
- When: Task 06 completion
- Verification: transaction.new events trigger notifications to all active subscribers
- E2E Test: Emit transaction.new event → verify all subscribed users receive notification

**Integration Point 5: Full Application Integration**
- When: Task 07 completion
- Verification: Application starts without errors, all modules wired correctly
- E2E Test: Run `pnpm run start:dev` → verify bot starts, test full user flow

**Integration Point 6: Bilingual Support**
- When: Task 08 completion
- Verification: Russian users see Russian text, English users see English text
- E2E Test: Test with Russian language user → verify all messages in Russian

## Quality Gates

Each task must pass the following quality gates before proceeding:

1. **Code Quality**: `pnpm run lint` passes with zero errors
2. **Type Safety**: `pnpm run check` passes with zero type errors
3. **Unit Tests**: All new and existing tests pass
4. **Test Coverage**: New code achieves 80%+ coverage
5. **Manual Verification**: Operational verification procedures completed (per work plan)

Phase 9 (Quality Assurance) adds:
6. **Integration Tests**: All E2E flows verified
7. **Acceptance Criteria**: All 28 AC items verified
8. **Performance**: Response times meet targets (< 2s for /start, < 5s for notifications)

## Notes

- **TDD Approach**: All tasks should follow Red-Green-Refactor cycle (write failing test first)
- **Commit Granularity**: Each task = 1 commit (or 2 commits if test and implementation are separated)
- **Documentation Updates**: Task 09 includes CLAUDE.md updates to reflect new architecture
- **No Schema Changes**: All work is code-only; no database migrations needed
- **Event System**: TransactionListener uses existing `transaction.new` event from BlockchainModule (ADR-0001 pattern)
