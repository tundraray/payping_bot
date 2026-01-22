# Phase 4 Completion: Orchestration Layer

Metadata:
- Phase: 4 (Orchestration)
- Dependencies: Phase 3 completed
- Provides: Polling orchestration for Phase 5+

## Phase Objectives
Implement polling loop with timing control, initial timestamp retrieval, and graceful shutdown.

## Completed Tasks Checklist
- [ ] task-4-1: Transaction Poller Service implemented with polling orchestration

## E2E Verification Procedures (from Design Doc)

### 1. Start Poller with DB Timestamp
```typescript
// Setup: DB returns existing timestamp
dbService.getLastTransactionTimestamp.mockResolvedValue(1737460000000);
dbService.getMonitoredWalletAddress.mockResolvedValue('TMonitoredWallet');

await pollerService.startPolling();

// Verify: API called with DB timestamp
expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
  'TMonitoredWallet',
  1737460000000,
);
```

### 2. Start Poller with Empty DB (Fallback)
```typescript
// Setup: DB returns null (no transactions)
dbService.getLastTransactionTimestamp.mockResolvedValue(null);
dbService.getMonitoredWalletAddress.mockResolvedValue('TMonitoredWallet');

await pollerService.startPolling();

// Verify: Fallback timestamp used (within 60s of now)
const calledTimestamp = tronGridClient.fetchUSDTTransactions.mock.calls[0][1];
const expectedMin = Date.now() - 60000 - 1000; // Allow 1s tolerance
const expectedMax = Date.now() - 60000 + 1000;
expect(calledTimestamp).toBeGreaterThanOrEqual(expectedMin);
expect(calledTimestamp).toBeLessThanOrEqual(expectedMax);
```

### 3. Trigger Skip on Concurrent Poll
```typescript
// Make first poll slow
const slowPoll = new Promise(resolve => setTimeout(resolve, 1000));
tronGridClient.fetchUSDTTransactions.mockReturnValueOnce(slowPoll);

// Start polling
await pollerService.startPolling();

// Trigger another poll while first is running
const callCountBefore = tronGridClient.fetchUSDTTransactions.mock.calls.length;
// Advance timers or manually trigger
// ...

// Verify: No new API call (skip + warning logged)
expect(tronGridClient.fetchUSDTTransactions.mock.calls.length).toBe(callCountBefore);
```

### 4. Graceful Shutdown During Active Poll
```typescript
// Start slow poll
tronGridClient.fetchUSDTTransactions.mockReturnValue(
  new Promise(resolve => setTimeout(() => resolve([]), 500))
);

await pollerService.startPolling();

// Trigger shutdown
const stopPromise = pollerService.stopPolling();

// State should be SHUTTING_DOWN
expect(pollerService.getState()).toBe(PollerState.SHUTTING_DOWN);

// Wait for shutdown
await stopPromise;

// State should be STOPPED, current poll should have completed
expect(pollerService.getState()).toBe(PollerState.STOPPED);
```

## Phase Completion Criteria
- [ ] Polling interval defaults to 5 seconds (AC-1.1)
- [ ] Concurrent poll attempts blocked with warning (AC-1.2)
- [ ] Initial timestamp retrieved from DB (AC-10.1, AC-10.3)
- [ ] Fallback to now-60s when no DB data (AC-10.2)
- [ ] Subsequent polls use last processed timestamp (AC-10.5)
- [ ] Graceful shutdown completes current poll (AC-8.1, AC-8.3)
- [ ] All 11 integration tests pass (9 from Phase 3 + 5 new, some overlap)
- [ ] `pnpm run check` passes

## Quality Checks
```bash
# Run all quality checks
pnpm run check    # Biome lint + format
pnpm run test libs/blockchain/src/services/  # All service tests
```

## Files Created/Modified in Phase 4

| File | Type | Purpose |
|------|------|---------|
| `services/transaction-poller.service.ts` | New | Polling orchestration |
| `services/transaction-poller.int.test.ts` | New | Poller integration tests |

## Integration Test Summary

| Test File | Test Count | AC Coverage |
|-----------|------------|-------------|
| transaction-poller.int.test.ts | 5+ | AC-1.2, AC-8.1, AC-8.3, AC-10.1, AC-10.2, AC-10.3, AC-10.5 |
| **Total (Phase 4)** | **5+** | |
| **Total (All Phases)** | **11+** | |

## Acceptance Criteria Covered
- AC-1.1: Poll every 5 seconds (configurable)
- AC-1.2: Skip poll when previous in progress
- AC-8.1: Complete current poll on SIGTERM
- AC-8.3: No new polls after shutdown signal
- AC-10.1: Query DB for last transaction timestamp on start
- AC-10.2: Fallback to now-60s when no DB data
- AC-10.3: Continue from last saved timestamp on restart
- AC-10.4: Do NOT skip transactions during downtime
- AC-10.5: Subsequent polls use last processed timestamp

## State Machine Verification

```
IDLE -> startPolling() -> POLLING
POLLING -> stopPolling() -> SHUTTING_DOWN -> (poll completes) -> STOPPED
POLLING -> (rate limit) -> PAUSED -> (backoff expires) -> POLLING
```

## Next Phase
Proceed to Phase 5: Integration Layer
- Task 5-1: Integration Wiring (BlockchainService, BlockchainModule, index.ts)
