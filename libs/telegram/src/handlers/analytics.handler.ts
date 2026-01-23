import {
  AnalyticsService,
  type AnalyticsResult as DbAnalyticsResult,
  type GroupedAnalyticsResult as DbGroupedAnalyticsResult,
  type FiredEmployeeResult,
} from '@app/db';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import { TelegramService } from '../telegram.service';
import type { BotContext } from '../types/telegram.types';
import { CALLBACK_ACTIONS } from '../types/telegram.types';
import { formatUsdtDisplay, truncateWalletForAnalytics } from '../utils';

/**
 * Month name keys for i18n lookup.
 */
const MONTH_KEYS = [
  'month-january',
  'month-february',
  'month-march',
  'month-april',
  'month-may',
  'month-june',
  'month-july',
  'month-august',
  'month-september',
  'month-october',
  'month-november',
  'month-december',
] as const;

/**
 * Short month names for parsing.
 */
const SHORT_MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

/**
 * AnalyticsHandler manages /analytics and /rating commands.
 *
 * Displays grouped payout analytics with separate messages per classification:
 * - Employees
 * - Freelancers
 * - One-time payments
 * - Unknown
 * - Fired (terminated)
 *
 * Includes inline keyboard navigation for browsing months.
 *
 * @see AC-1.2: /rating as alias
 * @see AC-1.4: Separate messages per classification
 * @see AC-1.5: Skip empty groups
 * @see AC-2.2: Wallet truncation first 4 + last 3
 * @see AC-2.6: Position within classification group
 * @see AC-7.1-7.4: Month parameter parsing and validation
 * @see AC-8.1-8.4: Inline keyboard navigation
 */
@Injectable()
export class AnalyticsHandler implements OnModuleInit {
  private readonly logger = new Logger(AnalyticsHandler.name);

  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Register commands and callback handlers on module initialization.
   */
  onModuleInit(): void {
    const bot = this.telegramService.getBot();

    // Register /analytics and /rating as alias
    bot.command('analytics', (ctx) => this.handleAnalytics(ctx));
    bot.command('rating', (ctx) => this.handleAnalytics(ctx));

    // Register navigation callbacks
    bot.callbackQuery(CALLBACK_ACTIONS.ANALYTICS_PREV, (ctx) => this.handleNavigationPrev(ctx));
    bot.callbackQuery(CALLBACK_ACTIONS.ANALYTICS_NEXT, (ctx) => this.handleNavigationNext(ctx));

    this.logger.log('AnalyticsHandler commands registered');
  }

