# Work Plan: Database Drizzle ORM Implementation

Created Date: 2026-01-22
Type: feature
Estimated Duration: 3-4 days
Estimated Impact: 18 files (10 new, 5 modified, 3 deleted)
Related Issue/PR: N/A

## Related Documents
- Design Doc: [docs/design/database-drizzle-design.md](../design/database-drizzle-design.md)
- ADR: [docs/adr/ADR-0002-drizzle-orm-database-access.md](../adr/ADR-0002-drizzle-orm-database-access.md)

## Objective

Implement PostgreSQL database access using Drizzle ORM to replace the current stub DbService with functional domain-specific services (TransactionsService, UsersService, SubscriptionsService, PaymentsService). This enables persistent storage for transaction deduplication, user management, subscription tracking, and payment history.

## Background

The current `DbService` contains only stub implementations returning null/void. The blockchain monitoring module requires real database persistence for:
- Transaction deduplication (critical for preventing duplicate notifications)
- Wallet address configuration
- Timestamp tracking for polling continuity

Future Telegram module features will require:
- User management
- Subscription tracking
- Payment history

## Phase Structure Diagram

```mermaid
graph TB
    subgraph "Phase 1: Foundation"
        P1A[Package Installation]
        P1B[Database Config]
        P1C[drizzle.config.ts]
    end

    subgraph "Phase 2: Schema"
        P2A[Schema Definitions]
        P2B[Relations]
        P2C[DTO Types]
    end

    subgraph "Phase 3: Infrastructure"
        P3A[SqlClientProvider]
        P3B[DatabaseProvider]
        P3C[Migration Setup]
    end

    subgraph "Phase 4: Services"
        P4A[TransactionsService]
        P4B[UsersService]
        P4C[SubscriptionsService]
        P4D[PaymentsService]
    end

    subgraph "Phase 5: Integration"
        P5A[DbModule Updates]
        P5B[Index Exports]
    end

    subgraph "Phase 6: Blockchain Migration"
        P6A[DeduplicationService Update]
        P6B[TransactionPollerService Update]
        P6C[Remove DbService]
    end

    subgraph "Phase 7: Quality Assurance"
        P7A[E2E Tests]
        P7B[Final Quality Gate]
    end

    P1A --> P1B --> P1C --> P2A
    P2A --> P2B --> P2C --> P3A
    P3A --> P3B --> P3C --> P4A
    P4A --> P4B --> P4C --> P4D --> P5A
    P5A --> P5B --> P6A
    P6A --> P6B --> P6C --> P7A
    P7A --> P7B
```

## Task Dependency Diagram

```mermaid
graph LR
    subgraph "Foundation Layer"
        PKG[drizzle-orm, postgres]
        CFG[db.config.ts]
        DRZ[drizzle.config.ts]
    end

    subgraph "Schema Layer"
        SCH[Schema Files]
        REL[Relations]
        DTO[DTO Types]
    end

    subgraph "Provider Layer"
        SQL[SqlClientProvider]
        DB[DatabaseProvider]
        MIG[Migrations]
    end

    subgraph "Service Layer"
        TXS[TransactionsService]
        USR[UsersService]
        SUB[SubscriptionsService]
        PAY[PaymentsService]
    end

    subgraph "Integration Layer"
        MOD[DbModule]
        IDX[Index Exports]
    end

    subgraph "Consumer Layer"
        DED[DeduplicationService]
        POL[TransactionPollerService]
    end

    PKG --> CFG --> DRZ
    DRZ --> SCH
    SCH --> REL --> DTO
    DTO --> SQL --> DB --> MIG
    MIG --> TXS & USR & SUB & PAY
    TXS & USR & SUB & PAY --> MOD --> IDX
    IDX --> DED & POL
```

## Risks and Countermeasures

### Technical Risks

- **Risk**: Migration execution failures on startup blocking application
  - **Impact**: High - Application cannot start
  - **Countermeasure**: Test migrations in CI before deployment; implement rollback procedures; validate SQL syntax before commit

- **Risk**: Connection pool exhaustion under high transaction volume
  - **Impact**: Medium - Query timeouts
  - **Countermeasure**: Configure appropriate pool size (default 10); monitor pool metrics; add connection timeout logging

