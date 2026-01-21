import { DbService } from '@app/db';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TronGridClient } from '../clients/trongrid.client';
import type { BlockchainConfig } from '../config/blockchain.config';
import type { Transaction } from '../interfaces/transaction.interface';
import { TransactionProcessorService } from './transaction-processor.service';

/**
 * Poller state machine states.
 */
export enum PollerState {
  /** Initial state, not started */
  IDLE = 'IDLE',
  /** Actively polling for transactions */
  POLLING = 'POLLING',
  /** Paused due to missing configuration or error */
  PAUSED = 'PAUSED',
  /** Graceful shutdown in progress, completing current poll */
  SHUTTING_DOWN = 'SHUTTING_DOWN',
  /** Fully stopped */
  STOPPED = 'STOPPED',
}

/**
 * Service for orchestrating blockchain transaction polling.
 *
 * Responsibilities:
 * - Polls TronGrid API at configurable intervals (default 5s)
 * - Retrieves initial timestamp from database or uses fallback
 * - Skips polls when previous is still in progress
 * - Implements graceful shutdown (completes current poll)
 *
 * @implements AC-1.1 - Poll every 5 seconds (configurable via POLLING_INTERVAL_MS)
 * @implements AC-1.2 - Skip poll if previous poll still in progress
 * @implements AC-8.1, AC-8.2, AC-8.3 - Graceful shutdown
 * @implements AC-10.1, AC-10.2, AC-10.3, AC-10.5 - Initial timestamp handling
 */
@Injectable()
export class TransactionPollerService implements OnModuleDestroy {
  private readonly logger = new Logger(TransactionPollerService.name);
  private readonly config: BlockchainConfig;

