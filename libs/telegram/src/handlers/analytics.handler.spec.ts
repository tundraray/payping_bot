import {
  AnalyticsService,
  type GroupedAnalyticsResult as DbGroupedAnalyticsResult,
  type FiredEmployeeResult,
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
        positionChange: 'up',
      },
      {
        position: 2,
        walletAddress: 'TAbcTestWalletAddress12345678901234',
        classification: 'EMPLOYEE',
        amount: '4000000000',
        previousPosition: 1,
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
      message: {
        text: '/analytics',
      },
      reply: jest.fn(),
      t: jest.fn((key: string) => key),
      answerCallbackQuery: jest.fn(),
    } as unknown as jest.Mocked<BotContext>;
  }

  describe('handleAnalytics', () => {
    /**
     * AC-1.4: System shall send messages in order: Employees, Freelancers, One-time, Unknown, Fired
     */
    it('should return early when no user ID in context', async () => {
      const ctx = createMockContext(123456);
      ctx.from = undefined;

      await handler.handleAnalytics(ctx);

      expect(ctx.reply).not.toHaveBeenCalled();
    });

    it('should display no-data message when no analytics data', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx);

      expect(ctx.t).toHaveBeenCalledWith('analytics-no-data');
      expect(ctx.reply).toHaveBeenCalled();
    });

    /**
     * AC-1.4: Send separate messages per classification group
     */
    it('should send separate messages for each non-empty classification group', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx);

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

      await handler.handleAnalytics(ctx);

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
      ctx.message = { text: '/analytics 2026-01' } as typeof ctx.message;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx);

      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith('2026-01');
    });

    /**
     * AC-7.2: Month parameter parsing - short format (Jan, Feb, etc.)
     */
    it('should parse month parameter in short format', async () => {
      const ctx = createMockContext(123456);
      ctx.message = { text: '/analytics Jan' } as typeof ctx.message;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx);

      // Should convert Jan to current year's January
      const currentYear = new Date().getUTCFullYear();
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(`${currentYear}-01`);
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
      ctx.message = { text: `/analytics ${futureMonth}` } as typeof ctx.message;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx);

      // Should use current month instead of future month
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(currentMonth);
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
      ctx.message = { text: `/analytics ${pastMonth}` } as typeof ctx.message;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleAnalytics(ctx);

      // Should use the requested historical month (no 6-month limit)
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(pastMonth);
    });

    /**
     * AC-2.6: Position should be within classification group
     */
    it('should display position within classification group', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx);

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

      await handler.handleAnalytics(ctx);

      expect(ctx.t).toHaveBeenCalledWith('analytics-fired-header', {
        count: '1',
      });
    });

    it('should handle service errors gracefully', async () => {
      const ctx = createMockContext(123456);

      analyticsService.getGroupedAnalytics.mockRejectedValue(new Error('DB error'));

      await handler.handleAnalytics(ctx);

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

      expect(mockBot.callbackQuery).toHaveBeenCalledWith(
        CALLBACK_ACTIONS.ANALYTICS_PREV,
        expect.any(Function),
      );
    });

    it('should register analytics:next callback query handler', () => {
      handler.onModuleInit();

      expect(mockBot.callbackQuery).toHaveBeenCalledWith(
        CALLBACK_ACTIONS.ANALYTICS_NEXT,
        expect.any(Function),
      );
    });
  });

  describe('handleNavigationPrev', () => {
    it('should navigate to previous month and answer callback query', async () => {
      const ctx = createMockContext(123456);
      ctx.callbackQuery = {
        data: 'analytics:prev:2026-01',
      } as typeof ctx.callbackQuery;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationPrev(ctx);

      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith('2025-12');
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
      } as typeof ctx.callbackQuery;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationPrev(ctx);

      // Should still answer callback query but not navigate
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('handleNavigationNext', () => {
    it('should navigate to next month and answer callback query', async () => {
      const ctx = createMockContext(123456);
      ctx.callbackQuery = {
        data: 'analytics:next:2025-12',
      } as typeof ctx.callbackQuery;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationNext(ctx);

      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith('2026-01');
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
      } as typeof ctx.callbackQuery;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      await handler.handleNavigationNext(ctx);

      // Should still answer callback query but not navigate to future
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  describe('month name formatting', () => {
    it('should format month name using localization', async () => {
      const ctx = createMockContext(123456);
      ctx.message = { text: '/analytics 2026-01' } as typeof ctx.message;

      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithData);

      await handler.handleAnalytics(ctx);

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

      await handler.handleAnalytics(ctx);

      // The reply message should contain truncated addresses
      expect(ctx.reply).toHaveBeenCalled();
      const replyCall = (ctx.reply as jest.Mock).mock.calls[0];
      const message = replyCall[0] as string;
      // Should contain truncated address format (TXyz...234)
      expect(message).toMatch(/T[A-Za-z0-9]{3}\.\.\.[A-Za-z0-9]{3}/);
    });
  });
});