- **Risk**: Service method signature changes breaking blockchain module
  - **Impact**: High - Compilation errors
  - **Countermeasure**: Update blockchain module in same PR; run full test suite before merge

### Schedule Risks

- **Risk**: postgres.js driver configuration complexity
  - **Impact**: Medium - May require investigation time
  - **Countermeasure**: Reference working examples from Drizzle documentation; prepare fallback to node-postgres if needed

## Test Case Summary

### Integration Tests (12 tests - database-services.int.test.ts)
| AC | Test Description | Category | Complexity | Phase |
|----|-----------------|----------|------------|-------|
| AC-4.1 | findByHash returns Transaction when exists | core-functionality | medium | P4 |
| AC-4.2 | findByHash returns null when not exists | core-functionality | low | P4 |
| AC-5.1 | save inserts new transaction row | core-functionality | medium | P4 |
| AC-5.2 | save throws on duplicate hash | core-functionality | medium | P4 |
| AC-5.3 | save preserves 6-decimal precision | core-functionality | medium | P4 |
| AC-6.1 | getLastTimestamp returns max timestamp | core-functionality | medium | P4 |
| AC-6.2 | getLastTimestamp returns null when empty | core-functionality | low | P4 |
| AC-8.1 | create creates or returns existing user | core-functionality | medium | P4 |
| AC-8.2 | findByTelegramId returns user or null | core-functionality | low | P4 |
| AC-9.1 | create creates subscription with active status | core-functionality | medium | P4 |
| AC-9.2 | getActive returns active non-expired subscription | core-functionality | medium | P4 |
| AC-10.1 | record inserts payment record | core-functionality | medium | P4 |

### E2E Tests (5 tests - database-module.e2e.test.ts)
| AC | Test Description | Category | Complexity | Phase |
|----|-----------------|----------|------------|-------|
| AC-2.1/3.1/12.x | Full lifecycle: init, operate, shutdown | e2e | high | P7 |
| AC-2.1 | DatabaseProvider establishes connection | e2e | medium | P7 |
| AC-3.1 | Migrations run on startup | e2e | high | P7 |
| AC-12.1/12.2 | Graceful shutdown closes connections | e2e | high | P7 |
| AC-2.3 | Throws descriptive error on connection failure | e2e | medium | P7 |

## Implementation Phases

### Phase 1: Foundation Setup (Estimated commits: 2)
**Purpose**: Install dependencies and configure Drizzle ORM base infrastructure

#### Tasks
- [x] Install packages: `pnpm add drizzle-orm postgres` and `pnpm add -D drizzle-kit`
- [x] Create `libs/db/src/config/db.config.ts` with DbConfig interface and registerAs factory
- [x] Create `drizzle.config.ts` at project root with schema path and PostgreSQL dialect
- [x] Add `DATABASE_URL` and pool configuration to `.env.example`
- [ ] Quality check: `pnpm run check` passes

#### Phase Completion Criteria
- [x] Packages installed and lockfile updated
- [x] DbConfig exports type and registerAs function
- [x] drizzle.config.ts compiles without errors
- [x] Environment variables documented

#### Operational Verification Procedures
1. Run `pnpm install` - verify no dependency conflicts
2. Run `pnpm run build` - verify TypeScript compilation succeeds
3. Verify `drizzle.config.ts` is recognized: `npx drizzle-kit check`

---

### Phase 2: Schema Definitions (Estimated commits: 2)
**Purpose**: Define database table schemas as TypeScript source of truth

#### Tasks
- [ ] Create `libs/db/src/schema/transactions.ts` - transactions table with hash index
- [ ] Create `libs/db/src/schema/users.ts` - users table with telegram_id unique
- [ ] Create `libs/db/src/schema/subscriptions.ts` - subscriptions table with user FK
- [ ] Create `libs/db/src/schema/payments.ts` - payments table with user FK
- [ ] Create `libs/db/src/schema/relations.ts` - table relationships (users -> subscriptions, payments)
- [ ] Create `libs/db/src/schema/index.ts` - aggregated schema exports
- [x] Create `libs/db/src/types/dto.ts` - CreateUserDto, UpdateUserDto, CreatePaymentDto
- [ ] Quality check: `pnpm run check` and `pnpm run build` pass

