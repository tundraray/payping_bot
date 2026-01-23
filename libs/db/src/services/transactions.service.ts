import type { Transaction, TransactionType } from '@app/blockchain';
import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, lt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { transactions } from '../schema';
import { formatUsdt } from '../utils/usdt.utils';
import { AnalyticsService } from './analytics.service';

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
    @Inject(forwardRef(() => AnalyticsService))
    private readonly analyticsService: AnalyticsService,
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
   * For outgoing transactions (fromAddress = monitored wallet), triggers
   * analytics processing to update recipient classification and position.
   *
   * @param transaction - Transaction to persist
   * @throws Error on unique constraint violation (duplicate hash) or database failure
   *
   * @see AC-5.1: Inserts new transaction row
   * @see AC-5.2: Throws on duplicate hash (unique constraint)
   * @see AC-5.3: Preserves amount precision (6 decimals for USDT)
   * @see AC-5.4: Triggers analytics processing for outgoing transactions
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

      // Process analytics for outgoing transactions (payouts from monitored wallet)
      // Use case-insensitive comparison because TRON addresses can vary in case
      const monitoredWallet = await this.getMonitoredWalletAddress();
      if (
        monitoredWallet &&
        transaction.fromAddress.toLowerCase() === monitoredWallet.toLowerCase()
      ) {
        try {
          await this.analyticsService.processTransaction(transaction);
          this.logger.debug('Analytics processed for outgoing transaction', {
            hash: transaction.hash,
            toAddress: transaction.toAddress,
          });
        } catch (analyticsError) {
          // Log but don't fail the transaction save - analytics is secondary
          this.logger.warn('Failed to process analytics for transaction', {
            hash: transaction.hash,
            error: analyticsError,
          });
        }
      }
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

  /**
   * Calculates the rolling average of monthly income over the previous N months.
   *
   * Excludes the reference month to provide a stable "expected" value that doesn't
   * change as new transactions arrive. Includes all N previous months in the
   * calculation, even if some months have zero transactions.
   *
   * @param months - Number of previous months to include in rolling average (e.g., 3)
   * @param referenceDate - Reference date for calculation (defaults to current date).
   *                        For transaction notifications, pass the transaction timestamp
   *                        to calculate the average relative to when the transaction occurred.
   * @returns Average monthly USDT amount as string with 2 decimal precision, "0.00" if no data or months=0
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-1.2: Displays expected income from 3-month average
   * @see AC-1.3: Uses available months if < 3 months data (includes zeros)
   * @see AC-1.4: Returns "0.00" when no data exists
   */
  async getRollingAverage(months: number, referenceDate?: Date | number): Promise<string> {
    try {
      // Edge case: 0 months requested returns "0.00"
      if (months <= 0) {
        return '0.00';
      }

      // Use reference date if provided, otherwise current date
      const refDate =
        referenceDate instanceof Date
          ? referenceDate
          : referenceDate !== undefined
            ? new Date(referenceDate)
            : new Date();
      let totalSumRaw = 0; // Sum raw amounts (smallest unit)

      // Loop through the previous N months (excluding reference month)
      for (let i = 1; i <= months; i++) {
        // Calculate year and month for each iteration
        // Using Date constructor handles month underflow correctly (e.g., month -1 becomes December of prev year)
        const targetDate = new Date(
          Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - i, 1),
        );
        const year = targetDate.getUTCFullYear();
        const month = targetDate.getUTCMonth() + 1; // Convert to 1-indexed

        const monthSum = await this.getMonthlySum(year, month);
        totalSumRaw += Number.parseFloat(monthSum); // Parse raw amount
      }

      // Calculate average on raw values (divide by number of months requested)
      // All months contribute to average, including zeros
      const averageRaw = totalSumRaw / months;

      // Format at the end: convert from raw to human-readable USDT format
      return formatUsdt(averageRaw);
    } catch (error) {
      this.logger.error('Failed to get rolling average', { months, error });
      throw error;
    }
  }

  /**
   * Calculates the sum of incoming USDT transactions for a specific month.
   *
   * Only counts transactions where toAddress matches the monitored wallet
   * (incoming transactions only). Amount precision is preserved at 6 decimals.
   *
   * @param year - Calendar year (e.g., 2026)
   * @param month - Calendar month (1-12)
   * @returns Total USDT amount as string with 6 decimal precision, "0" if no transactions
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-1.1: Supports current month income display
   * @see AC-1.4: Returns "0" when no data exists
   */
  async getMonthlySum(year: number, month: number): Promise<string> {
    try {
      // Get monitored wallet address from configuration
      const walletAddress = await this.getMonitoredWalletAddress();

      // If no wallet configured, return "0" (no transactions can match)
      if (!walletAddress) {
        return '0';
      }

      // Calculate start and end timestamps for the month (UTC)
      // Month is 1-indexed (1 = January), JavaScript Date uses 0-indexed months
      const startTimestamp = Date.UTC(year, month - 1, 1);
      const endTimestamp = Date.UTC(year, month, 1);

      // Query transactions where:
      // - toAddress = monitored wallet (incoming only)
      // - timestamp >= start of month
      // - timestamp < start of next month
      const result = await this.db
        .select({ amount: transactions.amount })
        .from(transactions)
        .where(
          and(
            eq(transactions.toAddress, walletAddress),
            gte(transactions.timestamp, startTimestamp),
            lt(transactions.timestamp, endTimestamp),
          ),
        );

      // Return "0" if no transactions found
      if (result.length === 0) {
        return '0';
      }

      // Sum the amounts (stored in smallest unit, e.g., 1000000 = 1 USDT)
      let sumInSmallestUnit = 0;
      for (const row of result) {
        sumInSmallestUnit += Number.parseFloat(row.amount);
      }

      // Return raw amount (presentation layer formats for display)
      return sumInSmallestUnit.toString();
    } catch (error) {
      this.logger.error('Failed to get monthly sum', { year, month, error });
      throw error;
    }
  }

  /**
   * Calculates the sum of outgoing USDT transactions for a specific month.
   *
   * Only counts transactions where fromAddress matches the monitored wallet
   * (outgoing/payout transactions).
   *
   * @param year - Calendar year (e.g., 2026)
   * @param month - Calendar month (1-12)
   * @returns Total USDT amount as string, "0" if no transactions
   * @throws Error on database failure (fail-fast)
   */
  async getMonthlyOutgoingSum(year: number, month: number): Promise<string> {
    try {
      const walletAddress = await this.getMonitoredWalletAddress();

      if (!walletAddress) {
        return '0';
      }

      const startTimestamp = Date.UTC(year, month - 1, 1);
      const endTimestamp = Date.UTC(year, month, 1);

      const result = await this.db
        .select({ amount: transactions.amount })
        .from(transactions)
        .where(
          and(
            eq(transactions.fromAddress, walletAddress),
            gte(transactions.timestamp, startTimestamp),
            lt(transactions.timestamp, endTimestamp),
          ),
        );

      if (result.length === 0) {
        return '0';
      }

      let sumInSmallestUnit = 0;
      for (const row of result) {
        sumInSmallestUnit += Number.parseFloat(row.amount);
      }

      return sumInSmallestUnit.toString();
    } catch (error) {
      this.logger.error('Failed to get monthly outgoing sum', { year, month, error });
      throw error;
    }
  }

  /**
   * Calculates the average number of unique recipient wallets per month
   * over the previous N months (excluding current month).
   *
   * @param months - Number of previous months to average
   * @param referenceDate - Reference date for calculation (defaults to current date)
   * @returns Average number of wallets as integer
   * @throws Error on database failure (fail-fast)
   */
  async getAverageWalletCount(months: number, referenceDate?: Date | number): Promise<number> {
    try {
      if (months <= 0) {
        return 0;
      }

      const walletAddress = await this.getMonitoredWalletAddress();
      if (!walletAddress) {
        return 0;
      }

      const refDate =
        referenceDate instanceof Date
          ? referenceDate
          : referenceDate !== undefined
            ? new Date(referenceDate)
            : new Date();

      let totalWallets = 0;

      for (let i = 1; i <= months; i++) {
        const targetDate = new Date(
          Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() - i, 1),
        );
        const year = targetDate.getUTCFullYear();
        const month = targetDate.getUTCMonth() + 1;

        const startTimestamp = Date.UTC(year, month - 1, 1);
        const endTimestamp = Date.UTC(year, month, 1);

        // Count unique recipient addresses
        const result = await this.db
          .selectDistinct({ toAddress: transactions.toAddress })
          .from(transactions)
          .where(
            and(
              eq(transactions.fromAddress, walletAddress),
              gte(transactions.timestamp, startTimestamp),
              lt(transactions.timestamp, endTimestamp),
            ),
          );

        totalWallets += result.length;
      }

      return Math.round(totalWallets / months);
    } catch (error) {
      this.logger.error('Failed to get average wallet count', { months, error });
      throw error;
    }
  }

  /**
   * Gets the count of unique recipient wallets for a specific month.
   *
   * @param year - Calendar year
   * @param month - Calendar month (1-12)
   * @returns Number of unique wallets
   */
  async getMonthlyWalletCount(year: number, month: number): Promise<number> {
    try {
      const walletAddress = await this.getMonitoredWalletAddress();
      if (!walletAddress) {
        return 0;
      }

      const startTimestamp = Date.UTC(year, month - 1, 1);
      const endTimestamp = Date.UTC(year, month, 1);

      const result = await this.db
        .selectDistinct({ toAddress: transactions.toAddress })
        .from(transactions)
        .where(
          and(
            eq(transactions.fromAddress, walletAddress),
            gte(transactions.timestamp, startTimestamp),
            lt(transactions.timestamp, endTimestamp),
          ),
        );

      return result.length;
    } catch (error) {
      this.logger.error('Failed to get monthly wallet count', { year, month, error });
      throw error;
    }
  }
}
