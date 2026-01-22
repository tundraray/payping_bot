# Task 12: Update DeduplicationService to Use TransactionsService

Metadata:
- Phase: Phase 6 - Blockchain Module Migration
- Dependencies: Task 11 (DbModule must export TransactionsService)
- Provides: Updated libs/blockchain/src/services/deduplication.service.ts and tests
- Size: Small (2 files: service + test)
- Breaking Change: Yes - replaces DbService with TransactionsService

## Implementation Content

Update DeduplicationService to use TransactionsService instead of DbService. This is a breaking change that replaces stub methods with real database operations.

**Method changes**:
- Import: `DbService` → `TransactionsService` from `@app/db`
- Method: `findTransactionByHash(hash)` → `findByHash(hash)`
- Method: `saveTransaction(tx)` → `save(tx)`

## Target Files
- [ ] libs/blockchain/src/services/deduplication.service.ts
- [ ] libs/blockchain/src/services/__tests__/deduplication.service.spec.ts (unit test)

## Implementation Steps

### 1. Update DeduplicationService Imports
- [ ] Change import: Remove `DbService` from `@app/db`
- [ ] Add import: `TransactionsService` from `@app/db`
- [ ] Verify no other imports need updating

### 2. Update Constructor Injection
- [ ] Change constructor parameter:
  - From: `private readonly dbService: DbService`
  - To: `private readonly transactionsService: TransactionsService`
- [ ] Verify constructor signature matches updated parameter

### 3. Update Method Calls
- [ ] Find all calls to `this.dbService.findTransactionByHash(hash)`
- [ ] Replace with: `this.transactionsService.findByHash(hash)`
- [ ] Find all calls to `this.dbService.saveTransaction(tx)`
- [ ] Replace with: `this.transactionsService.save(tx)`
- [ ] Verify no other DbService methods are called

### 4. Update Unit Tests
- [ ] Open deduplication.service.spec.ts
- [ ] Update test setup:
  - Remove DbService mock
  - Add TransactionsService mock
- [ ] Update mock method names:
  - `findTransactionByHash` → `findByHash`
  - `saveTransaction` → `save`
- [ ] Verify test expectations match new method names
- [ ] Run tests: `pnpm run test deduplication.service.spec` - confirm all pass

### 5. Verify No DbService References Remain
- [ ] Search file for "DbService" - should find no matches
- [ ] Search file for "findTransactionByHash" - should find no matches
- [ ] Search file for "saveTransaction" - should find no matches
- [ ] Verify all references updated to TransactionsService

## Completion Criteria
- [ ] DeduplicationService imports TransactionsService from @app/db
- [ ] Constructor injects TransactionsService
- [ ] All method calls use new method names (findByHash, save)
- [ ] Unit tests updated and passing
- [ ] No DbService references remain
- [ ] File compiles without TypeScript errors
- [ ] `pnpm run build` succeeds
- [ ] Operation verified: L2 (Test Operation) - unit tests pass with new service

## Notes
- Impact scope: DeduplicationService and its tests only
- Constraints: Do not modify TransactionsService or other blockchain services yet
- Breaking change: This is intentional migration from stub to real service
- Method behavior unchanged: findByHash and save have same signatures and contracts
- Unit tests mock TransactionsService (integration tests in Phase 7)
- Reference Design Doc "Breaking Changes: Blockchain Module Migration" section
