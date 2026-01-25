// PayoutSessionService Unit Tests
// Covers: AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.2, AC-2.3, AC-3.1, AC-3.3, AC-6.1, AC-6.3, AC-6.5, AC-8.1

import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { TronGridClient } from '../../clients/trongrid.client';
import type { BlockchainConfig, PayoutConfig } from '../../config/blockchain.config';
import { USDT_CONTRACT_ADDRESS } from '../../constants/contracts';
import {
  PAYOUT_END_EVENT,
  PAYOUT_START_EVENT,
  PAYOUT_TRANSACTION_EVENT,
  type PayoutEndEvent,
  type PayoutStartEvent,
  type PayoutTransactionEvent,
} from '../../events/payout.events';
import { type Transaction, TransactionType } from '../../interfaces/transaction.interface';
import { PayoutSessionService } from '../payout-session.service';

/**
 * Helper function to create mock Transaction objects
 */
function createMockTransaction(hash: string, options: Partial<Transaction> = {}): Transaction {
  return {
    hash,
    type: TransactionType.USDT,
    fromAddress: 'TWalletAddress1234567890123456789012',
    toAddress: 'TRecipientAddress123456789012345678',
    amount: '1000000', // 1 USDT in raw units
    timestamp: Date.now(),
    blockNumber: 12345678,
    contractAddress: USDT_CONTRACT_ADDRESS,
    ...options,
  };
}

/**
 * Create mock payout configuration
 */
function createMockPayoutConfig(): PayoutConfig {
  return {
    balanceThresholdUsdt: 1000, // 1000 USDT threshold
    timeoutMinutes: 30, // 30 minutes timeout
    checkIntervalMs: 60000, // 60 seconds check interval
  };
}

/**
 * Create mock blockchain configuration
 */
function createMockBlockchainConfig(payoutOverrides: Partial<PayoutConfig> = {}): BlockchainConfig {
  return {
    trongrid: {
      baseUrl: 'https://api.trongrid.io',
      apiKey: 'test-api-key',
      timeoutMs: 10000,
    },
    polling: {
      intervalMs: 5000,
      enabled: true,
      fallbackWindowMs: 63072000000,
      maxPages: 100,
    },
    lruCache: {
      maxSize: 10000,
      ttlMs: 3600000,
    },
    backoff: {
      initialMs: 1000,
      maxMs: 60000,
      multiplier: 2,
      jitterMs: 500,
    },
    contracts: {
      usdt: USDT_CONTRACT_ADDRESS,
    },
    payout: {
      ...createMockPayoutConfig(),
      ...payoutOverrides,
    },
  };
}

const MOCK_WALLET_ADDRESS = 'TWalletAddress1234567890123456789012';

