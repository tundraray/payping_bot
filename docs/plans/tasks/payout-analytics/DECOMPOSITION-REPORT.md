# Task Decomposition Report: Payout Analytics

**Generation Date**: 2026-01-23
**Plan Document**: `docs/plans/payout-analytics-plan.md` v2.0
**Plan Directory**: `docs/plans/tasks/payout-analytics/`
**Overall Design Document**: `docs/plans/tasks/payout-analytics/_overview.md`
**Status**: COMPLETED

## Task Decomposition Complete

Plan Document: payout-analytics-plan.md
Plan Directory: docs/plans/tasks/payout-analytics/
Overall Design Document: docs/plans/tasks/payout-analytics/_overview.md
Number of Decomposed Tasks: 16 tasks + 4 phase completions = 20 total deliverables

## Overall Optimization Results

### Common Processing Identified

**Database Service Pattern**:
- All services follow consistent NestJS injectable pattern
- Constructor injection of dependencies
- Registration in DbModule providers
- Export from @app/db index.ts
- Applied consistently in Tasks 2.1, 2.2, 2.3

**Schema Export Pattern**:
- All schemas exported from schema/index.ts
- Consistent table definition structure with drizzle-orm
- Foreign keys and indexes defined in schema callback
- Applied consistently in Tasks 1.1, 1.2, 1.5

**Test Structure Pattern**:
- AAA (Arrange-Act-Assert) pattern
- Mock database dependencies using Drizzle mock utilities
- Test both success and error paths
- Applied in Tasks 2.4, 4.1, 4.2

### Impact Scope Management