#### Phase Completion Criteria
- [ ] All 4 table schemas compile (AC-1.1, AC-1.2, AC-1.3, AC-1.4)
- [ ] Identity columns used for PKs (AC-1.5)
- [ ] Relations defined without circular dependencies
- [ ] DTO types match service method signatures

#### Operational Verification Procedures
1. Run `pnpm run build` - verify all schema files compile
2. Run `npx drizzle-kit generate` - verify migration SQL is generated
3. Inspect generated SQL in `drizzle/` - verify table structure matches design

---

### Phase 3: Database Providers (Estimated commits: 2)
**Purpose**: Create connection management and migration infrastructure

#### Tasks
- [x] Create `libs/db/src/database.provider.ts`:
  - Export `SQL_CLIENT` symbol and `SqlClientProvider` (postgres.js client)
  - Export `DRIZZLE` symbol and `DatabaseProvider` (Drizzle instance with migrations)
  - Export `DrizzleDB` type alias
- [x] Implement useFactory pattern with ConfigService injection
- [x] Implement programmatic migrations in DatabaseProvider.useFactory()
- [ ] Create initial migration: `npx drizzle-kit generate`
- [ ] Quality check: `pnpm run check` passes

#### Phase Completion Criteria
- [x] SqlClientProvider creates postgres.js connection (AC-2.1)
- [x] DatabaseProvider runs migrations on startup (AC-3.1)
- [ ] Migrations folder `drizzle/` contains SQL files
- [x] Separate migration client with max:1 for race condition prevention

#### Operational Verification Procedures
1. Run `pnpm run build` - verify provider compiles
2. Start test PostgreSQL: `docker compose up -d postgres`
3. Manual integration test: Create minimal test module, verify connection

---

### Phase 4: Domain Services Implementation (Estimated commits: 4)
**Purpose**: Implement domain-specific repository services with integration tests

**Test Resolution Target**: 12/12 integration tests (AC-4.x through AC-10.x)

#### Task 4.1: TransactionsService (3 tests)
- [x] Create `libs/db/src/services/transactions.service.ts`
- [x] Implement `findByHash(hash: string): Promise<Transaction | null>` (AC-4.1, AC-4.2)
- [x] Implement `save(transaction: Transaction): Promise<void>` (AC-5.1, AC-5.2, AC-5.3)
- [x] Implement `getLastTimestamp(): Promise<number | null>` (AC-6.1, AC-6.2)
- [x] Implement `getMonitoredWalletAddress(): Promise<string | null>` (AC-7.1, AC-7.2)
- [x] Create and execute TransactionsService integration tests (6 tests)
- [x] Quality check: `pnpm run test` passes for TransactionsService

#### Task 4.2: UsersService (2 tests)
- [ ] Create `libs/db/src/services/users.service.ts`
- [ ] Implement `findByTelegramId(telegramId: number): Promise<User | null>` (AC-8.2)
- [ ] Implement `create(data: CreateUserDto): Promise<User>` (AC-8.1)
- [ ] Implement `update(telegramId: number, data: UpdateUserDto): Promise<User | null>`
- [ ] Implement `findById(id: number): Promise<User | null>`
- [ ] Create and execute UsersService integration tests (2 tests)
- [ ] Quality check: `pnpm run test` passes for UsersService

#### Task 4.3: SubscriptionsService (2 tests)
- [ ] Create `libs/db/src/services/subscriptions.service.ts`
- [ ] Implement `create(userId: number, expiresAt: Date): Promise<Subscription>` (AC-9.1)
- [ ] Implement `getActive(userId: number): Promise<Subscription | null>` (AC-9.2)
- [ ] Implement `getActiveSubscribers(): Promise<User[]>`
- [ ] Implement `expire(subscriptionId: number): Promise<void>`
- [ ] Create and execute SubscriptionsService integration tests (3 tests including edge case)
- [ ] Quality check: `pnpm run test` passes for SubscriptionsService

