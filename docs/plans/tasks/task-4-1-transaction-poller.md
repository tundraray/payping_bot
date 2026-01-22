# Task: Transaction Poller Service

Metadata:
- Phase: 4 (Orchestration)
- Dependencies: task-2-1 (TronGridClient), task-3-2 (TransactionProcessorService), task-1-3 (blockchain.config.ts)
- Provides: TransactionPollerService for polling orchestration
- Size: Medium (2 files: implementation + integration tests)

## Implementation Content
Create the polling orchestration service that:
1. Polls TronGrid API at configurable intervals (default 5s)
2. Retrieves initial timestamp from database (or fallback to now-60s)
3. Skips polls when previous is still in progress
4. Implements graceful shutdown (completes current poll)
5. Manages state transitions (IDLE -> POLLING -> PAUSED -> STOPPED)

Reference: Design Doc "TransactionPollerService" component section and "State Transitions" section.

## Target Files
- [x] `libs/blockchain/src/services/transaction-poller.service.ts` (new)
- [x] `libs/blockchain/src/services/transaction-poller.service.spec.ts` (new - renamed from .int.test.ts to match testRegex)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Integration Tests

```typescript
// libs/blockchain/src/services/transaction-poller.int.test.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TransactionPollerService, PollerState } from './transaction-poller.service';
import { TronGridClient } from '../clients/trongrid.client';
import { TransactionProcessorService } from './transaction-processor.service';
import { DbService } from '@app/db';
import { Transaction, TransactionType } from '../interfaces/transaction.interface';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';

describe('TransactionPollerService Integration Tests', () => {
  let service: TransactionPollerService;
  let tronGridClient: jest.Mocked<TronGridClient>;
  let processorService: jest.Mocked<TransactionProcessorService>;
  let dbService: jest.Mocked<DbService>;

  const mockConfig = {
    polling: {
      intervalMs: 100, // Fast interval for tests
      enabled: true,
      fallbackWindowMs: 60000,
    },
    backoff: {
      initialMs: 100,
      maxMs: 1000,
      multiplier: 2,
      jitterMs: 50,
    },
  };

  const createMockTransaction = (hash: string, timestamp: number): Transaction => ({
    hash,
    type: TransactionType.USDT,
    fromAddress: 'TFromAddress',
    toAddress: 'TMonitoredWallet',
    amount: '1000000',
    timestamp,
    blockNumber: 12345,
    contractAddress: USDT_CONTRACT_ADDRESS,
  });

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionPollerService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'blockchain') return mockConfig;
              return undefined;
            }),
          },
        },
        {
          provide: TronGridClient,
          useValue: {
            fetchUSDTTransactions: jest.fn(),
          },
        },
        {
          provide: TransactionProcessorService,
          useValue: {
            processUSDTTransactions: jest.fn(),
          },
        },
        {
          provide: DbService,
          useValue: {
            getLastTransactionTimestamp: jest.fn(),
            getMonitoredWalletAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionPollerService>(TransactionPollerService);
    tronGridClient = module.get(TronGridClient);
    processorService = module.get(TransactionProcessorService);
    dbService = module.get(DbService);
  });

  afterEach(async () => {
    await service.stopPolling();
    jest.useRealTimers();
  });

  /**
   * @category core-functionality
   * @complexity high
   * @covers AC-10.1, AC-10.3
   */
  describe('AC-10.1/AC-10.3: retrieves last timestamp from DB on start', () => {
    it('should query DB for last transaction timestamp on first poll', async () => {
      const lastTimestamp = Date.now() - 30000; // 30 seconds ago
      const walletAddress = 'TMonitoredWallet';

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(lastTimestamp);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({ processed: 0, skipped: 0 });

      await service.startPolling();

      // Advance timer to trigger first poll
      jest.advanceTimersByTime(100);
      await Promise.resolve(); // Flush promises

      expect(dbService.getLastTransactionTimestamp).toHaveBeenCalled();
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        walletAddress,
        lastTimestamp,
      );
    });

    it('should continue from last saved timestamp on restart', async () => {
      const savedTimestamp = Date.now() - 120000; // 2 minutes ago (during "downtime")
      const walletAddress = 'TMonitoredWallet';

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(savedTimestamp);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({ processed: 0, skipped: 0 });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should use the DB timestamp, not a recent one
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        walletAddress,
        savedTimestamp,
      );
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-10.2
   */
  describe('AC-10.2: uses fallback when no DB data', () => {
    it('should use fallback timestamp (now - 60s) when no DB data', async () => {
      const walletAddress = 'TMonitoredWallet';
      const now = Date.now();

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(null);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({ processed: 0, skipped: 0 });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should use fallback: now - fallbackWindowMs (60000)
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        walletAddress,
        expect.any(Number),
      );

      const calledTimestamp = tronGridClient.fetchUSDTTransactions.mock.calls[0][1];
      const expectedFallback = now - mockConfig.polling.fallbackWindowMs;

      // Allow some tolerance for timing
      expect(calledTimestamp).toBeGreaterThanOrEqual(expectedFallback - 1000);
      expect(calledTimestamp).toBeLessThanOrEqual(expectedFallback + 1000);
    });
  });

  /**
   * @category edge-case
   * @complexity medium
   * @covers AC-1.2
   */
  describe('AC-1.2: skips poll when previous in progress', () => {
    it('should skip scheduled poll when previous is still running', async () => {
      const walletAddress = 'TMonitoredWallet';

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(Date.now());

      // Make first poll take a long time
      let resolveFirstPoll: () => void;
      const slowPollPromise = new Promise<Transaction[]>((resolve) => {
        resolveFirstPoll = () => resolve([]);
      });
      tronGridClient.fetchUSDTTransactions.mockReturnValueOnce(slowPollPromise);

      processorService.processUSDTTransactions.mockResolvedValue({ processed: 0, skipped: 0 });

      await service.startPolling();

      // First poll starts
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Clear mock to track second call
      const initialCallCount = tronGridClient.fetchUSDTTransactions.mock.calls.length;

      // Second poll interval fires while first is still running
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should NOT have started a new poll
      expect(tronGridClient.fetchUSDTTransactions.mock.calls.length).toBe(initialCallCount);

      // Resolve first poll
      resolveFirstPoll!();
      await Promise.resolve();
    });
  });

  /**
   * @category edge-case
   * @complexity medium
   * @covers AC-8.1, AC-8.3
   */
  describe('AC-8.1/AC-8.3: graceful shutdown', () => {
    it('should complete current poll before shutting down', async () => {
      const walletAddress = 'TMonitoredWallet';

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(Date.now());

      let resolveCurrentPoll: () => void;
      const currentPollPromise = new Promise<Transaction[]>((resolve) => {
        resolveCurrentPoll = () => resolve([]);
      });
      tronGridClient.fetchUSDTTransactions.mockReturnValue(currentPollPromise);
      processorService.processUSDTTransactions.mockResolvedValue({ processed: 0, skipped: 0 });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Start shutdown
      const stopPromise = service.stopPolling();

      // State should be SHUTTING_DOWN
      expect(service.getState()).toBe(PollerState.SHUTTING_DOWN);

      // Resolve current poll
      resolveCurrentPoll!();

      await stopPromise;

      // State should be STOPPED
      expect(service.getState()).toBe(PollerState.STOPPED);
    });

    it('should not start new polls after shutdown signal', async () => {
      const walletAddress = 'TMonitoredWallet';

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(Date.now());
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({ processed: 0, skipped: 0 });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      const callCountBeforeStop = tronGridClient.fetchUSDTTransactions.mock.calls.length;

      await service.stopPolling();

      // Advance time - should not trigger new polls
      jest.advanceTimersByTime(500);
      await Promise.resolve();

      expect(tronGridClient.fetchUSDTTransactions.mock.calls.length).toBe(callCountBeforeStop);
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-10.5
   */
  describe('AC-10.5: subsequent polls use last processed timestamp', () => {
    it('should use timestamp from last transaction in subsequent polls', async () => {
      const walletAddress = 'TMonitoredWallet';
      const initialTimestamp = Date.now() - 60000;
      const tx1Timestamp = Date.now() - 30000;
      const tx2Timestamp = Date.now() - 15000;

      dbService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      dbService.getLastTransactionTimestamp.mockResolvedValue(initialTimestamp);

      // First poll returns transactions
      tronGridClient.fetchUSDTTransactions
        .mockResolvedValueOnce([
          createMockTransaction('tx1', tx1Timestamp),
          createMockTransaction('tx2', tx2Timestamp),
        ])
        .mockResolvedValueOnce([]);

      processorService.processUSDTTransactions.mockResolvedValue({ processed: 2, skipped: 0 });

      await service.startPolling();

      // First poll
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Second poll
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Second poll should use the latest transaction timestamp
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenNthCalledWith(
        2,
        walletAddress,
        tx2Timestamp,
      );
    });
  });
});
```