**Allowed Changes** (Clearly Defined Boundaries):
- libs/db/src/schema/* (new schemas, index addition)
- libs/db/src/services/* (new services, transaction hook)
- libs/telegram/src/handlers/* (new handler)
- libs/telegram/src/locales/* (new keys)
- libs/telegram/src/types/* (new types)
- drizzle/migrations/* (new migration)

**Protected Areas** (No Changes):
- libs/blockchain/* (unchanged)
- Existing handlers: start.handler.ts, subscribe.handler.ts (unchanged)
- Core transaction schema (read-only access)
- Transaction listener (unchanged - analytics hook in DB layer)

### Implementation Order Optimization

**Critical Path Identified**:
```
Phase 1: Schema Foundation (Sequential)
  task-01 → task-02 → task-03 → task-04 → task-05

Phase 2: Service Layer (Sequential with Dependencies)
  task-06 → task-07 → task-08 → task-09

Phase 3: Presentation Layer (Sequential)
  task-10 → task-11 → task-12

Phase 4: Quality Assurance (Sequential)
  task-13 → task-14 → task-15 → task-16
```

**Parallelization Opportunities**:
- Within Phase 1: Tasks 1.1, 1.2, 1.3, 1.4 can be developed in parallel (independent schemas)
- Task 1.5 must wait for 1.1-1.4 (migration needs all schemas)
- Task 3.1 (localization) can start early once handler structure is clear
- Phase boundaries are strict (cannot overlap phases)

## Generated Task Files (20 total)

### Overall Design
- `_overview.md` - Comprehensive design document with task division rationale

### Phase 1: Database Schema Foundation (5 tasks)

1. **task-01.md** - Create recipient_wallets schema
   - Files: recipient-wallets.ts (create), schema/index.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 2 files - Small

2. **task-02.md** - Create monthly_positions schema
   - Files: monthly-positions.ts (create), schema/index.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 2 files - Small

3. **task-03.md** - Add fromAddress index to transactions
   - Files: transactions.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 1 file - Small

4. **task-04.md** - Create salary_history schema
   - Files: salary-history.ts (create), schema/index.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 2 files - Small

5. **task-05.md** - Generate and apply migration
   - Files: drizzle/migrations/*.sql (generate)
   - Verification: L3 (migration applies)
   - Scope: 1 file - Small

**Phase Completion**: `phase1-completion.md` - Database schema verification checklist

### Phase 2: Core Analytics Logic (4 tasks)

6. **task-06.md** - Create RecipientWalletsService
   - Files: recipient-wallets.service.ts (create), db.module.ts (modify), index.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 3 files - Small

7. **task-07.md** - Create ClassificationService
   - Files: classification.service.ts (create), db.module.ts (modify), index.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 3 files - Small

8. **task-08.md** - Update AnalyticsService for real-time processing
   - Files: analytics.service.ts (create), transactions.service.ts (modify), db.module.ts (modify), index.ts (modify)
   - Verification: L3 (build succeeds)
   - Scope: 4 files - Medium

9. **task-09.md** - Unit tests for services
   - Files: recipient-wallets.service.spec.ts, classification.service.spec.ts, analytics.service.spec.ts (create)
   - Verification: L2 (tests pass, 80%+ coverage)
   - Scope: 3 files - Medium

**Phase Completion**: `phase2-completion.md` - Service layer verification checklist

### Phase 3: Telegram Integration (3 tasks)

10. **task-10.md** - Add localization strings
    - Files: en.ftl, ru.ftl, uk.ftl (modify)
    - Verification: L3 (build succeeds)
    - Scope: 3 files - Medium

11. **task-11.md** - Create AnalyticsHandler with separate messages
    - Files: analytics.handler.ts, analytics.handler.spec.ts (create), telegram.module.ts (modify)
    - Verification: L2 (tests pass)
    - Scope: 3 files - Medium

12. **task-12.md** - Add type definitions
    - Files: telegram.types.ts (modify)
    - Verification: L3 (build succeeds)
    - Scope: 1 file - Small

**Phase Completion**: `phase3-completion.md` - Telegram integration verification checklist

### Phase 4: Testing & QA (4 tasks)

13. **task-13.md** - Integration tests
    - Files: analytics.int.test.ts (create)
    - Verification: L2 (tests pass)
    - Scope: 1 file - Small

14. **task-14.md** - E2E tests
    - Files: analytics.e2e.test.ts (create)
    - Verification: L1 (functional operation)
    - Scope: 1 file - Small

15. **task-15.md** - Performance benchmark tests
    - Files: Performance metrics documentation
    - Verification: L2 (benchmarks pass)
    - Scope: Measurement task

16. **task-16.md** - Final AC verification
    - Files: N/A (verification checklist)
    - Verification: L1 (all ACs verified, manual E2E)
    - Scope: Quality gate

**Phase Completion**: `phase4-completion.md` - Final feature completion verification

## Task Size Distribution

| Size | Count | Percentage | Tasks |
|------|-------|------------|-------|
| Small (1-2 files) | 10 | 62.5% | 01, 02, 03, 04, 05, 06, 07, 12, 13, 14 |
| Medium (3-5 files) | 6 | 37.5% | 08, 09, 10, 11 |
| Large (6+ files) | 0 | 0% | None |

**Granularity Assessment**: All tasks within acceptable limits (1-5 files). No splitting required. Cognitive load remains manageable for all tasks.

## Execution Order

### Recommended Sequential Order

**Must follow this order (dependencies enforced)**:

```
Phase 1: Database Schema Foundation
  01 → 02 → 03 → 04 → 05 → phase1-completion

Phase 2: Core Analytics Logic
  06 → 07 → 08 → 09 → phase2-completion

Phase 3: Telegram Integration
  10 → 11 → 12 → phase3-completion

Phase 4: Testing & QA
  13 → 14 → 15 → 16 → phase4-completion
```

### Inter-Phase Dependencies

- Phase 2 MUST NOT start until Phase 1 completion verified
- Phase 3 MUST NOT start until Phase 2 completion verified
- Phase 4 MUST NOT start until Phase 3 completion verified

### Reasoning

1. **Phase 1**: All schemas must exist before services can be implemented
2. **Phase 2**: RecipientWalletsService → ClassificationService → AnalyticsService (strict dependency chain)
3. **Phase 3**: Services must be working before handlers can use them
4. **Phase 4**: Full feature must be implemented before integration/E2E testing

## Design Consistency Verification

### Pattern Compliance Checklist

- [x] All services follow NestJS injectable pattern
- [x] All schemas use Drizzle ORM primitives consistently
- [x] All services registered in DbModule providers array
- [x] All services exported from @app/db index.ts
- [x] All schemas exported from schema/index.ts
- [x] Classification algorithm follows ADR-0003 v2.0 specification
- [x] Position calculation follows "within classification group" principle (not global)
- [x] Separate messages per classification group (not single combined message)
- [x] Real-time processing on transaction insert (not on-demand)

### Interface Change Validation

| Existing Interface | New Interface | Conversion | Task | Validated |
|-------------------|---------------|------------|------|-----------|
| TransactionsService.saveTransaction() | Add analytics hook | Yes | 2.3 | ✓ |
| DbModule providers | Add 3 services | Yes | 2.1, 2.2, 2.3 | ✓ |
| TelegramModule providers | Add AnalyticsHandler | Yes | 3.2 | ✓ |
| schema/index.ts | Export 3 schemas | Yes | 1.1, 1.2, 1.5 | ✓ |
| locales/*.ftl | Add analytics keys | Yes | 3.1 | ✓ |
| telegram.types.ts | Add analytics types | Yes | 3.3 | ✓ |

**No Breaking Changes**: All modifications are additive (new tables, new services, new handler).

## Verification Strategy by Phase

**Phase 1**: L3 verification (build succeeds, migration applies)
- Each schema task verifies build succeeds
- Final migration task verifies database tables created
- Phase completion verifies all tables/indexes/enums exist

**Phase 2**: L2 → L3 (tests pass, then build succeeds)
- Service tasks verify build succeeds (L3)
- Unit test task verifies tests pass with 80%+ coverage (L2)
- Phase completion verifies services registered and tests passing

**Phase 3**: L2 → L3 (tests pass, then build succeeds)
- Localization task verifies build succeeds (L3)
- Handler task verifies tests pass (L2)
- Types task verifies build succeeds (L3)
- Phase completion verifies handler responds to commands

**Phase 4**: L1 + L2 (E2E functional + integration tests)
- Integration tests verify data flow (L2)
- E2E tests verify user-facing functionality (L1)
- Performance tests verify requirements met (L2)
- Final verification verifies all ACs (L1 manual E2E)

## Risk Mitigation Coverage

| Risk | Impact | Mitigation Task | Status |
|------|--------|----------------|--------|
| Transaction insert latency > 200ms | High | Task 4.3 (performance benchmark) | Covered |
| Classification accuracy < 90% | Medium | Task 2.4 (comprehensive unit tests) | Covered |
| Salary change false positives | Medium | Task 2.2 (2-month confirmation, 5% threshold) | Covered |
| Multiple message timing issues | Low | Task 3.2 (sequential sending with delays) | Covered |
| Large recipient count (>100) | Medium | MVP limitation: first 20 per group with "more" indicator | Documented |
| i18n key missing | Low | Task 3.1 (build-time validation) | Covered |
| Drizzle migration issues | Medium | Task 1.4 (test on dev first) | Covered |

## Task Decomposition Checklist

- [x] Previous task deliverable paths specified in subsequent tasks
- [x] Deliverable filenames specified for all tasks
- [x] Common processing identification and shared design documented
- [x] Task dependencies and execution order clarified
- [x] Impact scope and boundaries defined for each task
- [x] Appropriate granularity (1-5 files per task)
- [x] Clear completion criteria for each task (AC mapping)
- [x] Overall design document created
- [x] Implementation efficiency optimized (patterns identified, impact clarified)

## Feature Deliverables Summary

### New Database Tables (3)
- `recipient_wallets` - Recipient tracking with classification and salary fields
- `monthly_positions` - Position cache per recipient per month
- `salary_history` - Salary change audit trail

### New Services (3)
- RecipientWalletsService - Wallet CRUD operations
- ClassificationService - Automatic classification algorithm
- AnalyticsService - Real-time processing and analytics retrieval

### New Telegram Components (1)
- AnalyticsHandler - /analytics and /rating command handling

### Localization (3 languages)
- English, Russian, Ukrainian message keys

### Test Coverage
- Unit tests (80%+ coverage)
- Integration tests (data flow verification)
- E2E tests (user-facing functionality)
- Performance benchmarks (<3s response, <200ms insert overhead)

## Next Steps

1. Review overall design document (`_overview.md`)
2. Begin Phase 1 execution with Task 1.1
3. Follow sequential order strictly (respect dependencies)
4. Complete phase completion verification before moving to next phase
5. Track progress in work plan progress table

## Document References

- **Source Plan**: docs/plans/payout-analytics-plan.md v2.0
- **Design Doc**: docs/design/payout-analytics-design.md v2.0
- **ADR**: docs/adr/003-payout-analytics-architecture.md v2.0
- **PRD**: docs/prd/payout-analytics-prd.md v2.0
- **Overall Design**: docs/plans/tasks/payout-analytics/_overview.md

---

**Report Status**: COMPLETE
**Total Task Files**: 20 (16 tasks + 4 phase completions)
**Total Deliverables**: 22 files (includes _overview.md and this report)
**Generation Date**: 2026-01-23
**Ready for Execution**: YES
