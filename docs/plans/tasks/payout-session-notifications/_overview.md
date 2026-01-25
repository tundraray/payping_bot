# Overall Design Document: Payout Session Notifications

Generation Date: 2026-01-23
Target Plan Document: payout-session-notifications-plan.md

## Project Overview

### Purpose and Goals

Implement payout session notifications for PayPing bot to enable real-time detection and notification of salary payout sessions. Users will receive notifications when:
1. A payout session starts (first outgoing transaction detected)
2. Each individual outgoing transaction occurs during the session
3. The payout session ends (balance threshold or timeout)

### Background and Context

**Why this work is necessary:**
- Users currently receive notifications for incoming transactions only
- No visibility into outgoing payout activity
- No awareness of when salary disbursement begins or ends
- No grouped context for related payout transactions

**Business value:**
- Enhanced user engagement through comprehensive transaction visibility
- Real-time awareness of salary distribution activity
- Better understanding of wallet activity patterns
- Improved transparency for all wallet operations

## Task Division Design

### Division Policy

**Approach Selected:** Vertical Slice with Foundation First

**Rationale:**
- The feature has clear boundaries with minimal external dependencies
- TronGrid balance API is the foundational capability needed before session management
- State machine and event system can be implemented as cohesive units
- Notifications build on top of the event foundation
- Each phase delivers verifiable functionality

**Verifiability Level Distribution:**

| Phase | Primary Verification Level | Rationale |
|-------|---------------------------|-----------|
| Phase 1: Foundation | L3 (Build Success) | Configuration and types must compile correctly |
| Phase 2: Core Logic | L2 (Test Operation) | State machine logic verified through unit tests |
| Phase 3: Notifications | L3 (Build Success) | Localization and listeners are wiring tasks |
| Phase 4: Integration | L1 (Functional Operation) | Complete feature must work end-to-end |

### Inter-task Relationship Map

