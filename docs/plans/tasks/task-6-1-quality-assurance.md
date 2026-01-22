# Task: Quality Assurance - E2E Tests and Final Verification

Metadata:
- Phase: 6 (Quality Assurance)
- Dependencies: All Phase 1-5 tasks
- Provides: Final verification that all acceptance criteria are met
- Size: Medium (1 E2E test file + verification)

## Implementation Content
Execute comprehensive quality assurance:
1. Implement and run E2E tests for complete blockchain monitoring flow
2. Verify all Design Doc acceptance criteria (AC-1.x through AC-10.x)
3. Run full quality checks (types, lint, format, build)
4. Achieve code coverage >= 80%

Reference: Design Doc "Test Strategy" and "E2E Tests" sections.

## Target Files
- [ ] `libs/blockchain/src/blockchain-monitoring.e2e.test.ts` (new)

## Implementation Steps

### 1. Create E2E Test File

```typescript
// libs/blockchain/src/blockchain-monitoring.e2e.test.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { BlockchainModule } from './blockchain.module';
import { BlockchainService } from './blockchain.service';
import { TronGridClient } from './clients/trongrid.client';
import { DbService } from '@app/db';
import { TRANSACTION_NEW_EVENT } from './events/transaction.events';
import { Transaction, TransactionType, TransactionNewEvent } from './interfaces/transaction.interface';
import { USDT_CONTRACT_ADDRESS } from './constants/contracts';

describe('Blockchain Monitoring E2E Tests', () => {
  let module: TestingModule;
  let blockchainService: BlockchainService;
  let tronGridClient: jest.Mocked<TronGridClient>;
  let dbService: jest.Mocked<DbService>;
  let eventEmitter: EventEmitter2;

  const mockWalletAddress = 'TMonitoredWallet123';

  const createMockTransaction = (
    hash: string,
    toAddress: string,
    timestamp: number,
  ): Transaction => ({
    hash,
    type: TransactionType.USDT,
    fromAddress: 'TExternalSender',
    toAddress,
    amount: '1000000',
    timestamp,
    blockNumber: 12345,
    contractAddress: USDT_CONTRACT_ADDRESS,
  });

  beforeEach(async () => {
    jest.useFakeTimers();

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              blockchain: {
                trongrid: {
                  baseUrl: 'https://api.trongrid.io',
                  apiKey: 'test-key',
                  timeoutMs: 10000,
                },
                polling: {
                  intervalMs: 100,
                  enabled: true,
                  fallbackWindowMs: 60000,
                },
                lruCache: {
                  maxSize: 1000,
                  ttlMs: 3600000,
                },
                backoff: {
                  initialMs: 100,
                  maxMs: 1000,
                  multiplier: 2,
                  jitterMs: 50,
                },
                contracts: {
                  usdt: USDT_CONTRACT_ADDRESS,
                },
              },
            }),
          ],
        }),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        BlockchainService,
        {
          provide: TronGridClient,
          useValue: {
            fetchUSDTTransactions: jest.fn(),
          },
        },
        {
          provide: DbService,
          useValue: {
            getMonitoredWalletAddress: jest.fn(),
            getLastTransactionTimestamp: jest.fn(),
            findTransactionByHash: jest.fn(),
            saveTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    blockchainService = module.get<BlockchainService>(BlockchainService);
    tronGridClient = module.get(TronGridClient);
    dbService = module.get(DbService);
    eventEmitter = module.get(EventEmitter2);
  });

  afterEach(async () => {
    await module.close();
    jest.useRealTimers();
  });

  /**
   * E2E Test 1: Complete USDT Detection Flow
   * @covers AC-1.1, AC-2.1, AC-2.2, AC-3.1, AC-4.1-4.3, AC-5.1-5.2, AC-10.1
   * @priority 1
   */
  describe('Complete USDT Detection Flow', () => {
    it('should detect incoming USDT transaction and emit event', async () => {
      // Setup
      const initialTimestamp = Date.now() - 30000;
      const txTimestamp = Date.now() - 10000;
      const incomingTx = createMockTransaction('new-tx-hash', mockWalletAddress, txTimestamp);

      dbService.getMonitoredWalletAddress.mockResolvedValue(mockWalletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(initialTimestamp);
      dbService.findTransactionByHash.mockResolvedValue(null); // Not a duplicate
      dbService.saveTransaction.mockResolvedValue(undefined);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([incomingTx]);

      // Listen for event
      const eventPromise = new Promise<TransactionNewEvent>((resolve) => {
        eventEmitter.once(TRANSACTION_NEW_EVENT, (event: TransactionNewEvent) => {
          resolve(event);
        });
      });

      // Start monitoring
      await blockchainService.onModuleInit();

      // Advance timer to trigger poll
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Wait for event (with timeout)
      const receivedEvent = await Promise.race([
        eventPromise,
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Event timeout')), 1000),
        ),
      ]);

      // Verify
      expect(receivedEvent).toBeDefined();
      expect(receivedEvent!.transaction.hash).toBe('new-tx-hash');
      expect(receivedEvent!.transaction.type).toBe(TransactionType.USDT);
      expect(receivedEvent!.transaction.toAddress).toBe(mockWalletAddress);
      expect(receivedEvent!.transaction.amount).toBe('1000000');
      expect(receivedEvent!.transaction.contractAddress).toBe(USDT_CONTRACT_ADDRESS);
      expect(receivedEvent!.detectedAt).toBeGreaterThan(0);

      // Verify transaction was saved to DB
      expect(dbService.saveTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ hash: 'new-tx-hash' }),
      );

      // Cleanup
      await blockchainService.onModuleDestroy();
    });

    it('should NOT emit event for outgoing transaction', async () => {
      // Setup: Transaction FROM wallet (outgoing)
      const outgoingTx = createMockTransaction(
        'outgoing-tx',
        'TExternalReceiver', // TO is external
        Date.now(),
      );
      outgoingTx.fromAddress = mockWalletAddress; // FROM is our wallet

      dbService.getMonitoredWalletAddress.mockResolvedValue(mockWalletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(Date.now() - 60000);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([outgoingTx]);

      let eventReceived = false;
      eventEmitter.on(TRANSACTION_NEW_EVENT, () => {
        eventReceived = true;
      });

      // Start monitoring
      await blockchainService.onModuleInit();

      // Advance timer
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Wait a bit more
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Verify: No event emitted for outgoing tx
      expect(eventReceived).toBe(false);
      expect(dbService.saveTransaction).not.toHaveBeenCalled();

      await blockchainService.onModuleDestroy();
    });

    it('should NOT emit duplicate event for same transaction', async () => {
      const txHash = 'duplicate-tx-hash';
      const tx = createMockTransaction(txHash, mockWalletAddress, Date.now());

      dbService.getMonitoredWalletAddress.mockResolvedValue(mockWalletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(Date.now() - 60000);

      // First poll: new transaction
      dbService.findTransactionByHash.mockResolvedValueOnce(null);
      dbService.saveTransaction.mockResolvedValue(undefined);
      tronGridClient.fetchUSDTTransactions.mockResolvedValueOnce([tx]);

      // Second poll: same transaction (now in cache)
      tronGridClient.fetchUSDTTransactions.mockResolvedValueOnce([tx]);

      let eventCount = 0;
      eventEmitter.on(TRANSACTION_NEW_EVENT, () => {
        eventCount++;
      });

      await blockchainService.onModuleInit();

      // First poll
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Second poll
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should only emit once
      expect(eventCount).toBe(1);

      await blockchainService.onModuleDestroy();
    });
  });

  /**
   * E2E Test 2: Restart Continuity
   * @covers AC-10.1, AC-10.2, AC-10.3, AC-10.4, AC-10.5
   * @priority 2
   */
  describe('Restart Continuity', () => {
    it('should continue from last saved timestamp after restart', async () => {
      // Simulate restart: DB has last transaction from before "downtime"
      const lastSavedTimestamp = Date.now() - 300000; // 5 minutes ago

      dbService.getMonitoredWalletAddress.mockResolvedValue(mockWalletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(lastSavedTimestamp);
      dbService.findTransactionByHash.mockResolvedValue(null);
      dbService.saveTransaction.mockResolvedValue(undefined);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);

      await blockchainService.onModuleInit();

      // Advance timer
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Verify: Should use DB timestamp, not a recent one
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        mockWalletAddress,
        lastSavedTimestamp,
      );

      await blockchainService.onModuleDestroy();
    });

    it('should use fallback timestamp when no DB data exists', async () => {
      const now = Date.now();

      dbService.getMonitoredWalletAddress.mockResolvedValue(mockWalletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(null); // No DB data
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);

      await blockchainService.onModuleInit();

      // Advance timer
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Verify: Should use fallback (now - 60s)
      const calledTimestamp = tronGridClient.fetchUSDTTransactions.mock.calls[0][1];
      const expectedFallback = now - 60000;

      // Allow 2 second tolerance for test timing
      expect(calledTimestamp).toBeGreaterThanOrEqual(expectedFallback - 2000);
      expect(calledTimestamp).toBeLessThanOrEqual(expectedFallback + 2000);

      await blockchainService.onModuleDestroy();
    });

    it('should NOT skip transactions during downtime', async () => {
      // Scenario: Service was down for 5 minutes, multiple transactions occurred
      const lastSavedTimestamp = Date.now() - 300000; // Last tx 5 min ago
      const downtimeTx1 = createMockTransaction('downtime-tx-1', mockWalletAddress, Date.now() - 240000);
      const downtimeTx2 = createMockTransaction('downtime-tx-2', mockWalletAddress, Date.now() - 180000);
      const downtimeTx3 = createMockTransaction('downtime-tx-3', mockWalletAddress, Date.now() - 60000);

      dbService.getMonitoredWalletAddress.mockResolvedValue(mockWalletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(lastSavedTimestamp);
      dbService.findTransactionByHash.mockResolvedValue(null);
      dbService.saveTransaction.mockResolvedValue(undefined);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([downtimeTx1, downtimeTx2, downtimeTx3]);

      let eventCount = 0;
      eventEmitter.on(TRANSACTION_NEW_EVENT, () => {
        eventCount++;
      });

      await blockchainService.onModuleInit();

      // Advance timer
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Verify: All transactions during downtime should be processed
      expect(eventCount).toBe(3);
      expect(dbService.saveTransaction).toHaveBeenCalledTimes(3);

      await blockchainService.onModuleDestroy();
    });
  });
});
```

