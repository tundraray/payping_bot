import * as path from 'node:path';
import { I18n } from '@grammyjs/i18n';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bot } from 'grammy';
import type { TelegramConfig } from './config/telegram.config';
import type { BotContext } from './types/telegram.types';

@Injectable()
export class TelegramService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramService.name);
  private readonly bot: Bot<BotContext>;
  private readonly i18n: I18n<BotContext>;

  constructor(private readonly configService: ConfigService) {
    const config = this.configService.get<TelegramConfig>('telegram');
    if (!config?.botToken) {
      throw new Error('TELEGRAM_BOT_TOKEN is required');
    }

    this.bot = new Bot<BotContext>(config.botToken);

    // Locales are copied to dist/locales by webpack
    const localesDir = path.join(process.cwd(), 'dist', 'locales');

    this.i18n = new I18n<BotContext>({
      defaultLocale: 'en',
      directory: localesDir,
      useSession: false,
      globalTranslationContext: () => ({
        // Global context for translations if needed
      }),
    });

    this.bot.use(this.i18n);
  }

  /**
   * Get the bot instance for registering handlers.
   */
  getBot(): Bot<BotContext> {
    return this.bot;
  }

  /**
   * Get the i18n instance for manual translation access.
   */
  getI18n(): I18n<BotContext> {
    return this.i18n;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Starting Telegram bot...');
    try {
      // Start bot with long polling (non-blocking)
      this.bot.start({
        onStart: (botInfo) => {
          this.logger.log(`Bot @${botInfo.username} started successfully`);
        },
      });
    } catch (error) {
      this.logger.error('Failed to start Telegram bot', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log('Stopping Telegram bot...');
    try {
      await this.bot.stop();
      this.logger.log('Telegram bot stopped');
    } catch (error) {
      this.logger.error('Error stopping Telegram bot', error);
    }
  }
}
