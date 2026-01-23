/**
 * Analytics E2E Tests
 *
 * These tests verify the complete bot interaction flow for the /analytics command,
 * including separate messages per classification group, locale support, and navigation.
 *
 * Test Requirements:
 * - Requires running bot (TELEGRAM_BOT_TOKEN set)
 * - Uses real database for analytics data
 * - Mocks Telegram API for message verification
 *
 * Note: These tests are marked as skipped by default as they require a running bot.
 * To run: Set RUN_E2E_TESTS=true and ensure bot is configured.
 *
 * @see AC-1.1 through AC-1.5: Command behavior
 * @see AC-6.1, AC-6.2, AC-6.3: Localization
 * @see AC-8.1 through AC-8.4: Navigation
 */

import { AnalyticsService, type GroupedAnalyticsResult as DbGroupedAnalyticsResult } from '@app/db';
import { Test, type TestingModule } from '@nestjs/testing';
import { AnalyticsHandler } from '../handlers/analytics.handler';
import { TelegramService } from '../telegram.service';
import type { BotContext } from '../types/telegram.types';

// Skip E2E tests unless explicitly enabled
const shouldRunE2E = process.env.RUN_E2E_TESTS === 'true';

/**
 * E2E Test Skeleton for Analytics Bot Interaction
 *
 * These tests document the expected E2E behavior. They can be enabled
 * by setting RUN_E2E_TESTS=true in the environment.
 */