### 2. Run E2E Tests
```bash
pnpm run test libs/blockchain/src/blockchain-monitoring.e2e.test.ts
```

### 3. Verify All Acceptance Criteria

#### Polling (FR-1)
- [ ] AC-1.1: `pnpm run start:dev` and observe 5-second poll interval in logs
- [ ] AC-1.2: Slow down API response and verify skip warning logged
- [ ] AC-1.3: Mock 429 response and verify backoff/resume

#### USDT Monitoring (FR-2)
- [ ] AC-2.1: Unit test verifies all fields extracted
- [ ] AC-2.2: Integration test verifies contract_address filter
- [ ] AC-2.3: Integration test verifies only_confirmed=true
- [ ] AC-2.4: Integration test verifies min_timestamp parameter
- [ ] AC-2.5: Integration test verifies retry behavior

#### Incoming Filtering (FR-3)
- [ ] AC-3.1: E2E test verifies incoming tx processed
- [ ] AC-3.2: E2E test verifies outgoing tx ignored

#### Deduplication (FR-4)
- [ ] AC-4.1: Integration test verifies LRU cache hit
- [ ] AC-4.2: Integration test verifies DB hit
- [ ] AC-4.3: Integration test verifies new tx added to both
- [ ] AC-4.4: Configuration test verifies default 10000

