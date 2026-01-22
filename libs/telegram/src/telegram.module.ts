import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import telegramConfig from './config/telegram.config';
import { TelegramService } from './telegram.service';

/**
 * TelegramModule provides Telegram bot functionality using grammY.
 *
 * Features:
 * - Long polling bot operation
 * - i18n support (English/Russian)
 * - /start command with analytics
 * - /subscribe and /unsubscribe commands
 * - Transaction notifications
 *
 * Configuration:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather (required)
 * - SUBSCRIPTION_DAYS: Default subscription duration (default: 365)
 */
@Module({
  imports: [ConfigModule.forFeature(telegramConfig)],
  providers: [TelegramService],
  exports: [TelegramService],
})
export class TelegramModule {}
