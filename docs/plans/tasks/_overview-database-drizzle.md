# Overall Design Document: Database Drizzle ORM Implementation

Generation Date: 2026-01-22
Target Plan Document: database-drizzle-work-plan.md

## Project Overview

### Purpose and Goals

Implement PostgreSQL database access using Drizzle ORM to replace stub DbService with functional domain-specific services. This enables:
- Persistent transaction storage for deduplication (critical for blockchain monitoring)
- User management for Telegram bot subscriptions
- Subscription tracking with expiration dates
- Payment history recording for Telegram Stars transactions

### Background and Context

The current `DbService` contains only stub implementations returning null/void. The blockchain monitoring module requires real database persistence for transaction deduplication, and future Telegram features need user/subscription/payment management. This implementation adopts the Repository Pattern with separate domain services as recommended by ADR-0002.

## Task Division Design

### Division Policy

Tasks are divided using **Horizontal Slice (Foundation-driven)** approach for the following reasons:
- Database layer is foundational infrastructure that multiple features depend upon
- All domain services require the same schema and connection management
- Layer-by-layer implementation enables verification at each stage
- Minimizes risk by establishing stable foundation before building services

**Verifiability Level Distribution**:
- Foundation/Schema tasks (Phases 1-3): L3 (Build Success) - infrastructure setup
- Service implementation tasks (Phase 4): L2 (Test Operation) - TDD with integration tests
- Integration tasks (Phases 5-6): L2 (Test Operation) - verify service wiring
- Quality assurance (Phase 7): L1 (Functional Operation) - E2E user-facing verification

### Inter-task Relationship Map

```
Phase 1: Foundation Setup
  Task 01: Package installation → No deliverable (package.json, lockfile)
  Task 02: Configuration files → Deliverable: drizzle.config.ts, db.config.ts, .env.example
    ↓
Phase 2: Schema Definitions
  Task 03: Schema files (transactions, users, subscriptions, payments, relations) → Deliverable: libs/db/src/schema/*.ts
  Task 04: DTO types → Deliverable: libs/db/src/types/dto.ts
    ↓
Phase 3: Database Providers
  Task 05: DatabaseProvider implementation → Deliverable: libs/db/src/database.provider.ts
  Task 06: Generate migrations → Deliverable: drizzle/*.sql
    ↓
Phase 4: Domain Services Implementation (parallel after Task 06)
  Task 07: TransactionsService + integration tests → Deliverable: libs/db/src/services/transactions.service.ts
  Task 08: UsersService + integration tests → Deliverable: libs/db/src/services/users.service.ts
  Task 09: SubscriptionsService + integration tests → Deliverable: libs/db/src/services/subscriptions.service.ts
  Task 10: PaymentsService + integration tests → Deliverable: libs/db/src/services/payments.service.ts
    ↓
Phase 5: DbModule Integration
  Task 11: Wire all providers and services in DbModule → Updates: libs/db/src/db.module.ts, index.ts
    ↓
Phase 6: Blockchain Module Migration (Breaking Change)
  Task 12: Update DeduplicationService → Updates: libs/blockchain/src/services/deduplication.service.ts
  Task 13: Update TransactionPollerService and cleanup → Updates: transaction-poller.service.ts, deletes DbService
    ↓
Phase 7: Quality Assurance
  Task 14: E2E tests and final quality gate → Deliverable: E2E test file, verification report

Phase Completion Tasks (auto-generated):
  - Task 15: Phase 1 Completion Verification
  - Task 16: Phase 2 Completion Verification
  - Task 17: Phase 3 Completion Verification
  - Task 18: Phase 4 Completion Verification
  - Task 19: Phase 5 Completion Verification
  - Task 20: Phase 6 Completion Verification
  - Task 21: Phase 7 Completion Verification (Final)
```

### Interface Change Impact Analysis

| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|-------------------|-------------------|
| DbService (stub) | TransactionsService (real) | Yes - import and method names | Task 12, 13 |
| findTransactionByHash(hash) | findByHash(hash) | Yes - method rename | Task 12 |
| saveTransaction(tx) | save(tx) | Yes - method rename | Task 12 |
| getLastTransactionTimestamp() | getLastTimestamp() | Yes - method rename | Task 13 |
| getMonitoredWalletAddress() | getMonitoredWalletAddress() | No - same name | Task 13 |
| N/A (new) | UsersService | No - new service | Task 08 |
| N/A (new) | SubscriptionsService | No - new service | Task 09 |
| N/A (new) | PaymentsService | No - new service | Task 10 |

### Common Processing Points

**Shared Infrastructure**:
- DatabaseProvider with useFactory pattern (Task 05) - used by all domain services
- Schema definitions (Task 03) - used by migrations and all services
- Migration execution logic (Task 06) - runs once on startup
- DRIZZLE token injection (Task 05) - standard pattern for all services

**Design Policy to Avoid Duplicate Implementation**:
- Single DatabaseProvider creates connection pool (not per-service)
- Single migration execution on startup (separate max:1 client)
- Shared schema imports via libs/db/src/schema/index.ts
- Common error handling pattern: fail-fast with context logging

