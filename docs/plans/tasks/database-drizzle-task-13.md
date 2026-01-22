# Task 13: Update TransactionPollerService and Delete Old DbService

Metadata:
- Phase: Phase 6 - Blockchain Module Migration
- Dependencies: Task 12 (DeduplicationService must be updated first)
- Provides: Updated libs/blockchain/src/services/transaction-poller.service.ts, deleted DbService files
- Size: Medium (5 files: service + test + 2 deletions + blockchain module update)
- Breaking Change: Yes - completes migration from DbService to TransactionsService

## Implementation Content

Update TransactionPollerService to use TransactionsService, delete old DbService stub and its tests, and update BlockchainModule imports.

**Method changes**:
- Import: `DbService` → `TransactionsService` from `@app/db`
- Method: `getMonitoredWalletAddress()` → no change (same name)
- Method: `getLastTransactionTimestamp()` → `getLastTimestamp()`

**Files to delete**:
- `libs/db/src/db.service.ts` (old stub service)
- `libs/db/src/db.service.spec.ts` (old stub tests)

## Target Files
- [ ] libs/blockchain/src/services/transaction-poller.service.ts
- [ ] libs/blockchain/src/services/__tests__/transaction-poller.service.spec.ts (unit test)
- [ ] libs/blockchain/src/blockchain.module.ts (update imports)
- [ ] libs/db/src/db.service.ts (DELETE)
- [ ] libs/db/src/db.service.spec.ts (DELETE)

## Implementation Steps

### 1. Update TransactionPollerService Imports
- [ ] Change import: Remove `DbService` from `@app/db`
- [ ] Add import: `TransactionsService` from `@app/db`
- [ ] Verify no other imports need updating

### 2. Update Constructor Injection
- [ ] Change constructor parameter:
  - From: `private readonly dbService: DbService`
  - To: `private readonly transactionsService: TransactionsService`
- [ ] Verify constructor signature matches updated parameter

### 3. Update Method Calls
- [ ] Find calls to `this.dbService.getMonitoredWalletAddress()`
- [ ] Replace with: `this.transactionsService.getMonitoredWalletAddress()` (same name)
- [ ] Find calls to `this.dbService.getLastTransactionTimestamp()`
- [ ] Replace with: `this.transactionsService.getLastTimestamp()` (renamed)
- [ ] Verify no other DbService methods are called

### 4. Update Unit Tests
- [ ] Open transaction-poller.service.spec.ts
- [ ] Update test setup:
  - Remove DbService mock
  - Add TransactionsService mock
- [ ] Update mock method names:
  - `getLastTransactionTimestamp` → `getLastTimestamp`
  - `getMonitoredWalletAddress` → no change
- [ ] Verify test expectations match new method names
- [ ] Run tests: `pnpm run test transaction-poller.service.spec` - confirm all pass

### 5. Update BlockchainModule
- [ ] Open libs/blockchain/src/blockchain.module.ts
- [ ] Find imports from `@app/db`
- [ ] Remove DbService from imports
- [ ] Verify DbModule is still imported (provides TransactionsService)
- [ ] No changes to providers or exports needed (services already inject TransactionsService)

### 6. Delete Old DbService Files
- [ ] Delete file: `libs/db/src/db.service.ts`
- [ ] Delete file: `libs/db/src/db.service.spec.ts`
- [ ] Verify files are deleted from filesystem

### 7. Verify No DbService References Remain
- [ ] Run: `grep -r "DbService" libs/` (or search entire codebase)
- [ ] Should find zero matches (DbService completely removed)
- [ ] If matches found: Update those files to use TransactionsService

## Completion Criteria
- [ ] TransactionPollerService imports TransactionsService from @app/db
- [ ] Constructor injects TransactionsService
- [ ] All method calls use correct method names (getLastTimestamp, getMonitoredWalletAddress)
- [ ] Unit tests updated and passing
- [ ] BlockchainModule no longer references DbService
- [ ] Old DbService and its tests deleted
- [ ] No DbService references remain in codebase
- [ ] All blockchain tests pass: `pnpm run test libs/blockchain`
- [ ] `pnpm run build` succeeds
- [ ] Operation verified: L2 (Test Operation) - all blockchain tests pass

## Notes
- Impact scope: TransactionPollerService, BlockchainModule, DbService deletion
- Constraints: Do not modify TransactionsService or DbModule
- Breaking change: This completes the migration from stub to real service
- getMonitoredWalletAddress method name unchanged (same in both services)
- getLastTransactionTimestamp renamed to getLastTimestamp for clarity
- After this task, DbService no longer exists in codebase
- Verify all blockchain tests pass before proceeding to Phase 7
- Reference Design Doc "Breaking Changes: Blockchain Module Migration" section
