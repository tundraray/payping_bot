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
- [x] libs/db/src/services/transactions.service.ts
- [x] libs/db/src/services/__tests__/transactions.service.int.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests
- [x] Create services directory: `libs/db/src/services/`
- [x] Create __tests__ directory: `libs/db/src/services/__tests__/`
- [x] Create integration test file: transactions.service.int.test.ts
- [x] Set up test database connection (use test DATABASE_URL)
- [x] Implement test setup/teardown:
  - beforeAll: Create test app context with DbModule
  - beforeEach: Clean transactions table
  - afterAll: Close database connection
- [x] Write 6 failing integration tests:
  - **AC-4.1**: findByHash returns Transaction when exists
  - **AC-4.2**: findByHash returns null when not exists
  - **AC-5.1**: save inserts new transaction row
  - **AC-5.2**: save throws on duplicate hash (unique constraint)
  - **AC-5.3**: save preserves 6-decimal precision for amount
  - **AC-6.1**: getLastTimestamp returns max timestamp
  - **AC-6.2**: getLastTimestamp returns null when empty table
- [x] Run tests: `pnpm run test transactions.service.int.test` - confirm all fail
- [x] Reference Design Doc TransactionsService interface and data contract

### 2. Green Phase - Minimal Implementation
- [x] Create transactions.service.ts
- [x] Import Injectable, Inject from @nestjs/common
- [x] Import DRIZZLE, DrizzleDB from '../database.provider'
- [x] Import transactions schema from '../schema'
- [x] Import Transaction interface from @app/blockchain
- [x] Import eq, desc from drizzle-orm
- [x] Import ConfigService from @nestjs/config
- [x] Add @Injectable() decorator
- [x] Implement constructor with @Inject(DRIZZLE) and ConfigService

#### Implement findByHash (AC-4.1, AC-4.2, AC-4.3)
- [x] Query: db.select().from(transactions).where(eq(transactions.hash, hash)).limit(1)
- [x] Return first result or null
- [x] Wrap in try-catch, log error with context, throw error (fail-fast)
- [x] Target: < 10ms query time (AC-4.3)

#### Implement save (AC-5.1, AC-5.2, AC-5.3)
- [x] Insert: db.insert(transactions).values({...transaction data})
- [x] Map Transaction interface fields to table columns
- [x] Preserve amount as string (AC-5.3)
- [x] Wrap in try-catch, log error, throw error (fail-fast)
- [x] Let database enforce unique constraint (AC-5.2)

#### Implement getLastTimestamp (AC-6.1, AC-6.2)
- [x] Query: db.select().from(transactions).orderBy(desc(transactions.timestamp)).limit(1)
- [x] Return timestamp from first result or null
- [x] Wrap in try-catch, log error, throw error

#### Implement getMonitoredWalletAddress (AC-7.1, AC-7.2)
- [x] Read MONITORED_WALLET_ADDRESS from ConfigService environment
- [x] Return address or null if not configured
- [x] On error: return null (fail-open for configuration)

- [x] Run only new tests: `pnpm run test transactions.service.int.test` - confirm all pass

### 3. Refactor Phase
- [x] Extract common error logging if needed
- [x] Improve variable naming for clarity
- [x] Add JSDoc comments to public methods
- [x] Ensure consistent error handling pattern
- [x] Run tests again: `pnpm run test transactions.service.int.test` - confirm all pass

## Completion Criteria
- [x] All 6 integration tests pass (AC-4.1, AC-4.2, AC-5.1, AC-5.2, AC-5.3, AC-6.1, AC-6.2)
- [x] Service injects DRIZZLE token correctly
- [x] Error handling follows fail-fast pattern
- [x] Amount precision preserved (6 decimals)
- [x] Hash lookup uses indexed column
- [x] Operation verified: L2 (Test Operation) - new tests added and passing

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