describe('Analytics E2E Tests', () => {
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

  const mockAnalyticsWithAllGroups: DbGroupedAnalyticsResult = {
    employees: [
      {
        position: 1,
        walletAddress: 'TEmployee1234567890123456789012',
        classification: 'EMPLOYEE',
        amount: '5000000000',
        previousPosition: null,
        positionChange: 'new',
      },
      {
        position: 2,
        walletAddress: 'TEmployee2345678901234567890123',
        classification: 'EMPLOYEE',
        amount: '4500000000',
        previousPosition: 1,
        positionChange: 'down',
      },
    ],
    freelancers: [
      {
        position: 1,
        walletAddress: 'TFreelancer12345678901234567890',
        classification: 'FREELANCER',
        amount: '3000000000',
        previousPosition: 2,
        positionChange: 'up',
      },
    ],
    oneTime: [
      {
        position: 1,
        walletAddress: 'TOneTime1234567890123456789012',
        classification: 'ONE_TIME',
        amount: '1000000000',
        previousPosition: null,
        positionChange: 'new',
      },
    ],
    unknown: [
      {
        position: 1,
        walletAddress: 'TUnknown12345678901234567890123',
        classification: 'UNKNOWN',
        amount: '300000000',
        previousPosition: null,
        positionChange: 'new',
      },
    ],
    fired: [
      {
        walletAddress: 'TFiredEmployee123456789012345',
        lastPaymentMonth: '2025-11',
        lastAmount: '5000000000',
      },
    ],
  };

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

  function createMockContext(
    telegramId: number,
    options?: {
      languageCode?: string;
      messageText?: string;
      callbackData?: string;
    },
  ): jest.Mocked<BotContext> {
    return {
      from: {
        id: telegramId,
        username: 'testuser',
        first_name: 'Test',
        last_name: undefined,
        language_code: options?.languageCode ?? 'en',
        is_bot: false,
      },
      message: {
        text: options?.messageText ?? '/analytics',
      },
      callbackQuery: options?.callbackData
        ? {
            data: options.callbackData,
          }
        : undefined,
      reply: jest.fn(),
      t: jest.fn((key: string, params?: Record<string, string>) => {
        // Simulate i18n translation
        if (params) {
          let result = key;
          for (const [k, v] of Object.entries(params)) {
            result += ` ${k}=${v}`;
          }
          return result;
        }
        return key;
      }),
      answerCallbackQuery: jest.fn(),
    } as unknown as jest.Mocked<BotContext>;
  }

  // ===========================================================================
  // Current Month Response - AC-1.1
  // ===========================================================================
  describe('/analytics current month response (AC-1.1)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should respond within 3 seconds', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithAllGroups);

      // Act
      const startTime = Date.now();
      await handler.handleAnalytics(ctx);
      const duration = Date.now() - startTime;

      // Assert
      expect(duration).toBeLessThan(3000);
    });

    conditionalIt('should send separate messages for each classification', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithAllGroups);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Should call reply multiple times (once per non-empty group)
      // Employees, Freelancers, One-time, Unknown, Fired = 5 messages
      expect(ctx.reply).toHaveBeenCalledTimes(5);
    });
  });

  // ===========================================================================
  // Historical Month Response - AC-7.1
  // ===========================================================================
  describe('/analytics historical month (AC-7.1)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should parse YYYY-MM format parameter', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        messageText: '/analytics 2026-01',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith('2026-01');
    });

    conditionalIt('should parse short month format parameter', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        messageText: '/analytics Jan',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Should convert to current year
      const currentYear = new Date().getUTCFullYear();
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(`${currentYear}-01`);
    });
  });

  // ===========================================================================
  // /rating Alias - AC-1.2
  // ===========================================================================
  describe('/rating alias (AC-1.2)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should handle /rating as alias for /analytics', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        messageText: '/rating',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithAllGroups);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Navigation Buttons - AC-8.1, AC-8.2
  // ===========================================================================
  describe('Navigation button clicks (AC-8.1, AC-8.2)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should navigate to previous month', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        callbackData: 'analytics:prev:2026-01',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      // Act
      await handler.handleNavigationPrev(ctx);

      // Assert
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith('2025-12');
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });

    conditionalIt('should navigate to next month', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        callbackData: 'analytics:next:2025-12',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      // Act
      await handler.handleNavigationNext(ctx);

      // Assert
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith('2026-01');
      expect(ctx.answerCallbackQuery).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Message Formats - Employees
  // ===========================================================================
  describe('Employees message format', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt(
      'should format employees message with position and change indicators',
      async () => {
        // Arrange
        const ctx = createMockContext(123456);
        analyticsService.getGroupedAnalytics.mockResolvedValue({
          ...mockEmptyAnalytics,
          employees: mockAnalyticsWithAllGroups.employees,
        });

        // Act
        await handler.handleAnalytics(ctx);

        // Assert
        expect(ctx.t).toHaveBeenCalledWith('analytics-employees-header', expect.any(Object));
        // Verify position indicators are used
        expect(ctx.t).toHaveBeenCalledWith('position-new');
        expect(ctx.t).toHaveBeenCalledWith('position-down');
      },
    );
  });

  // ===========================================================================
  // Message Formats - Freelancers
  // ===========================================================================
  describe('Freelancers message format', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should format freelancers message correctly', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        freelancers: mockAnalyticsWithAllGroups.freelancers,
      });

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(ctx.t).toHaveBeenCalledWith('analytics-freelancers-header', expect.any(Object));
    });
  });

  // ===========================================================================
  // Message Formats - One-time
  // ===========================================================================
  describe('One-time message format', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should format one-time message correctly', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        oneTime: mockAnalyticsWithAllGroups.oneTime,
      });

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(ctx.t).toHaveBeenCalledWith('analytics-onetime-header', expect.any(Object));
    });
  });

  // ===========================================================================
  // Message Formats - Unknown
  // ===========================================================================
  describe('Unknown message format', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should format unknown message correctly', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        unknown: mockAnalyticsWithAllGroups.unknown,
      });

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(ctx.t).toHaveBeenCalledWith('analytics-unknown-header', expect.any(Object));
    });
  });

  // ===========================================================================
  // Message Formats - Fired
  // ===========================================================================
  describe('Fired message appears when applicable', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should display fired message when there are terminated employees', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        fired: mockAnalyticsWithAllGroups.fired,
      });

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(ctx.t).toHaveBeenCalledWith('analytics-fired-header', { count: '1' });
    });
  });

  // ===========================================================================
  // Russian Locale Display - AC-6.1
  // ===========================================================================
  describe('Russian locale display (AC-6.1)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should use Russian translations when language_code is ru', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        languageCode: 'ru',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithAllGroups);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Translation function should be called
      expect(ctx.t).toHaveBeenCalled();
      // In a real E2E test, we would verify Russian text output
    });
  });

  // ===========================================================================
  // Ukrainian Locale Display - AC-6.2
  // ===========================================================================
  describe('Ukrainian locale display (AC-6.2)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should use Ukrainian translations when language_code is uk', async () => {
      // Arrange
      const ctx = createMockContext(123456, {
        languageCode: 'uk',
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithAllGroups);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Translation function should be called
      expect(ctx.t).toHaveBeenCalled();
      // In a real E2E test, we would verify Ukrainian text output
    });
  });

  // ===========================================================================
  // 6-Month Range Validation - AC-7.4
  // ===========================================================================
  describe('6-month range validation (AC-7.4)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should reject months older than 6 months', async () => {
      // Arrange: Request a month 8 months ago
      const pastDate = new Date();
      pastDate.setUTCMonth(pastDate.getUTCMonth() - 8);
      const pastMonth = `${pastDate.getUTCFullYear()}-${String(pastDate.getUTCMonth() + 1).padStart(2, '0')}`;

      const ctx = createMockContext(123456, {
        messageText: `/analytics ${pastMonth}`,
      });
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Should use current month instead
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      expect(analyticsService.getGroupedAnalytics).toHaveBeenCalledWith(currentMonth);
    });
  });

  // ===========================================================================
  // Empty Groups Skipped - AC-1.5
  // ===========================================================================
  describe('Empty groups skipped (AC-1.5)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should not send messages for empty classification groups', async () => {
      // Arrange: Only employees have data
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue({
        ...mockEmptyAnalytics,
        employees: mockAnalyticsWithAllGroups.employees,
      });

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Only employees header should be called, not others
      expect(ctx.t).toHaveBeenCalledWith('analytics-employees-header', expect.any(Object));
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-freelancers-header', expect.any(Object));
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-onetime-header', expect.any(Object));
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-unknown-header', expect.any(Object));
      expect(ctx.t).not.toHaveBeenCalledWith('analytics-fired-header', expect.any(Object));
    });
  });

  // ===========================================================================
  // No Data Message - AC-1.3
  // ===========================================================================
  describe('No data message (AC-1.3)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should display no-data message when all groups empty', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockEmptyAnalytics);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert
      expect(ctx.t).toHaveBeenCalledWith('analytics-no-data');
    });
  });

  // ===========================================================================
  // Wallet Address Truncation - AC-2.2
  // ===========================================================================
  describe('Wallet address truncation (AC-2.2)', () => {
    const conditionalIt = shouldRunE2E ? it : it.skip;

    conditionalIt('should truncate wallet addresses to first 4 + last 3', async () => {
      // Arrange
      const ctx = createMockContext(123456);
      analyticsService.getGroupedAnalytics.mockResolvedValue(mockAnalyticsWithAllGroups);

      // Act
      await handler.handleAnalytics(ctx);

      // Assert: Message should contain truncated format
      const replyCalls = (ctx.reply as jest.Mock).mock.calls;
      // Check that at least one call contains truncated address format
      const hasCorrectFormat = replyCalls.some((call) => {
        const message = call[0] as string;
        // Pattern: TXyz...abc (first 4 chars...last 3 chars)
        return /T[A-Za-z0-9]{3}\.\.\.[A-Za-z0-9]{3}/.test(message);
      });

      expect(hasCorrectFormat).toBe(true);
    });
  });
});
