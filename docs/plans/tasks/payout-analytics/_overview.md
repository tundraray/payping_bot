# Overall Design Document: Payout Analytics

Generation Date: 2026-01-23
Target Plan Document: payout-analytics-plan.md

## Project Overview

### Purpose and Goals

Implement a comprehensive payout analytics feature for PayPing bot that provides:
- Real-time classification of recipient wallets based on payment patterns
- Automatic salary change detection for employees
- Employment status tracking (fired/rehired detection)
- Telegram commands `/analytics` and `/rating` displaying recipient rankings in separate messages per classification
- Month-over-month position comparison with inline navigation

### Background and Context

Finance teams and business owners need visibility into outgoing payment patterns. The feature processes transactions in real-time (on insert) to maintain up-to-date analytics data, eliminating calculation delays on user commands.

**Key Innovation**: Real-time processing architecture where analytics data is updated immediately when transactions are saved, providing instant `/analytics` command responses.

## Task Division Design

### Division Policy

**Hybrid Approach**: Foundation-driven for database and services (Phase 1-2), then vertical slice for Telegram integration (Phase 3).

**Rationale**:
- Database schema must exist before any services can be implemented (foundation-first)
- Service layer has clear dependencies: RecipientWalletsService → ClassificationService → AnalyticsService
- Telegram handlers can be implemented as a vertical slice once core services are ready
- Quality assurance phase verifies complete integration

**Verifiability Level Distribution**:
- Phase 1 (Schema): L3 (build succeeds, migration applies)
- Phase 2 (Services): L2 (unit tests pass) → L3 (build succeeds)
- Phase 3 (Telegram): L2 (unit tests pass) → L3 (build succeeds)
- Phase 4 (QA): L1 (E2E functional operation) + L2 (integration tests)

### Inter-task Relationship Map

