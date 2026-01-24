// Payout Session Notifications E2E Tests - Design Doc: payout-session-notifications-design.md
// Generated: 2026-01-23 | Budget Used: 2/2 E2E
// Test Type: End-to-End Test
// Implementation Timing: After all feature implementations complete

import { SubscriptionsService, type User } from '@app/db';
import { TelegramService } from '@app/telegram';
import { PayoutListener } from '@app/telegram/listeners/payout.listener';
import { clearBundleCache } from '@app/telegram/utils';
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
 * Payout Session Notifications E2E Tests
 *
 * These tests verify the complete payout session lifecycle from transaction detection
 * to event emission, simulating real-world payout scenarios including:
 * - Full session lifecycle (start -> multiple transactions -> end)
 * - Multi-transaction sessions with running totals
 * - Notification delivery flow verification
 *
 * Mock Boundaries:
 * - TronGrid API (HTTP) - mocked at network layer to simulate API responses
 * - TelegramService - mocked to capture notification calls
 * - SubscriptionsService - mocked to return test subscribers
 *
 * Real Components:
 * - PayoutSessionService - full state machine with real mutex
 * - EventEmitter2 - real event emission and propagation
 * - PayoutListener - real notification handler (with mocked dependencies)
 *
 * Note: These tests exercise the full system integration for payout session
 * notifications. External system interactions are mocked at boundaries.
 */
