import { SubscriptionsService, TransactionsService, UsersService } from '@app/db';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';
import type { BotContext } from '../types/telegram.types';
import { StartHandler } from './start.handler';

describe('StartHandler', () => {
  let handler: StartHandler;
  let usersService: jest.Mocked<UsersService>;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;
  let transactionsService: jest.Mocked<TransactionsService>;
  let mockBot: {
    command: jest.Mock;
  };

  const mockUser = {
    id: 1,
    telegramId: 123456,
    username: 'testuser',
    firstName: 'Test',
    lastName: null,
    languageCode: 'en',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    mockBot = {
      command: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StartHandler,
        {
          provide: UsersService,
          useValue: {
            findByTelegramId: jest.fn(),
            create: jest.fn(),
            updateLanguage: jest.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            getActive: jest.fn(),
          },
        },
        {
          provide: TransactionsService,
          useValue: {
            getMonthlySum: jest.fn().mockResolvedValue('0'),
            getRollingAverage: jest.fn().mockResolvedValue('0.00'),
            getMonthlyOutgoingSum: jest.fn().mockResolvedValue('0'),
            getAverageWalletCount: jest.fn().mockResolvedValue(0),
            getMonthlyWalletCount: jest.fn().mockResolvedValue(0),
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

    handler = module.get<StartHandler>(StartHandler);
    usersService = module.get(UsersService);
    subscriptionsService = module.get(SubscriptionsService);
    transactionsService = module.get(TransactionsService);
  });

  /**
   * Creates a mock BotContext for testing.
   * @param telegramId - The Telegram user ID
   * @returns Mock BotContext with basic properties
   */
  function createMockContext(telegramId: number): jest.Mocked<BotContext> {
    return {
      from: {
        id: telegramId,
        username: 'testuser',
        first_name: 'Test',
        last_name: undefined,
        language_code: 'en',
        is_bot: false,
      },
      reply: jest.fn(),
      t: jest.fn((key: string) => key), // Returns key as translation for testing
    } as unknown as jest.Mocked<BotContext>;
  }

  describe('handleStart', () => {
    it('should return early when no user ID in context', async () => {
      const ctx = createMockContext(123456);
      ctx.from = undefined;

      await handler.handleStart(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should display analytics with current month sum and rolling average', async () => {
      const ctx = createMockContext(123456);

      // Mock service responses (getMonthlySum returns raw amount, getRollingAverage returns formatted)
      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('1500250000'); // Raw: 1500.25 USDT
      transactionsService.getRollingAverage.mockResolvedValue('1200.50'); // Already formatted

      await handler.handleStart(ctx);

      // Verify TransactionsService methods called with correct arguments
      const now = new Date();
      expect(transactionsService.getMonthlySum).toHaveBeenCalledWith(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1,
      );
      expect(transactionsService.getRollingAverage).toHaveBeenCalledWith(3);

      // Verify reply was called with message containing analytics
      expect(ctx.reply).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          parse_mode: 'HTML',
        }),
      );

      // Verify t() was called with consolidated analytics key (with history)
      expect(ctx.t).toHaveBeenCalledWith('analytics-with-history', {
        currentAmount: '1,500.25',
        expectedAmount: '1200.50',
        months: '3',
      });
    });

    it('should show N/A for expected amount when rolling average is zero', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('0'); // Raw: 0 USDT
      transactionsService.getRollingAverage.mockResolvedValue('0.00');

      await handler.handleStart(ctx);

      // Verify consolidated no-history key used when no historical data
      expect(ctx.t).toHaveBeenCalledWith('analytics-no-history', { currentAmount: '0.00' });
      // Should not be called with history key
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-with-history', expect.any(Object));
    });

    it('should format current month sum to 2 decimal precision for display', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      // getMonthlySum returns raw amount (smallest unit)
      transactionsService.getMonthlySum.mockResolvedValue('2345680000'); // Raw: 2345.68 USDT
      transactionsService.getRollingAverage.mockResolvedValue('1000.00');

      await handler.handleStart(ctx);

      // Should be formatted with thousand separators via formatUsdtDisplay
      expect(ctx.t).toHaveBeenCalledWith('analytics-with-history', {
        currentAmount: '2,345.68',
        expectedAmount: '1000.00',
        months: '3',
      });
    });

    it('should handle TransactionsService errors gracefully', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockRejectedValue(new Error('DB connection error'));

      await handler.handleStart(ctx);

      // Verify error message shown to user
      expect(ctx.reply).toHaveBeenCalledWith('error-generic');
    });

    it('should create new user if not found', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('0'); // Raw: 0 USDT
      transactionsService.getRollingAverage.mockResolvedValue('0.00');

      await handler.handleStart(ctx);

      expect(usersService.create).toHaveBeenCalledWith({
        telegramId: 123456,
        username: 'testuser',
        firstName: 'Test',
        lastName: undefined,
      });
    });

    it('should save user language on /start', async () => {
      const ctx = createMockContext(123456);
      if (ctx.from) {
        ctx.from.language_code = 'uk';
      }

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('0'); // Raw: 0 USDT
      transactionsService.getRollingAverage.mockResolvedValue('0.00');

      await handler.handleStart(ctx);

      expect(usersService.updateLanguage).toHaveBeenCalledWith(123456, 'uk');
    });

    it('should fallback to "en" if language_code is undefined', async () => {
      const ctx = createMockContext(123456);
      if (ctx.from) {
        ctx.from.language_code = undefined;
      }

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('0'); // Raw: 0 USDT
      transactionsService.getRollingAverage.mockResolvedValue('0.00');

      await handler.handleStart(ctx);

      expect(usersService.updateLanguage).toHaveBeenCalledWith(123456, 'en');
    });

    it('should display subscribed status when user has active subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue({
        id: 1,
        userId: mockUser.id,
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      transactionsService.getMonthlySum.mockResolvedValue('100000000'); // Raw: 100 USDT
      transactionsService.getRollingAverage.mockResolvedValue('50.00');

      await handler.handleStart(ctx);

      expect(ctx.t).toHaveBeenCalledWith('status-subscribed');
    });

    it('should display not subscribed status when user has no active subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('100000000'); // Raw: 100 USDT
      transactionsService.getRollingAverage.mockResolvedValue('50.00');

      await handler.handleStart(ctx);

      expect(ctx.t).toHaveBeenCalledWith('status-not-subscribed');
    });

    it('should use UTC for date calculations', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      transactionsService.getMonthlySum.mockResolvedValue('0'); // Raw: 0 USDT
      transactionsService.getRollingAverage.mockResolvedValue('0.00');

      await handler.handleStart(ctx);

      // Verify UTC methods are used
      const now = new Date();
      expect(transactionsService.getMonthlySum).toHaveBeenCalledWith(
        now.getUTCFullYear(),
        now.getUTCMonth() + 1, // 1-indexed
      );
    });
  });

  describe('onModuleInit', () => {
    it('should register /start command', () => {
      handler.onModuleInit();

      expect(mockBot.command).toHaveBeenCalledWith('start', expect.any(Function));
    });
  });
});