```
Phase 1: Foundation (L3 Verification)
├─ Task 01: Payout config → Deliverable: blockchain.config.ts additions
├─ Task 02: Event definitions → Deliverable: payout.events.ts (contracts)
├─ Task 03: Balance API → Deliverable: TronGridClient.getUSDTBalance()
└─ Task 04: Balance API tests → Deliverable: trongrid.client.spec.ts

↓ (Phase 1 complete → enables Phase 2)

Phase 2: Core Logic (L2 Verification)
├─ Task 05: PayoutSessionService → Deliverable: payout-session.service.ts (state machine)
│    └─ Depends on: Task 01 (config), Task 02 (events), Task 03 (balance API)
├─ Task 06: Timeout/balance check → Deliverable: @Interval checkTimeout() method
│    └─ Depends on: Task 05 (service), Task 03 (balance API)
├─ Task 07: TX event emission → Deliverable: emitTransactionEvent() method
│    └─ Depends on: Task 02 (events), Task 05 (service)
├─ Task 08: TransactionProcessor hook → Deliverable: integration point
│    └─ Depends on: Task 05 (service must exist)
└─ Task 09: Session service tests → Deliverable: payout-session.service.spec.ts
     └─ Depends on: Tasks 05-08 (all service methods)

↓ (Phase 2 complete → enables Phase 3)

Phase 3: Notifications (L3 Verification)
├─ Task 10: Localization strings → Deliverable: 3 FTL files updated
├─ Task 11: PayoutListener → Deliverable: payout.listener.ts
│    └─ Depends on: Task 02 (events), Task 10 (localization)
└─ Task 12: Listener tests → Deliverable: payout.listener.spec.ts
     └─ Depends on: Task 11 (listener)

↓ (Phase 3 complete → enables Phase 4)

Phase 4: Integration & Testing (L1 Verification)
├─ Task 13: Module registration → Deliverable: module providers updated
│    └─ Depends on: Task 05 (session service), Task 11 (listener)
├─ Task 14: Index exports → Deliverable: libs/blockchain/src/index.ts
│    └─ Depends on: Task 05 (service), Task 02 (events)
├─ Task 15: Integration tests → Deliverable: payout-session.int.test.ts
│    └─ Depends on: All previous tasks
├─ Task 16: E2E tests → Deliverable: payout-session.e2e.test.ts
│    └─ Depends on: All previous tasks
└─ Task 17: Final AC verification → Deliverable: Complete feature
     └─ Depends on: Tasks 15, 16
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|---------------------|-------------------|
| TransactionProcessorService | Add handleOutgoingTransaction() call | No (new call only) | Task 08 |
| TronGridClient | Add getUSDTBalance() | No (new method) | Task 03 |
| BlockchainModule providers | Add PayoutSessionService | No (new provider) | Task 13 |
| TelegramModule providers | Add PayoutListener | No (new provider) | Task 13 |
| Event system | Add 3 new payout events | No (new events) | Task 02 |

**No breaking changes required** - all changes are additive.

### Common Processing Points

**Shared Functionality:**
1. **Event emission pattern** (Tasks 05, 07):
   - Use existing EventEmitter2 pattern from TransactionProcessorService
   - Emit events with structured payloads
   - Fire-and-forget (no error propagation)

2. **Notification delivery pattern** (Task 11):
   - Use existing SubscriptionsService.getActiveSubscribers()
   - Use existing TelegramService.sendMessage() pattern
   - Individual failure handling (log and continue)

3. **Localization pattern** (Tasks 10, 11):
   - Use existing Fluent (.ftl) format
   - Language fallback to English
   - Variable interpolation pattern

4. **Unit test patterns** (Tasks 04, 09, 12):
   - Mock external dependencies (TronGrid API, EventEmitter, Telegram)
   - Use jest.useFakeTimers() for timeout testing
   - AAA pattern (Arrange-Act-Assert)

**Design Policy to Avoid Duplicate Implementation:**
- Reuse existing transaction detection logic in TransactionProcessorService
- Reuse existing notification delivery pattern from TransactionListener
- Reuse existing localization infrastructure
- Reuse existing event emission pattern

## Implementation Considerations

### Principles to Maintain Throughout

1. **State Machine Integrity**: Session state transitions must be atomic and protected by mutex
2. **Event-Driven Architecture**: All notifications driven by events, not direct coupling
3. **Fail-Fast with Graceful Degradation**: Balance check failures log but don't crash; notification failures don't block others
4. **Separation of Concerns**: Blockchain logic in @app/blockchain, notification logic in @app/telegram
5. **Test-Driven Development**: Write failing tests first, then implement (Red-Green-Refactor)
6. **Localization First**: All user-facing text must support en/ru/uk from day one

### Risks and Countermeasures

**Risk 1: Race condition in rapid transaction sequence (I002)**
- **Mitigation**: Use `async-mutex` library to wrap all state transitions
- **Implementation**: Task 05 (PayoutSessionService) includes mutex pattern
- **Verification**: Integration test with rapid sequential transactions

**Risk 2: TronGrid API rate limits (I001)**
- **Mitigation**: Balance checks occur only every 60 seconds, not per-transaction
- **Impact Assessment**: ~17% additional API usage (acceptable within free tier headroom)
- **Verification**: Monitor API usage in production logs

**Risk 3: State loss on service restart**
- **Mitigation**: Documented as acceptable per ADR-0004
- **Recovery**: Next outgoing transaction starts new session
- **Verification**: E2E test simulating service restart

**Risk 4: Notification delivery failures**
- **Mitigation**: Individual subscriber failures don't block others
- **Implementation**: Task 11 (PayoutListener) includes error handling loop
- **Verification**: E2E test with mocked Telegram API failures

**Risk 5: High notification volume during bulk payouts (50+ transactions)**
- **Mitigation**: Telegram rate limits respected (30 msg/sec)
- **Implementation**: Existing TelegramService handles rate limiting
- **Verification**: E2E test with 50-transaction session

### Impact Scope Management

**Allowed Change Scope:**
- `libs/blockchain/src/services/payout-session.service.ts` (new file)
- `libs/blockchain/src/events/payout.events.ts` (new file)
- `libs/blockchain/src/clients/trongrid.client.ts` (add method)
- `libs/blockchain/src/services/transaction-processor.service.ts` (add hook call)
- `libs/blockchain/src/config/blockchain.config.ts` (add config section)
- `libs/blockchain/src/blockchain.module.ts` (register service)
- `libs/telegram/src/listeners/payout.listener.ts` (new file)
- `libs/telegram/src/telegram.module.ts` (register listener)
- `libs/telegram/src/locales/*.ftl` (add 3 keys each)
- `libs/blockchain/src/index.ts` (add exports)

**No-Change Areas:**
- Existing transaction processing flow (except adding one call)
- Existing TransactionListener (incoming transaction notifications)
- Database schema (no persistence for payout sessions)
- Telegram bot handlers (no command changes)
- TRX transaction monitoring (USDT only for payout detection)

## Task Deliverables Summary

| Task | Deliverable Type | File Path | Verification |
|------|-----------------|-----------|--------------|
| 01 | Configuration | libs/blockchain/src/config/blockchain.config.ts | Build |
| 02 | Contracts | libs/blockchain/src/events/payout.events.ts | Build |
| 03 | API Method | libs/blockchain/src/clients/trongrid.client.ts | Build |
| 04 | Unit Tests | libs/blockchain/src/clients/__tests__/trongrid.client.spec.ts | Tests pass |
| 05 | Core Service | libs/blockchain/src/services/payout-session.service.ts | Build |
| 06 | Service Method | payout-session.service.ts (checkTimeout) | Build |
| 07 | Service Method | payout-session.service.ts (emitTransactionEvent) | Build |
| 08 | Integration | libs/blockchain/src/services/transaction-processor.service.ts | Build |
| 09 | Unit Tests | libs/blockchain/src/services/__tests__/payout-session.service.spec.ts | Tests pass |
| 10 | Localization | libs/telegram/src/locales/*.ftl (3 files) | Build |
| 11 | Listener | libs/telegram/src/listeners/payout.listener.ts | Build |
| 12 | Unit Tests | libs/telegram/src/listeners/__tests__/payout.listener.spec.ts | Tests pass |
| 13 | Wiring | Module files (2 files) | Build |
| 14 | Exports | libs/blockchain/src/index.ts | Build |
| 15 | Integration Tests | libs/blockchain/src/__tests__/payout-session.int.test.ts | Tests pass |
| 16 | E2E Tests | libs/blockchain/src/__tests__/payout-session.e2e.test.ts | Feature works |
| 17 | Quality Gate | All AC verified | All checks pass |

## Implementation Efficiency Notes

**Pre-identified Common Processing:**
1. Event emission uses EventEmitter2 (already in codebase)
2. Notification delivery uses SubscriptionsService + TelegramService (already in codebase)
3. Localization uses Fluent format (already in codebase)
4. Test infrastructure (mocks, fixtures) reuses existing patterns

**Impact Scope Clarification:**
- Direct impact: 11 files (6 new, 5 modified)
- Indirect impact: Transaction processing latency (1 additional async call per outgoing TX)
- No ripple effect: Incoming transaction notifications, database layer, bot commands

**Implementation Order Optimization:**
1. Foundation tasks (01-04) can run in parallel after config is done
2. Core logic tasks (05-09) must run sequentially (state machine dependencies)
3. Notification tasks (10-12) can run in parallel (independent of each other)
4. Integration tasks (13-17) must run sequentially (each depends on previous)

**Rework Prevention:**
- All event interfaces defined upfront (Task 02) before service implementation
- All configuration values defined upfront (Task 01) before service implementation
- Balance API tested in isolation (Task 04) before integration into service (Task 05)
- Unit tests for each component before integration tests
