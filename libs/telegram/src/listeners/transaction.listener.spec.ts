import type { Transaction, TransactionNewEvent } from '@app/blockchain';
import { TransactionType } from '@app/blockchain';
import { SubscriptionsService, TransactionsService, type User } from '@app/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';
import { clearBundleCache } from '../utils';
import { TransactionListener } from './transaction.listener';

describe('TransactionListener', () => {
  let listener: TransactionListener;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let transactionsService: jest.Mocked<TransactionsService>;
  let mockBot: { api: { sendMessage: jest.Mock } };

  beforeEach(async () => {
    mockBot = {
      api: {
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionListener,
        {
          provide: SubscriptionsService,
          useValue: {
            getActiveSubscribers: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            getMonthlySum: jest.fn().mockResolvedValue('5000000000'), // 5000 USDT
            getRollingAverage: jest.fn().mockResolvedValue('10,000.00'),
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

    listener = module.get<TransactionListener>(TransactionListener);
    subscriptionsService = module.get(SubscriptionsService);
    transactionsService = module.get(TransactionsService);
  });

  afterEach(() => {
    clearBundleCache();
  });

  const createMockTransaction = (overrides?: Partial<Transaction>): Transaction => ({
    hash: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9d0e1f2',
    type: TransactionType.USDT,
    fromAddress: 'TRX7nK2xY3pL8qM9vC5wB4nF6tR1eS8dA2hJ9kP',
    toAddress: 'TMonitoredWalletAddress123456789',
    amount: '1500250000', // Raw amount: 1500.25 USDT (6 decimals)
    timestamp: 1640000000000,
    blockNumber: 12345678,
    contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    ...overrides,
  });

  const createMockEvent = (transaction?: Transaction): TransactionNewEvent => ({
    transaction: transaction ?? createMockTransaction(),
    detectedAt: Date.now(),
  });

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

  describe('onTransactionNew', () => {
    it('should send notifications to all active subscribers', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, username: 'user1', languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, username: 'user2', languageCode: 'en' }),
        createMockUser({ id: 3, telegramId: 333333, username: 'user3', languageCode: 'en' }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onTransactionNew(createMockEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);
      // Fluent adds Unicode isolation marks around variables, so use regex match
      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toMatch(/1,500\.25.*USDT/); // With thousand separator
    });

    it('should send localized notification to each subscriber in their language', async () => {
      const subscribers = [
        createMockUser({ id: 1, telegramId: 111111, languageCode: 'en' }),
        createMockUser({ id: 2, telegramId: 222222, languageCode: 'ru' }),
        createMockUser({ id: 3, telegramId: 333333, languageCode: 'uk' }),
      ];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onTransactionNew(createMockEvent());

      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);

      // Verify English message
      const enMessage = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(enMessage).toContain('Funds received');

      // Verify Russian message
      const ruMessage = mockBot.api.sendMessage.mock.calls[1][1] as string;
      expect(ruMessage).toContain('Поступление средств');

      // Verify Ukrainian message
      const ukMessage = mockBot.api.sendMessage.mock.calls[2][1] as string;
      expect(ukMessage).toContain('Надходження коштів');
    });

    it('should fallback to English for subscribers without language', async () => {
      const subscribers = [createMockUser({ telegramId: 999999, languageCode: null })];

      subscriptionsService.getActiveSubscribers.mockResolvedValue(subscribers);

      await listener.onTransactionNew(createMockEvent());

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      expect(message).toContain('Funds received');
    });

    it('should include transaction details and progress in notification', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      await listener.onTransactionNew(createMockEvent());

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Fluent adds Unicode isolation marks around variables, so use regex match
      expect(message).toMatch(/1,500\.25.*USDT/); // Amount with thousand separator
      expect(message).toMatch(/5,000\.00/); // Month total
      expect(message).toMatch(/10,000\.00/); // Expected amount
      expect(message).toContain('tronscan.org'); // Link to Tronscan
    });

    it('should handle empty subscriber list gracefully', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([]);

      await listener.onTransactionNew(createMockEvent());

      expect(mockBot.api.sendMessage).not.toHaveBeenCalled();
    });

    it('should continue on individual send failures', async () => {
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

      await listener.onTransactionNew(createMockEvent());

      // All three sends attempted
      expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);
    });

    it('should log timing metrics on completion', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // biome-ignore lint/suspicious/noExplicitAny: Accessing private logger for testing
      const logSpy = jest.spyOn((listener as any).logger, 'log');

      await listener.onTransactionNew(createMockEvent());

      expect(logSpy).toHaveBeenCalledWith(
        'Notification batch complete',
        expect.objectContaining({
          durationMs: expect.any(Number),
          successCount: 1,
          failureCount: 0,
        }),
      );
    });

    it('should warn if delivery exceeds 5 second target', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Mock slow sendMessage (>5s)
      mockBot.api.sendMessage.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5100)),
      );

      // biome-ignore lint/suspicious/noExplicitAny: Accessing private logger for testing
      const warnSpy = jest.spyOn((listener as any).logger, 'warn');

      await listener.onTransactionNew(createMockEvent());

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeded 5s target'));
    }, 10000); // Increase timeout for this test

    it('should not crash on unexpected errors', async () => {
      subscriptionsService.getActiveSubscribers.mockRejectedValue(new Error('DB connection lost'));

      // Should not throw
      await expect(listener.onTransactionNew(createMockEvent())).resolves.not.toThrow();
    });

    it('should format amount with 2 decimal places', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Raw amount: 100.123456 USDT = 100123456 (6 decimals)
      const transaction = createMockTransaction({ amount: '100123456' });
      await listener.onTransactionNew(createMockEvent(transaction));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Fluent adds Unicode isolation marks around variables, so use regex match
      expect(message).toMatch(/100\.12.*USDT/);
    });

    it('should format large amount with thousand separators', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      // Raw amount: 1,234,567.89 USDT = 1234567890000 (6 decimals)
      const transaction = createMockTransaction({ amount: '1234567890000' });
      await listener.onTransactionNew(createMockEvent(transaction));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Fluent adds Unicode isolation marks around variables, so use regex match
      expect(message).toMatch(/1,234,567\.89.*USDT/);
    });

    it('should include full hash in Tronscan link', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      const fullHash = 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0';
      const transaction = createMockTransaction({ hash: fullHash });
      await listener.onTransactionNew(createMockEvent(transaction));

      const message = mockBot.api.sendMessage.mock.calls[0][1] as string;
      // Fluent adds Unicode isolation marks around variables
      expect(message).toContain('tronscan.org/#/transaction/');
      expect(message).toContain(fullHash);
    });

    it('should fetch monthly statistics before sending notifications', async () => {
      subscriptionsService.getActiveSubscribers.mockResolvedValue([createMockUser()]);

      await listener.onTransactionNew(createMockEvent());

      expect(transactionsService.getMonthlySum).toHaveBeenCalled();
      expect(transactionsService.getRollingAverage).toHaveBeenCalledWith(3);
    });
  });
});
