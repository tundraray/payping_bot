import type { PayoutEndEvent, PayoutStartEvent, PayoutTransactionEvent } from '@app/blockchain';
import { SubscriptionsService, type User } from '@app/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramService } from '../../telegram.service';
import { clearBundleCache } from '../../utils';
import { PayoutListener } from '../payout.listener';

describe('PayoutListener', () => {
  let listener: PayoutListener;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let mockBot: { api: { sendMessage: jest.Mock } };

  beforeEach(async () => {
    mockBot = {
      api: {
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutListener,
        {
          provide: SubscriptionsService,
          useValue: {
            getActiveSubscribers: jest.fn(),
          },
        },
        {
          provide: TelegramService,
          useValue: {
            getBot: jest.fn().mockReturnValue(mockBot),
          },
        },
      ],
    }).compile();

    listener = module.get<PayoutListener>(PayoutListener);
    subscriptionsService = module.get(SubscriptionsService);
  });

  afterEach(() => {
    clearBundleCache();
  });

  // Helper to create mock user
  const createMockUser = (overrides?: Partial<User>): User =>
    ({
      id: 1,
      telegramId: 111111,
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      languageCode: 'en',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    }) as User;

  // Helper to create mock PayoutStartEvent
  const createPayoutStartEvent = (overrides?: Partial<PayoutStartEvent>): PayoutStartEvent => ({
    startedAt: 1640000000000,
    firstTransactionHash: 'abc123def456',
    startBalance: '10000000000', // 10,000 USDT
    ...overrides,
  });

  // Helper to create mock PayoutTransactionEvent
  const createPayoutTransactionEvent = (
    overrides?: Partial<PayoutTransactionEvent>,
  ): PayoutTransactionEvent => ({
    transactionHash: 'tx123hash456789abcdef',
    amount: '1500250000', // 1,500.25 USDT (6 decimals)
    recipientAddress: 'TRX7nK2xY3pL8qM9vC5wB4nF6tR1eS8dA2hJ9kP',
    timestamp: 1640000000000,
    sessionTotalAmount: '3000500000', // 3,000.50 USDT
    transactionNumber: 2,
    ...overrides,
  });

  // Helper to create mock PayoutEndEvent
  const createPayoutEndEvent = (overrides?: Partial<PayoutEndEvent>): PayoutEndEvent => ({
    startedAt: 1640000000000,
    endedAt: 1640003600000, // 1 hour later
    endReason: 'BALANCE_THRESHOLD',
    transactionCount: 15,
    totalAmount: '50000000000', // 50,000 USDT
    endingBalance: '500000000', // 500 USDT
    durationMinutes: 60,
    ...overrides,
  });

  describe('onPayoutStart', () => {
    it('should send notifications to all active subscribers', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111 }),
        createMockUser({ id: 2, telegramId: 222222 }),
        createMockUser({ id: 3, telegramId: 333333 }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutStart(createPayoutStartEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);
      expect(mockBot.api.sendMessage).toHaveBeenCalledWith(111111, expect.any(String), {
        parse_mode: 'HTML',
      });
    });

    it('should handle empty subscriber list gracefully', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([]);

      await listener.onPayoutStart(createPayoutStartEvent());

      expect(mockBot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should continue on individual send failures (AC-4.3)', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111 }),
        createMockUser({ id: 2, telegramId: 222222 }),
        createMockUser({ id: 3, telegramId: 333333 }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      // Second call fails
      mockBot.api.sendMessage
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('User blocked bot'))
        .mockResolvedValueOnce({});

      await listener.onPayoutStart(createPayoutStartEvent());

      // All three sends should be attempted
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should not crash on unexpected errors', async () => {
      subscriptionsService.getActiveSubscribers.mockRejectedValue(new Error('DB connection lost'));

      // Should not throw
      await expect(listener.onPayoutStart(createPayoutStartEvent())).resolves.not.toThrow();
    });
  });

  describe('onPayoutTransaction', () => {
    it('should send notifications to all active subscribers', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111 }),
        createMockUser({ id: 2, telegramId: 222222 }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutTransaction(createPayoutTransactionEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should format amount correctly with thousand separators', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Raw amount: 1,500.25 USDT = 1500250000 (6 decimals)
      await listener.onPayoutTransaction(createPayoutTransactionEvent({ amount: '1500250000' }));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Fluent adds Unicode isolation marks around variables, so use regex match
      expect(message).toMatch(/1,500\.25/);
    });

    it('should truncate recipient address correctly', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      const fullAddress = 'TRX7nK2xY3pL8qM9vC5wB4nF6tR1eS8dA2hJ9kP';
      await listener.onPayoutTransaction(
        createPayoutTransactionEvent({ recipientAddress: fullAddress }),
      );

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // truncateAddress shows first 6 + last 4 chars
      // Fluent adds Unicode isolation marks around variables, so use regex match
      expect(message).toMatch(/TRX7nK\.\.\.J9kP/);
    });

    it('should include session total in notification', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Session total: 3,000.50 USDT
      await listener.onPayoutTransaction(
        createPayoutTransactionEvent({ sessionTotalAmount: '3000500000' }),
      );

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toMatch(/3,000\.50/);
    });

    it('should include transaction number in notification', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      await listener.onPayoutTransaction(createPayoutTransactionEvent({ transactionNumber: 5 }));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Fluent adds Unicode isolation marks around variables, so use regex match
      expect(message).toMatch(/#.*5/);
    });

    it('should include Tronscan link as inline button', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      const txHash = 'abc123def456hash';
      await listener.onPayoutTransaction(createPayoutTransactionEvent({ transactionHash: txHash }));

      const options = mockBot.api.sendMessage.mock.calls[0][2] as {
        parse_mode: string;
        reply_markup: { inline_keyboard: Array<Array<{ text: string; url: string }>> };
      };

      expect(options.reply_markup).toBeDefined();
      expect(options.reply_markup.inline_keyboard[0][0].url).toBe(
        `https://tronscan.org/#/transaction/${txHash}`,
      );
    });

    it('should continue on individual send failures (AC-4.3)', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111 }),
        createMockUser({ id: 2, telegramId: 222222 }),
        createMockUser({ id: 3, telegramId: 333333 }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      mockBot.api.sendMessage
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('User blocked bot'))
        .mockResolvedValueOnce({});

      await listener.onPayoutTransaction(createPayoutTransactionEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle empty subscriber list gracefully', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([]);

      await listener.onPayoutTransaction(createPayoutTransactionEvent());

      expect(mockBot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should not crash on unexpected errors', async () => {
      subscriptionsService.getActiveSubscribers.mockRejectedValue(new Error('DB connection lost'));

      await expect(
        listener.onPayoutTransaction(createPayoutTransactionEvent()),
      ).resolves.not.toThrow();
    });
  });

  describe('onPayoutEnd', () => {
    it('should send notifications to all active subscribers', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111 }),
        createMockUser({ id: 2, telegramId: 222222 }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutEnd(createPayoutEndEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(2);
    });

    it('should include summary with transaction count', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      await listener.onPayoutEnd(createPayoutEndEvent({ transactionCount: 15 }));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toContain('15');
    });

    it('should include summary with total amount formatted', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Total: 50,000 USDT
      await listener.onPayoutEnd(createPayoutEndEvent({ totalAmount: '50000000000' }));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toMatch(/50,000\.00/);
    });

    it('should include duration in notification', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      await listener.onPayoutEnd(createPayoutEndEvent({ durationMinutes: 60 }));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toContain('60');
    });

    it('should include ending balance formatted', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Ending balance: 500 USDT
      await listener.onPayoutEnd(createPayoutEndEvent({ endingBalance: '500000000' }));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toMatch(/500\.00/);
    });

    it('should continue on individual send failures (AC-4.3)', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111 }),
        createMockUser({ id: 2, telegramId: 222222 }),
        createMockUser({ id: 3, telegramId: 333333 }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      mockBot.api.sendMessage
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('User blocked bot'))
        .mockResolvedValueOnce({});

      await listener.onPayoutEnd(createPayoutEndEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should handle empty subscriber list gracefully', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([]);

      await listener.onPayoutEnd(createPayoutEndEvent());

      expect(mockBot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should not crash on unexpected errors', async () => {
      subscriptionsService.getActiveSubscribers.mockRejectedValue(new Error('DB connection lost'));

      await expect(listener.onPayoutEnd(createPayoutEndEvent())).resolves.not.toThrow();
    });
  });

  describe('Localization (AC-7.1, AC-7.2, AC-7.3)', () => {
    it('should send Russian message to Russian subscriber (AC-7.1)', async () => {
      const subscribers = [createMockUser({ telegramId: 111111, languageCode: 'ru' })];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutStart(createPayoutStartEvent());

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Russian: "Выплата началась"
      expect(message).toContain('Выплата началась');
    });

    it('should send Ukrainian message to Ukrainian subscriber (AC-7.2)', async () => {
      const subscribers = [createMockUser({ telegramId: 111111, languageCode: 'uk' })];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutStart(createPayoutStartEvent());

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Ukrainian: "Виплата розпочалась"
      expect(message).toContain('Виплата розпочалась');
    });

    it('should fallback to English for unknown language (AC-7.3)', async () => {
      const subscribers = [createMockUser({ telegramId: 111111, languageCode: null })];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutStart(createPayoutStartEvent());

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // English: "Payout Session Started"
      expect(message).toContain('Payout Session Started');
    });

    it('should send localized payout transaction notification', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, languageCode: 'ru' }),
        createMockUser({ id: 3, telegramId: 333333, languageCode: 'uk' }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutTransaction(createPayoutTransactionEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);

      // Verify English message - "Transfer #"
      const enMessage = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(enMessage).toContain('Transfer #');

      // Verify Russian message - "Перевод #"
      const ruMessage = mockBot.api.sendMessage.mock.calls[1][1] as string;
      expect(ruMessage).toContain('Перевод #');

      // Verify Ukrainian message - "Переказ #"
      const ukMessage = mockBot.api.sendMessage.mock.calls[2][1] as string;
      expect(ukMessage).toContain('Переказ #');
    });

    it('should send localized payout end notification', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, languageCode: 'ru' }),
        createMockUser({ id: 3, telegramId: 333333, languageCode: 'uk' }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onPayoutEnd(createPayoutEndEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);

      // Verify English message - "Payout Session Completed"
      const enMessage = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(enMessage).toContain('Payout Session Completed');

      // Verify Russian message - "Выплата завершена"
      const ruMessage = mockBot.api.sendMessage.mock.calls[1][1] as string;
      expect(ruMessage).toContain('Выплата завершена');

      // Verify Ukrainian message - "Виплата завершена"
      const ukMessage = mockBot.api.sendMessage.mock.calls[2][1] as string;
      expect(ukMessage).toContain('Виплата завершена');
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limit delay for large subscriber lists (>10)', async () => {
      // Create 12 subscribers (above RATE_LIMIT_THRESHOLD of 10)
      const subscribers = Array.from({ length: 12 }, (_, i) =>
        createMockUser({ id: i + 1, telegramId: 100000 + i }),
      );

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      const startTime = Date.now();
      await listener.onPayoutStart(createPayoutStartEvent());
      const duration = Date.now() - startTime;

      // With 12 subscribers and 40ms delay per message, minimum ~480ms
      // (actually 11 delays since no delay after last message in loop)
      // Allow some tolerance for test execution variance
      expect(duration).toBeGreaterThan(400);
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(12);
    });

    it('should not apply rate limit delay for small subscriber lists (<=10)', async () => {
      // Create exactly 10 subscribers (at threshold, no delay)
      const subscribers = Array.from({ length: 10 }, (_, i) =>
        createMockUser({ id: i + 1, telegramId: 100000 + i }),
      );

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      const startTime = Date.now();
      await listener.onPayoutStart(createPayoutStartEvent());
      const duration = Date.now() - startTime;

      // Without rate limiting, should complete quickly (<200ms)
      expect(duration).toBeLessThan(200);
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(10);
    });
  });
});