  /**
   * Handle /analytics and /rating commands.
   * Parses optional month parameter and displays grouped analytics.
   */
  async handleAnalytics(ctx: BotContext): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      this.logger.warn('Received /analytics without user ID');
      return;
    }

    try {
      // Parse month parameter from command
      const yearMonth = this.parseMonthParameter(ctx);

      // Fetch analytics data
      const analytics = await this.analyticsService.getGroupedAnalytics(yearMonth);

      // Check if any data exists
      const hasData = this.hasAnalyticsData(analytics);
      if (!hasData) {
        this.logger.warn('No analytics data found', { yearMonth });
        await ctx.reply(ctx.t('analytics-no-data'), { parse_mode: 'HTML' });
        return;
      }

      // Calculate previous month for comparison display
      const previousMonth = this.getPreviousMonth(yearMonth);

      // Send separate messages for each non-empty classification group
      const messageCount = await this.sendGroupedMessages(ctx, analytics, yearMonth, previousMonth);

      this.logger.log(`Analytics displayed for ${yearMonth}`, {
        telegramId,
        yearMonth,
        messageCount,
      });
    } catch (error) {
      this.logger.error('Error handling /analytics command', { telegramId, error });
      await ctx.reply(ctx.t('error-generic'));
    }
  }

  /**
   * Handle Previous month navigation callback.
   */
  async handleNavigationPrev(ctx: BotContext): Promise<void> {
    try {
      const currentMonth = this.extractMonthFromCallback(ctx);
      const targetMonth = this.getPreviousMonth(currentMonth);

      // Check if within 6-month boundary
      if (!this.isWithinRange(targetMonth)) {
        await ctx.answerCallbackQuery({ text: ctx.t('analytics-data-unavailable') });
        return;
      }

      // Delete old messages and send new analytics
      await this.handleAnalyticsForMonth(ctx, targetMonth);
      await ctx.answerCallbackQuery();
    } catch (error) {
      this.logger.error('Error handling navigation prev', error);
      await ctx.answerCallbackQuery({ text: ctx.t('error-generic') });
    }
  }

  /**
   * Handle Next month navigation callback.
   */
  async handleNavigationNext(ctx: BotContext): Promise<void> {
    try {
      const currentMonth = this.extractMonthFromCallback(ctx);
      const targetMonth = this.getNextMonth(currentMonth);

      // Check if not in future
      if (!this.isNotFuture(targetMonth)) {
        await ctx.answerCallbackQuery({ text: ctx.t('analytics-data-unavailable') });
        return;
      }

      // Delete old messages and send new analytics
      await this.handleAnalyticsForMonth(ctx, targetMonth);
      await ctx.answerCallbackQuery();
    } catch (error) {
      this.logger.error('Error handling navigation next', error);
      await ctx.answerCallbackQuery({ text: ctx.t('error-generic') });
    }
  }

  /**
   * Handle analytics for a specific month (used by navigation).
   */
  private async handleAnalyticsForMonth(ctx: BotContext, yearMonth: string): Promise<void> {
    const analytics = await this.analyticsService.getGroupedAnalytics(yearMonth);

    const hasData = this.hasAnalyticsData(analytics);
    if (!hasData) {
      await ctx.reply(ctx.t('analytics-no-data'), { parse_mode: 'HTML' });
      return;
    }

    const previousMonth = this.getPreviousMonth(yearMonth);
    await this.sendGroupedMessages(ctx, analytics, yearMonth, previousMonth);
  }

  /**
   * Parse month parameter from command text.
   *
   * @see AC-7.1: YYYY-MM format
   * @see AC-7.2: Short month names (Jan, Feb, etc.)
   * @see AC-7.4: 6-month range validation
   */
  private parseMonthParameter(ctx: BotContext): string {
    const now = new Date();
    const currentMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

    const text = ctx.message?.text || '';
    const parts = text.split(/\s+/);

    // No parameter - use current month
    if (parts.length < 2) {
      return currentMonth;
    }

    const param = parts[1].toLowerCase();

    // Try YYYY-MM format
    const fullMatch = param.match(/^(\d{4})-(\d{2})$/);
    if (fullMatch) {
      const yearMonth = param;
      return this.isWithinRange(yearMonth) ? yearMonth : currentMonth;
    }

    // Try short month name (Jan, Feb, etc.)
    const monthNum = SHORT_MONTHS[param.slice(0, 3)];
    if (monthNum) {
      const yearMonth = `${now.getUTCFullYear()}-${String(monthNum).padStart(2, '0')}`;
      return this.isWithinRange(yearMonth) ? yearMonth : currentMonth;
    }

    return currentMonth;
  }

  /**
   * Check if year-month is within the allowed range (not in the future).
   */
  private isWithinRange(yearMonth: string): boolean {
    const now = new Date();
    const [year, month] = yearMonth.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1, 1));
    const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return target <= current;
  }

  /**
   * Check if year-month is not in the future.
   */
  private isNotFuture(yearMonth: string): boolean {
    const now = new Date();
    const [year, month] = yearMonth.split('-').map(Number);
    const target = new Date(Date.UTC(year, month - 1, 1));
    const current = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    return target <= current;
  }

  /**
   * Get the previous month in YYYY-MM format.
   */
  private getPreviousMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    const prevDate = new Date(Date.UTC(year, month - 2, 1));
    return `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get the next month in YYYY-MM format.
   */
  private getNextMonth(yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    const nextDate = new Date(Date.UTC(year, month, 1));
    return `${nextDate.getUTCFullYear()}-${String(nextDate.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Extract month from callback data (e.g., "analytics:prev:2026-01").
   */
  private extractMonthFromCallback(ctx: BotContext): string {
    const data = ctx.callbackQuery?.data || '';
    const parts = data.split(':');
    return parts.length >= 3 ? parts[2] : this.getCurrentMonth();
  }

  /**
   * Get current month in YYYY-MM format.
   */
  private getCurrentMonth(): string {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Check if analytics has any data.
   */
  private hasAnalyticsData(analytics: DbGroupedAnalyticsResult): boolean {
    return (
      analytics.employees.length > 0 ||
      analytics.freelancers.length > 0 ||
      analytics.oneTime.length > 0 ||
      analytics.unknown.length > 0 ||
      analytics.fired.length > 0
    );
  }

  /**
   * Send separate messages for each non-empty classification group.
   *
   * @see AC-1.4: Messages in order: Employees, Freelancers, One-time, Unknown, Fired
   * @see AC-1.5: Skip empty groups
   */
  private async sendGroupedMessages(
    ctx: BotContext,
    analytics: DbGroupedAnalyticsResult,
    yearMonth: string,
    previousMonth: string,
  ): Promise<number> {
    let messageCount = 0;

    const monthName = this.getMonthName(ctx, yearMonth);
    const prevMonthName = this.getMonthName(ctx, previousMonth);

    // Send employees message
    if (analytics.employees.length > 0) {
      await this.sendGroupMessage(
        ctx,
        'analytics-employees-header',
        analytics.employees,
        monthName,
        prevMonthName,
        false,
      );
      messageCount++;
    }

    // Send freelancers message
    if (analytics.freelancers.length > 0) {
      await this.sendGroupMessage(
        ctx,
        'analytics-freelancers-header',
        analytics.freelancers,
        monthName,
        prevMonthName,
        false,
      );
      messageCount++;
    }

    // Send one-time message
    if (analytics.oneTime.length > 0) {
      await this.sendGroupMessage(
        ctx,
        'analytics-onetime-header',
        analytics.oneTime,
        monthName,
        prevMonthName,
        false,
      );
      messageCount++;
    }

    // Send unknown message
    if (analytics.unknown.length > 0) {
      await this.sendGroupMessage(
        ctx,
        'analytics-unknown-header',
        analytics.unknown,
        monthName,
        prevMonthName,
        false,
      );
      messageCount++;
    }

    // Send fired message
    if (analytics.fired.length > 0) {
      await this.sendFiredMessage(ctx, analytics.fired, monthName);
      messageCount++;
    }

    // Send navigation keyboard on last message
    const keyboard = this.buildNavigationKeyboard(ctx, yearMonth);
    await ctx.reply(ctx.t('analytics-changes-from', { previousMonth: prevMonthName }), {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });

    return messageCount;
  }

  /**
   * Send a message for a classification group.
   *
   * @see AC-2.2: Wallet truncation first 4 + last 3
   * @see AC-2.6: Position within classification group
   */
  private async sendGroupMessage(
    ctx: BotContext,
    headerKey: string,
    entries: DbAnalyticsResult[],
    monthName: string,
    prevMonthName: string,
    isLast: boolean,
  ): Promise<void> {
    const lines: string[] = [];

    // Header
    lines.push(ctx.t(headerKey, { count: entries.length.toString() }));
    lines.push(`${monthName}`);
    lines.push('');

    // Table header
    lines.push('<pre>');
    lines.push(' #  | Wallet      | Prev | Change');
    lines.push('----+-------------+------+--------');

    // Table rows
    let totalAmount = BigInt(0);
    for (const entry of entries) {
      const posIndicator = this.getPositionIndicator(ctx, entry.positionChange);
      const prevPos = entry.previousPosition !== null ? entry.previousPosition.toString() : 'NEW';
      const truncatedWallet = truncateWalletForAnalytics(entry.walletAddress);

      lines.push(
        ` ${entry.position.toString().padStart(2)} | ${truncatedWallet.padEnd(11)} | ${prevPos.padStart(4)} | ${posIndicator.padStart(6)}`,
      );

      totalAmount += BigInt(entry.amount);
    }

    lines.push('</pre>');
    lines.push('');

    // Total
    const totalFormatted = formatUsdtDisplay(totalAmount.toString());
    lines.push(ctx.t('analytics-total', { amount: totalFormatted }));

    const message = lines.join('\n');

    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  /**
   * Send a message for fired/terminated wallets.
   */
  private async sendFiredMessage(
    ctx: BotContext,
    fired: FiredEmployeeResult[],
    monthName: string,
  ): Promise<void> {
    const lines: string[] = [];

    // Header
    lines.push(ctx.t('analytics-fired-header', { count: fired.length.toString() }));
    lines.push(`${monthName}`);
    lines.push('');

    // Table
    lines.push('<pre>');
    lines.push(' Wallet      | Last Payment | Amount');
    lines.push('-------------+--------------+--------');

    for (const entry of fired) {
      const truncatedWallet = truncateWalletForAnalytics(entry.walletAddress);
      const amount = formatUsdtDisplay(entry.lastAmount);

      lines.push(
        ` ${truncatedWallet.padEnd(11)} | ${entry.lastPaymentMonth.padStart(12)} | ${amount.padStart(6)}`,
      );
    }

    lines.push('</pre>');

    const message = lines.join('\n');

    await ctx.reply(message, { parse_mode: 'HTML' });
  }

  /**
   * Get position change indicator from i18n.
   */
  private getPositionIndicator(ctx: BotContext, change: 'up' | 'down' | 'same' | 'new'): string {
    switch (change) {
      case 'up':
        return ctx.t('position-up');
      case 'down':
        return ctx.t('position-down');
      case 'same':
        return ctx.t('position-same');
      case 'new':
        return ctx.t('position-new');
    }
  }

  /**
   * Get localized month name from YYYY-MM format.
   */
  private getMonthName(ctx: BotContext, yearMonth: string): string {
    const [year, month] = yearMonth.split('-').map(Number);
    const monthKey = MONTH_KEYS[month - 1];
    return `${ctx.t(monthKey)} ${year}`;
  }

  /**
   * Build navigation keyboard with Previous/Next buttons.
   *
   * @see AC-8.1: Inline keyboard with Previous/Next
   * @see AC-8.3: Disable Previous at 6-month boundary
   * @see AC-8.4: Disable Next at current month
   */
  private buildNavigationKeyboard(ctx: BotContext, currentMonth: string): InlineKeyboard {
    const keyboard = new InlineKeyboard();

    const prevMonth = this.getPreviousMonth(currentMonth);
    const nextMonth = this.getNextMonth(currentMonth);

    const prevMonthName = this.getShortMonthName(ctx, prevMonth);
    const nextMonthName = this.getShortMonthName(ctx, nextMonth);

    // Add Previous button if within range
    if (this.isWithinRange(prevMonth)) {
      keyboard.text(
        ctx.t('btn-prev-month', { month: prevMonthName }),
        `analytics:prev:${currentMonth}`,
      );
    }

    // Add Next button if not in future
    if (this.isNotFuture(nextMonth)) {
      keyboard.text(
        ctx.t('btn-next-month', { month: nextMonthName }),
        `analytics:next:${currentMonth}`,
      );
    }

    return keyboard;
  }

  /**
   * Get short month name for navigation buttons.
   */
  private getShortMonthName(ctx: BotContext, yearMonth: string): string {
    const [, month] = yearMonth.split('-').map(Number);
    const monthKey = MONTH_KEYS[month - 1];
    return ctx.t(monthKey);
  }
}