#### Task 4.4: PaymentsService (2 tests)
- [ ] Create `libs/db/src/services/payments.service.ts`
- [ ] Implement `record(data: CreatePaymentDto): Promise<Payment>` (AC-10.1)
- [ ] Implement `findByUser(userId: number): Promise<Payment[]>`
- [ ] Implement `findByChargeId(chargeId: string): Promise<Payment | null>`
- [ ] Create and execute PaymentsService integration tests (2 tests)
- [ ] Quality check: `pnpm run test` passes for PaymentsService

#### Phase Completion Criteria
- [ ] All 4 services compile and export correctly
- [ ] Integration tests pass: 12/12 resolved
- [ ] Services inject DRIZZLE token correctly
- [ ] Error handling follows fail-fast pattern

#### Operational Verification Procedures
1. Run `pnpm run test libs/db` - verify all integration tests pass
2. Verify test database cleanup between tests
3. Check query performance: hash lookup < 10ms (AC-4.3)

---

### Phase 5: DbModule Integration (Estimated commits: 1)
**Purpose**: Wire all providers and services in DbModule, update exports

#### Tasks
- [ ] Update `libs/db/src/db.module.ts`:
  - Import ConfigModule.forFeature(dbConfig)
  - Register SqlClientProvider and DatabaseProvider
  - Register all 4 domain services
  - Export all 4 domain services
  - Implement OnApplicationShutdown for graceful connection close (AC-12.1, AC-12.2)
- [ ] Update `libs/db/src/index.ts`:
  - Export schema types
  - Export all services
  - Export DRIZZLE and SQL_CLIENT tokens
  - Export DrizzleDB type
- [ ] Quality check: `pnpm run check` and `pnpm run build` pass

#### Phase Completion Criteria
- [ ] DbModule registers all providers in correct order
- [ ] DbModule exports all services for external use
- [ ] Graceful shutdown implemented
- [ ] Index exports all public API

#### Operational Verification Procedures
1. Run `pnpm run build` - verify module compiles
2. Verify module can be imported in test harness
3. Test graceful shutdown: Start app, send SIGTERM, verify no connection leaks

---

### Phase 6: Blockchain Module Migration (Estimated commits: 2)
**Purpose**: Migrate blockchain module from DbService to TransactionsService

**Breaking Change**: This phase implements the method name changes defined in Design Doc.

#### Tasks
- [ ] Update `libs/blockchain/src/services/deduplication.service.ts`:
  - Change import: `DbService` -> `TransactionsService` from `@app/db`
  - Change constructor: `dbService` -> `transactionsService`
  - Change method: `dbService.findTransactionByHash(hash)` -> `transactionsService.findByHash(hash)`
  - Change method: `dbService.saveTransaction(tx)` -> `transactionsService.save(tx)`
- [ ] Update `libs/blockchain/src/services/transaction-poller.service.ts`:
  - Change import: `DbService` -> `TransactionsService` from `@app/db`
  - Change constructor: `dbService` -> `transactionsService`
  - Change method: `dbService.getMonitoredWalletAddress()` -> `transactionsService.getMonitoredWalletAddress()`
  - Change method: `dbService.getLastTransactionTimestamp()` -> `transactionsService.getLastTimestamp()`
- [ ] Update blockchain module unit tests to use TransactionsService mocks
- [ ] Delete `libs/db/src/db.service.ts` (old stub service)
- [ ] Delete `libs/db/src/db.service.spec.ts` (old stub tests)
- [ ] Quality check: `pnpm run test` - all blockchain tests pass
- [ ] Quality check: `pnpm run build` - no compilation errors

#### Phase Completion Criteria
- [ ] DeduplicationService uses TransactionsService
- [ ] TransactionPollerService uses TransactionsService
- [ ] Old DbService and tests deleted
- [ ] All blockchain tests pass with new service

#### Operational Verification Procedures
1. Run `pnpm run test libs/blockchain` - all tests pass
2. Run `pnpm run build` - no type errors
3. Verify no references to DbService remain: `grep -r "DbService" libs/`

---

### Phase 7: Quality Assurance (Required) (Estimated commits: 1)
**Purpose**: Overall quality assurance, E2E tests, and Design Doc consistency verification

**Test Resolution Target**: 5/5 E2E tests + all previous tests passing

