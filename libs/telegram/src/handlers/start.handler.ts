import { SubscriptionsService, TransactionsService, UsersService } from '@app/db';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import { TelegramService } from '../telegram.service';
import type { AnalyticsData, BotContext, PayoutStats } from '../types/telegram.types';
import { CALLBACK_ACTIONS } from '../types/telegram.types';
import { formatUsdtDisplay } from '../utils';

@Injectable()
export class StartHandler implements OnModuleInit {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly transactionsService: TransactionsService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Register /start command on module initialization.
   */
  onModuleInit(): void {
    const bot = this.telegramService.getBot();
    bot.command('start', (ctx) => this.handleStart(ctx));
    this.logger.log('StartHandler commands registered');
  }

  /**
   * Handle /start command.
   * Shows welcome message, subscription status, and inline buttons.
   * Sets up bot menu commands based on subscription status.
   */
  async handleStart(ctx: BotContext): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      this.logger.warn('Received /start without user ID');
      return;
    }

    try {
      // Ensure user exists in database
      let user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        user = await this.usersService.create({
          telegramId,
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
        });
        this.logger.log(`Created new user: ${telegramId}`);
      }

      // Save user's language preference (fallback to 'en' if not provided)
      const languageCode = ctx.from?.language_code || 'en';
      await this.usersService.updateLanguage(telegramId, languageCode);

      // Check subscription status
      const subscription = await this.subscriptionsService.getActive(user.id);
      const isSubscribed = !!subscription;

      // Set up bot menu commands based on subscription status
      await this.setUserMenuCommands(ctx, isSubscribed);

      // Fetch analytics data
      const now = new Date();
      const currentYear = now.getUTCFullYear();
      const currentMonth = now.getUTCMonth() + 1; // JavaScript months are 0-indexed, need 1-12

      const [currentMonthSum, rollingAverage, monthlyPayouts, avgWalletCount, currentWalletCount] =
        await Promise.all([
          this.transactionsService.getMonthlySum(currentYear, currentMonth),
          this.transactionsService.getRollingAverage(3),
          this.transactionsService.getMonthlyOutgoingSum(currentYear, currentMonth),
          this.transactionsService.getAverageWalletCount(3),
          this.transactionsService.getMonthlyWalletCount(currentYear, currentMonth),
        ]);

      // Determine months used: if rolling average > 0, we have historical data
      const monthsUsed = Number.parseFloat(rollingAverage) > 0 ? 3 : 0;

      const analytics: AnalyticsData = {
        currentMonthSum,
        expectedAmount: rollingAverage,
        monthsUsed,
      };

      const payoutStats: PayoutStats = {
        avgWalletCount,
        monthlyPayouts,
        currentWalletCount,
      };

      // Build message with analytics
      const message = this.buildMessage(ctx, isSubscribed, analytics, payoutStats);
      const keyboard = this.buildKeyboard(ctx, isSubscribed);

      await ctx.reply(message, {
        reply_markup: keyboard,
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error('Error handling /start command', error);
      await ctx.reply(ctx.t('error-generic'));
    }
  }

  /**
   * Build the welcome message with optional analytics.
   */
  private buildMessage(
    ctx: BotContext,
    isSubscribed: boolean,
    analytics?: AnalyticsData,
    payoutStats?: PayoutStats,
  ): string {
    const lines: string[] = [];

    // Welcome
    lines.push(ctx.t('welcome'));
    lines.push('');

    // Analytics section (consolidated locale keys)
    if (analytics) {
      // Format current amount (raw -> display with separators)
      const currentAmount = formatUsdtDisplay(analytics.currentMonthSum);

      if (analytics.monthsUsed > 0) {
        // Has historical data - show expected amount
        const expectedAmount = analytics.expectedAmount; // Already formatted by getRollingAverage()
        lines.push(
          ctx.t('analytics-with-history', {
            currentAmount,
            expectedAmount,
            months: analytics.monthsUsed.toString(),
          }),
        );
      } else {
        // No historical data
        lines.push(ctx.t('analytics-no-history', { currentAmount }));
      }
    }

    // Payout statistics section (approximate values)
    if (payoutStats && payoutStats.avgWalletCount > 0) {
      const payoutsAmount = formatUsdtDisplay(payoutStats.monthlyPayouts);
      lines.push('');
      lines.push(
        ctx.t('payout-stats', {
          avgWallets: payoutStats.avgWalletCount.toString(),
          currentWallets: payoutStats.currentWalletCount.toString(),
          payoutsAmount,
        }),
      );
    }

    lines.push('');

    // Subscription status
    if (isSubscribed) {
      lines.push(ctx.t('status-subscribed'));
    } else {
      lines.push(ctx.t('status-not-subscribed'));
      lines.push(ctx.t('subscribe-for-analytics'));
    }

    return lines.join('\n');
  }

  /**
   * Build inline keyboard with subscribe/unsubscribe button.
   */
  private buildKeyboard(ctx: BotContext, isSubscribed: boolean): InlineKeyboard {
    const keyboard = new InlineKeyboard();

    if (isSubscribed) {
      keyboard.text(ctx.t('btn-unsubscribe'), CALLBACK_ACTIONS.UNSUBSCRIBE);
    } else {
      keyboard.text(ctx.t('btn-subscribe'), CALLBACK_ACTIONS.SUBSCRIBE);
    }

    return keyboard;
  }

  /**
   * Set bot menu commands for the user based on subscription status.
   * /start is always available, /analytics only for subscribers.
   */
  private async setUserMenuCommands(ctx: BotContext, isSubscribed: boolean): Promise<void> {
    try {
      const commands = [{ command: 'start', description: ctx.t('menu-start') }];

      // Add /analytics command only for subscribers
      if (isSubscribed) {
        commands.push({ command: 'analytics', description: ctx.t('menu-analytics') });
      }

      // Set commands for this specific user's chat
      await ctx.api.setMyCommands(commands, {
        scope: { type: 'chat', chat_id: ctx.chat?.id ?? ctx.from?.id ?? 0 },
      });

      this.logger.debug('Menu commands set for user', {
        telegramId: ctx.from?.id,
        isSubscribed,
        commandCount: commands.length,
      });
    } catch (error) {
      // Non-critical error - log and continue
      this.logger.warn('Failed to set menu commands', { error });
    }
  }
}
