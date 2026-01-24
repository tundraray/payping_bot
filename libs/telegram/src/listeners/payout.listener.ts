import {
  PAYOUT_END_EVENT,
  PAYOUT_START_EVENT,
  PAYOUT_TRANSACTION_EVENT,
  type PayoutEndEvent,
  type PayoutStartEvent,
  type PayoutTransactionEvent,
} from '@app/blockchain';
import { SubscriptionsService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InlineKeyboard } from 'grammy';
import { TelegramService } from '../telegram.service';
import { formatUsdtDisplay, translate, truncateAddress } from '../utils';

/**
 * PayoutListener handles payout session events.
 *
 * Listens for payout.start, payout.transaction, and payout.end events
 * and sends notifications to all active subscribers.
 *
 * Rate limiting: Respects Telegram's 30 msg/sec limit with 40ms delay.
 * Error handling: Individual delivery failures are logged but don't stop others.
 */
@Injectable()
export class PayoutListener {
  private readonly logger = new Logger(PayoutListener.name);

  /** Subscriber count threshold for enabling rate limiting */
  private readonly RATE_LIMIT_THRESHOLD = 10;
  /** Delay between messages in ms (~25 msg/sec, under Telegram's 30/sec limit) */
  private readonly RATE_LIMIT_DELAY_MS = 40;

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Handle payout session start event.
   * Sends notification to all active subscribers.
   *
   * @param event - Payout start event payload
   */
  @OnEvent(PAYOUT_START_EVENT)
  async onPayoutStart(event: PayoutStartEvent): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log('Received payout start event', {
        firstTransactionHash: event.firstTransactionHash,
        startBalance: event.startBalance,
      });

      const subscribers = await this.subscriptionsService.getActiveSubscribers();

      if (subscribers.length === 0) {
        this.logger.log('No active subscribers, skipping payout start notification');
        return;
      }

      this.logger.log(`Sending payout start notifications to ${subscribers.length} subscribers`);

      let successCount = 0;
      let failureCount = 0;

      for (const user of subscribers) {
        try {
          const lang = user.languageCode || 'en';
          const message = this.formatPayoutStartMessage(event, lang);

          const bot = this.telegramService.getBot();
          await bot.api.sendMessage(user.telegramId, message, {
            parse_mode: 'HTML',
          });

          successCount++;
          this.logger.debug(`Payout start notification sent to user ${user.telegramId}`);
        } catch (error) {
          failureCount++;
          this.logger.warn(`Failed to send payout start notification to user ${user.telegramId}`, {
            languageCode: user.languageCode,
            error,
          });
        }

        if (subscribers.length > this.RATE_LIMIT_THRESHOLD) {
          await this.delay(this.RATE_LIMIT_DELAY_MS);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log('Payout start notification batch complete', {
        totalSubscribers: subscribers.length,
        successCount,
        failureCount,
        durationMs: duration,
      });
    } catch (error) {
      this.logger.error('Failed to process payout start event', { error });
    }
  }

  /**
   * Handle individual payout transaction event.
   * Sends notification to all active subscribers.
   *
   * @param event - Payout transaction event payload
   */
  @OnEvent(PAYOUT_TRANSACTION_EVENT)
  async onPayoutTransaction(event: PayoutTransactionEvent): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log('Received payout transaction event', {
        transactionHash: event.transactionHash,
        amount: event.amount,
        transactionNumber: event.transactionNumber,
      });

      const subscribers = await this.subscriptionsService.getActiveSubscribers();

      if (subscribers.length === 0) {
        this.logger.log('No active subscribers, skipping payout transaction notification');
        return;
      }

      this.logger.log(
        `Sending payout transaction notifications to ${subscribers.length} subscribers`,
      );

      let successCount = 0;
      let failureCount = 0;

      for (const user of subscribers) {
        try {
          const lang = user.languageCode || 'en';
          const message = this.formatPayoutTransactionMessage(event, lang);

          // Create inline keyboard with Tronscan link button
          const buttonText = translate(lang, 'btn-view-tronscan');
          const tronscanUrl = `https://tronscan.org/#/transaction/${event.transactionHash}`;
          const keyboard = new InlineKeyboard().url(buttonText, tronscanUrl);

          const bot = this.telegramService.getBot();
          await bot.api.sendMessage(user.telegramId, message, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });

          successCount++;
          this.logger.debug(`Payout transaction notification sent to user ${user.telegramId}`);
        } catch (error) {
          failureCount++;
          this.logger.warn(
            `Failed to send payout transaction notification to user ${user.telegramId}`,
            {
              languageCode: user.languageCode,
              error,
            },
          );
        }