describe('PayoutSessionService', () => {
  let service: PayoutSessionService;
  let tronGridClient: jest.Mocked<TronGridClient>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let _configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    jest.useFakeTimers();

    const mockConfig = createMockBlockchainConfig();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutSessionService,
        {
          provide: TronGridClient,
          useValue: {
            getUSDTBalance: jest.fn().mockResolvedValue('5000000000'), // 5000 USDT
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'blockchain') return mockConfig;
              if (key === 'MONITORED_WALLET_ADDRESS') return MOCK_WALLET_ADDRESS;
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<PayoutSessionService>(PayoutSessionService);
    tronGridClient = module.get(TronGridClient);
    eventEmitter = module.get(EventEmitter2);
    _configService = module.get(ConfigService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // ===========================================================================
  // AC-8.1: New instance initializes to IDLE state
  // ===========================================================================
  describe('AC-8.1: New instance initializes to IDLE state', () => {
    /**
     * @category initialization
     * @complexity low
     * @covers AC-8.1
     */
    it('should initialize with isActive = false (IDLE state)', () => {
      const state = service.getState();

      expect(state.isActive).toBe(false);
    });

    /**
     * @category initialization
     * @complexity low
     * @covers AC-8.1
     */
    it('should initialize with null timestamps and zero counters', () => {
      const state = service.getState();

      expect(state.startedAt).toBeNull();
      expect(state.startBalance).toBeNull();
      expect(state.lastTransactionAt).toBeNull();
      expect(state.transactionCount).toBe(0);
      expect(state.totalAmount).toBe('0');
      expect(state.firstTransactionHash).toBeNull();
    });

    /**
     * @category initialization
     * @complexity low
     * @covers AC-8.1
     */
    it('should return false from isActive() method when in IDLE state', () => {
      expect(service.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // AC-1.1: First outgoing TX transitions IDLE -> ACTIVE
  // ===========================================================================
  describe('AC-1.1: First outgoing TX transitions IDLE -> ACTIVE', () => {
    /**
     * @category state-transition
     * @complexity medium
     * @covers AC-1.1
     */
    it('should transition from IDLE to ACTIVE on first outgoing transaction', async () => {
      const tx = createMockTransaction('first-tx-hash-001');

      expect(service.isActive()).toBe(false);

      await service.handleOutgoingTransaction(tx);

      expect(service.isActive()).toBe(true);
    });

    /**
     * @category state-transition
     * @complexity medium
     * @covers AC-1.1
     */
    it('should fetch balance when starting session', async () => {
      const tx = createMockTransaction('balance-check-tx-001');

      await service.handleOutgoingTransaction(tx);

      expect(tronGridClient.getUSDTBalance).toHaveBeenCalledWith(MOCK_WALLET_ADDRESS);
    });
  });

  // ===========================================================================
  // AC-1.2: Start info recorded (timestamp, balance, hash)
  // ===========================================================================
  describe('AC-1.2: Start info recorded (timestamp, balance, hash)', () => {
    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.2
     */
    it('should record startedAt timestamp when session starts', async () => {
      const beforeTime = Date.now();
      const tx = createMockTransaction('record-start-tx-001');

      await service.handleOutgoingTransaction(tx);
      const afterTime = Date.now();

      const state = service.getState();
      expect(state.startedAt).not.toBeNull();
      expect(state.startedAt?.getTime()).toBeGreaterThanOrEqual(beforeTime);
      expect(state.startedAt?.getTime()).toBeLessThanOrEqual(afterTime);
    });

    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.2
     */
    it('should record startBalance from TronGrid API', async () => {
      const expectedBalance = '5000000000'; // 5000 USDT
      tronGridClient.getUSDTBalance.mockResolvedValueOnce(expectedBalance);

      const tx = createMockTransaction('balance-record-tx-001');
      await service.handleOutgoingTransaction(tx);

      const state = service.getState();
      expect(state.startBalance).toBe(expectedBalance);
    });

    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.2
     */
    it('should record firstTransactionHash', async () => {
      const expectedHash = 'first-transaction-hash-abc123';
      const tx = createMockTransaction(expectedHash);

      await service.handleOutgoingTransaction(tx);

      const state = service.getState();
      expect(state.firstTransactionHash).toBe(expectedHash);
    });

    /**
     * @category state-management
     * @complexity low
     * @covers AC-1.2
     */
    it('should set transactionCount to 1 for first transaction', async () => {
      const tx = createMockTransaction('count-check-tx-001');

      await service.handleOutgoingTransaction(tx);

      const state = service.getState();
      expect(state.transactionCount).toBe(1);
    });

    /**
     * @category state-management
     * @complexity low
     * @covers AC-1.2
     */
    it('should set totalAmount to first transaction amount', async () => {
      const amount = '2500000'; // 2.5 USDT
      const tx = createMockTransaction('amount-tx-001', { amount });

      await service.handleOutgoingTransaction(tx);

      const state = service.getState();
      expect(state.totalAmount).toBe(amount);
    });
  });

  // ===========================================================================
  // AC-1.3: Subsequent TXs update statistics only
  // ===========================================================================
  describe('AC-1.3: Subsequent TXs update statistics only', () => {
    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.3
     */
    it('should increment transactionCount for subsequent transactions', async () => {
      const tx1 = createMockTransaction('tx-001');
      const tx2 = createMockTransaction('tx-002');
      const tx3 = createMockTransaction('tx-003');

      await service.handleOutgoingTransaction(tx1);
      await service.handleOutgoingTransaction(tx2);
      await service.handleOutgoingTransaction(tx3);

      const state = service.getState();
      expect(state.transactionCount).toBe(3);
    });

    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.3
     */
    it('should accumulate totalAmount for subsequent transactions', async () => {
      const tx1 = createMockTransaction('tx-001', { amount: '1000000' }); // 1 USDT
      const tx2 = createMockTransaction('tx-002', { amount: '2000000' }); // 2 USDT
      const tx3 = createMockTransaction('tx-003', { amount: '500000' }); // 0.5 USDT

      await service.handleOutgoingTransaction(tx1);
      await service.handleOutgoingTransaction(tx2);
      await service.handleOutgoingTransaction(tx3);

      const state = service.getState();
      expect(state.totalAmount).toBe('3500000'); // 3.5 USDT total
    });

    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.3
     */
    it('should update lastTransactionAt for each transaction', async () => {
      const timestamp1 = Date.now();
      const tx1 = createMockTransaction('tx-001', { timestamp: timestamp1 });

      await service.handleOutgoingTransaction(tx1);
      const stateAfter1 = service.getState();
      expect(stateAfter1.lastTransactionAt?.getTime()).toBe(timestamp1);

      const timestamp2 = Date.now() + 1000;
      const tx2 = createMockTransaction('tx-002', { timestamp: timestamp2 });

      await service.handleOutgoingTransaction(tx2);
      const stateAfter2 = service.getState();
      expect(stateAfter2.lastTransactionAt?.getTime()).toBe(timestamp2);
    });

    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.3
     */
    it('should NOT change firstTransactionHash for subsequent transactions', async () => {
      const firstHash = 'first-tx-hash';
      const tx1 = createMockTransaction(firstHash);
      const tx2 = createMockTransaction('second-tx-hash');

      await service.handleOutgoingTransaction(tx1);
      await service.handleOutgoingTransaction(tx2);

      const state = service.getState();
      expect(state.firstTransactionHash).toBe(firstHash);
    });

    /**
     * @category state-management
     * @complexity medium
     * @covers AC-1.3
     */
    it('should NOT fetch balance for subsequent transactions', async () => {
      const tx1 = createMockTransaction('tx-001');
      const tx2 = createMockTransaction('tx-002');

      await service.handleOutgoingTransaction(tx1);
      tronGridClient.getUSDTBalance.mockClear();

      await service.handleOutgoingTransaction(tx2);

      expect(tronGridClient.getUSDTBalance).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC-1.4: payout.start event emitted with correct payload
  // ===========================================================================
  describe('AC-1.4: payout.start event emitted with correct payload', () => {
    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-1.4
     */
    it('should emit payout.start event on first transaction', async () => {
      const tx = createMockTransaction('start-event-tx-001');

      await service.handleOutgoingTransaction(tx);

      expect(eventEmitter.emit).toHaveBeenCalledWith(PAYOUT_START_EVENT, expect.any(Object));
    });

    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-1.4
     */
    it('should emit payout.start event with correct payload structure', async () => {
      const expectedBalance = '8000000000'; // 8000 USDT
      tronGridClient.getUSDTBalance.mockResolvedValueOnce(expectedBalance);

      const txHash = 'start-payload-tx-abc';
      const tx = createMockTransaction(txHash);

      await service.handleOutgoingTransaction(tx);

      const startEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_START_EVENT,
      );
      expect(startEventCall).toBeDefined();

      const payload = startEventCall?.[1] as PayoutStartEvent;
      expect(payload.startedAt).toEqual(expect.any(Number));
      expect(payload.firstTransactionHash).toBe(txHash);
      expect(payload.startBalance).toBe(expectedBalance);
    });

    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-1.4
     */
    it('should NOT emit payout.start event for subsequent transactions', async () => {
      const tx1 = createMockTransaction('tx-001');
      const tx2 = createMockTransaction('tx-002');

      await service.handleOutgoingTransaction(tx1);
      eventEmitter.emit.mockClear();

      await service.handleOutgoingTransaction(tx2);

      const startEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_START_EVENT,
      );
      expect(startEventCall).toBeUndefined();
    });
  });

  // ===========================================================================
  // AC-6.1: payout.transaction event emitted for each TX
  // ===========================================================================
  describe('AC-6.1: payout.transaction event emitted for each TX', () => {
    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-6.1
     */
    it('should emit payout.transaction event for first transaction', async () => {
      const tx = createMockTransaction('transaction-event-tx-001');

      await service.handleOutgoingTransaction(tx);

      expect(eventEmitter.emit).toHaveBeenCalledWith(PAYOUT_TRANSACTION_EVENT, expect.any(Object));
    });

    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-6.1
     */
    it('should emit payout.transaction event for each subsequent transaction', async () => {
      const tx1 = createMockTransaction('tx-001');
      const tx2 = createMockTransaction('tx-002');
      const tx3 = createMockTransaction('tx-003');

      await service.handleOutgoingTransaction(tx1);
      await service.handleOutgoingTransaction(tx2);
      await service.handleOutgoingTransaction(tx3);

      const transactionEventCalls = eventEmitter.emit.mock.calls.filter(
        (call) => call[0] === PAYOUT_TRANSACTION_EVENT,
      );
      expect(transactionEventCalls.length).toBe(3);
    });
  });

  // ===========================================================================
  // AC-6.3: Transaction event contains all required fields
  // ===========================================================================
  describe('AC-6.3: Transaction event contains all required fields', () => {
    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-6.3
     */
    it('should emit payout.transaction event with all required fields', async () => {
      const txHash = 'complete-fields-tx-001';
      const amount = '3500000';
      const recipientAddress = 'TRecipient12345678901234567890123';
      const timestamp = Date.now();

      const tx = createMockTransaction(txHash, {
        amount,
        toAddress: recipientAddress,
        timestamp,
      });

      await service.handleOutgoingTransaction(tx);

      const transactionEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_TRANSACTION_EVENT,
      );
      expect(transactionEventCall).toBeDefined();

      const payload = transactionEventCall?.[1] as PayoutTransactionEvent;
      expect(payload.transactionHash).toBe(txHash);
      expect(payload.amount).toBe(amount);
      expect(payload.recipientAddress).toBe(recipientAddress);
      expect(payload.timestamp).toBe(timestamp);
      expect(payload.sessionTotalAmount).toBe(amount);
      expect(payload.transactionNumber).toBe(1);
    });

    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-6.3
     */
    it('should include running total and transaction number for subsequent transactions', async () => {
      const tx1 = createMockTransaction('tx-001', { amount: '1000000' });
      const tx2 = createMockTransaction('tx-002', { amount: '2000000' });

      await service.handleOutgoingTransaction(tx1);
      await service.handleOutgoingTransaction(tx2);

      const transactionEventCalls = eventEmitter.emit.mock.calls.filter(
        (call) => call[0] === PAYOUT_TRANSACTION_EVENT,
      );

      const firstPayload = transactionEventCalls[0][1] as PayoutTransactionEvent;
      expect(firstPayload.transactionNumber).toBe(1);
      expect(firstPayload.sessionTotalAmount).toBe('1000000');

      const secondPayload = transactionEventCalls[1][1] as PayoutTransactionEvent;
      expect(secondPayload.transactionNumber).toBe(2);
      expect(secondPayload.sessionTotalAmount).toBe('3000000');
    });
  });

  // ===========================================================================
  // AC-6.5: First TX emits both start AND transaction events
  // ===========================================================================
  describe('AC-6.5: First TX emits both start AND transaction events', () => {
    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-6.5
     */
    it('should emit both payout.start and payout.transaction events for first transaction', async () => {
      const tx = createMockTransaction('dual-event-tx-001');

      await service.handleOutgoingTransaction(tx);

      const startEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_START_EVENT,
      );
      const transactionEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_TRANSACTION_EVENT,
      );

      expect(startEventCall).toBeDefined();
      expect(transactionEventCall).toBeDefined();
    });

    /**
     * @category event-emission
     * @complexity medium
     * @covers AC-6.5
     */
    it('should emit payout.start BEFORE payout.transaction for first transaction', async () => {
      const emitOrder: string[] = [];
      eventEmitter.emit.mockImplementation((event: string) => {
        emitOrder.push(event);
        return true;
      });

      const tx = createMockTransaction('emit-order-tx-001');

      await service.handleOutgoingTransaction(tx);

      const startIndex = emitOrder.indexOf(PAYOUT_START_EVENT);
      const transactionIndex = emitOrder.indexOf(PAYOUT_TRANSACTION_EVENT);

      expect(startIndex).toBeLessThan(transactionIndex);
    });
  });

  // ===========================================================================
  // AC-2.2: Session ends when balance < 1000 USDT
  // ===========================================================================
  describe('AC-2.2: Session ends when balance < 1000 USDT', () => {
    /**
     * @category session-end
     * @complexity medium
     * @covers AC-2.2
     */
    it('should end session when balance falls below threshold', async () => {
      // Start session
      const tx = createMockTransaction('session-tx-001');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // 5000 USDT at start
      await service.handleOutgoingTransaction(tx);

      expect(service.isActive()).toBe(true);

      // Simulate balance check returning below threshold (500 USDT)
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('500000000');

      await service.checkTimeout();

      expect(service.isActive()).toBe(false);
    });

    /**
     * @category session-end
     * @complexity medium
     * @covers AC-2.2
     */
    it('should emit payout.end event with BALANCE_THRESHOLD reason', async () => {
      const tx = createMockTransaction('threshold-tx-001');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      eventEmitter.emit.mockClear();

      // Balance below threshold
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('800000000'); // 800 USDT

      await service.checkTimeout();

      const endEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_END_EVENT,
      );
      expect(endEventCall).toBeDefined();

      const payload = endEventCall?.[1] as PayoutEndEvent;
      expect(payload.endReason).toBe('BALANCE_THRESHOLD');
    });

    /**
     * @category session-end
     * @complexity medium
     * @covers AC-2.2
     */
    it('should NOT end session when balance is at or above threshold', async () => {
      const tx = createMockTransaction('above-threshold-tx');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      // Balance exactly at threshold (1000 USDT)
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('1000000000');

      await service.checkTimeout();

      expect(service.isActive()).toBe(true);
    });

    /**
     * @category session-end
     * @complexity medium
     * @covers AC-2.2
     */
    it('should reset state to IDLE after balance threshold end', async () => {
      const tx = createMockTransaction('reset-tx-001');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      // Balance below threshold
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('100000000'); // 100 USDT

      await service.checkTimeout();

      const state = service.getState();
      expect(state.isActive).toBe(false);
      expect(state.startedAt).toBeNull();
      expect(state.startBalance).toBeNull();
      expect(state.transactionCount).toBe(0);
      expect(state.totalAmount).toBe('0');
      expect(state.firstTransactionHash).toBeNull();
    });
  });

  // ===========================================================================
  // AC-2.3: Balance check failure logs error, session continues
  // ===========================================================================
  describe('AC-2.3: Balance check failure logs error, session continues', () => {
    /**
     * @category error-handling
     * @complexity medium
     * @covers AC-2.3
     */
    it('should continue session when balance check fails', async () => {
      const tx = createMockTransaction('continue-session-tx');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      expect(service.isActive()).toBe(true);

      // Balance check fails
      tronGridClient.getUSDTBalance.mockRejectedValueOnce(new Error('API Error'));

      await service.checkTimeout();

      // Session should still be active
      expect(service.isActive()).toBe(true);
    });

    /**
     * @category error-handling
     * @complexity medium
     * @covers AC-2.3
     */
    it('should NOT emit payout.end event when balance check fails', async () => {
      const tx = createMockTransaction('no-end-event-tx');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      eventEmitter.emit.mockClear();

      // Balance check fails
      tronGridClient.getUSDTBalance.mockRejectedValueOnce(new Error('Network Error'));

      await service.checkTimeout();

      const endEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_END_EVENT,
      );
      expect(endEventCall).toBeUndefined();
    });

    /**
     * @category error-handling
     * @complexity medium
     * @covers AC-2.3
     */
    it('should retry balance check on next interval after failure', async () => {
      const tx = createMockTransaction('retry-tx');
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      // First check fails
      tronGridClient.getUSDTBalance.mockRejectedValueOnce(new Error('Temp Error'));
      await service.checkTimeout();

      expect(service.isActive()).toBe(true);

      // Second check succeeds and returns below threshold
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('500000000');
      await service.checkTimeout();

      expect(service.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // AC-3.1: Session ends after 30 min + balance decreased
  // ===========================================================================
  describe('AC-3.1: Session ends after 30 min + balance decreased', () => {
    /**
     * @category timeout
     * @complexity medium
     * @covers AC-3.1
     */
    it('should end session after timeout when balance has decreased', async () => {
      const tx = createMockTransaction('timeout-tx-001', {
        timestamp: Date.now(),
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // 5000 USDT start
      await service.handleOutgoingTransaction(tx);

      expect(service.isActive()).toBe(true);

      // Advance time past timeout (30 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Balance has decreased but still above threshold
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('4000000000'); // 4000 USDT

      await service.checkTimeout();

      expect(service.isActive()).toBe(false);
    });

    /**
     * @category timeout
     * @complexity medium
     * @covers AC-3.1
     */
    it('should emit payout.end event with TIMEOUT reason', async () => {
      const tx = createMockTransaction('timeout-reason-tx', {
        timestamp: Date.now(),
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      eventEmitter.emit.mockClear();

      // Advance past timeout
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Balance decreased
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('4500000000');

      await service.checkTimeout();

      const endEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_END_EVENT,
      );
      expect(endEventCall).toBeDefined();

      const payload = endEventCall?.[1] as PayoutEndEvent;
      expect(payload.endReason).toBe('TIMEOUT');
    });

    /**
     * @category timeout
     * @complexity medium
     * @covers AC-3.1
     */
    it('should include correct duration in payout.end event', async () => {
      const startTime = Date.now();
      const tx = createMockTransaction('duration-tx', {
        timestamp: startTime,
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      eventEmitter.emit.mockClear();

      // Advance 35 minutes
      jest.advanceTimersByTime(35 * 60 * 1000);

      tronGridClient.getUSDTBalance.mockResolvedValueOnce('4500000000');

      await service.checkTimeout();

      const endEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_END_EVENT,
      );

      const payload = endEventCall?.[1] as PayoutEndEvent;
      expect(payload.durationMinutes).toBeGreaterThanOrEqual(35);
    });
  });

  // ===========================================================================
  // AC-3.3: Session does NOT end if balance not decreased
  // ===========================================================================
  describe('AC-3.3: Session does NOT end if balance not decreased', () => {
    /**
     * @category timeout
     * @complexity medium
     * @covers AC-3.3
     */
    it('should NOT end session after timeout if balance has NOT decreased', async () => {
      const tx = createMockTransaction('no-decrease-tx', {
        timestamp: Date.now(),
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // 5000 USDT start
      await service.handleOutgoingTransaction(tx);

      // Advance past timeout
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Balance same or higher
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // Same balance

      await service.checkTimeout();

      expect(service.isActive()).toBe(true);
    });

    /**
     * @category timeout
     * @complexity medium
     * @covers AC-3.3
     */
    it('should NOT end session if balance has INCREASED after timeout', async () => {
      const tx = createMockTransaction('increase-tx', {
        timestamp: Date.now(),
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      jest.advanceTimersByTime(31 * 60 * 1000);

      // Balance increased (incoming funds)
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('6000000000'); // 6000 USDT

      await service.checkTimeout();

      expect(service.isActive()).toBe(true);
    });

    /**
     * @category timeout
     * @complexity medium
     * @covers AC-3.3
     */
    it('should NOT emit payout.end event if balance not decreased', async () => {
      const tx = createMockTransaction('no-end-tx', {
        timestamp: Date.now(),
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      eventEmitter.emit.mockClear();

      jest.advanceTimersByTime(31 * 60 * 1000);

      // Balance same
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');

      await service.checkTimeout();

      const endEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_END_EVENT,
      );
      expect(endEventCall).toBeUndefined();
    });
  });

  // ===========================================================================
  // Mutex protection tests
  // ===========================================================================
  describe('Mutex protection', () => {
    /**
     * @category concurrency
     * @complexity high
     * @covers Mutex protection for concurrent transactions
     */
    it('should handle concurrent transactions safely', async () => {
      // Start 10 transactions concurrently
      const transactions = Array.from({ length: 10 }, (_, i) =>
        createMockTransaction(`concurrent-tx-${i}`, { amount: '1000000' }),
      );

      // Execute all concurrently
      await Promise.all(transactions.map((tx) => service.handleOutgoingTransaction(tx)));

      const state = service.getState();
      expect(state.transactionCount).toBe(10);
      expect(state.totalAmount).toBe('10000000'); // 10 USDT total
    });
  });

  // ===========================================================================
  // Error handling during session start
  // ===========================================================================
  describe('Error handling during session start', () => {
    /**
     * @category error-handling
     * @complexity medium
     */
    it('should propagate error if balance fetch fails during session start', async () => {
      const tx = createMockTransaction('error-start-tx');
      tronGridClient.getUSDTBalance.mockRejectedValueOnce(new Error('Balance fetch failed'));

      await expect(service.handleOutgoingTransaction(tx)).rejects.toThrow('Balance fetch failed');
    });

    /**
     * @category error-handling
     * @complexity medium
     */
    it('should remain in IDLE state if session start fails', async () => {
      const tx = createMockTransaction('fail-start-tx');
      tronGridClient.getUSDTBalance.mockRejectedValueOnce(new Error('API Error'));

      try {
        await service.handleOutgoingTransaction(tx);
      } catch {
        // Expected to fail
      }

      expect(service.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // checkTimeout when session is not active
  // ===========================================================================
  describe('checkTimeout when session is not active', () => {
    /**
     * @category edge-case
     * @complexity low
     */
    it('should do nothing when called with no active session', async () => {
      expect(service.isActive()).toBe(false);

      await service.checkTimeout();

      expect(tronGridClient.getUSDTBalance).not.toHaveBeenCalled();
      expect(service.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // payout.end event payload verification
  // ===========================================================================
  describe('payout.end event payload verification', () => {
    /**
     * @category event-emission
     * @complexity medium
     */
    it('should include all required fields in payout.end event', async () => {
      const txAmount = '2500000';
      const tx = createMockTransaction('complete-end-tx', {
        amount: txAmount,
        timestamp: Date.now(),
      });
      tronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      await service.handleOutgoingTransaction(tx);

      eventEmitter.emit.mockClear();

      const endingBalance = '400000000'; // 400 USDT
      tronGridClient.getUSDTBalance.mockResolvedValueOnce(endingBalance);

      await service.checkTimeout();

      const endEventCall = eventEmitter.emit.mock.calls.find(
        (call) => call[0] === PAYOUT_END_EVENT,
      );

      const payload = endEventCall?.[1] as PayoutEndEvent;
      expect(payload.startedAt).toEqual(expect.any(Number));
      expect(payload.endedAt).toEqual(expect.any(Number));
      expect(payload.endedAt).toBeGreaterThanOrEqual(payload.startedAt);
      expect(payload.endReason).toBe('BALANCE_THRESHOLD');
      expect(payload.transactionCount).toBe(1);
      expect(payload.totalAmount).toBe(txAmount);
      expect(payload.endingBalance).toBe(endingBalance);
      expect(payload.durationMinutes).toEqual(expect.any(Number));
    });
  });
});
