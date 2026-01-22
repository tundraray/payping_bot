import { registerAs } from '@nestjs/config';

/**
 * Telegram bot configuration interface.
 * Defines all settings required for grammY bot operation.
 */
export interface TelegramConfig {
  /** Bot token from @BotFather */
  botToken: string;
  /** Default subscription duration in days */
  subscriptionDays: number;
}

/**
 * Telegram configuration factory registered with NestJS ConfigModule.
 * Access via: configService.get<TelegramConfig>('telegram')
 *
 * Environment Variables:
 * - TELEGRAM_BOT_TOKEN: Bot token from @BotFather (required)
 * - SUBSCRIPTION_DAYS: Default subscription duration (default: 365)
 */
export default registerAs(
  'telegram',
  (): TelegramConfig => ({
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    subscriptionDays: parseInt(process.env.SUBSCRIPTION_DAYS || '365', 10),
  }),
);