        if (subscribers.length > this.RATE_LIMIT_THRESHOLD) {
          await this.delay(this.RATE_LIMIT_DELAY_MS);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log('Payout transaction notification batch complete', {
        transactionHash: event.transactionHash,
        totalSubscribers: subscribers.length,
        successCount,
        failureCount,
        durationMs: duration,
      });
    } catch (error) {
      this.logger.error('Failed to process payout transaction event', {
        transactionHash: event.transactionHash,
        error,
      });
    }
  }

  /**
   * Handle payout session end event.
   * Sends summary notification to all active subscribers.
   *
   * @param event - Payout end event payload
   */
  @OnEvent(PAYOUT_END_EVENT)
  async onPayoutEnd(event: PayoutEndEvent): Promise<void> {
    const startTime = Date.now();

    try {
      this.logger.log('Received payout end event', {
        transactionCount: event.transactionCount,
        totalAmount: event.totalAmount,
        endReason: event.endReason,
      });

      const subscribers = await this.subscriptionsService.getActiveSubscribers();

      if (subscribers.length === 0) {
        this.logger.log('No active subscribers, skipping payout end notification');
        return;
      }

      this.logger.log(`Sending payout end notifications to ${subscribers.length} subscribers`);

      let successCount = 0;
      let failureCount = 0;

      for (const user of subscribers) {
        try {
          const lang = user.languageCode || 'en';
          const message = this.formatPayoutEndMessage(event, lang);

          const bot = this.telegramService.getBot();
          await bot.api.sendMessage(user.telegramId, message, {
            parse_mode: 'HTML',
          });

          successCount++;
          this.logger.debug(`Payout end notification sent to user ${user.telegramId}`);
        } catch (error) {
          failureCount++;
          this.logger.warn(`Failed to send payout end notification to user ${user.telegramId}`, {
            languageCode: user.languageCode,
            error,
          });
        }

        if (subscribers.length > this.RATE_LIMIT_THRESHOLD) {
          await this.delay(this.RATE_LIMIT_DELAY_MS);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log('Payout end notification batch complete', {
        totalSubscribers: subscribers.length,
        successCount,
        failureCount,
        durationMs: duration,
      });
    } catch (error) {
      this.logger.error('Failed to process payout end event', { error });
    }
  }

  /**
   * Format payout session start message.
   *
   * @param event - Payout start event payload
   * @param languageCode - Subscriber's language preference
   * @returns Localized message string
   */
  private formatPayoutStartMessage(event: PayoutStartEvent, languageCode: string): string {
    const time = new Date(event.startedAt).toLocaleString(languageCode, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return translate(languageCode, 'payout-started', { time });
  }

  /**
   * Format payout transaction message.
   *
   * @param event - Payout transaction event payload
   * @param languageCode - Subscriber's language preference
   * @returns Localized message string
   */
  private formatPayoutTransactionMessage(
    event: PayoutTransactionEvent,
    languageCode: string,
  ): string {
    const amount = formatUsdtDisplay(event.amount);
    const sessionTotal = formatUsdtDisplay(event.sessionTotalAmount);
    const recipient = truncateAddress(event.recipientAddress);

    return translate(languageCode, 'payout-transaction', {
      txNumber: event.transactionNumber.toString(),
      amount,
      recipient,
      sessionTotal,
    });
  }

  /**
   * Format payout session end message.
   *
   * @param event - Payout end event payload
   * @param languageCode - Subscriber's language preference
   * @returns Localized message string
   */
  private formatPayoutEndMessage(event: PayoutEndEvent, languageCode: string): string {
    const totalAmount = formatUsdtDisplay(event.totalAmount);
    const endBalance = formatUsdtDisplay(event.endingBalance);
    const time = new Date(event.endedAt).toLocaleString(languageCode, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return translate(languageCode, 'payout-completed', {
      txCount: event.transactionCount.toString(),
      totalAmount,
      duration: event.durationMinutes.toString(),
      endBalance,
      time,
    });
  }

  /**
   * Delay helper for rate limiting.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
