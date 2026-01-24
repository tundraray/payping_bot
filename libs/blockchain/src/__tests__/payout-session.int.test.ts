// Payout Session Notifications Integration Tests - Design Doc: payout-session-notifications-design.md
// Generated: 2026-01-23 | Budget Used: 3/3 integration, 0/2 E2E

import { ConfigModule } from '@nestjs/config';
import { EventEmitter2, EventEmitterModule } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';

import { TronGridClient } from '../clients/trongrid.client';
import blockchainConfig from '../config/blockchain.config';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';
import {
  PAYOUT_END_EVENT,
  PAYOUT_START_EVENT,
  PAYOUT_TRANSACTION_EVENT,
  type PayoutEndEvent,
  type PayoutStartEvent,
  type PayoutTransactionEvent,
} from '../events/payout.events';
import { type Transaction, TransactionType } from '../interfaces/transaction.interface';
import { PayoutSessionService } from '../services/payout-session.service';

/**
 * Payout Session Service Integration Tests
 *
 * These tests verify the PayoutSessionService's state machine behavior,
 * event emission patterns, and integration with TronGridClient for balance checking.
 *
 * Mock Boundaries:
 * - TronGridClient.getUSDTBalance() - mocked to simulate balance API responses
 * - Timer functions - mocked for deterministic timeout testing
 *
 * Real Components:
 * - PayoutSessionService - system under test (with real state machine)
 * - EventEmitter2 - real NestJS event emitter
 * - Mutex - real async-mutex for race condition prevention
 */