```
Phase 1: Database Schema Foundation
Task 1.1: recipient_wallets schema → Deliverable: libs/db/src/schema/recipient-wallets.ts
  ↓
Task 1.2: monthly_positions schema → Deliverable: libs/db/src/schema/monthly-positions.ts
  ↓
Task 1.3: fromAddress index → Deliverable: libs/db/src/schema/transactions.ts (modified)
  ↓
Task 1.5: salary_history schema → Deliverable: libs/db/src/schema/salary-history.ts
  ↓
Task 1.4: Migration generation → Deliverable: drizzle/migrations/*.sql
  ↓ (all schemas must exist before services)

Phase 2: Core Analytics Logic
Task 2.1: RecipientWalletsService → Deliverable: libs/db/src/services/recipient-wallets.service.ts
  ↓ (referenced by ClassificationService)
Task 2.2: ClassificationService → Deliverable: libs/db/src/services/classification.service.ts
  ↓ (referenced by AnalyticsService)
Task 2.3: AnalyticsService → Deliverable: libs/db/src/services/analytics.service.ts
  ↓
Task 2.4: Unit tests for all services → Deliverable: libs/db/src/services/__tests__/*.spec.ts
  ↓ (services must work before handlers can use them)

Phase 3: Telegram Integration
Task 3.1: Localization strings → Deliverable: libs/telegram/src/locales/*.ftl (modified)
  ↓ (parallel with handler implementation)
Task 3.2: AnalyticsHandler → Deliverable: libs/telegram/src/handlers/analytics.handler.ts
  ↓
Task 3.3: Type definitions → Deliverable: libs/telegram/src/types/telegram.types.ts (modified)
  ↓ (all Telegram components ready)

Phase 4: Testing & QA
Task 4.1: Integration tests → Deliverable: libs/db/src/__tests__/analytics.int.test.ts
  ↓
Task 4.2: E2E tests → Deliverable: libs/telegram/src/__tests__/analytics.e2e.test.ts
  ↓
Task 4.3: Performance benchmark → Deliverable: Documented performance metrics
  ↓
Task 4.4: Final AC verification → Deliverable: All ACs verified, feature complete
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|-------------------|-------------------|
| TransactionsService.saveTransaction() | Add analytics hook call | Yes (add hook) | Task 2.3 |
| db.module.ts providers | Add 3 new services | Yes (registration) | Tasks 2.1, 2.2, 2.3 |
| telegram.module.ts providers | Add AnalyticsHandler | Yes (registration) | Task 3.2 |
| schema/index.ts exports | Add 3 new schemas | Yes (exports) | Tasks 1.1, 1.2, 1.5 |
| locales/*.ftl | Add analytics keys | Yes (new keys) | Task 3.1 |
| telegram.types.ts | Add analytics types | Yes (new types) | Task 3.3 |

**Critical Path**: Schema (Task 1.4) → RecipientWalletsService (Task 2.1) → ClassificationService (Task 2.2) → AnalyticsService (Task 2.3) → AnalyticsHandler (Task 3.2)

### Common Processing Points

**Database Services Pattern**:
- All services (RecipientWalletsService, ClassificationService, AnalyticsService) follow the same pattern:
  - Injectable NestJS service
  - Constructor injection of dependencies
  - Registered in DbModule providers array
  - Exported from @app/db index.ts
- **Design Policy**: Implement this pattern consistently in Tasks 2.1, 2.2, 2.3

**Schema Export Pattern**:
- All schema files follow the same pattern:
  - Define table with drizzle-orm primitives
  - Export table and enum definitions
  - Add to schema/index.ts exports
- **Design Policy**: Implement this pattern consistently in Tasks 1.1, 1.2, 1.5

**Test Structure Pattern**:
- All service tests follow AAA pattern (Arrange-Act-Assert)
- Mock database dependencies using Drizzle mock utilities
- Test both success and error paths
- **Design Policy**: Apply consistently in Tasks 2.4, 4.1, 4.2

## Implementation Considerations

### Principles to Maintain Throughout

1. **Real-time Processing**: All analytics processing happens on transaction insert, not on-demand
2. **Automatic Classification**: No manual classification - algorithm evaluates patterns automatically
3. **TDD Approach**: Write failing tests first, implement minimal code to pass, refactor
4. **Service Separation**: AnalyticsService, ClassificationService, RecipientWalletsService have distinct responsibilities
5. **Separate Messages**: Display analytics in separate Telegram messages per classification group
6. **Position Within Group**: Position numbers are within classification group, not global

### Risks and Countermeasures

**Risk: Transaction insert latency exceeds 200ms with analytics processing**
- Countermeasure: Performance test in Task 4.3; optimize queries with indexes from Task 1.3
- Kill Criteria: If latency consistently exceeds 200ms, consider async processing

**Risk: Classification algorithm accuracy below 90%**
- Countermeasure: Comprehensive test cases in Task 2.4 covering edge cases
- Mitigation: Log edge cases for tuning thresholds based on real data

**Risk: Salary change false positives**
- Countermeasure: Require 2-month confirmation in ClassificationService (Task 2.2)
- Mitigation: 5% tolerance threshold for "same salary" detection

**Risk: Multiple messages display timing issues**
- Countermeasure: Send messages sequentially in Task 3.2
- Mitigation: Small delay between messages if needed

**Risk: Large recipient count (>100) causes performance degradation**
- Countermeasure: Performance benchmark in Task 4.3
- MVP Limitation: Display limited to first 20 per group with "more" indicator

### Impact Scope Management

**Allowed Change Scope**:
- libs/db/src/schema/* (new schemas, index addition)
- libs/db/src/services/* (new services, transaction hook)
- libs/telegram/src/handlers/* (new handler)
- libs/telegram/src/locales/* (new keys)
- libs/telegram/src/types/* (new types)
- drizzle/migrations/* (new migration)

**No-Change Areas**:
- libs/blockchain/* (unchanged)
- libs/telegram/src/handlers/start.handler.ts (unchanged)
- libs/telegram/src/handlers/subscribe.handler.ts (unchanged)
- libs/telegram/src/listeners/transaction.listener.ts (unchanged)
- Core transaction schema (read-only access)

**Boundary Clarification**:
- AnalyticsService reads from transactions table but NEVER modifies it
- TransactionsService adds a hook to call AnalyticsService but core save logic unchanged
- Handler pattern follows existing StartHandler and SubscribeHandler patterns

## Design Decisions from ADR and Design Doc

### From ADR-0003 v2.0

**Core Decision**: Real-time processing on transaction insert
- **Why**: Instant `/analytics` response, zero calculation delay
- **Trade-off**: Slightly higher transaction insert latency (acceptable given low volume)

**Classification Approach**: Automatic algorithm with no manual override
- **Why**: Reduces admin workload, consistent pattern detection
- **Trade-off**: Edge cases may require algorithm tuning

**Salary Tracking**: 2-month confirmation for salary changes
- **Why**: Reduces false positives from one-time payment fluctuations
- **Tolerance**: 5% threshold for "same salary" detection

### From Design Doc v2.0

**Separate Messages Strategy**: One message per classification group
- **Why**: Better user experience, easier navigation by type
- **Implementation**: Send Employees → Freelancers → One-time → Unknown → Fired (if any)
- **Empty Groups**: Skip message if classification has no recipients

**Position Calculation**: Position is within classification group, not global
- **Why**: Users care about position relative to same type (employee #1, not global #1)
- **Determinism**: Timestamp ASC, then hash ASC for ties

**Cache Strategy**: monthly_positions table pre-stores calculated positions
- **Why**: Instant query response, no window function on read
- **Write-through**: Updated on every transaction insert

## Task Size Analysis

| Phase | Task | Files Modified | Size | Rationale |
|-------|------|---------------|------|-----------|
| 1 | 1.1 | 2 | Small | New schema + export |
| 1 | 1.2 | 2 | Small | New schema + export |
| 1 | 1.3 | 1 | Small | Index addition only |
| 1 | 1.5 | 2 | Small | New schema + export |
| 1 | 1.4 | 1 | Small | Migration generation |
| 2 | 2.1 | 3 | Small | Service + registration + export |
| 2 | 2.2 | 3 | Small | Service + registration + export |
| 2 | 2.3 | 4 | Medium | Service + registration + export + hook |
| 2 | 2.4 | 3 | Medium | Tests for 3 services |
| 3 | 3.1 | 3 | Medium | 3 locale files |
| 3 | 3.2 | 3 | Medium | Handler + test + registration |
| 3 | 3.3 | 1 | Small | Type additions |
| 4 | 4.1 | 1 | Small | Integration test file |
| 4 | 4.2 | 1 | Small | E2E test file |
| 4 | 4.3 | 0 | Small | Benchmark execution |
| 4 | 4.4 | 0 | Small | Verification checklist |

**Granularity Assessment**: All tasks are within 1-5 files. Phase 2 and 3 have a few Medium (3-4 files) tasks, which is acceptable given cognitive load remains manageable.

## Testing Strategy by Phase

**Phase 1 (Schema)**: L3 verification
- Build succeeds after each schema addition
- Migration generates and applies successfully

**Phase 2 (Services)**: L2 verification
- Unit tests written and passing for each service
- Coverage target: 80% minimum
- Classification algorithm tests cover all 4 types + transitions

**Phase 3 (Telegram)**: L2 verification
- Handler unit tests with mocked services
- Localization keys validated (all 3 locales)
- Separate message logic tested

**Phase 4 (QA)**: L1 + L2 verification
- Integration tests: Real database, verify data flow
- E2E tests: Real bot interaction, all classification groups
- Performance tests: <200ms insert overhead, <3s command response
- Manual E2E: Full user journey verification

## Common Pitfalls to Avoid

1. **Schema Dependency Violations**: Do not implement services before Task 1.4 (migration) completes
2. **Service Dependency Violations**: Do not implement AnalyticsService (Task 2.3) before ClassificationService (Task 2.2)
3. **Missing Exports**: Always update index.ts files when adding new schemas/services
4. **Inconsistent Classification**: Follow classification algorithm exactly as defined in ADR-0003
5. **Global Position Calculation**: Position MUST be within classification group, not global
6. **Single Message Display**: Must send separate messages per classification, not one combined message
7. **Skipping Tests**: Do not skip unit tests in Phase 2; they verify core logic before integration

## Deliverable Checklist

Phase 1:
- [ ] recipient_wallets.ts schema with all fields
- [ ] monthly_positions.ts schema with classification column
- [ ] salary_history.ts schema
- [ ] fromAddress index on transactions
- [ ] Migration file generated and applied

Phase 2:
- [ ] RecipientWalletsService with all CRUD methods
- [ ] ClassificationService with algorithm implementation
- [ ] AnalyticsService with real-time processing
- [ ] Unit tests for all services (80%+ coverage)

Phase 3:
- [ ] Localization keys in en.ftl, ru.ftl, uk.ftl
- [ ] AnalyticsHandler with separate message logic
- [ ] Type definitions for analytics

Phase 4:
- [ ] Integration tests passing
- [ ] E2E tests passing
- [ ] Performance benchmarks documented
- [ ] All ACs verified

## References

- Source Plan: docs/plans/payout-analytics-plan.md v2.0
- Design Doc: docs/design/payout-analytics-design.md v2.0
- ADR: docs/adr/003-payout-analytics-architecture.md v2.0
- PRD: docs/prd/payout-analytics-prd.md v2.0