describe('Payout Session Notifications E2E Tests', () => {
  let module: TestingModule;
  let payoutSessionService: PayoutSessionService;
  let eventEmitter: EventEmitter2;
  let mockTronGridClient: jest.Mocked<TronGridClient>;
  let mockSubscriptionsService: jest.Mocked<SubscriptionsService>;
  let mockBot: { api: { sendMessage: jest.Mock } };

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

  /**
   * Helper function to create mock User
   */
  function createMockUser(overrides: Partial<User> = {}): User {
    return {
      id: 1,
      telegramId: 111111,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      languageCode: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as User;
  }

  beforeEach(async () => {
    jest.useFakeTimers({ advanceTimers: true });

    // Set test environment variables
    process.env.TRONGRID_BASE_URL = 'https://api.trongrid.io';
    process.env.TRONGRID_API_KEY = 'test-api-key';
    process.env.MONITORED_WALLET_ADDRESS = MOCK_WALLET_ADDRESS;
    process.env.PAYOUT_BALANCE_THRESHOLD_USDT = '1000';
    process.env.PAYOUT_TIMEOUT_MINUTES = '30';
    process.env.PAYOUT_CHECK_INTERVAL_MS = '60000';

    // Create mock bot
    mockBot = {
      api: {
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    };

    // Create mock services
    mockTronGridClient = {
      getUSDTBalance: jest.fn().mockResolvedValue('5000000000'), // 5000 USDT default
      fetchUSDTTransactions: jest.fn(),
      getAccountCreationTimestamp: jest.fn(),
    } as unknown as jest.Mocked<TronGridClient>;

    mockSubscriptionsService = {
      getActiveSubscribers: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<SubscriptionsService>;

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
        PayoutListener,
        {
          provide: TronGridClient,
          useValue: mockTronGridClient,
        },
        {
          provide: SubscriptionsService,
          useValue: mockSubscriptionsService,
        },
        {
          provide: TelegramService,
          useValue: {
            getBot: jest.fn().mockReturnValue(mockBot),
          },
        },
      ],
    }).compile();

    // Initialize the module to activate @OnEvent decorators
    await module.init();

    payoutSessionService = module.get<PayoutSessionService>(PayoutSessionService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    jest.clearAllMocks();
  });

  afterEach(async () => {
    jest.useRealTimers();
    clearBundleCache();
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
  // User Journey: Complete Payout Session Lifecycle
  // ===========================================================================
  describe('User Journey: Complete Payout Session Lifecycle', () => {
    /**
     * User Journey: Payout session start -> Multiple transactions -> Balance threshold reached -> Session end
     * Covers: AC-1.1, AC-1.2, AC-1.3, AC-1.4, AC-2.1, AC-2.2, AC-5.1, AC-5.2, AC-6.1, AC-6.3, AC-6.5
     * ROI: 95 | Business Value: 10 (core business requirement) | Frequency: 10 (primary use case)
     * Verification: End-to-end payout session from first transaction to completion notification
     * @category: e2e
     * @dependency: full-system
     * @complexity: high
     *
     * User Story:
     *   As a PayPing subscriber,
     *   When a payout session starts and progresses,
     *   I want to receive notifications for session start, each transaction, and session end,
     *   So that I can track the complete payout activity in real-time.
     *
     * Verification items:
     * - First outgoing TX triggers session start (IDLE -> ACTIVE)
     * - payout.start event is emitted with correct payload
     * - payout.transaction event is emitted for first TX
     * - Subsequent TXs emit payout.transaction events with running totals
     * - Balance check detects threshold breach
     * - payout.end event is emitted with session statistics
     * - All events propagate to PayoutListener
     * - PayoutListener queries active subscribers
     * - Notifications are sent to all subscribers (mocked TelegramService called)
     * - Event payloads contain all required fields for notification formatting
     */
    it('completes full session lifecycle with start, transaction, and end notifications', async () => {
      // Arrange:
      // - Configure mock TronGridClient.getUSDTBalance():
      //   - First call (session start): return '5000000000' (5000 USDT)
      //   - Second call (after transactions): return '800000000' (800 USDT, below threshold)
      mockTronGridClient.getUSDTBalance
        .mockResolvedValueOnce('5000000000') // Session start
        .mockResolvedValueOnce('800000000'); // Balance check - below threshold

      // - Configure mock SubscriptionsService.getActiveSubscribers():
      //   - Return 3 test subscribers with different language codes (en, ru, uk)
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, languageCode: 'ru' }),
        createMockUser({ id: 3, telegramId: 333333, languageCode: 'uk' }),
      ];
      mockSubscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      // - Create test transactions:
      //   - TX1: { hash: 'tx1', amount: '1000000000', toAddress: 'TRecipient1' } (1000 USDT)
      //   - TX2: { hash: 'tx2', amount: '1500000000', toAddress: 'TRecipient2' } (1500 USDT)
      //   - TX3: { hash: 'tx3', amount: '1700000000', toAddress: 'TRecipient3' } (1700 USDT)
      const tx1 = createMockTransaction('tx1_hash_first_transaction', {
        amount: '1000000000',
        toAddress: 'TRecipient1Address12345678901234',
      });
      const tx2 = createMockTransaction('tx2_hash_second_transaction', {
        amount: '1500000000',
        toAddress: 'TRecipient2Address12345678901234',
      });
      const tx3 = createMockTransaction('tx3_hash_third_transaction', {
        amount: '1700000000',
        toAddress: 'TRecipient3Address12345678901234',
      });

      // - Setup event collectors for all three event types
      const collectedEvents: { event: string; payload: unknown }[] = [];
      eventEmitter.on(PAYOUT_START_EVENT, (payload: PayoutStartEvent) => {
        collectedEvents.push({ event: PAYOUT_START_EVENT, payload });
      });
      eventEmitter.on(PAYOUT_TRANSACTION_EVENT, (payload: PayoutTransactionEvent) => {
        collectedEvents.push({ event: PAYOUT_TRANSACTION_EVENT, payload });
      });
      eventEmitter.on(PAYOUT_END_EVENT, (payload: PayoutEndEvent) => {
        collectedEvents.push({ event: PAYOUT_END_EVENT, payload });
      });

      // Verify initial state is IDLE
      expect(payoutSessionService.isActive()).toBe(false);

      // Act:
      // - Process TX1 through PayoutSessionService (triggers session start)
      await payoutSessionService.handleOutgoingTransaction(tx1);

      // Allow event handlers to process
      await jest.runAllTimersAsync();

      // - Process TX2 through PayoutSessionService
      await payoutSessionService.handleOutgoingTransaction(tx2);
      await jest.runAllTimersAsync();

      // - Process TX3 through PayoutSessionService
      await payoutSessionService.handleOutgoingTransaction(tx3);
      await jest.runAllTimersAsync();

      // - Call checkTimeout() to trigger balance threshold check
      await payoutSessionService.checkTimeout();
      await jest.runAllTimersAsync();

      // Assert:
      // Phase 1 - Session Start (TX1):
      // - payout.start event emitted once
      const startEvents = collectedEvents.filter((e) => e.event === PAYOUT_START_EVENT);
      expect(startEvents).toHaveLength(1);
      const startPayload = startEvents[0].payload as PayoutStartEvent;
      expect(startPayload.startedAt).toEqual(expect.any(Number));
      expect(startPayload.firstTransactionHash).toBe('tx1_hash_first_transaction');
      expect(startPayload.startBalance).toBe('5000000000');

      // - payout.transaction events for all 3 TXs
      const txEvents = collectedEvents.filter((e) => e.event === PAYOUT_TRANSACTION_EVENT);
      expect(txEvents).toHaveLength(3);

      // TX1 event verification
      const tx1Payload = txEvents[0].payload as PayoutTransactionEvent;
      expect(tx1Payload.transactionHash).toBe('tx1_hash_first_transaction');
      expect(tx1Payload.amount).toBe('1000000000');
      expect(tx1Payload.transactionNumber).toBe(1);
      expect(tx1Payload.sessionTotalAmount).toBe('1000000000');

      // TX2 event verification (running total: 1000 + 1500 = 2500)
      const tx2Payload = txEvents[1].payload as PayoutTransactionEvent;
      expect(tx2Payload.transactionHash).toBe('tx2_hash_second_transaction');
      expect(tx2Payload.amount).toBe('1500000000');
      expect(tx2Payload.transactionNumber).toBe(2);
      expect(tx2Payload.sessionTotalAmount).toBe('2500000000');

      // TX3 event verification (running total: 2500 + 1700 = 4200)
      const tx3Payload = txEvents[2].payload as PayoutTransactionEvent;
      expect(tx3Payload.transactionHash).toBe('tx3_hash_third_transaction');
      expect(tx3Payload.amount).toBe('1700000000');
      expect(tx3Payload.transactionNumber).toBe(3);
      expect(tx3Payload.sessionTotalAmount).toBe('4200000000');

      // Phase 3 - Session End:
      const endEvents = collectedEvents.filter((e) => e.event === PAYOUT_END_EVENT);
      expect(endEvents).toHaveLength(1);
      const endPayload = endEvents[0].payload as PayoutEndEvent;
      expect(endPayload.endReason).toBe('BALANCE_THRESHOLD');
      expect(endPayload.transactionCount).toBe(3);
      expect(endPayload.totalAmount).toBe('4200000000');
      expect(endPayload.endingBalance).toBe('800000000');
      expect(endPayload.durationMinutes).toEqual(expect.any(Number));

      // Verify notifications were sent
      // Total: 3 subscribers * (1 start + 3 TX + 1 end) = 15 calls
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(15);

      // Verify session is back to IDLE
      expect(payoutSessionService.isActive()).toBe(false);
    });
  });

  // ===========================================================================
  // User Journey: Multi-Transaction Session with Running Totals
  // ===========================================================================
  describe('User Journey: Multi-Transaction Session', () => {
    /**
     * User Journey: Multiple transactions in rapid succession -> All tracked with running totals
     * Covers: AC-1.3, AC-6.1, AC-6.3
     * ROI: 88 | Business Value: 9 (bulk payout scenario) | Frequency: 8 (common scenario)
     * Verification: System handles multiple transactions correctly with accurate running totals
     * @category: e2e
     * @dependency: full-system
     * @complexity: high
     *
     * User Story:
     *   As a PayPing subscriber,
     *   When a bulk payout occurs with many transactions,
     *   I want each transaction notification to show the running total,
     *   So that I can track the session's progress without manual calculation.
     *
     * Verification items:
     * - 5 transactions processed in sequence
     * - Each transaction emits payout.transaction event
     * - Running total (sessionTotalAmount) accumulates correctly
     * - Transaction numbers increment: 1, 2, 3, 4, 5
     * - No duplicate events or missed transactions
     * - Mutex prevents race conditions (if parallel processing tested)
     */
    it('tracks running totals correctly across 5 transactions in a session', async () => {
      // Arrange:
      // - Configure mock TronGridClient.getUSDTBalance() to return high balance
      mockTronGridClient.getUSDTBalance.mockResolvedValue('10000000000'); // 10000 USDT

      // - Configure mock SubscriptionsService with test subscribers
      const subscribers = [createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' })];
      mockSubscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      // - Create 5 test transactions with varying amounts:
      //   - TX1: 100 USDT (100000000 raw)
      //   - TX2: 200 USDT (200000000 raw)
      //   - TX3: 150 USDT (150000000 raw)
      //   - TX4: 300 USDT (300000000 raw)
      //   - TX5: 250 USDT (250000000 raw)
      const transactions = [
        createMockTransaction('tx1_100', { amount: '100000000' }),
        createMockTransaction('tx2_200', { amount: '200000000' }),
        createMockTransaction('tx3_150', { amount: '150000000' }),
        createMockTransaction('tx4_300', { amount: '300000000' }),
        createMockTransaction('tx5_250', { amount: '250000000' }),
      ];

      // - Setup event collector for payout.transaction events
      const txEvents: PayoutTransactionEvent[] = [];
      eventEmitter.on(PAYOUT_TRANSACTION_EVENT, (payload: PayoutTransactionEvent) => {
        txEvents.push(payload);
      });

      let startEventEmitted = false;
      eventEmitter.on(PAYOUT_START_EVENT, () => {
        startEventEmitted = true;
      });

      // Act:
      // - Process all 5 transactions sequentially through handleOutgoingTransaction()
      for (const tx of transactions) {
        await payoutSessionService.handleOutgoingTransaction(tx);
        await jest.runAllTimersAsync();
      }

      // Assert:
      // - 5 payout.transaction events emitted (plus 1 payout.start for TX1)
      expect(startEventEmitted).toBe(true);
      expect(txEvents).toHaveLength(5);

      // - Event payloads have correct running totals:
      //   - TX1: sessionTotalAmount = '100000000', transactionNumber = 1
      expect(txEvents[0].sessionTotalAmount).toBe('100000000');
      expect(txEvents[0].transactionNumber).toBe(1);

      //   - TX2: sessionTotalAmount = '300000000', transactionNumber = 2
      expect(txEvents[1].sessionTotalAmount).toBe('300000000');
      expect(txEvents[1].transactionNumber).toBe(2);

      //   - TX3: sessionTotalAmount = '450000000', transactionNumber = 3
      expect(txEvents[2].sessionTotalAmount).toBe('450000000');
      expect(txEvents[2].transactionNumber).toBe(3);

      //   - TX4: sessionTotalAmount = '750000000', transactionNumber = 4
      expect(txEvents[3].sessionTotalAmount).toBe('750000000');
      expect(txEvents[3].transactionNumber).toBe(4);

      //   - TX5: sessionTotalAmount = '1000000000', transactionNumber = 5
      expect(txEvents[4].sessionTotalAmount).toBe('1000000000');
      expect(txEvents[4].transactionNumber).toBe(5);

      // - Final session state: transactionCount = 5, totalAmount = '1000000000'
      const state = payoutSessionService.getState();
      expect(state.transactionCount).toBe(5);
      expect(state.totalAmount).toBe('1000000000');
    });
  });

  // ===========================================================================
  // User Journey: Localization Verification
  // ===========================================================================
  describe('User Journey: Localized Notifications', () => {
    /**
     * User Journey: Subscribers with different language preferences receive localized notifications
     * Covers: AC-7.1, AC-7.2, AC-7.3, AC-4.2, AC-5.3, AC-6.4
     * ROI: 72 | Business Value: 8 (user experience) | Frequency: 10 (every notification)
     * Verification: Notification content is correctly localized based on subscriber preference
     * @category: e2e
     * @dependency: full-system
     * @complexity: medium
     *
     * User Story:
     *   As a PayPing subscriber with Russian language preference,
     *   When I receive payout notifications,
     *   I want them in Russian,
     *   So that I can understand the information easily.
     *
     * Verification items:
     * - Subscriber with language_code='ru' receives Russian notification
     * - Subscriber with language_code='uk' receives Ukrainian notification
     * - Subscriber with unknown language_code receives English (fallback)
     * - All three notification types (start, transaction, end) are localized
     * - Localization variables are correctly interpolated
     */
    it('AC-7.1/AC-7.2/AC-7.3: sends notifications in subscriber preferred language', async () => {
      // Arrange:
      // - Configure mock SubscriptionsService.getActiveSubscribers() to return:
      //   - Subscriber 1: { telegramId: 1001, languageCode: 'ru' }
      //   - Subscriber 2: { telegramId: 1002, languageCode: 'uk' }
      //   - Subscriber 3: { telegramId: 1003, languageCode: 'fr' } (unsupported, fallback to en)
      const subscribers = [
        createMockUser({ id: 1, telegramId: 1001, languageCode: 'ru' }),
        createMockUser({ id: 2, telegramId: 1002, languageCode: 'uk' }),
        createMockUser({ id: 3, telegramId: 1003, languageCode: 'fr' }), // Unsupported
      ];
      mockSubscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      // - Configure mock TelegramService.sendMessage(): capture message content
      mockTronGridClient.getUSDTBalance.mockResolvedValue('5000000000');

      // Create test transaction
      const tx = createMockTransaction('localized_tx_hash', {
        amount: '1500000000',
        toAddress: 'TRecipientLocalized1234567890123',
      });

      // Act:
      // - Process outgoing transaction (triggers start + transaction notifications)
      await payoutSessionService.handleOutgoingTransaction(tx);
      await jest.runAllTimersAsync();

      // Assert:
      // Notifications: 3 subscribers * 2 events (start + transaction) = 6 calls
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(6);

      // Find messages by telegram ID
      const allCalls = mockBot.api.sendMessage.mock.calls;

      // Subscriber 1001 (Russian) - payout start
      const ruStartCall = allCalls.find(
        (call) => call[0] === 1001 && (call[1] as string).includes('Выплата'),
      );
      expect(ruStartCall).toBeDefined();
      expect(ruStartCall?.[1]).toContain('Выплата началась');

      // Subscriber 1002 (Ukrainian) - payout start
      const ukStartCall = allCalls.find(
        (call) => call[0] === 1002 && (call[1] as string).includes('Виплата'),
      );
      expect(ukStartCall).toBeDefined();
      expect(ukStartCall?.[1]).toContain('Виплата розпочалась');

      // Subscriber 1003 (French -> fallback to English) - payout start
      const enStartCall = allCalls.find(
        (call) => call[0] === 1003 && (call[1] as string).includes('Payout Session Started'),
      );
      expect(enStartCall).toBeDefined();
      expect(enStartCall?.[1]).toContain('Payout Session Started');

      // Verify transaction notifications are also localized
      // Russian transaction notification
      const ruTxCall = allCalls.find(
        (call) => call[0] === 1001 && (call[1] as string).includes('Перевод #'),
      );
      expect(ruTxCall).toBeDefined();

      // Ukrainian transaction notification
      const ukTxCall = allCalls.find(
        (call) => call[0] === 1002 && (call[1] as string).includes('Переказ #'),
      );
      expect(ukTxCall).toBeDefined();

      // English (fallback) transaction notification
      const enTxCall = allCalls.find(
        (call) => call[0] === 1003 && (call[1] as string).includes('Transfer #'),
      );
      expect(enTxCall).toBeDefined();
    });
  });

  // ===========================================================================
  // Error Recovery: Notification Failure Resilience
  // ===========================================================================
  describe('Error Recovery: Notification Failures', () => {
    /**
     * AC-4.3, AC-5.3 (implied): Individual notification failure should not block others
     * ROI: 68 | Business Value: 7 (reliability) | Frequency: 2 (occasional failures)
     * @category: e2e
     * @dependency: full-system
     * @complexity: medium
     *
     * Verification items:
     * - When one notification fails, others still succeed
     * - Error is logged but not propagated
     * - Session state is not affected by notification failures
     */
    it('AC-4.3: continues with remaining subscribers when one notification fails', async () => {
      // Arrange:
      // - Configure mock SubscriptionsService with 3 subscribers
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, languageCode: 'en' }),
        createMockUser({ id: 3, telegramId: 333333, languageCode: 'en' }),
      ];
      mockSubscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);
      mockTronGridClient.getUSDTBalance.mockResolvedValue('5000000000');

      // - Configure mock TelegramService.sendMessage():
      //   - Subscriber 1: resolve successfully (start event)
      //   - Subscriber 2: throw Error('Telegram API error') (start event)
      //   - Subscriber 3: resolve successfully (start event)
      //   - Then all succeed for transaction event
      let callCount = 0;
      mockBot.api.sendMessage.mockImplementation(async (chatId: number) => {
        callCount++;
        // Second call (subscriber 2's start notification) fails
        if (callCount === 2) {
          throw new Error('Telegram API error');
        }
        return {};
      });

      // Create test transaction
      const tx = createMockTransaction('failure_test_tx', { amount: '100000000' });

      // Act:
      // - Process outgoing transaction (triggers notifications)
      await payoutSessionService.handleOutgoingTransaction(tx);
      await jest.runAllTimersAsync();

      // Assert:
      // - TelegramService.sendMessage called 6 times (3 for start, 3 for transaction)
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(6);

      // - Session state remains valid (not corrupted by notification error)
      const state = payoutSessionService.getState();
      expect(state.isActive).toBe(true);
      expect(state.transactionCount).toBe(1);
      expect(state.totalAmount).toBe('100000000');

      // - Verify all subscriber IDs were attempted
      const calledIds = mockBot.api.sendMessage.mock.calls.map((call) => call[0]);
      expect(calledIds).toContain(111111);
      expect(calledIds).toContain(222222);
      expect(calledIds).toContain(333333);
    });
  });

  // ===========================================================================
  // Session End: Timeout Scenario
  // ===========================================================================
  describe('Session End: Timeout with Balance Decrease', () => {
    /**
     * User Journey: Session times out after 30 minutes with confirmed balance decrease
     * Covers: AC-3.1, AC-3.2, AC-5.1, AC-5.2
     * ROI: 78 | Business Value: 8 (session cleanup) | Frequency: 5 (timeout scenarios)
     * Verification: Timeout-based session end triggers correct notifications
     * @category: e2e
     * @dependency: full-system
     * @complexity: high
     *
     * Verification items:
     * - Session started with recorded start balance
     * - After 30+ minutes (mocked time), timeout check triggers
     * - Balance decrease is confirmed
     * - Session ends with reason TIMEOUT
     * - End notification includes correct statistics
     */
    it('AC-3.1/AC-3.2: ends session with TIMEOUT and sends notification after 30 minutes', async () => {
      // Arrange:
      // - Configure mock TronGridClient.getUSDTBalance():
      //   - Session start: return '10000000000' (10000 USDT)
      //   - Timeout check: return '7000000000' (7000 USDT, decreased but above threshold)
      mockTronGridClient.getUSDTBalance
        .mockResolvedValueOnce('10000000000') // Session start
        .mockResolvedValueOnce('7000000000'); // Timeout check - decreased

      // - Configure mock SubscriptionsService with test subscribers
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, languageCode: 'ru' }),
      ];
      mockSubscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      // - Setup event collector for payout.end
      let endEventPayload: PayoutEndEvent | null = null;
      eventEmitter.on(PAYOUT_END_EVENT, (payload: PayoutEndEvent) => {
        endEventPayload = payload;
      });

      // - Process initial transaction to start session
      const tx = createMockTransaction('timeout_tx', {
        amount: '200000000', // 200 USDT
        timestamp: Date.now(),
      });

      await payoutSessionService.handleOutgoingTransaction(tx);
      await jest.runAllTimersAsync();

      // Verify session is active
      expect(payoutSessionService.isActive()).toBe(true);

      // Clear message calls from start/transaction events
      mockBot.api.sendMessage.mockClear();

      // - Advance time by 31 minutes
      jest.advanceTimersByTime(31 * 60 * 1000);

      // Act:
      // - Call checkTimeout() (simulates @Interval trigger)
      await payoutSessionService.checkTimeout();
      await jest.runAllTimersAsync();

      // Assert:
      // - Session state is now IDLE
      expect(payoutSessionService.isActive()).toBe(false);

      // - payout.end event emitted with correct payload
      expect(endEventPayload).not.toBeNull();
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endReason).toBe('TIMEOUT');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.durationMinutes).toBeGreaterThanOrEqual(31);
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.endingBalance).toBe('7000000000');
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.transactionCount).toBe(1);
      // biome-ignore lint/style/noNonNullAssertion: verified by expect().not.toBeNull() above
      expect(endEventPayload!.totalAmount).toBe('200000000');

      // - All subscribers received end notification (2 subscribers)
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(2);

      // - Notification contains correct statistics
      const enMessage = mockBot.api.sendMessage.mock.calls.find(
        (call) => call[0] === 111111,
      )?.[1] as string;
      expect(enMessage).toContain('Payout Session Completed');

      const ruMessage = mockBot.api.sendMessage.mock.calls.find(
        (call) => call[0] === 222222,
      )?.[1] as string;
      expect(ruMessage).toContain('Выплата завершена');
    });
  });
});