describe('PayoutSessionService Integration Tests', () => {
  let module: TestingModule;
  let payoutSessionService: PayoutSessionService;
  let mockTronGridClient: jest.Mocked<TronGridClient>;
  let eventEmitter: EventEmitter2;

  const MOCK_WALLET_ADDRESS = 'TTestWalletAddress12345678901234';

  /**
   * Helper function to create mock Transaction objects
   */
  function createMockTransaction(hash: string, options: Partial<Transaction> = {}): Transaction {
    return {
      hash,
      type: TransactionType.USDT,
      fromAddress: MOCK_WALLET_ADDRESS,
      toAddress: 'TRecipientAddress123456789012345678',
      amount: '100000000', // 100 USDT in raw units
      timestamp: Date.now(),
      blockNumber: 12345678,
      contractAddress: USDT_CONTRACT_ADDRESS,
      ...options,
    };
  }

  beforeEach(async () => {
    jest.useFakeTimers();

    // Set test environment variables
    process.env.TRONGRID_BASE_URL = 'https://api.trongrid.io';
    process.env.TRONGRID_API_KEY = 'test-api-key';
    process.env.MONITORED_WALLET_ADDRESS = MOCK_WALLET_ADDRESS;
    process.env.PAYOUT_BALANCE_THRESHOLD_USDT = '1000';
    process.env.PAYOUT_TIMEOUT_MINUTES = '30';
    process.env.PAYOUT_CHECK_INTERVAL_MS = '60000';

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          load: [blockchainConfig],
          isGlobal: true,
        }),
        EventEmitterModule.forRoot(),
      ],
      providers: [
        PayoutSessionService,
        // Provide mock TronGridClient
        {
          provide: TronGridClient,
          useValue: {
            getUSDTBalance: jest.fn().mockResolvedValue('5000000000'), // 5000 USDT default
          },
        },
      ],
    }).compile();

    payoutSessionService = module.get<PayoutSessionService>(PayoutSessionService);
    mockTronGridClient = module.get(TronGridClient);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.useRealTimers();
    await module.close();
    // Clean up environment variables
    delete process.env.TRONGRID_BASE_URL;
    delete process.env.TRONGRID_API_KEY;
    delete process.env.MONITORED_WALLET_ADDRESS;
    delete process.env.PAYOUT_BALANCE_THRESHOLD_USDT;
    delete process.env.PAYOUT_TIMEOUT_MINUTES;
    delete process.env.PAYOUT_CHECK_INTERVAL_MS;
  });

  // ===========================================================================
  // AC-1.1, AC-1.2, AC-1.4, AC-6.1, AC-6.5: Session Start and First Transaction Events
  // ===========================================================================
  describe('Session Start and Event Emission (AC-1.x, AC-6.x)', () => {
    /**
     * AC-1.1: "When first outgoing USDT transaction is detected AND session is IDLE,
     *          the system shall transition to ACTIVE state"
     * AC-1.2: "When session transitions to ACTIVE, the system shall record start
     *          timestamp, starting balance, and first transaction hash"
     * AC-1.4: "The system shall emit payout.start event containing start timestamp,
     *          first transaction hash, and starting balance"
     * AC-6.1: "When session is ACTIVE AND outgoing transaction is detected (including
     *          the first one), the system shall emit payout.transaction event"
     * AC-6.5: "For the first transaction, both payout.start AND payout.transaction
     *          events shall be emitted (separate notifications)"
     *
     * ROI: 95 | Business Value: 10 (core state machine) | Frequency: 10 (every payout)
     * Behavior: First outgoing TX arrives -> State IDLE->ACTIVE -> Both events emitted
     * @category: core-functionality
     * @dependency: PayoutSessionService, TronGridClient (mocked), EventEmitter2
     * @complexity: high
     */
    it('AC-1.1/AC-1.2/AC-1.4/AC-6.1/AC-6.5: transitions to ACTIVE and emits both start and transaction events on first outgoing TX', async () => {
      // Arrange: Setup mock balance and event listeners
      const expectedBalance = '5000000000'; // 5000 USDT
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce(expectedBalance);

      const emittedEvents: { event: string; payload: unknown }[] = [];
      eventEmitter.on(PAYOUT_START_EVENT, (payload: PayoutStartEvent) => {
        emittedEvents.push({ event: PAYOUT_START_EVENT, payload });
      });
      eventEmitter.on(PAYOUT_TRANSACTION_EVENT, (payload: PayoutTransactionEvent) => {
        emittedEvents.push({ event: PAYOUT_TRANSACTION_EVENT, payload });
      });

      // Verify initial state is IDLE
      expect(payoutSessionService.isActive()).toBe(false);

      const tx = createMockTransaction('abc123', {
        toAddress: 'TRecipient123456789012345678901234',
        amount: '100000000', // 100 USDT
      });

      // Act: Handle first outgoing transaction
      await payoutSessionService.handleOutgoingTransaction(tx);

      // Assert: State is now ACTIVE
      expect(payoutSessionService.isActive()).toBe(true);

      // Assert: payout.start event was emitted with correct payload
      const startEvent = emittedEvents.find((e) => e.event === PAYOUT_START_EVENT);
      expect(startEvent).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().toBeDefined() above
      const startPayload = startEvent!.payload as PayoutStartEvent;
      expect(startPayload.startedAt).toEqual(expect.any(Number));
      expect(startPayload.firstTransactionHash).toBe('abc123');
      expect(startPayload.startBalance).toBe(expectedBalance);

      // Assert: payout.transaction event was emitted with correct payload
      const txEvent = emittedEvents.find((e) => e.event === PAYOUT_TRANSACTION_EVENT);
      expect(txEvent).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().toBeDefined() above
      const txPayload = txEvent!.payload as PayoutTransactionEvent;
      expect(txPayload.transactionHash).toBe('abc123');
      expect(txPayload.amount).toBe('100000000');
      expect(txPayload.recipientAddress).toBe('TRecipient123456789012345678901234');
      expect(txPayload.timestamp).toEqual(expect.any(Number));
      expect(txPayload.sessionTotalAmount).toBe('100000000');
      expect(txPayload.transactionNumber).toBe(1);

      // Assert: Events emitted in order: payout.start before payout.transaction
      const startIndex = emittedEvents.findIndex((e) => e.event === PAYOUT_START_EVENT);
      const transactionIndex = emittedEvents.findIndex((e) => e.event === PAYOUT_TRANSACTION_EVENT);
      expect(startIndex).toBeLessThan(transactionIndex);
    });

    /**
     * AC-1.3: "When session is ACTIVE AND another outgoing transaction is detected,
     *          the system shall update session statistics without emitting start event"
     * AC-6.1: "When session is ACTIVE AND outgoing transaction is detected,
     *          the system shall emit payout.transaction event"
     *
     * ROI: 88 | Business Value: 9 (statistics accuracy) | Frequency: 9 (multiple TX/session)
     * Behavior: Subsequent TX during ACTIVE -> Stats updated -> Only transaction event emitted
     * @category: core-functionality
     * @dependency: PayoutSessionService, EventEmitter2
     * @complexity: medium
     */
    it('AC-1.3/AC-6.1: updates statistics and emits only transaction event for subsequent outgoing TXs', async () => {
      // Arrange: Setup session in ACTIVE state (process first transaction first)
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      const tx1 = createMockTransaction('first-tx-hash', { amount: '100000000' });
      await payoutSessionService.handleOutgoingTransaction(tx1);

      // Clear event tracking after first TX
      const emittedEvents: { event: string; payload: unknown }[] = [];
      eventEmitter.on(PAYOUT_START_EVENT, (payload: PayoutStartEvent) => {
        emittedEvents.push({ event: PAYOUT_START_EVENT, payload });
      });
      eventEmitter.on(PAYOUT_TRANSACTION_EVENT, (payload: PayoutTransactionEvent) => {
        emittedEvents.push({ event: PAYOUT_TRANSACTION_EVENT, payload });
      });

      // Create second test transaction
      const tx2 = createMockTransaction('def456', { amount: '50000000' }); // 50 USDT

      // Act: Handle subsequent transaction
      await payoutSessionService.handleOutgoingTransaction(tx2);

      // Assert: State remains ACTIVE
      expect(payoutSessionService.isActive()).toBe(true);

      // Assert: Statistics updated correctly
      const state = payoutSessionService.getState();
      expect(state.transactionCount).toBe(2);
      expect(state.totalAmount).toBe('150000000'); // 100M + 50M

      // Assert: NO payout.start event emitted for subsequent transaction
      const startEvent = emittedEvents.find((e) => e.event === PAYOUT_START_EVENT);
      expect(startEvent).toBeUndefined();

      // Assert: payout.transaction event emitted with updated running total
      const txEvent = emittedEvents.find((e) => e.event === PAYOUT_TRANSACTION_EVENT);
      expect(txEvent).toBeDefined();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().toBeDefined() above
      const txPayload = txEvent!.payload as PayoutTransactionEvent;
      expect(txPayload.transactionHash).toBe('def456');
      expect(txPayload.amount).toBe('50000000');
      expect(txPayload.sessionTotalAmount).toBe('150000000');
      expect(txPayload.transactionNumber).toBe(2);
    });
  });

  // ===========================================================================
  // AC-2.1, AC-2.2, AC-2.3: Balance Threshold Detection and Session End
  // ===========================================================================
  describe('Balance Threshold End Detection (AC-2.x)', () => {
    /**
     * AC-2.1: "When session is ACTIVE, the system shall check balance periodically
     *          (every 1 minute via @Interval(60000))"
     * AC-2.2: "When balance check returns value < 1000 USDT (1,000,000,000 raw units),
     *          the system shall end session with reason BALANCE_THRESHOLD"
     *
     * ROI: 92 | Business Value: 10 (session completion) | Frequency: 10 (every session end)
     * Behavior: Active session -> Balance < threshold -> Session ends, end event emitted
     * @category: core-functionality
     * @dependency: PayoutSessionService, TronGridClient (mocked), EventEmitter2
     * @complexity: high
     */
    it('AC-2.1/AC-2.2: ends session with BALANCE_THRESHOLD when balance falls below 1000 USDT', async () => {
      // Arrange: Setup session in ACTIVE state with some transactions processed
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // 5000 USDT at start
      const tx = createMockTransaction('session-tx', { amount: '100000000' });
      await payoutSessionService.handleOutgoingTransaction(tx);

      expect(payoutSessionService.isActive()).toBe(true);

      // Setup event listener for 'payout.end'
      let endEventPayload: PayoutEndEvent | null = null;
      eventEmitter.on(PAYOUT_END_EVENT, (payload: PayoutEndEvent) => {
        endEventPayload = payload;
      });

      // Mock TronGridClient.getUSDTBalance() to return below threshold (500 USDT)
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('500000000');

      // Act: Call payoutSessionService.checkTimeout() (simulates @Interval trigger)
      await payoutSessionService.checkTimeout();

      // Assert: Session state is now IDLE
      expect(payoutSessionService.isActive()).toBe(false);

      // Assert: payout.end event was emitted with correct payload
      expect(endEventPayload).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.startedAt).toEqual(expect.any(Number));
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endedAt).toEqual(expect.any(Number));
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endReason).toBe('BALANCE_THRESHOLD');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.transactionCount).toBe(1);
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.totalAmount).toBe('100000000');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endingBalance).toBe('500000000');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.durationMinutes).toEqual(expect.any(Number));

      // Assert: getState() shows reset state (isActive: false, transactionCount: 0)
      const state = payoutSessionService.getState();
      expect(state.isActive).toBe(false);
      expect(state.transactionCount).toBe(0);
    });

    /**
     * AC-2.3: "If balance check fails, then the system shall log error and
     *          retry on next check interval"
     *
     * ROI: 70 | Business Value: 7 (resilience) | Frequency: 2 (API failures)
     * Behavior: Balance check throws -> Error logged -> Session remains ACTIVE -> Retry later
     * @category: edge-case
     * @dependency: PayoutSessionService, TronGridClient (mocked), Logger (spy)
     * @complexity: medium
     */
    it('AC-2.3: logs error and continues when balance check fails', async () => {
      // Arrange: Setup session in ACTIVE state
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      const tx = createMockTransaction('continue-tx', { amount: '100000000' });
      await payoutSessionService.handleOutgoingTransaction(tx);

      expect(payoutSessionService.isActive()).toBe(true);

      // Setup event listener for 'payout.end'
      let endEventEmitted = false;
      eventEmitter.on(PAYOUT_END_EVENT, () => {
        endEventEmitted = true;
      });

      // Mock TronGridClient.getUSDTBalance() to throw Error
      mockTronGridClient.getUSDTBalance.mockRejectedValueOnce(new Error('API Error'));

      // Act: Call payoutSessionService.checkTimeout()
      await payoutSessionService.checkTimeout();

      // Assert: Session state remains ACTIVE
      expect(payoutSessionService.isActive()).toBe(true);

      // Assert: NO payout.end event emitted
      expect(endEventEmitted).toBe(false);

      // Assert: Session statistics unchanged
      const state = payoutSessionService.getState();
      expect(state.transactionCount).toBe(1);
      expect(state.totalAmount).toBe('100000000');
    });
  });

  // ===========================================================================
  // AC-3.1, AC-3.2, AC-3.3: Timeout Detection with Balance Decrease Verification
  // ===========================================================================
  describe('Timeout End Detection (AC-3.x)', () => {
    /**
     * AC-3.1: "When session is ACTIVE AND 30 minutes elapsed since last outgoing
     *          transaction AND balance decreased since session start, the system
     *          shall end session with reason TIMEOUT"
     * AC-3.2: "When session ends due to timeout, the system shall check balance
     *          to confirm decrease"
     *
     * ROI: 85 | Business Value: 9 (session cleanup) | Frequency: 6 (timeout scenarios)
     * Behavior: 30min elapsed + balance decreased -> Session ends with TIMEOUT
     * @category: core-functionality
     * @dependency: PayoutSessionService, TronGridClient (mocked), EventEmitter2, Timer (mocked)
     * @complexity: high
     */
    it('AC-3.1/AC-3.2: ends session with TIMEOUT when 30min elapsed and balance decreased', async () => {
      // Arrange: Setup session in ACTIVE state
      const startTime = Date.now();
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // 5000 USDT start
      const tx = createMockTransaction('timeout-tx', {
        timestamp: startTime,
        amount: '100000000',
      });
      await payoutSessionService.handleOutgoingTransaction(tx);

      expect(payoutSessionService.isActive()).toBe(true);

      // Setup event listener for 'payout.end'
      let endEventPayload: PayoutEndEvent | null = null;
      eventEmitter.on(PAYOUT_END_EVENT, (payload: PayoutEndEvent) => {
        endEventPayload = payload;
      });

      // Advance time past timeout (31 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Mock TronGridClient.getUSDTBalance() to return decreased balance (3000 USDT)
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('3000000000');

      // Act: Call payoutSessionService.checkTimeout()
      await payoutSessionService.checkTimeout();

      // Assert: Session state is now IDLE
      expect(payoutSessionService.isActive()).toBe(false);

      // Assert: payout.end event was emitted with correct payload
      expect(endEventPayload).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endReason).toBe('TIMEOUT');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endingBalance).toBe('3000000000');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.durationMinutes).toBeGreaterThanOrEqual(31);
    });

    /**
     * AC-3.3: "If balance has not decreased after timeout, then the system
     *          shall not end session (continue monitoring)"
     *
     * ROI: 75 | Business Value: 8 (false positive prevention) | Frequency: 3 (edge case)
     * Behavior: 30min elapsed + balance NOT decreased -> Session continues
     * @category: edge-case
     * @dependency: PayoutSessionService, TronGridClient (mocked), EventEmitter2
     * @complexity: medium
     */
    it('AC-3.3: does NOT end session when timeout elapsed but balance not decreased', async () => {
      // Arrange: Setup session in ACTIVE state
      const startTime = Date.now();
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000'); // 5000 USDT start
      const tx = createMockTransaction('no-decrease-tx', {
        timestamp: startTime,
        amount: '100000000',
      });
      await payoutSessionService.handleOutgoingTransaction(tx);

      expect(payoutSessionService.isActive()).toBe(true);

      // Setup event listener for 'payout.end'
      let endEventEmitted = false;
      eventEmitter.on(PAYOUT_END_EVENT, () => {
        endEventEmitted = true;
      });

      // Advance time past timeout (31 minutes)
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Mock TronGridClient.getUSDTBalance() to return same balance (no decrease)
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');

      // Act: Call payoutSessionService.checkTimeout()
      await payoutSessionService.checkTimeout();

      // Assert: Session state remains ACTIVE
      expect(payoutSessionService.isActive()).toBe(true);

      // Assert: NO payout.end event emitted
      expect(endEventEmitted).toBe(false);
    });
  });

  // ===========================================================================
  // AC-8.1, AC-8.2, AC-8.3: Service Restart Behavior
  // ===========================================================================
  describe('Service Restart Behavior (AC-8.x)', () => {
    /**
     * AC-8.1: "When service restarts, the system shall initialize session state to IDLE"
     * AC-8.2: "When service restarts during active session, the next outgoing
     *          transaction shall start a new session"
     * AC-8.3: "The system shall accept potential duplicate 'payout started'
     *          notification as acceptable edge case"
     *
     * ROI: 65 | Business Value: 7 (restart resilience) | Frequency: 3 (deployments)
     * Behavior: Service restart -> State IDLE -> Next TX starts new session
     * @category: integration
     * @dependency: PayoutSessionService
     * @complexity: low
     */
    it('AC-8.1/AC-8.2: initializes to IDLE state and starts new session on first TX after restart', async () => {
      // Arrange: Create new PayoutSessionService instance (simulating restart)
      // The current instance was just created in beforeEach, so it simulates a restart

      // Verify initial state is IDLE
      expect(payoutSessionService.isActive()).toBe(false);

      // Act: Verify isActive() === false
      const initialState = payoutSessionService.getState();
      expect(initialState.isActive).toBe(false);
      expect(initialState.startedAt).toBeNull();
      expect(initialState.transactionCount).toBe(0);

      // Setup event listener for payout.start
      let startEventEmitted = false;
      eventEmitter.on(PAYOUT_START_EVENT, () => {
        startEventEmitted = true;
      });

      // Process first outgoing transaction
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      const tx = createMockTransaction('restart-tx', { amount: '100000000' });
      await payoutSessionService.handleOutgoingTransaction(tx);

      // Assert: Session transitions to ACTIVE
      expect(payoutSessionService.isActive()).toBe(true);

      // Assert: payout.start event emitted
      expect(startEventEmitted).toBe(true);

      // This is expected behavior even if previous session was interrupted
      // (AC-8.3: duplicate 'payout started' is acceptable)
    });
  });

  // ===========================================================================
  // AC-6.3: Transaction Event Payload Verification
  // ===========================================================================
  describe('Transaction Event Payload (AC-6.3)', () => {
    /**
     * AC-6.3: "The notification shall include: transaction amount, recipient
     *          address (truncated), transaction hash, session running total"
     *
     * ROI: 80 | Business Value: 9 (notification content) | Frequency: 10 (every TX)
     * Behavior: Transaction processed -> Event payload contains all required fields
     * @category: core-functionality
     * @dependency: PayoutSessionService, EventEmitter2
     * @complexity: medium
     */
    it('AC-6.3: payout.transaction event contains all required fields', async () => {
      // Arrange: Setup session in ACTIVE state with previous transactions
      mockTronGridClient.getUSDTBalance.mockResolvedValueOnce('5000000000');
      const tx1 = createMockTransaction('first-tx', { amount: '100000000' });
      await payoutSessionService.handleOutgoingTransaction(tx1);

      // Setup event listener for payout.transaction
      let txEventPayload: PayoutTransactionEvent | null = null;
      eventEmitter.on(PAYOUT_TRANSACTION_EVENT, (payload: PayoutTransactionEvent) => {
        txEventPayload = payload;
      });

      // Create test transaction with known values
      const txHash = 'payload-test-tx-hash-12345';
      const amount = '75000000'; // 75 USDT
      const recipientAddress = 'TRecipient987654321098765432109876';
      const timestamp = Date.now();

      const tx2 = createMockTransaction(txHash, {
        amount,
        toAddress: recipientAddress,
        timestamp,
      });

      // Act: Handle transaction
      await payoutSessionService.handleOutgoingTransaction(tx2);

      // Assert: payout.transaction event payload contains all required fields
      expect(txEventPayload).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(txEventPayload!.transactionHash).toBe(txHash); // string (matches input)
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(txEventPayload!.amount).toBe(amount); // string (raw units)
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(txEventPayload!.recipientAddress).toBe(recipientAddress); // string (full TRON address)
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(txEventPayload!.timestamp).toBe(timestamp); // number (Unix ms)
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(txEventPayload!.sessionTotalAmount).toBe('175000000'); // string (accumulated total: 100M + 75M)
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(txEventPayload!.transactionNumber).toBe(2); // number (sequence)
    });
  });
});
