// TransactionPollerService Integration Tests - TDD Red Phase
// Covers: AC-1.1, AC-1.2, AC-8.1, AC-8.3, AC-10.1, AC-10.2, AC-10.3, AC-10.5

import { TransactionsService } from '@app/db';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { TronGridClient } from '../clients/trongrid.client';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';
import type { Transaction } from '../interfaces/transaction.interface';
import { TransactionType } from '../interfaces/transaction.interface';
import { PollerState, TransactionPollerService } from './transaction-poller.service';
import { TransactionProcessorService } from './transaction-processor.service';

/**
 * Helper function to create mock Transaction objects
 */
function createMockTransaction(hash: string, timestamp: number): Transaction {
  return {
    hash,
    type: TransactionType.USDT,
    fromAddress: 'TFromAddress123456789012345678901234',
    toAddress: 'TMonitoredWallet12345678901234567890',
    amount: '1000000',
    timestamp,
    blockNumber: 12345,
    contractAddress: USDT_CONTRACT_ADDRESS,
  };
}

describe('TransactionPollerService Integration Tests', () => {
  let service: TransactionPollerService;
  let tronGridClient: jest.Mocked<TronGridClient>;
  let processorService: jest.Mocked<TransactionProcessorService>;
  let transactionsService: jest.Mocked<TransactionsService>;

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
            getAccountCreationTimestamp: jest.fn(),
          },
        },
        {
          provide: TransactionProcessorService,
          useValue: {
            processUSDTTransactions: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            getLastTimestamp: jest.fn(),
            getMonitoredWalletAddress: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<TransactionPollerService>(TransactionPollerService);
    tronGridClient = module.get(TronGridClient);
    processorService = module.get(TransactionProcessorService);
    transactionsService = module.get(TransactionsService);
  });

  afterEach(async () => {
    await service.stopPolling();
    jest.useRealTimers();
  });

  // ===========================================================================
  // AC-10.1/AC-10.3: Retrieves last timestamp from DB on start
  // ===========================================================================
  describe('AC-10.1/AC-10.3: retrieves last timestamp from DB on start', () => {
    /**
     * @category core-functionality
     * @complexity high
     * @covers AC-10.1, AC-10.3
     */
    it('should query DB for last transaction timestamp on first poll', async () => {
      const lastTimestamp = Date.now() - 30000; // 30 seconds ago
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(lastTimestamp);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();

      // Advance timer to trigger first poll
      jest.advanceTimersByTime(100);
      await Promise.resolve(); // Flush promises

      expect(transactionsService.getLastTimestamp).toHaveBeenCalled();
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        walletAddress,
        lastTimestamp,
      );
    });

    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-10.3
     */
    it('should continue from last saved timestamp on restart', async () => {
      const savedTimestamp = Date.now() - 120000; // 2 minutes ago (during "downtime")
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(savedTimestamp);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

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

  // ===========================================================================
  // AC-10.2: Uses fallback when no DB data
  // ===========================================================================
  describe('AC-10.2: uses fallback when no DB data', () => {
    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-10.2
     */
    it('should use wallet creation date when no DB data', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';
      const walletCreationTimestamp = 1609459200000; // 2021-01-01 00:00:00 UTC

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(null);
      tronGridClient.getAccountCreationTimestamp.mockResolvedValue(walletCreationTimestamp);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should use wallet creation timestamp
      expect(tronGridClient.getAccountCreationTimestamp).toHaveBeenCalledWith(walletAddress);
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        walletAddress,
        walletCreationTimestamp,
      );
    });

    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-10.2
     */
    it('should use now - 2 years fallback when no DB data and wallet creation fails', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';
      const now = Date.now();
      const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(null);
      tronGridClient.getAccountCreationTimestamp.mockResolvedValue(null);
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should use fallback: now - 2 years
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledWith(
        walletAddress,
        expect.any(Number),
      );

      const calledTimestamp = tronGridClient.fetchUSDTTransactions.mock.calls[0][1];
      const expectedFallback = now - TWO_YEARS_MS;

      // Allow some tolerance for timing
      expect(calledTimestamp).toBeGreaterThanOrEqual(expectedFallback - 1000);
      expect(calledTimestamp).toBeLessThanOrEqual(expectedFallback + 1000);
    });
  });

  // ===========================================================================
  // AC-1.2: Skips poll when previous in progress
  // ===========================================================================
  describe('AC-1.2: skips poll when previous in progress', () => {
    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-1.2
     */
    it('should skip scheduled poll when previous is still running', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(Date.now());

      // Make first poll take a long time
      let resolveFirstPoll: (() => void) | undefined;
      const slowPollPromise = new Promise<Transaction[]>((resolve) => {
        resolveFirstPoll = () => resolve([]);
      });
      tronGridClient.fetchUSDTTransactions.mockReturnValueOnce(slowPollPromise);

      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

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
      resolveFirstPoll?.();
      await Promise.resolve();
    });
  });

  // ===========================================================================
  // AC-8.1/AC-8.3: Graceful shutdown
  // ===========================================================================
  describe('AC-8.1/AC-8.3: graceful shutdown', () => {
    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-8.1, AC-8.3
     */
    it('should complete current poll before shutting down', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(Date.now());

      let resolveCurrentPoll: (() => void) | undefined;
      const currentPollPromise = new Promise<Transaction[]>((resolve) => {
        resolveCurrentPoll = () => resolve([]);
      });
      tronGridClient.fetchUSDTTransactions.mockReturnValue(currentPollPromise);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Start shutdown
      const stopPromise = service.stopPolling();

      // State should be SHUTTING_DOWN
      expect(service.getState()).toBe(PollerState.SHUTTING_DOWN);

      // Resolve current poll
      resolveCurrentPoll?.();

      await stopPromise;

      // State should be STOPPED
      expect(service.getState()).toBe(PollerState.STOPPED);
    });

    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-8.3
     */
    it('should not start new polls after shutdown signal', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(Date.now());
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

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

  // ===========================================================================
  // AC-10.5: Subsequent polls use last processed timestamp
  // ===========================================================================
  describe('AC-10.5: subsequent polls use last processed timestamp', () => {
    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-10.5
     */
    it('should use timestamp from last transaction in subsequent polls', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';
      const initialTimestamp = Date.now() - 60000;
      const tx1Timestamp = Date.now() - 30000;
      const tx2Timestamp = Date.now() - 15000;

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(initialTimestamp);

      // First poll returns transactions
      tronGridClient.fetchUSDTTransactions
        .mockResolvedValueOnce([
          createMockTransaction('tx1', tx1Timestamp),
          createMockTransaction('tx2', tx2Timestamp),
        ])
        .mockResolvedValueOnce([]);

      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 2,
        skipped: 0,
        notified: 2,
      });

      await service.startPolling();

      // First poll - advance time and flush async operations
      await jest.advanceTimersByTimeAsync(100);

      // Second poll
      await jest.advanceTimersByTimeAsync(100);

      // Second poll should use the latest transaction timestamp
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenNthCalledWith(
        2,
        walletAddress,
        tx2Timestamp,
      );
    });
  });

  // ===========================================================================
  // State management
  // ===========================================================================
  describe('State management', () => {
    /**
     * @category core-functionality
     * @complexity low
     */
    it('should start in IDLE state', () => {
      expect(service.getState()).toBe(PollerState.IDLE);
    });

    /**
     * @category core-functionality
     * @complexity low
     */
    it('should transition to POLLING state after startPolling', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(Date.now());
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();

      expect(service.getState()).toBe(PollerState.POLLING);
    });

    /**
     * @category edge-case
     * @complexity medium
     */
    it('should transition to PAUSED state when no wallet address configured', async () => {
      transactionsService.getMonitoredWalletAddress.mockResolvedValue(null);

      await service.startPolling();

      expect(service.getState()).toBe(PollerState.PAUSED);
    });

    /**
     * @category core-functionality
     * @complexity low
     */
    it('should not start polling when already polling', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(Date.now());
      tronGridClient.fetchUSDTTransactions.mockResolvedValue([]);
      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();
      await service.startPolling(); // Second call should be ignored

      // Should only call getMonitoredWalletAddress once
      expect(transactionsService.getMonitoredWalletAddress).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // Error handling
  // ===========================================================================
  describe('Error handling', () => {
    /**
     * @category edge-case
     * @complexity medium
     */
    it('should continue polling after TronGrid API error', async () => {
      const walletAddress = 'TMonitoredWallet12345678901234567890';

      transactionsService.getMonitoredWalletAddress.mockResolvedValue(walletAddress);
      transactionsService.getLastTimestamp.mockResolvedValue(Date.now());

      // First poll fails
      tronGridClient.fetchUSDTTransactions
        .mockRejectedValueOnce(new Error('API Error'))
        .mockResolvedValueOnce([]);

      processorService.processUSDTTransactions.mockResolvedValue({
        processed: 0,
        skipped: 0,
        notified: 0,
      });

      await service.startPolling();

      // First poll (fails)
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      await Promise.resolve(); // Extra tick for error handling

      // Second poll (succeeds)
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      // Should have attempted both polls
      expect(tronGridClient.fetchUSDTTransactions).toHaveBeenCalledTimes(2);
    });
  });
});
