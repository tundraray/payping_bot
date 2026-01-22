import { SubscriptionsService, UsersService } from '@app/db';
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { TelegramService } from '../telegram.service';
import type { BotContext } from '../types/telegram.types';
import { CALLBACK_ACTIONS } from '../types/telegram.types';

/**
 * SubscribeHandler manages user subscriptions.
 *
 * Handles /subscribe and /unsubscribe commands, creating or canceling
 * subscriptions as requested. Ensures users exist before subscription
 * operations and provides localized feedback messages.
 */
@Injectable()
export class SubscribeHandler implements OnModuleInit {
  private readonly logger = new Logger(SubscribeHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Register commands and callback handlers on module initialization.
   */
  onModuleInit(): void {
    const bot = this.telegramService.getBot();

    bot.command('subscribe', (ctx) => this.handleSubscribe(ctx));
    bot.command('unsubscribe', (ctx) => this.handleUnsubscribe(ctx));

    bot.callbackQuery(CALLBACK_ACTIONS.SUBSCRIBE, (ctx) => this.handleSubscribeCallback(ctx));
    bot.callbackQuery(CALLBACK_ACTIONS.UNSUBSCRIBE, (ctx) => this.handleUnsubscribeCallback(ctx));

    this.logger.log('SubscribeHandler commands registered');
  }

  /**
   * Handle /subscribe command.
   * Creates a new subscription with 365-day expiry if user is not already subscribed.
   */
  async handleSubscribe(ctx: BotContext): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      this.logger.warn('Received /subscribe without user ID');
      return;
    }

    try {
      // Ensure user exists
      let user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        user = await this.usersService.create({
          telegramId,
          username: ctx.from.username,
          firstName: ctx.from.first_name,
          lastName: ctx.from.last_name,
        });
        this.logger.log(`Created new user for subscription: ${telegramId}`);
      }

      // Check for existing active subscription
      const existingSubscription = await this.subscriptionsService.getActive(user.id);
      if (existingSubscription) {
        await ctx.reply(ctx.t('subscribe-already'));
        this.logger.log(`User ${telegramId} already subscribed`);
        return;
      }

      // Create new subscription with 365-day expiry
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365);

      await this.subscriptionsService.create(user.id, expiresAt);

      await ctx.reply(ctx.t('subscribe-success'));
      this.logger.log(`User ${telegramId} subscribed successfully`, {
        userId: user.id,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      this.logger.error('Error handling /subscribe command', {
        telegramId,
        error,
      });
      await ctx.reply(ctx.t('error-generic'));
    }
  }

  /**
   * Handle /unsubscribe command.
   * Cancels active subscription if one exists.
   */
  async handleUnsubscribe(ctx: BotContext): Promise<void> {
    const telegramId = ctx.from?.id;
    if (!telegramId) {
      this.logger.warn('Received /unsubscribe without user ID');
      return;
    }

    try {
      // Find user
      const user = await this.usersService.findByTelegramId(telegramId);
      if (!user) {
        await ctx.reply(ctx.t('unsubscribe-not-subscribed'));
        this.logger.log(`User ${telegramId} not found for unsubscribe`);
        return;
      }

      // Cancel active subscription
      const cancelled = await this.subscriptionsService.cancel(user.id);
      if (!cancelled) {
        await ctx.reply(ctx.t('unsubscribe-not-subscribed'));
        this.logger.log(`User ${telegramId} has no active subscription`);
        return;
      }

      await ctx.reply(ctx.t('unsubscribe-success'));
      this.logger.log(`User ${telegramId} unsubscribed successfully`, {
        userId: user.id,
      });
    } catch (error) {
      this.logger.error('Error handling /unsubscribe command', {
        telegramId,
        error,
      });
      await ctx.reply(ctx.t('error-generic'));
    }
  }

  /**
   * Handle Subscribe button callback.
   * Calls handleSubscribe logic and acknowledges the callback query.
   */
  async handleSubscribeCallback(ctx: BotContext): Promise<void> {
    await this.handleSubscribe(ctx);
    await ctx.answerCallbackQuery();
  }

  /**
   * Handle Unsubscribe button callback.
   * Calls handleUnsubscribe logic and acknowledges the callback query.
   */
  async handleUnsubscribeCallback(ctx: BotContext): Promise<void> {
    await this.handleUnsubscribe(ctx);
    await ctx.answerCallbackQuery();
  }
}
