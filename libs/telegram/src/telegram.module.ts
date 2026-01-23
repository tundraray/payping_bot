import { DbModule } from '@app/db';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import telegramConfig from './config/telegram.config';
import { AnalyticsHandler } from './handlers/analytics.handler';
import { StartHandler } from './handlers/start.handler';
import { SubscribeHandler } from './handlers/subscribe.handler';
import { TransactionListener } from './listeners/transaction.listener';
import { TelegramService } from './telegram.service';

/**
 * TelegramModule provides Telegram bot functionality using grammY.
 *
 * Features:
 * - Long polling bot operation
 * - i18n support (English/Russian/Ukrainian)
 * - /start command with analytics
 * - /subscribe and /unsubscribe commands
 * - /analytics and /rating commands for payout analytics
 * - Transaction notifications via event listener
 *
 * Configuration:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather (required)
 * - SUBSCRIPTION_DAYS: Default subscription duration (default: 365)
 *
 * Providers:
 * - TelegramService: Bot lifecycle management and i18n
 * - StartHandler: /start command with analytics
 * - SubscribeHandler: /subscribe and /unsubscribe commands
 * - AnalyticsHandler: /analytics and /rating commands
 * - TransactionListener: Event listener for transaction notifications
 */
@Module({
  imports: [ConfigModule.forFeature(telegramConfig), DbModule],
  providers: [
    TelegramService,
    StartHandler,
    SubscribeHandler,
    AnalyticsHandler,
    TransactionListener,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
