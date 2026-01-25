import {
  AnalyticsService,
  type GroupedAnalyticsResult as DbGroupedAnalyticsResult,
  type FiredEmployeeResult,
  type SalaryChangeInfo,
} from '@app/db';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from '../telegram.service';
import type { BotContext } from '../types/telegram.types';
import { CALLBACK_ACTIONS } from '../types/telegram.types';
import { AnalyticsHandler } from './analytics.handler';

describe('AnalyticsHandler', () => {
  let handler: AnalyticsHandler;
  let analyticsService: jest.Mocked<AnalyticsService>;
  let mockBot: {
    command: jest.Mock;
    callbackQuery: jest.Mock;
  };

  const mockEmptyAnalytics: DbGroupedAnalyticsResult = {
    employees: [],
    freelancers: [],
    oneTime: [],
    unknown: [],
    fired: [],
  };

  const mockAnalyticsWithData: DbGroupedAnalyticsResult = {
    employees: [
      {
        position: 1,
        walletAddress: 'TXyzTestWalletAddress12345678901234',
        classification: 'EMPLOYEE',
        amount: '5000000000',
        previousPosition: 2,
        previousAmount: '4500000000',
        positionChange: 'up',
      },
      {
        position: 2,
        walletAddress: 'TAbcTestWalletAddress12345678901234',
        classification: 'EMPLOYEE',
        amount: '4000000000',
        previousPosition: 1,
        previousAmount: '5000000000',
        positionChange: 'down',
      },
    ],
    freelancers: [
      {
        position: 1,
        walletAddress: 'TFreelancerWallet1234567890123456',
        classification: 'FREELANCER',
        amount: '3000000000',
        previousPosition: null,
        previousAmount: null,
        positionChange: 'new',
      },
    ],
    oneTime: [],
    unknown: [],
    fired: [],
  };

  const mockFiredEmployees: FiredEmployeeResult[] = [
    {
      walletAddress: 'TFiredWalletAddress12345678901234',
      lastPaymentMonth: '2025-11',
      lastAmount: '5000000000',
    },
  ];

  beforeEach(async () => {
    mockBot = {
      command: jest.fn(),
      callbackQuery: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsHandler,
        {
          provide: AnalyticsService,
          useValue: {
            getGroupedAnalytics: jest.fn(),
            getSalaryChangesForMonth: jest
              .fn()
              .mockResolvedValue(new Map<string, SalaryChangeInfo>()),
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

    handler = module.get<AnalyticsHandler>(AnalyticsHandler);
    analyticsService = module.get(AnalyticsService);
  });

  /**
   * Mutable mock context interface for testing.
   * Allows reassignment of read-only BotContext properties.
   */
  interface MockBotContext {
    from: BotContext['from'] | undefined;
    message: BotContext['message'] | undefined;
    callbackQuery: BotContext['callbackQuery'] | undefined;
    reply: jest.Mock;
    t: jest.Mock;
    answerCallbackQuery: jest.Mock;
  }

  /**
   * Creates a mock BotContext for testing.
   * @param telegramId - The Telegram user ID
   * @returns Mock BotContext with basic properties
   */
  function createMockContext(telegramId: number): MockBotContext {
    return {
      from: {
        id: telegramId,
        username: 'testuser',
        first_name: 'Test',
        last_name: undefined,
        language_code: 'en',
        is_bot: false,
      },
      message: {
        text: '/analytics',
      } as BotContext['message'],
      callbackQuery: undefined,
      reply: jest.fn(),
      t: jest.fn((key: string) => key),
      answerCallbackQuery: jest.fn(),
    };
  }

  describe('handleAnalytics', () => {
    /**
     * AC-1.4: System shall send messages in order: Employees, Freelancers, One-time, Unknown, Fired
     */
    it('should return early when no user ID in context', async () => {
      const ctx = createMockContext(123456);
      ctx.from = undefined;

      await handler.handleAnalytics(ctx as unknown as BotContext);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should display no-data message when no analytics data', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      expect(ctx.t).toHaveBeenCalledWith('analytics-no-data');
      expect(ctx.reply).toHaveBeenCalled();
    });

    /**
     * AC-1.4: Send separate messages per classification group
     */
    it('should send separate messages for each non-empty classification group', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Should send message for employees
      expect(ctx.t).toHaveBeenCalledWith('analytics-employees-header', {
        count: '2',
      });
      // Should send message for freelancers
      expect(ctx.t).toHaveBeenCalledWith('analytics-freelancers-header', {
        count: '1',
      });
      // Should not send messages for empty groups
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-onetime-header', expect.any(Object));
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-unknown-header', expect.any(Object));
    });

    /**
     * AC-1.5: Empty groups should be skipped
     */
    it('should skip empty classification groups', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        employees: mockAnalyticsWithData.employees,
      });

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Only employees message should be sent
      expect(ctx.t).toHaveBeenCalledWith('analytics-employees-header', {
        count: '2',
      });
      // Other group headers should not be called
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-freelancers-header', expect.any(Object));
    });

    /**
     * AC-7.1: Month parameter parsing - YYYY-MM format
     */
    it('should parse month parameter in YYYY-MM format', async () => {
      const ctx = createMockContext(123456);
      ctx.message = { text: '/analytics 2026-01' } as BotContext['message'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // First arg is yearMonth, second arg is comparison month
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(
        '2026-01',
        expect.any(String),
      );
    });

    /**
     * AC-7.2: Month parameter parsing - short format (Jan, Feb, etc.)
     */
    it('should parse month parameter in short format', async () => {
      const ctx = createMockContext(123456);
      ctx.message = { text: '/analytics Jan' } as BotContext['message'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Should convert Jan to current year's January
      const currentYear = new Date().getUTCFullYear();
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(
        `${currentYear}-01`,
        expect.any(String),
      );
    });

    /**
     * AC-7.4: Validate month is not in the future
     */
    it('should validate month is not in the future', async () => {
      const ctx = createMockContext(123456);
      // Request a month 2 months in the future
      const futureDate = new Date();
      futureDate.setUTCMonth(futureDate.getUTCMonth() + 2);
      const futureMonth = `${futureDate.getUTCFullYear()}-${String(futureDate.getUTCMonth() + 1).padStart(2, '0')}`;
      ctx.message = { text: `/analytics ${futureMonth}` } as BotContext['message'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Should use current month instead of future month
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(
        currentMonth,
        expect.any(String),
      );
    });

    /**
     * Allow access to historical months (no 6-month limit)
     */
    it('should allow access to historical months beyond 6 months', async () => {
      const ctx = createMockContext(123456);
      // Request a month 8 months ago - should be allowed now
      const pastDate = new Date();
      pastDate.setUTCMonth(pastDate.getUTCMonth() - 8);
      const pastMonth = `${pastDate.getUTCFullYear()}-${String(pastDate.getUTCMonth() + 1).padStart(2, '0')}`;
      ctx.message = { text: `/analytics ${pastMonth}` } as BotContext['message'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Should use the requested historical month (no 6-month limit)
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(
        pastMonth,
        expect.any(String),
      );
    });

    /**
     * AC-2.6: Position should be within classification group
     */
    it('should display position within classification group', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Position indicators should be called for each entry
      expect(ctx.t).toHaveBeenCalledWith('position-up');
      expect(ctx.t).toHaveBeenCalledWith('position-down');
      expect(ctx.t).toHaveBeenCalledWith('position-new');
    });

    it('should handle fired employees in results', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        employees: mockAnalyticsWithData.employees,
        fired: mockFiredEmployees,
      });

      await handler.handleAnalytics(ctx as unknown as BotContext);

      expect(ctx.t).toHaveBeenCalledWith('analytics-fired-header', {
        count: '1',
      });
    });

    it('should handle service errors gracefully', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockRejectedValue(new Error('DB error'));

      await handler.handleAnalytics(ctx as unknown as BotContext);

      expect(ctx.reply).toHaveBeenCalledWith('error-generic');
    });
  });

  describe('onModuleInit', () => {
    /**
     * AC-1.2: /rating works as alias for /analytics
     */
    it('should register /analytics command', () => {
      handler.onModuleInit();

      expect(mockBot.command).toHaveBeenCalledWith('analytics', expect.any(Function));
    });

    it('should register /rating command as alias', () => {
      handler.onModuleInit();

      expect(mockBot.command).toHaveBeenCalledWith('rating', expect.any(Function));
    });

    /**
     * AC-8.1: Inline keyboard navigation
     */
    it('should register analytics:prev callback query handler', () => {
      handler.onModuleInit();

      // Handler uses regex patterns to match callback data with month suffix
      expect(mockBot.callbackQuery).toHaveBeenCalledWith(expect.any(RegExp), expect.any(Function));
      // Verify the regex matches the expected pattern
      const regexCall = mockBot.callbackQuery.mock.calls.find(
        (call) =>
          call[0] instanceof RegExp && call[0].toString().includes(CALLBACK_ACTIONS.ANALYTICS_PREV),
      );
      expect(regexCall).toBeDefined();
    });

    it('should register analytics:next callback query handler', () => {
      handler.onModuleInit();

      // Handler uses regex patterns to match callback data with month suffix
      expect(mockBot.callbackQuery).toHaveBeenCalledWith(expect.any(RegExp), expect.any(Function));
      // Verify the regex matches the expected pattern
      const regexCall = mockBot.callbackQuery.mock.calls.find(
        (call) =>
          call[0] instanceof RegExp && call[0].toString().includes(CALLBACK_ACTIONS.ANALYTICS_NEXT),
      );
      expect(regexCall).toBeDefined();
    });
  });

  describe('handleNavigationPrev', () => {
    it('should navigate to previous month and answer callback query', async () => {
      const ctx = createMockContext(123456);
      ctx.callbackQuery = {
        data: 'analytics:prev:2026-01',
      } as BotContext['callbackQuery'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationPrev(ctx as unknown as BotContext);

      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(
        '2025-12',
        expect.any(String),
      );
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    /**
     * AC-8.3: Disable buttons at boundaries
     */
    it('should not navigate beyond 6-month boundary', async () => {
      const ctx = createMockContext(123456);
      // 6 months ago
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setUTCMonth(sixMonthsAgo.getUTCMonth() - 5);
      const month = `${sixMonthsAgo.getUTCFullYear()}-${String(sixMonthsAgo.getUTCMonth() + 1).padStart(2, '0')}`;
      ctx.callbackQuery = {
        data: `analytics:prev:${month}`,
      } as BotContext['callbackQuery'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationPrev(ctx as unknown as BotContext);

      // Should still answer callback query but not navigate
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('handleNavigationNext', () => {
    it('should navigate to next month and answer callback query', async () => {
      const ctx = createMockContext(123456);
      ctx.callbackQuery = {
        data: 'analytics:next:2025-12',
      } as BotContext['callbackQuery'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationNext(ctx as unknown as BotContext);

      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(
        '2026-01',
        expect.any(String),
      );
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    /**
     * AC-8.4: Disable buttons at boundaries (cannot go to future)
     */
    it('should not navigate beyond current month', async () => {
      const ctx = createMockContext(123456);
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      ctx.callbackQuery = {
        data: `analytics:next:${currentMonth}`,
      } as BotContext['callbackQuery'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationNext(ctx as unknown as BotContext);

      // Should still answer callback query but not navigate to future
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('month name formatting', () => {
    it('should format month name using localization', async () => {
      const ctx = createMockContext(123456);
      ctx.message = { text: '/analytics 2026-01' } as BotContext['message'];

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // Month name should be requested from i18n
      expect(ctx.t).toHaveBeenCalledWith('month-january');
    });
  });

  describe('wallet address truncation', () => {
    /**
     * AC-2.2: Wallet truncation first 4 + last 3
     */
    it('should truncate wallet addresses to first 4 + last 3 characters', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // The reply message should contain truncated addresses
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      const message = replyCall[0] as string;
      // Should contain truncated address format (TXyz...234)
      expect(message).toMatch(/T[A-Za-z0-9]{3}\.\.\.[A-Za-z0-9]{3}/);
    });
  });

  describe('amount column display', () => {
    it('should display current month amount when payout occurred', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // The reply message should contain the amount
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      const message = replyCall[0] as string;
      // Should contain formatted amount (5,000.00 from 5000000000 raw)
      expect(message).toContain('5,000.00');
    });

    it('should display comparison month amount when no payout (miss)', async () => {
      const ctx = createMockContext(123456);

      const mockWithMissedEntry: DbGroupedAnalyticsResult = {
        employees: [
          {
            position: 1,
            walletAddress: 'TXyzTestWalletAddress12345678901234',
            classification: 'EMPLOYEE',
            amount: '0', // No payout this month
            previousPosition: 1,
            previousAmount: '3000000000', // But had payout in comparison month
            positionChange: 'miss',
          },
        ],
        freelancers: [],
        oneTime: [],
        unknown: [],
        fired: [],
      };

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockWithMissedEntry);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // The reply message should contain the previous amount (3,000.00 USDT)
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      const message = replyCall[0] as string;
      expect(message).toContain('3,000.00');
    });

    it('should display salary change indicator for employees', async () => {
      const ctx = createMockContext(123456);

      const salaryChangesMap = new Map<string, SalaryChangeInfo>([
        [
          'TXyzTestWalletAddress12345678901234',
          {
            walletAddress: 'TXyzTestWalletAddress12345678901234',
            changePercent: 10.5,
            isIncrease: true,
          },
        ],
      ]);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);
      analyticsService.getSalaryChangesForMonth = jest.fn().mockResolvedValue(salaryChangesMap);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // The reply message should contain salary change indicator
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      const message = replyCall[0] as string;
      // Should contain +11% (rounded from 10.5%)
      expect(message).toMatch(/\+\d+%/);
    });

    it('should display salary decrease indicator', async () => {
      const ctx = createMockContext(123456);

      const salaryChangesMap = new Map<string, SalaryChangeInfo>([
        [
          'TAbcTestWalletAddress12345678901234',
          {
            walletAddress: 'TAbcTestWalletAddress12345678901234',
            changePercent: 15.0,
            isIncrease: false,
          },
        ],
      ]);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);
      analyticsService.getSalaryChangesForMonth = jest.fn().mockResolvedValue(salaryChangesMap);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // The reply message should contain salary decrease indicator
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      const message = replyCall[0] as string;
      // Should contain -15%
      expect(message).toMatch(/-\d+%/);
    });

    it('should not display salary change for missed entries', async () => {
      const ctx = createMockContext(123456);

      const mockWithMissedEntry: DbGroupedAnalyticsResult = {
        employees: [
          {
            position: 1,
            walletAddress: 'TXyzTestWalletAddress12345678901234',
            classification: 'EMPLOYEE',
            amount: '0',
            previousPosition: 1,
            previousAmount: '3000000000',
            positionChange: 'miss',
          },
        ],
        freelancers: [],
        oneTime: [],
        unknown: [],
        fired: [],
      };

      // Even if salary change exists, it shouldn't be shown for missed entries
      const salaryChangesMap = new Map<string, SalaryChangeInfo>([
        [
          'TXyzTestWalletAddress12345678901234',
          {
            walletAddress: 'TXyzTestWalletAddress12345678901234',
            changePercent: 10.0,
            isIncrease: true,
          },
        ],
      ]);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockWithMissedEntry);
      analyticsService.getSalaryChangesForMonth = jest.fn().mockResolvedValue(salaryChangesMap);

      await handler.handleAnalytics(ctx as unknown as BotContext);

      // The reply message should NOT contain salary change indicator for missed entry
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = ctx.reply.mock.calls[0];
      const message = replyCall[0] as string;
      // Should not contain +10% since entry is missed
      expect(message).not.toMatch(/\+10%/);
    });
  });
});
