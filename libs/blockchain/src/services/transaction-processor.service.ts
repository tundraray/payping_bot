import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TRANSACTION_NEW_EVENT } from '../events/transaction.events';
import type { Transaction, TransactionNewEvent } from '../interfaces/transaction.interface';
import { DeduplicationService } from './deduplication.service';

/**
 * Service for processing blockchain transactions.
 *
 * Responsibilities:
 * - Save ALL transactions (incoming + outgoing) to database for audit/history
 * - Emit 'transaction.new' events ONLY for incoming transactions
 * - Deduplicate transactions using DeduplicationService
 * - Handle event emission failures gracefully (log and continue)
 *
 * @implements AC-3.1 - Save all transactions to database
 * @implements AC-3.2 - Emit events only for incoming transactions
 * @implements AC-3.3 - Outgoing transactions saved but no event emitted
 * @implements AC-5.1, AC-5.2, AC-5.3 - Event emission
 */
@Injectable()
export class TransactionProcessorService {
  private readonly logger = new Logger(TransactionProcessorService.name);

  constructor(
    private readonly deduplicationService: DeduplicationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process a single transaction.
   * Only processes incoming transactions (to_address = walletAddress).
   * Deduplicates and emits events for new transactions.
   *
   * @param transaction - The transaction to process
   * @param walletAddress - The monitored wallet address
   *
   * @implements AC-3.1 - Process only transactions where to_address matches monitored wallet
   * @implements AC-3.2 - Ignore outgoing transactions (from_address = wallet)
   * @implements AC-5.1 - Emit transaction.new event for new transactions
   * @implements AC-5.2 - Event contains all required fields
   * @implements AC-5.3 - Event emission failure logged, processing continues
   */
  async processTransaction(transaction: Transaction, walletAddress: string): Promise<void> {
    // AC-3.1/AC-3.2: Filter incoming transactions only
    if (!this.isIncomingTransaction(transaction, walletAddress)) {
      this.logger.debug(
        `Skipping non-incoming transaction: ${transaction.hash.substring(0, 16)}...`,
      );
      return;
    }

    // Check for duplicates
    const isDuplicate = await this.deduplicationService.isDuplicate(transaction.hash);

    if (isDuplicate) {
      this.logger.debug(`Skipping duplicate transaction: ${transaction.hash.substring(0, 16)}...`);
      return;
    }

    // Emit event for new transaction (AC-5.3: log error and continue on failure)
    this.emitTransactionEvent(transaction);

    // Mark as processed (persist to cache + DB)
    await this.deduplicationService.markProcessed(transaction.hash, transaction);
  }

  /**
   * Process multiple USDT transactions.
   * Saves ALL transactions to database, emits events only for incoming.
   *
   * @param transactions - Array of transactions to process
   * @param walletAddress - The monitored wallet address
   * @returns Count of saved, notified (incoming), and skipped (duplicate) transactions
   *
   * @implements AC-3.1 - Save all transactions to database
   * @implements AC-3.2 - Emit events only for incoming transactions
   * @implements AC-3.3 - Outgoing transactions saved but no event emitted
   */
  async processUSDTTransactions(
    transactions: Transaction[],
    walletAddress: string,
  ): Promise<{ processed: number; skipped: number; notified: number }> {
    let processed = 0;
    let skipped = 0;
    let notified = 0;

    for (const transaction of transactions) {
      const isDuplicate = await this.deduplicationService.isDuplicate(transaction.hash);

      if (isDuplicate) {
        skipped++;
        this.logger.debug(
          `Skipping duplicate transaction: ${transaction.hash.substring(0, 16)}...`,
        );
        continue;
      }

      // AC-3.1: Save ALL transactions (incoming + outgoing) to database
      await this.deduplicationService.markProcessed(transaction.hash, transaction);
      processed++;

      // AC-3.2/AC-3.3: Emit event ONLY for incoming transactions
      const isIncoming = this.isIncomingTransaction(transaction, walletAddress);
      if (isIncoming) {
        this.emitTransactionEvent(transaction);
        notified++;
        this.logger.debug(
          `Saved and notified incoming transaction: ${transaction.hash.substring(0, 16)}...`,
        );
      } else {
        this.logger.debug(
          `Saved outgoing transaction (no notification): ${transaction.hash.substring(0, 16)}...`,
        );
      }
    }

    return { processed, skipped, notified };
  }

  /**
   * Check if transaction is incoming (to_address = wallet).
   * Address comparison is case-insensitive (TRON addresses can vary in case).
   *
   * @param transaction - Transaction to check
   * @param walletAddress - The monitored wallet address
   * @returns true if transaction is incoming to the wallet
   */
  private isIncomingTransaction(transaction: Transaction, walletAddress: string): boolean {
    return transaction.toAddress.toLowerCase() === walletAddress.toLowerCase();
  }

  /**
   * Emit transaction.new event.
   * Catches and logs errors but does not throw (AC-5.3).
   *
   * @param transaction - Transaction to emit event for
   */
  private emitTransactionEvent(transaction: Transaction): void {
    const event: TransactionNewEvent = {
      transaction,
      detectedAt: Date.now(),
    };

    try {
      this.eventEmitter.emit(TRANSACTION_NEW_EVENT, event);
      this.logger.log(
        `Emitted ${TRANSACTION_NEW_EVENT} for transaction: ${transaction.hash.substring(0, 16)}...`,
      );
    } catch (error) {
      // AC-5.3: Log error and continue
      this.logger.error(`Failed to emit ${TRANSACTION_NEW_EVENT}: ${error}`, {
        transactionHash: transaction.hash,
      });
      // Do not re-throw - processing should continue
    }
  }
}
