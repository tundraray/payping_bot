import { DbModule } from '@app/db';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BlockchainService } from './blockchain.service';
import { TronGridClient } from './clients/trongrid.client';
import blockchainConfig from './config/blockchain.config';
import { DeduplicationService } from './services/deduplication.service';
import { TransactionPollerService } from './services/transaction-poller.service';
import { TransactionProcessorService } from './services/transaction-processor.service';

/**
 * BlockchainModule provides TRON blockchain monitoring functionality.
 *
 * Features:
 * - Polls TronGrid API for incoming USDT (TRC20) transactions
 * - Deduplicates transactions using LRU cache + database
 * - Emits 'transaction.new' events for downstream consumers
 * - Handles graceful shutdown
 *
 * Usage:
 * ```typescript
 * @Module({
 *   imports: [BlockchainModule],
 * })
 * export class AppModule {}
 * ```
 *
 * Configuration:
 * - TRONGRID_BASE_URL: TronGrid API endpoint
 * - TRONGRID_API_KEY: API key for higher rate limits
 * - POLLING_INTERVAL_MS: Polling interval (default: 5000)
 * - LRU_CACHE_SIZE: Max cache entries (default: 10000)
 * - See blockchain.config.ts for all options
 */
@Module({
  imports: [
    // Register blockchain configuration
    ConfigModule.forFeature(blockchainConfig),

    // Event emitter for transaction events
    EventEmitterModule.forRoot({
      // Global event emitter configuration
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),

    // Database module for persistence
    DbModule,
  ],
  providers: [
    // Core service (coordinator)
    BlockchainService,

    // Infrastructure layer
    TronGridClient,
    DeduplicationService,

    // Application layer
    TransactionProcessorService,

    // Orchestration layer
    TransactionPollerService,
  ],
  exports: [
    BlockchainService,
    // Export for external event listeners
    TransactionProcessorService,
  ],
})
export class BlockchainModule {}
