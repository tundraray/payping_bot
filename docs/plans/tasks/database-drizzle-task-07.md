# Task 07: Implement TransactionsService with Integration Tests

Metadata:
- Phase: Phase 4 - Domain Services Implementation
- Dependencies: Task 06 (migrations must be generated), Task 05 (DRIZZLE token must exist)
- Provides: libs/db/src/services/transactions.service.ts and integration tests
- Size: Small (2 files: service + test)
- Test Resolution Target: 6 tests (AC-4.1, AC-4.2, AC-5.1, AC-5.2, AC-5.3, AC-6.1, AC-6.2)

## Implementation Content

Implement TransactionsService with real database queries for blockchain module transaction persistence. This service replaces the stub DbService methods for transaction operations.

**Methods to implement**:
1. `findByHash(hash: string): Promise<Transaction | null>` - Transaction lookup
2. `save(transaction: Transaction): Promise<void>` - Transaction persistence
3. `getLastTimestamp(): Promise<number | null>` - Last transaction timestamp
4. `getMonitoredWalletAddress(): Promise<string | null>` - Wallet address config

## Target Files
- [ ] libs/db/src/services/transactions.service.ts
- [ ] libs/db/src/services/__tests__/transactions.service.int.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests
- [ ] Create services directory: `libs/db/src/services/`
- [ ] Create __tests__ directory: `libs/db/src/services/__tests__/`
- [ ] Create integration test file: transactions.service.int.test.ts
- [ ] Set up test database connection (use test DATABASE_URL)
- [ ] Implement test setup/teardown:
  - beforeAll: Create test app context with DbModule
  - beforeEach: Clean transactions table
  - afterAll: Close database connection
- [ ] Write 6 failing integration tests:
  - **AC-4.1**: findByHash returns Transaction when exists
  - **AC-4.2**: findByHash returns null when not exists
  - **AC-5.1**: save inserts new transaction row
  - **AC-5.2**: save throws on duplicate hash (unique constraint)
  - **AC-5.3**: save preserves 6-decimal precision for amount
  - **AC-6.1**: getLastTimestamp returns max timestamp
  - **AC-6.2**: getLastTimestamp returns null when empty table
- [ ] Run tests: `pnpm run test transactions.service.int.test` - confirm all fail
- [ ] Reference Design Doc TransactionsService interface and data contract

### 2. Green Phase - Minimal Implementation
- [ ] Create transactions.service.ts
- [ ] Import Injectable, Inject from @nestjs/common
- [ ] Import DRIZZLE, DrizzleDB from '../database.provider'
- [ ] Import transactions schema from '../schema'
- [ ] Import Transaction interface from @app/blockchain
- [ ] Import eq, desc from drizzle-orm
- [ ] Import ConfigService from @nestjs/config
- [ ] Add @Injectable() decorator
- [ ] Implement constructor with @Inject(DRIZZLE) and ConfigService

#### Implement findByHash (AC-4.1, AC-4.2, AC-4.3)
- [ ] Query: db.select().from(transactions).where(eq(transactions.hash, hash)).limit(1)
- [ ] Return first result or null
- [ ] Wrap in try-catch, log error with context, throw error (fail-fast)
- [ ] Target: < 10ms query time (AC-4.3)

#### Implement save (AC-5.1, AC-5.2, AC-5.3)
- [ ] Insert: db.insert(transactions).values({...transaction data})
- [ ] Map Transaction interface fields to table columns
- [ ] Preserve amount as string (AC-5.3)
- [ ] Wrap in try-catch, log error, throw error (fail-fast)
- [ ] Let database enforce unique constraint (AC-5.2)

#### Implement getLastTimestamp (AC-6.1, AC-6.2)
- [ ] Query: db.select().from(transactions).orderBy(desc(transactions.timestamp)).limit(1)
- [ ] Return timestamp from first result or null
- [ ] Wrap in try-catch, log error, throw error

#### Implement getMonitoredWalletAddress (AC-7.1, AC-7.2)
- [ ] Read MONITORED_WALLET_ADDRESS from ConfigService environment
- [ ] Return address or null if not configured
- [ ] On error: return null (fail-open for configuration)

- [ ] Run only new tests: `pnpm run test transactions.service.int.test` - confirm all pass

### 3. Refactor Phase
- [ ] Extract common error logging if needed
- [ ] Improve variable naming for clarity
- [ ] Add JSDoc comments to public methods
- [ ] Ensure consistent error handling pattern
- [ ] Run tests again: `pnpm run test transactions.service.int.test` - confirm all pass

## Completion Criteria
- [ ] All 6 integration tests pass (AC-4.1, AC-4.2, AC-5.1, AC-5.2, AC-5.3, AC-6.1, AC-6.2)
- [ ] Service injects DRIZZLE token correctly
- [ ] Error handling follows fail-fast pattern
- [ ] Amount precision preserved (6 decimals)
- [ ] Hash lookup uses indexed column
- [ ] Operation verified: L2 (Test Operation) - new tests added and passing

## Notes
- Impact scope: TransactionsService and its tests only
- Constraints: Do not modify DbModule yet (Task 11)
- Test database setup:
  - Use docker-compose: `docker compose up -d postgres`
  - Or local PostgreSQL with test database
  - Set DATABASE_URL for tests
- Reference Design Doc TransactionsService section for method signatures
- Follow TDD strictly: Red → Green → Refactor
- Tests must be independent (create own data, no execution order dependency)
