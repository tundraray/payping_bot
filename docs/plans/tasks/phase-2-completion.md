# Phase 2 Completion: Infrastructure Layer

Metadata:
- Phase: 2 (Infrastructure)
- Dependencies: Phase 1 completed
- Provides: Infrastructure services for Phase 3+

## Phase Objectives
Implement HTTP client for TronGrid API and deduplication service with LRU + DB strategy.

## Completed Tasks Checklist
- [ ] task-2-1: TronGrid Client implemented with retry logic
- [ ] task-2-2: Deduplication Service implemented with LRU + DB

## E2E Verification Procedures (from Design Doc)

### 1. TronGrid Client Integration Test
```bash
# Run TronGrid client integration tests
pnpm run test libs/blockchain/src/clients/trongrid.client.int.test.ts

# Expected: 3 tests pass
# - AC-2.1/AC-2.2: extracts USDT transaction fields
# - AC-2.3/AC-2.4: constructs API request with correct query parameters
# - AC-7.1/AC-7.2: error handling with backoff
```

### 2. Deduplication Service Integration Test
```bash
# Run deduplication integration tests
pnpm run test libs/blockchain/src/services/deduplication.int.test.ts

# Expected: 4+ tests pass
# - AC-4.1: LRU cache hit skips processing
# - AC-4.2: DB hit after LRU miss
# - AC-4.3: new transaction added to LRU + DB
# - AC-4.4: LRU max size configurable
```

### 3. Verify Request Parameters
Manually verify or through test that TronGrid requests include:
- `only_confirmed=true`
- `min_timestamp` parameter
- `contract_address` = USDT contract

### 4. Verify Cache Warming
Test sequence:
1. Check hash not in cache (should query DB)
2. DB returns existing transaction
3. Check same hash again (should NOT query DB - cache hit)

### 5. Verify Fail-Fast Behavior
Test that database write errors are propagated (not swallowed):
```typescript
// In test
dbService.saveTransaction.mockRejectedValueOnce(new Error('DB error'));
await expect(service.markProcessed(hash, tx)).rejects.toThrow();
```

## Phase Completion Criteria
- [ ] TronGridClient fetches and transforms USDT transactions correctly
- [ ] TronGridClient handles HTTP 429 and 5xx errors with backoff
- [ ] DeduplicationService uses LRU cache before DB queries
- [ ] DeduplicationService persists new transactions to DB
- [ ] Cache warming works on DB hit
- [ ] All 6+ integration tests pass
- [ ] `pnpm run check` passes

## Quality Checks
```bash
# Run all quality checks
pnpm run check    # Biome lint + format
pnpm run test libs/blockchain/src/clients/  # Client tests
pnpm run test libs/blockchain/src/services/deduplication  # Dedup tests
```

## Files Created/Modified in Phase 2

| File | Type | Purpose |
|------|------|---------|
| `clients/trongrid.client.ts` | New | TronGrid HTTP client |
| `clients/trongrid.client.int.test.ts` | New | Client integration tests |
| `services/deduplication.service.ts` | New | LRU + DB deduplication |
| `services/deduplication.int.test.ts` | New | Deduplication tests |

## Integration Test Summary

| Test File | Test Count | AC Coverage |
|-----------|------------|-------------|
| trongrid.client.int.test.ts | 3 | AC-2.1, AC-2.2, AC-2.3, AC-2.4, AC-7.1, AC-7.2 |
| deduplication.int.test.ts | 4+ | AC-4.1, AC-4.2, AC-4.3, AC-4.4 |
| **Total** | **7+** | |

## Acceptance Criteria Covered
- AC-2.1: Extract all required transaction fields
- AC-2.2: Filter by USDT contract address
- AC-2.3: Request only confirmed transactions
- AC-2.4: Use min_timestamp parameter
- AC-7.1: HTTP 429 triggers exponential backoff
- AC-7.2: HTTP 5xx retries up to 3 times
- AC-4.1: LRU cache hit skips processing
- AC-4.2: DB hit skips event emission
- AC-4.3: New transaction added to LRU + DB
- AC-4.4: LRU max size configurable

## Next Phase
Proceed to Phase 3: Application Layer
- Task 3-1: Transaction Events (event constants)
- Task 3-2: Transaction Processor Service
