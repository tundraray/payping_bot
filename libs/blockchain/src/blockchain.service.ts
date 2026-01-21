import { DbService } from '@app/db';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PollerState, TransactionPollerService } from './services/transaction-poller.service';

/**
 * Coordinator service for blockchain monitoring.
 *
 * Responsibilities:
 * - Load wallet address from database on startup
 * - Start/stop polling via TransactionPollerService
 * - Provide status information about polling state
 * - Handle graceful shutdown
 *
 * @implements AC-6.1 - Load wallet address from DB on start
 * @implements AC-6.2 - Pause polling if no wallet configured
 * @implements AC-6.3 - No restart required for wallet change
 */
@Injectable()
export class BlockchainService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BlockchainService.name);
  private monitoredWallet: string | null = null;

  constructor(
    private readonly pollerService: TransactionPollerService,
    private readonly dbService: DbService,
  ) {}

  /**
   * Initialize blockchain monitoring on module start.
   * Loads wallet address from database and starts polling.
   */
  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing BlockchainService...');

    try {
      // AC-6.1: Load wallet address from database
      this.monitoredWallet = await this.dbService.getMonitoredWalletAddress();

      if (!this.monitoredWallet) {
        // AC-6.2: Log warning and pause if no wallet configured
        this.logger.warn('No wallet address configured. Polling will be paused.');
        return;
      }

      this.logger.log(`Monitoring wallet: ${this.monitoredWallet}`);

      // Start polling
      await this.pollerService.startPolling();

      this.logger.log('BlockchainService initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize BlockchainService: ${error}`);
      // Do not throw - allow application to start without blockchain monitoring
    }
  }

  /**
   * Cleanup on module destroy.
   * Stops polling gracefully.
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log('Shutting down BlockchainService...');

    try {
      await this.pollerService.stopPolling();
      this.logger.log('BlockchainService shut down successfully');
    } catch (error) {
      this.logger.error(`Error during BlockchainService shutdown: ${error}`);
    }
  }

  /**
   * Start blockchain monitoring.
   * Delegates to TransactionPollerService.
   */
  async startMonitoring(): Promise<void> {
    await this.pollerService.startPolling();
  }

  /**
   * Stop blockchain monitoring.
   * Delegates to TransactionPollerService.
   */
  async stopMonitoring(): Promise<void> {
    await this.pollerService.stopPolling();
  }

  /**
   * Get current poller state.
   *
   * @returns Current state of the poller (IDLE, POLLING, PAUSED, SHUTTING_DOWN, STOPPED)
   */
  getStatus(): PollerState {
    return this.pollerService.getState();
  }

  /**
   * Get the currently monitored wallet address.
   * AC-6.1: Returns wallet loaded from database.
   */
  getMonitoredWallet(): string | null {
    return this.monitoredWallet;
  }

  /**
   * Refresh wallet address from database.
   * AC-6.3: Allows changing wallet without restart.
   */
  async refreshWalletAddress(): Promise<void> {
    const newWallet = await this.dbService.getMonitoredWalletAddress();

    if (newWallet !== this.monitoredWallet) {
      this.logger.log(`Wallet address changed: ${this.monitoredWallet} -> ${newWallet}`);
      this.monitoredWallet = newWallet;

      // Restart polling with new wallet
      await this.pollerService.stopPolling();

      if (newWallet) {
        await this.pollerService.startPolling();
      }
    }
  }

  /**
   * Check if polling is currently active.
   */
  isPollingActive(): boolean {
    return this.pollerService.getState() === PollerState.POLLING;
  }
}