  private state: PollerState = PollerState.IDLE;
  private pollInterval: ReturnType<typeof setInterval> | null = null;
  private isPollingInProgress = false;
  private lastPollTimestamp: number | null = null;
  private walletAddress: string | null = null;
  private currentPollPromise: Promise<void> | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly tronGridClient: TronGridClient,
    private readonly processorService: TransactionProcessorService,
    private readonly dbService: DbService,
  ) {
    const config = this.configService.get<BlockchainConfig>('blockchain');
    if (!config) {
      throw new Error('Blockchain configuration not found');
    }
    this.config = config;
  }

  /**
   * NestJS lifecycle hook - called when module is destroyed.
   * Ensures graceful shutdown of the poller.
   */
  async onModuleDestroy(): Promise<void> {
    await this.stopPolling();
  }

  /**
   * Start the polling loop.
   * Loads wallet address and initial timestamp from database.
   */
  async startPolling(): Promise<void> {
    if (this.state !== PollerState.IDLE && this.state !== PollerState.STOPPED) {
      this.logger.warn(`Cannot start polling from state: ${this.state}`);
      return;
    }

    // Load wallet address from database
    this.walletAddress = await this.dbService.getMonitoredWalletAddress();

    if (!this.walletAddress) {
      this.logger.error('No wallet address configured, pausing polling');
      this.state = PollerState.PAUSED;
      return;
    }

    // Get initial timestamp from database (AC-10.1, AC-10.3)
    this.lastPollTimestamp = await this.getInitialTimestamp();

    this.state = PollerState.POLLING;
    this.logger.log(
      `Starting polling with interval ${this.config.polling.intervalMs}ms, initial timestamp: ${new Date(this.lastPollTimestamp).toISOString()}`,
    );

    // Start interval (AC-1.1)
    this.pollInterval = setInterval(() => {
      this.executePoll();
    }, this.config.polling.intervalMs);

    // Execute first poll immediately
    this.executePoll();
  }

  /**
   * Stop the polling loop gracefully.
   * Waits for current poll to complete before stopping (AC-8.1, AC-8.3).
   */
  async stopPolling(): Promise<void> {
    if (this.state === PollerState.STOPPED || this.state === PollerState.IDLE) {
      return;
    }

    this.state = PollerState.SHUTTING_DOWN;
    this.logger.log('Shutting down poller...');

    // Clear interval to prevent new polls (AC-8.3)
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    // Wait for current poll to complete (AC-8.1)
    if (this.currentPollPromise) {
      this.logger.log('Waiting for current poll to complete...');
      await this.currentPollPromise;
    }

    this.state = PollerState.STOPPED;
    this.logger.log('Poller stopped');
  }

  /**
   * Get current poller state.
   */
  getState(): PollerState {
    return this.state;
  }

  /**
   * Check if polling is currently in progress.
   */
  isPolling(): boolean {
    return this.isPollingInProgress;
  }

  /**
   * Get initial timestamp for polling.
   * Queries database for last transaction, falls back to now - fallbackWindowMs.
   *
   * @implements AC-10.1 - Query DB for last transaction timestamp on start
   * @implements AC-10.2 - Fallback to now-60s when no DB data
   * @implements AC-10.3 - Continue from last saved timestamp on restart
   */
  private async getInitialTimestamp(): Promise<number> {
    const dbTimestamp = await this.dbService.getLastTransactionTimestamp();

    if (dbTimestamp !== null) {
      this.logger.log(`Using DB timestamp: ${new Date(dbTimestamp).toISOString()}`);
      return dbTimestamp;
    }

    // AC-10.2: Fallback to now - fallbackWindowMs
    const fallbackTimestamp = Date.now() - this.config.polling.fallbackWindowMs;
    this.logger.log(
      `No DB data, using fallback timestamp: ${new Date(fallbackTimestamp).toISOString()}`,
    );
    return fallbackTimestamp;
  }

  /**
   * Execute a single poll cycle.
   * Handles state checks and prevents overlapping polls.
   */
  private executePoll(): void {
    // AC-8.3: No new polls after shutdown signal
    if (this.state === PollerState.SHUTTING_DOWN || this.state === PollerState.STOPPED) {
      return;
    }

    // AC-1.2: Skip if previous poll is still in progress
    if (this.isPollingInProgress) {
      this.logger.warn('Previous poll still in progress, skipping');
      return;
    }

    this.isPollingInProgress = true;
    this.currentPollPromise = this.performPoll().finally(() => {
      this.isPollingInProgress = false;
      this.currentPollPromise = null;
    });
  }

  /**
   * Perform the actual poll operation.
   * Fetches transactions from TronGrid and processes them.
   *
   * @implements AC-10.5 - Subsequent polls use last processed timestamp
   */
  private async performPoll(): Promise<void> {
    if (!this.walletAddress || this.lastPollTimestamp === null) {
      this.logger.error('Poll skipped: missing wallet address or timestamp');
      return;
    }

    const startTime = Date.now();

    try {
      this.logger.debug(
        `Polling for transactions since ${new Date(this.lastPollTimestamp).toISOString()}`,
      );

      // Fetch transactions from TronGrid
      const transactions = await this.tronGridClient.fetchUSDTTransactions(
        this.walletAddress,
        this.lastPollTimestamp,
      );

      if (transactions.length > 0) {
        // Process transactions
        const result = await this.processorService.processUSDTTransactions(
          transactions,
          this.walletAddress,
        );

        // AC-10.5: Update timestamp to latest transaction
        this.lastPollTimestamp = this.getLatestTimestamp(transactions);

        this.logger.log(
          `Poll complete: ${transactions.length} fetched, ${result.processed} processed, ${result.skipped} skipped`,
        );
      }

      const durationMs = Date.now() - startTime;
      this.logger.debug(`Poll cycle completed in ${durationMs}ms`);
    } catch (error) {
      this.logger.error(`Poll failed: ${error}`);
      // Error handling is done in TronGridClient (backoff/retry)
      // Continue polling on next interval
    }
  }

  /**
   * Get the latest timestamp from a list of transactions.
   *
   * @param transactions - Array of transactions
   * @returns The latest timestamp, or current timestamp if array is empty
   */
  private getLatestTimestamp(transactions: Transaction[]): number {
    if (transactions.length === 0) {
      // lastPollTimestamp is guaranteed to be non-null when this method is called
      // since performPoll guards against null values before processing
      return this.lastPollTimestamp ?? Date.now();
    }

    return Math.max(...transactions.map((tx) => tx.timestamp));
  }
}
