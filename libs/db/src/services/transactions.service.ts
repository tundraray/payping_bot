import type { Transaction, TransactionType } from '@app/blockchain';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { transactions } from '../schema';

/**
 * TransactionsService provides database operations for blockchain transaction persistence.
 *
 * This service supports the blockchain monitoring module by enabling:
 * - Transaction deduplication via hash lookup
 * - Transaction persistence for audit trail
 * - Polling continuity via timestamp tracking
 * - Wallet configuration retrieval
 *
 * All methods follow fail-fast error handling - errors are logged and re-thrown.
 *
 * @see AC-4.1, AC-4.2, AC-5.1, AC-5.2, AC-5.3, AC-6.1, AC-6.2, AC-7.1, AC-7.2
 */
@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Finds a transaction by its unique hash.
   *
   * Used by DeduplicationService to check if a transaction has already been processed.
   * Query uses indexed hash column for optimal performance (< 10ms target).
   *
   * @param hash - 64-character transaction hash
   * @returns Transaction if found, null otherwise
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-4.1: Returns Transaction when hash exists
   * @see AC-4.2: Returns null when hash does not exist
   * @see AC-4.3: Query uses indexed column for < 10ms performance
   */
  async findByHash(hash: string): Promise<Transaction | null> {
    try {
      const result = await this.db
        .select()
        .from(transactions)
        .where(eq(transactions.hash, hash))
        .limit(1);

      if (result.length === 0) {
        return null;
      }

      const row = result[0];
      return {
        hash: row.hash,
        type: row.type as TransactionType,
        fromAddress: row.fromAddress,
        toAddress: row.toAddress,
        amount: row.amount,
        timestamp: row.timestamp,
        blockNumber: row.blockNumber,
        contractAddress: row.contractAddress,
        raw: row.raw,
      };
    } catch (error) {
      this.logger.error('Failed to find transaction by hash', { hash, error });
      throw error;
    }
  }

  /**
   * Saves a transaction to the database.
   *
   * Used by DeduplicationService to persist new transactions after processing.
   * Amount is stored as string to preserve 6-decimal USDT precision.
   *
   * @param transaction - Transaction to persist
   * @throws Error on unique constraint violation (duplicate hash) or database failure
   *
   * @see AC-5.1: Inserts new transaction row
   * @see AC-5.2: Throws on duplicate hash (unique constraint)
   * @see AC-5.3: Preserves amount precision (6 decimals for USDT)
   */
  async save(transaction: Transaction): Promise<void> {
    try {
      await this.db.insert(transactions).values({
        hash: transaction.hash,
        type: transaction.type,
        fromAddress: transaction.fromAddress,
        toAddress: transaction.toAddress,
        amount: transaction.amount,
        timestamp: transaction.timestamp,
        blockNumber: transaction.blockNumber,
        contractAddress: transaction.contractAddress,
        raw: transaction.raw,
      });
    } catch (error) {
      this.logger.error('Failed to save transaction', {
        hash: transaction.hash,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets the timestamp of the most recent transaction.
   *
   * Used by TransactionPollerService to determine the starting point for polling
   * after application restart, ensuring no transactions are missed.
   *
   * @returns Maximum timestamp if transactions exist, null otherwise
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-6.1: Returns MAX(timestamp) when transactions exist
   * @see AC-6.2: Returns null when table is empty
   */
  async getLastTimestamp(): Promise<number | null> {
    try {
      const result = await this.db
        .select({ timestamp: transactions.timestamp })
        .from(transactions)
        .orderBy(desc(transactions.timestamp))
        .limit(1);

      return result.length > 0 ? result[0].timestamp : null;
    } catch (error) {
      this.logger.error('Failed to get last transaction timestamp', { error });
      throw error;
    }
  }

  /**
   * Gets the monitored wallet address from configuration.
   *
   * Used by TransactionPollerService to filter transactions for the monitored wallet.
   * Address is read from MONITORED_WALLET_ADDRESS environment variable.
   *
   * @returns Wallet address if configured, null otherwise
   *
   * @see AC-7.1: Returns configured wallet address
   * @see AC-7.2: Wallet address from environment variable
   */
  getMonitoredWalletAddress(): Promise<string | null> {
    try {
      const address = this.configService.get<string>('MONITORED_WALLET_ADDRESS');
      return Promise.resolve(address || null);
    } catch {
      // Fail-open for configuration: return null if not configured
      return Promise.resolve(null);
    }
  }
}