## Implementation Considerations

### Principles to Maintain Throughout

1. **Fail-Fast Error Handling**: Infrastructure layer always throws errors upward with full context
2. **Repository Pattern**: One service per domain table, injected via DRIZZLE token
3. **TDD Cycle**: All service implementations follow Red-Green-Refactor
4. **Migration Safety**: Migrations validated in CI before deployment
5. **Connection Lifecycle**: Graceful shutdown closes all connections cleanly
6. **Test Isolation**: Each test creates its own data, no shared state
7. **Single Responsibility**: Each task implements 1-5 files maximum

### Risks and Countermeasures

**Risk 1: Migration execution failures on startup blocking application**
- Impact: High (application cannot start)
- Countermeasure:
  - Validate migrations in CI before deployment (Task 06)
  - Test migrations against fresh database in Task 14
  - Implement rollback procedures documented in plan
  - Use separate max:1 client to prevent race conditions

**Risk 2: Connection pool exhaustion under high transaction volume**
- Impact: Medium (query timeouts)
- Countermeasure:
  - Configure appropriate pool size in db.config.ts (Task 02)
  - Monitor pool metrics in production
  - Add connection timeout logging in DatabaseProvider (Task 05)

**Risk 3: Service method signature changes breaking blockchain module**
- Impact: High (compilation errors)
- Countermeasure:
  - Update blockchain module in same phase (Tasks 12-13)
  - Run full test suite before proceeding to Phase 7
  - Document breaking changes in task files

**Risk 4: Test database configuration complexity**
- Impact: Medium (integration tests may fail)
- Countermeasure:
  - Document test database setup in each service task (Tasks 07-10)
  - Use docker-compose for consistent test environment
  - Provide DATABASE_URL example for local PostgreSQL

### Impact Scope Management

**Allowed Change Scope**:
- All files under `libs/db/src/` (new implementation)
- `drizzle.config.ts` at project root (new file)
- `drizzle/` directory for migrations (new directory)
- `.env.example` for environment variable documentation
- Blockchain module services: `DeduplicationService`, `TransactionPollerService` (method updates)
- `package.json` and `pnpm-lock.yaml` (dependency additions)

**No-Change Areas** (must not be touched):
- Transaction interface definition in `@app/blockchain` (already exists)
- Blockchain module polling logic (only imports change)
- TronGridClient implementation
- TransactionProcessorService
- LRU cache logic
- TelegramService (future work, out of scope)

## Task Size Distribution

| Phase | Task Count | Files per Task | Rationale |
|-------|-----------|----------------|-----------|
| Phase 1 | 2 | 1-3 files | Foundation setup, config files |
| Phase 2 | 2 | 4-5 files | Schema definitions grouped by domain |
| Phase 3 | 2 | 1 file | Provider and migrations |
| Phase 4 | 4 | 2 files | One service + tests per task |
| Phase 5 | 1 | 2 files | Module and index updates |
| Phase 6 | 2 | 2-3 files | Blockchain integration + cleanup |
| Phase 7 | 1 | 1 file | E2E tests |
| Completion | 7 | N/A | Phase verification tasks |

**Total: 21 tasks** (14 implementation + 7 phase completion)

All tasks meet size criteria (1-5 files per task, no task exceeds Medium size).

## Implementation Order Optimization

**Sequential Dependencies** (must be executed in order):
1. Package installation (Task 01) → Everything depends on Drizzle packages
2. Configuration (Task 02) → DatabaseProvider needs config
3. Schema definitions (Tasks 03-04) → Migrations and services need schema
4. DatabaseProvider (Task 05) → Services need DRIZZLE token
5. Migration generation (Task 06) → Database must have tables

**Parallel Opportunities** (can be executed concurrently):
- After Task 06, Tasks 07-10 (all domain services) can be implemented in parallel
- Each service has no dependency on other services
- Separate integration test files prevent conflicts

**Execution Order Benefits**:
- Foundation-first minimizes rework
- Early verification of infrastructure before building services
- Parallel service implementation accelerates Phase 4
- Breaking change (Phase 6) isolated at the end before final QA

## Next Steps

1. Execute tasks in numerical order (Task 01 → Task 21)
2. Complete each phase before proceeding to next
3. Run phase completion verification after each phase
4. Do not skip tasks or change order (dependencies must be respected)
5. Each task follows TDD cycle: Red → Green → Refactor
6. Verify deliverables are created as specified in task files
7. Update progress tracking in work plan as tasks complete

## Success Criteria

Implementation is complete when:
- [ ] All 14 implementation tasks completed and tested
- [ ] All 7 phase completion verifications passed
- [ ] 17 total tests passing (12 integration + 5 E2E)
- [ ] All acceptance criteria (AC-1.1 through AC-12.2) verified
- [ ] Zero lint/format errors (`pnpm run check`)
- [ ] Build succeeds (`pnpm run build`)
- [ ] Coverage >= 80% (`pnpm run test:cov`)
- [ ] Blockchain module successfully migrated to new services
- [ ] E2E operational verification procedures completed
- [ ] Documentation updated (.env.example, CLAUDE.md if needed)
