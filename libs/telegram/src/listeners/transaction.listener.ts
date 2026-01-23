import type { Transaction, TransactionNewEvent } from '@app/blockchain';
import { TRANSACTION_NEW_EVENT } from '@app/blockchain';
import { SubscriptionsService, TransactionsService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InlineKeyboard } from 'grammy';
import { TelegramService } from '../telegram.service';
import { formatUsdtDisplay, translate } from '../utils';

/**
 * TransactionListener handles blockchain transaction events.
 *
 * Listens for transaction.new events and sends notifications to all
 * active subscribers with transaction details (amount, sender, timestamp).
 *
 * Rate limiting: Respects Telegram's 30 msg/sec limit with 40ms delay.
 * Error handling: Individual delivery failures are logged but don't stop others.
 */
@Injectable()
export class TransactionListener {
  private readonly logger = new Logger(TransactionListener.name);

  /** Subscriber count threshold for enabling rate limiting */
  private readonly RATE_LIMIT_THRESHOLD = 10;
  /** Delay between messages in ms (~25 msg/sec, under Telegram's 30/sec limit) */
  private readonly RATE_LIMIT_DELAY_MS = 40;

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly transactionsService: TransactionsService,
    private readonly telegramService: TelegramService,
  ) {}

  /**
   * Handle new transaction events.
   * Sends notifications to all active subscribers.
   *
   * @param event - Transaction event containing the detected transaction
   */
  @OnEvent(TRANSACTION_NEW_EVENT)
  async onTransactionNew(event: TransactionNewEvent): Promise<void> {
    const startTime = Date.now();
    const { transaction } = event;

    try {
      this.logger.log('Received new transaction event', {
        hash: transaction.hash,
        amount: transaction.amount,
        type: transaction.type,
      });

      // Fetch all active subscribers
      const subscribers = await this.subscriptionsService.getActiveSubscribers();

      if (subscribers.length === 0) {
        this.logger.log('No active subscribers, skipping notifications');
        return;
      }

      this.logger.log(`Sending notifications to ${subscribers.length} subscribers`);

      // Fetch monthly statistics for progress display (based on transaction date, not current date)
      const txDate = new Date(transaction.timestamp);
      const txYear = txDate.getUTCFullYear();
      const txMonth = txDate.getUTCMonth() + 1;

      const [
        monthTotalRaw,
        expectedAmountFormatted,
        monthlyPayoutsRaw,
        avgWalletCount,
        currentWalletCount,
      ] = await Promise.all([
        this.transactionsService.getMonthlySum(txYear, txMonth),
        this.transactionsService.getRollingAverage(3, transaction.timestamp),
        this.transactionsService.getMonthlyOutgoingSum(txYear, txMonth),
        this.transactionsService.getAverageWalletCount(3, transaction.timestamp),
        this.transactionsService.getMonthlyWalletCount(txYear, txMonth),
      ]);

      // Send notifications to all subscribers
      let successCount = 0;
      let failureCount = 0;

      for (const user of subscribers) {
        try {
          // Determine language (fallback to 'en' if not set)
          const lang = user.languageCode || 'en';

          // Format message in subscriber's language
          const message = this.formatNotificationMessage(
            transaction,
            lang,
            monthTotalRaw,
            expectedAmountFormatted,
            {
              monthlyPayoutsRaw,
              avgWalletCount,
              currentWalletCount,
            },
          );

          // Create inline keyboard with Tronscan link button
          const buttonText = translate(lang, 'btn-view-tronscan');
          const tronscanUrl = `https://tronscan.org/#/transaction/${transaction.hash}`;
          const keyboard = new InlineKeyboard().url(buttonText, tronscanUrl);

          const bot = this.telegramService.getBot();
          await bot.api.sendMessage(user.telegramId, message, {
            parse_mode: 'HTML',
            reply_markup: keyboard,
          });

          successCount++;
          this.logger.debug(`Notification sent to user ${user.telegramId}`);
        } catch (error) {
          failureCount++;
          this.logger.warn(`Failed to send notification to user ${user.telegramId}`, {
            languageCode: user.languageCode,
            error,
          });
          // Continue with next subscriber (don't stop on individual failures)
        }

        // Rate limiting: Respect Telegram's 30 msg/sec limit
        if (subscribers.length > this.RATE_LIMIT_THRESHOLD) {
          await this.delay(this.RATE_LIMIT_DELAY_MS);
        }
      }

      // Log timing metrics
      const duration = Date.now() - startTime;

      this.logger.log('Notification batch complete', {
        hash: transaction.hash,
        totalSubscribers: subscribers.length,
        successCount,
        failureCount,
        durationMs: duration,
      });

      // Check if we met the 5-second target (AC-5.1)
      if (duration > 5000) {
        this.logger.warn(`Notification delivery exceeded 5s target: ${duration}ms`);
      }
    } catch (error) {
      this.logger.error('Failed to process transaction event', {
        hash: transaction.hash,
        error,
      });
      // Don't re-throw - event processing should not fail the entire application
    }
  }

  /**
   * Format transaction notification message with localized text.
   *
   * Uses the translate() utility to format messages in the subscriber's language.
   * Falls back to English if the language code is not supported.
   *
   * @param transaction - Transaction data to format
   * @param languageCode - Subscriber's language preference (e.g., 'en', 'ru', 'uk')
   * @param monthTotalRaw - Raw monthly total amount
   * @param expectedAmountFormatted - Pre-formatted expected amount (3-month average)
   * @param payoutStats - Payout statistics (approximate values)
   * @returns Localized notification message
   */
  private formatNotificationMessage(
    transaction: Transaction,
    languageCode: string,
    monthTotalRaw: string,
    expectedAmountFormatted: string,
    payoutStats: {
      monthlyPayoutsRaw: string;
      avgWalletCount: number;
      currentWalletCount: number;
    },
  ): string {
    const amount = formatUsdtDisplay(transaction.amount);
    const monthTotal = formatUsdtDisplay(monthTotalRaw);
    const time = new Date(transaction.timestamp).toLocaleString(languageCode, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
    const payoutsAmount = formatUsdtDisplay(payoutStats.monthlyPayoutsRaw);

    return translate(languageCode, 'notification', {
      amount,
      monthTotal,
      expectedAmount: expectedAmountFormatted,
      time,
      avgWallets: payoutStats.avgWalletCount.toString(),
      currentWallets: payoutStats.currentWalletCount.toString(),
      payoutsAmount,
    });
  }

  /**
   * Delay helper for rate limiting.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
