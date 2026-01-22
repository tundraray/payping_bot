# Task 14: E2E Tests and Final Quality Assurance

Metadata:
- Phase: Phase 7 - Quality Assurance (Required)
- Dependencies: Task 13 (all implementation complete)
- Provides: E2E test file and verification report
- Size: Small (1 file: E2E tests)
- Test Resolution Target: 5 E2E tests + all previous tests passing

## Implementation Content

Create and execute E2E tests for database module lifecycle, verify all acceptance criteria, run full quality checks, and validate operational procedures.

**E2E tests to implement**:
1. Full lifecycle: init → operate → shutdown (AC-2.1, AC-3.1, AC-12.1, AC-12.2)
2. Database connection establishment (AC-2.1)
3. Migration execution on startup (AC-3.1)
4. Graceful shutdown closes connections (AC-12.1, AC-12.2)
5. Connection failure throws descriptive error (AC-2.3)

**Quality checks**:
- All tests pass (unit + integration + E2E)
- Static checks pass (Biome lint/format)
- Build succeeds
- Coverage >= 80%

## Target Files
- [ ] libs/db/src/__tests__/database-module.e2e.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing E2E Tests
- [ ] Create __tests__ directory: `libs/db/src/__tests__/`
- [ ] Create E2E test file: database-module.e2e.test.ts
- [ ] Set up test infrastructure:
  - Use real PostgreSQL database (docker-compose or local)
  - Set DATABASE_URL for test database
  - Import necessary NestJS testing utilities
- [ ] Write 5 failing E2E tests:
  - **Test 1**: Full lifecycle test (AC-2.1, AC-3.1, AC-12.1, AC-12.2)
    - Create NestJS application context with DbModule
    - Verify migrations run on init
    - Perform basic operations (insert/query)
    - Shutdown gracefully
    - Verify no connection leaks
  - **Test 2**: Database connection establishment (AC-2.1)
    - Initialize DbModule
    - Verify DRIZZLE token available
    - Verify connection pool established
  - **Test 3**: Migration execution (AC-3.1)
    - Start with fresh database
    - Initialize DbModule
    - Verify all 4 tables exist
    - Verify migration history recorded
  - **Test 4**: Graceful shutdown (AC-12.1, AC-12.2)
    - Create active queries
    - Trigger shutdown
    - Verify queries complete
    - Verify connections closed cleanly
  - **Test 5**: Connection failure error (AC-2.3)
    - Use invalid DATABASE_URL
    - Attempt to initialize DbModule
    - Verify descriptive error thrown
    - Verify error contains connection details (password masked)
- [ ] Run tests: `pnpm run test database-module.e2e.test` - confirm all fail
- [ ] Reference Design Doc E2E tests section and Work Plan Phase 7

### 2. Green Phase - Implementation Complete
- [ ] Note: All implementation already complete in previous tasks
- [ ] Run E2E tests: `pnpm run test database-module.e2e.test`
- [ ] If tests fail: Fix issues in implementation
- [ ] Confirm all 5 E2E tests pass

### 3. Verify All Integration Tests Pass
- [ ] Run: `pnpm run test libs/db/src/services`
- [ ] Verify 12 integration tests pass:
  - TransactionsService: 6 tests
  - UsersService: 2 tests
  - SubscriptionsService: 2 tests (plus edge cases)
  - PaymentsService: 2 tests
- [ ] If failures: Fix issues and rerun

### 4. Verify All Blockchain Tests Pass
- [ ] Run: `pnpm run test libs/blockchain`
- [ ] Verify all blockchain unit tests pass with TransactionsService
- [ ] If failures: Fix integration issues

### 5. Execute Full Quality Checks
- [ ] Run Biome check: `pnpm run check`
  - Verify zero lint errors
  - Verify zero format errors
  - If errors: Fix and rerun
- [ ] Run TypeScript build: `pnpm run build`
  - Verify compilation succeeds
  - Verify no type errors
  - If errors: Fix and rerun
- [ ] Run full test suite: `pnpm run test`
  - Verify all tests pass (unit + integration + E2E)
  - If failures: Fix and rerun
- [ ] Run coverage check: `pnpm run test:cov`
  - Verify coverage >= 80%
  - If below threshold: Add missing tests

### 6. Execute E2E Operational Verification Procedures (from Work Plan Phase 7)
- [ ] **Database Connection**:
  - Run `pnpm run start:dev` with valid DATABASE_URL
  - Verify app connects without error
  - Check logs for migration execution
- [ ] **Migration Execution**:
  - Start with fresh database: drop all tables
  - Run `pnpm run start:dev`
  - Verify all 4 tables created automatically
  - Check migration history table
- [ ] **Transaction CRUD**:
  - Use TransactionsService in running app
  - Save transaction and verify persistence
  - Query by hash and verify retrieval
- [ ] **User Management**:
  - Use UsersService in running app
  - Create user and verify in database
  - Update user and verify changes
- [ ] **Subscription Tracking**:
  - Create subscription with 30-day expiration
  - Verify active status
  - Verify expiration date correct
- [ ] **Payment Recording**:
  - Record payment with unique charge ID
  - Verify persistence in database
  - Query payment and verify data
- [ ] **Graceful Shutdown**:
  - Start app with active operations
  - Send SIGTERM or SIGINT
  - Verify connections close cleanly
  - Check logs for no errors

### 7. Verify All Design Doc Acceptance Criteria
- [ ] AC-1.1 through AC-1.5: Schema definitions (verify in migration SQL)
- [ ] AC-2.1 through AC-2.3: Database connection (verify in E2E tests)
- [ ] AC-3.1 through AC-3.3: Migrations (verify in E2E tests)
- [ ] AC-4.1 through AC-4.3: Transaction lookup (verify in integration tests)
- [ ] AC-5.1 through AC-5.3: Transaction save (verify in integration tests)
- [ ] AC-6.1 through AC-6.2: Last timestamp (verify in integration tests)
- [ ] AC-7.1 through AC-7.2: Wallet address (verify in integration tests)
- [ ] AC-8.1 through AC-8.2: User operations (verify in integration tests)
- [ ] AC-9.1 through AC-9.2: Subscription operations (verify in integration tests)
- [ ] AC-10.1: Payment operations (verify in integration tests)
- [ ] AC-11.1 through AC-11.2: Connection pooling (verify in provider code)
- [ ] AC-12.1 through AC-12.2: Graceful shutdown (verify in E2E tests)

### 8. Update Documentation
- [ ] Verify .env.example has all required DATABASE_URL variables
- [ ] Check if CLAUDE.md needs updates (database setup instructions)
- [ ] Document any configuration changes or setup requirements

## Completion Criteria
- [ ] All 5 E2E tests pass
- [ ] All 12 integration tests pass
- [ ] All blockchain tests pass
- [ ] Zero Biome lint/format errors
- [ ] Build succeeds
- [ ] Coverage >= 80%
- [ ] All 7 E2E operational verification procedures completed successfully
- [ ] All Design Doc acceptance criteria (AC-1.1 through AC-12.2) verified
- [ ] Documentation updated
- [ ] Operation verified: L1 (Functional Operation) - full E2E user-facing functionality works

## Notes
- Impact scope: E2E tests only, no implementation changes
- Constraints: Do not modify implementation unless tests reveal bugs
- This is the final quality gate before completion
- All acceptance criteria must be verified before marking complete
- E2E tests use real PostgreSQL database (not mocks)
- Test database cleanup required between test runs
- Reference Design Doc E2E verification procedures section
- This completes Phase 7 and the entire implementation