Run tests to confirm they fail:
```bash
pnpm run test libs/blockchain/src/services/transaction-poller.int.test.ts
```

### 2. Green Phase - Implement TransactionPollerService

```typescript
// libs/blockchain/src/services/transaction-poller.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TronGridClient } from '../clients/trongrid.client';
import { TransactionProcessorService } from './transaction-processor.service';
import { DbService } from '@app/db';
import { BlockchainConfig } from '../config/blockchain.config';
import { Transaction } from '../interfaces/transaction.interface';

export enum PollerState {
  IDLE = 'IDLE',
  POLLING = 'POLLING',
  PAUSED = 'PAUSED',
  SHUTTING_DOWN = 'SHUTTING_DOWN',
  STOPPED = 'STOPPED',
}

@Injectable()
export class TransactionPollerService implements OnModuleDestroy {
  private readonly logger = new Logger(TransactionPollerService.name);
  private readonly config: BlockchainConfig;

  private state: PollerState = PollerState.IDLE;
  private pollInterval: NodeJS.Timeout | null = null;
  private isPollingInProgress = false;
  private lastPollTimestamp: number | null = null;
  private walletAddress: string | null = null;
  private currentPollPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly tronGridClient: TronGridClient,
    private readonly processorService: TransactionProcessorService,
    private readonly dbService: DbService,
  ) {
    this.config = this.configService.get<BlockchainConfig>('blockchain')!;
  }

  async onModuleDestroy(): Promise<void> {
    await this.stopPolling();
  }

  /**
   * Start the polling loop.
   */
  async startPolling(): Promise<void> {
    if (this.state !== PollerState.IDLE && this.state !== PollerState.STOPPED) {
      this.logger.warn(`Cannot start polling from state: ${this.state}`);
      return;
    }

    // Load wallet address
    this.walletAddress = await this.dbService.getMonitoredWalletAddress();

    if (!this.walletAddress) {
      this.logger.error('No wallet address configured, pausing polling');
      this.state = PollerState.PAUSED;
      return;
    }

    // Get initial timestamp from database
    this.lastPollTimestamp = await this.getInitialTimestamp();

    this.state = PollerState.POLLING;
    this.logger.log(
      `Starting polling with interval ${this.config.polling.intervalMs}ms, initial timestamp: ${this.lastPollTimestamp}`,
    );

    // Start interval
    this.pollInterval = setInterval(() => {
      this.executePoll();
    }, this.config.polling.intervalMs);

    // Execute first poll immediately
    this.executePoll();
  }

  /**
   * Stop the polling loop gracefully.
   * Waits for current poll to complete before stopping.
   */
  async stopPolling(): Promise<void> {
    if (this.state === PollerState.STOPPED || this.state === PollerState.IDLE) {
      return;
    }

    this.state = PollerState.SHUTTING_DOWN;
    this.logger.log('Shutting down poller...');

    // Clear interval to prevent new polls
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for current poll to complete
    if (this.currentPollPromise) {
      this.logger.log('Waiting for current poll to complete...');
      await this.currentPollPromise;
    }

    this.state = PollerState.STOPPED;
    this.logger.log('Poller stopped');
  }

  /**
   * Get current poller state.
   */
  getState(): PollerState {
    return this.state;
  }

  /**
   * Check if polling is currently in progress.
   */
  isPolling(): boolean {
    return this.isPollingInProgress;
  }

  /**
   * Get initial timestamp for polling.
   * Queries database for last transaction, falls back to now - fallbackWindowMs.
   */
  private async getInitialTimestamp(): Promise<number> {
    const dbTimestamp = await this.dbService.getLastTransactionTimestamp();

    if (dbTimestamp !== null) {
      this.logger.log(`Using DB timestamp: ${new Date(dbTimestamp).toISOString()}`);
      return dbTimestamp;
    }

    const fallbackTimestamp = Date.now() - this.config.polling.fallbackWindowMs;
    this.logger.log(
      `No DB data, using fallback timestamp: ${new Date(fallbackTimestamp).toISOString()}`,
    );
    return fallbackTimestamp;
  }

  /**
   * Execute a single poll cycle.
   */
  private executePoll(): void {
    // AC-8.3: No new polls after shutdown signal
    if (this.state === PollerState.SHUTTING_DOWN || this.state === PollerState.STOPPED) {
      return;
    }

    // AC-1.2: Skip if previous poll is still in progress
    if (this.isPollingInProgress) {
      this.logger.warn('Previous poll still in progress, skipping');
      return;
    }

    this.isPollingInProgress = true;
    this.currentPollPromise = this.performPoll().finally(() => {
      this.isPollingInProgress = false;
      this.currentPollPromise = null;
    });
  }

  /**
   * Perform the actual poll operation.
   */
  private async performPoll(): Promise<void> {
    if (!this.walletAddress || !this.lastPollTimestamp) {
      this.logger.error('Poll skipped: missing wallet address or timestamp');
      return;
    }

    const startTime = Date.now();

    try {
      this.logger.debug(
        `Polling for transactions since ${new Date(this.lastPollTimestamp).toISOString()}`,
      );

      // Fetch transactions from TronGrid
      const transactions = await this.tronGridClient.fetchUSDTTransactions(
        this.walletAddress,
        this.lastPollTimestamp,
      );

      if (transactions.length > 0) {
        // Process transactions
        const result = await this.processorService.processUSDTTransactions(
          transactions,
          this.walletAddress,
        );

        // AC-10.5: Update timestamp to latest transaction
        this.lastPollTimestamp = this.getLatestTimestamp(transactions);

        this.logger.log(
          `Poll complete: ${transactions.length} fetched, ${result.processed} processed, ${result.skipped} skipped`,
        );
      }

      const durationMs = Date.now() - startTime;
      this.logger.debug(`Poll cycle completed in ${durationMs}ms`);
    } catch (error) {
      this.logger.error(`Poll failed: ${error}`);
      // Error handling is done in TronGridClient (backoff/retry)
      // Continue polling on next interval
    }
  }

  /**
   * Get the latest timestamp from a list of transactions.
   */
  private getLatestTimestamp(transactions: Transaction[]): number {
    if (transactions.length === 0) {
      return this.lastPollTimestamp!;
    }

    return Math.max(...transactions.map((tx) => tx.timestamp));
  }
}
```