#### Tasks
- [ ] Execute E2E tests (`libs/db/src/__tests__/database-module.e2e.test.ts`):
  - [ ] Full lifecycle test (AC-2.1, AC-3.1, AC-12.1, AC-12.2)
  - [ ] Connection establishment test (AC-2.1)
  - [ ] Migration execution test (AC-3.1)
  - [ ] Graceful shutdown test (AC-12.1, AC-12.2)
  - [ ] Connection failure test (AC-2.3)
- [ ] Verify all Design Doc acceptance criteria achieved:
  - [ ] FR-1 through FR-12 implemented
  - [ ] AC-1.1 through AC-12.2 verified
- [ ] Quality checks:
  - [ ] `pnpm run check` - Biome lint/format pass
  - [ ] `pnpm run build` - TypeScript compilation success
  - [ ] `pnpm run test` - All tests pass (unit + integration + E2E)
  - [ ] `pnpm run test:cov` - Coverage >= 80%
- [ ] Update documentation:
  - [ ] Verify `.env.example` has all required variables
  - [ ] Update CLAUDE.md if needed

#### Phase Completion Criteria
- [ ] All E2E tests pass: 5/5 resolved
- [ ] All integration tests pass: 12/12 resolved
- [ ] All acceptance criteria verified
- [ ] Zero lint/format errors
- [ ] Build succeeds
- [ ] Coverage >= 80%

#### Operational Verification Procedures (from Design Doc)
1. **Database Connection**: Run `pnpm run start:dev` with valid DATABASE_URL - app connects without error
2. **Migration Execution**: Start with fresh database - all tables created automatically
3. **Transaction CRUD**: Save and retrieve transaction - data persists correctly
4. **User Management**: Create and find user - CRUD operations work
5. **Subscription Tracking**: Create subscription, verify active status and expiration
6. **Payment Recording**: Record payment, verify persistence
7. **Graceful Shutdown**: Send SIGTERM - connections close cleanly, no errors

---

## Quality Assurance Summary

### All Phases
- [ ] Implement staged quality checks (ai-development-guide skill)
- [ ] All tests pass
- [ ] Static check pass (`pnpm run check`)
- [ ] Lint check pass (included in check)
- [ ] Build success (`pnpm run build`)

## Completion Criteria

- [ ] All 7 phases completed
- [ ] Each phase's operational verification procedures executed
- [ ] Design Doc acceptance criteria satisfied (AC-1.1 through AC-12.2)
- [ ] Staged quality checks completed (zero errors)
- [ ] All tests pass (17 total: 12 integration + 5 E2E)
- [ ] Necessary documentation updated
- [ ] User review approval obtained

## Progress Tracking

### Phase 1: Foundation Setup
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes:

### Phase 2: Schema Definitions
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes:

### Phase 3: Database Providers
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes:

### Phase 4: Domain Services Implementation
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes: Test resolution: __/12

### Phase 5: DbModule Integration
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes:

### Phase 6: Blockchain Module Migration
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes: Breaking change applied

### Phase 7: Quality Assurance
- Start: ____-__-__ __:__
- Complete: ____-__-__ __:__
- Notes: E2E resolution: __/5

## Notes

### Technical Dependencies Summary
1. **Package Installation** -> All subsequent phases
2. **Schema Definitions** -> Migrations, Services
3. **SqlClientProvider** -> DatabaseProvider (must be registered first)
4. **DatabaseProvider** -> All domain services
5. **Migrations** -> Service queries (tables must exist)
6. **TransactionsService** -> Blockchain module migration

### Breaking Changes
The blockchain module requires updates due to service/method renaming:
- Import: `DbService` -> `TransactionsService`
- Method: `findTransactionByHash()` -> `findByHash()`
- Method: `saveTransaction()` -> `save()`
- Method: `getLastTransactionTimestamp()` -> `getLastTimestamp()`

### Test Database Setup
Integration and E2E tests require a PostgreSQL instance:
```bash
# Start test database
docker compose up -d postgres

# Or use local PostgreSQL with test database
DATABASE_URL=postgresql://user:pass@localhost:5432/payping_test
```

### Rollback Plan
If migration issues occur:
1. Drop tables manually: `DROP TABLE payments, subscriptions, users, transactions CASCADE;`
2. Delete migration files in `drizzle/`
3. Regenerate migrations: `npx drizzle-kit generate`