#### Event Emission (FR-5)
- [ ] AC-5.1: E2E test verifies transaction.new event emitted
- [ ] AC-5.2: E2E test verifies event payload fields
- [ ] AC-5.3: Integration test verifies error handling

#### Wallet Configuration (FR-6)
- [ ] AC-6.1: Integration test verifies DB load on start
- [ ] AC-6.2: Integration test verifies pause on no wallet
- [ ] AC-6.3: refreshWalletAddress method available

#### Error Handling (FR-7)
- [ ] AC-7.1: Integration test verifies 429 backoff
- [ ] AC-7.2: Integration test verifies 5xx retry
- [ ] AC-7.3: Sentry integration (manual verification)
- [ ] AC-7.4: Backoff includes jitter (code review)

#### Graceful Shutdown (FR-8)
- [ ] AC-8.1: Integration test verifies current poll completes
- [ ] AC-8.2: DeduplicationService persists on shutdown
- [ ] AC-8.3: Integration test verifies no new polls after signal

#### Configuration (FR-9)
- [ ] AC-9.1: Config test verifies env var reading
- [ ] AC-9.2: Config test verifies required vars
- [ ] AC-9.3: Config test verifies defaults

#### Initial Timestamp (FR-10)
- [ ] AC-10.1: E2E test verifies DB timestamp query
- [ ] AC-10.2: E2E test verifies fallback
- [ ] AC-10.3: E2E test verifies restart continuity
- [ ] AC-10.4: E2E test verifies no tx skipped
- [ ] AC-10.5: Integration test verifies subsequent poll timestamp

### 4. Run Quality Checks
```bash
# Type checking and linting
pnpm run check

# All tests
pnpm run test

# Coverage report
pnpm run test:cov
# Target: >= 80%

# Build
pnpm run build
```

### 5. Final Build Verification
```bash
# Ensure build succeeds
pnpm run build

# Start in production mode (optional)
pnpm run start:prod
```

## Completion Criteria
- [ ] All 2 E2E tests pass
- [ ] All 11+ integration tests pass
- [ ] All acceptance criteria verified (checklist above)
- [ ] Code coverage >= 80%
- [ ] `pnpm run check` passes (zero errors)
- [ ] `pnpm run build` succeeds
- [ ] Application starts and polls correctly

## Quality Metrics Summary

| Metric | Target | Actual |
|--------|--------|--------|
| Unit Tests | Pass | [ ] |
| Integration Tests | 11+ pass | [ ] |
| E2E Tests | 2 pass | [ ] |
| Code Coverage | >= 80% | [ ]% |
| Lint Errors | 0 | [ ] |
| Build | Success | [ ] |

## Notes
- Impact scope: New E2E test file
- Constraints: Must not modify any implementation code
- E2E tests use full module with mocked external dependencies (TronGrid, DB)
- This is the final verification phase before feature is complete