Run tests to confirm they pass:
```bash
pnpm run test libs/blockchain/src/services/transaction-poller.int.test.ts
```

### 3. Refactor Phase
- Review state machine transitions
- Ensure logging is comprehensive
- Add metrics hooks for poll duration
- Consider extracting state management

## Completion Criteria
- [x] TransactionPollerService created with polling orchestration
- [x] All 5+ integration tests pass (12 tests pass)
- [x] Initial timestamp retrieved from DB (AC-10.1, AC-10.3)
- [x] Fallback timestamp used when no DB data (AC-10.2)
- [x] Skip poll when previous in progress (AC-1.2)
- [x] Graceful shutdown implemented (AC-8.1, AC-8.3)
- [x] Subsequent polls use last processed timestamp (AC-10.5)
- [x] Operation verified: L2 (Test Operation) - all tests pass
- [x] `pnpm run check` passes

## Related Acceptance Criteria
- AC-1.1: Poll every 5 seconds (configurable)
- AC-1.2: Skip poll when previous in progress
- AC-1.3: Resume after rate limit backoff
- AC-7.4: Jitter in backoff (handled by TronGridClient)
- AC-8.1: Complete current poll on SIGTERM
- AC-8.2: Flush pending DB writes (handled by DeduplicationService)
- AC-8.3: No new polls after shutdown signal
- AC-10.1: Query DB for last transaction timestamp on start
- AC-10.2: Fallback to now-60s when no DB data
- AC-10.3: Continue from last saved timestamp on restart
- AC-10.4: Do NOT skip transactions during downtime
- AC-10.5: Subsequent polls use last processed timestamp

## Notes
- Impact scope: New files in `libs/blockchain/src/services/`
- Constraints: Must integrate with TronGridClient and TransactionProcessorService
- State machine: IDLE -> POLLING -> SHUTTING_DOWN -> STOPPED
- Assumes DbService has `getMonitoredWalletAddress` and `getLastTransactionTimestamp` methods
