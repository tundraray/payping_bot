import { SubscriptionsService, UsersService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { InlineKeyboard } from 'grammy';
import type { AnalyticsData, BotContext } from '../types/telegram.types';
import { CALLBACK_ACTIONS } from '../types/telegram.types';

@Injectable()
export class StartHandler {
  private readonly logger = new Logger(StartHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Handle /start command.
   * Shows welcome message, subscription status, and inline buttons.
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
          languageCode: ctx.from.language_code,
        });
        this.logger.log(`Created new user: ${telegramId}`);
      }

      // Check subscription status
      const subscription = await this.subscriptionsService.getActive(user.id);
      const isSubscribed = !!subscription;

      // Build message
      const message = this.buildMessage(ctx, isSubscribed);
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
  private buildMessage(ctx: BotContext, isSubscribed: boolean, analytics?: AnalyticsData): string {
    const lines: string[] = [];

    // Welcome
    lines.push(ctx.t('welcome'));
    lines.push('');

    // Analytics (will be added in Phase 5)
    if (analytics) {
      lines.push(`<b>${ctx.t('analytics-title')}</b>`);
      lines.push(ctx.t('analytics-current', { amount: analytics.currentMonthSum }));
      if (analytics.monthsUsed > 0) {
        lines.push(ctx.t('analytics-expected', { amount: analytics.expectedAmount }));
        lines.push(ctx.t('analytics-based-on', { months: analytics.monthsUsed.toString() }));
      } else {
        lines.push(ctx.t('analytics-expected-na'));
      }
      lines.push('');
    }

    // Subscription status
    lines.push(isSubscribed ? ctx.t('status-subscribed') : ctx.t('status-not-subscribed'));

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
}
