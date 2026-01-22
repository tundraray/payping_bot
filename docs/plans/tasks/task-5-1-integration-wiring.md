# Task: Integration Wiring

Metadata:
- Phase: 5 (Integration)
- Dependencies: All Phase 1-4 tasks
- Provides: Complete BlockchainModule ready for application use
- Size: Medium (3 files to modify)

## Implementation Content
Wire all components together by:
1. Implementing BlockchainService as the module coordinator
2. Configuring BlockchainModule with all providers and imports
3. Updating index.ts to export all new components

Reference: Design Doc "BlockchainService (Coordinator)" and "Integration Points" sections.

## Target Files
- [x] `libs/blockchain/src/blockchain.service.ts` (modify - complete rewrite)
- [x] `libs/blockchain/src/blockchain.module.ts` (modify - complete rewrite)
- [x] `libs/blockchain/src/index.ts` (modify - add exports)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
No new tests for integration wiring - existing integration tests should still pass. This task focuses on module configuration and exports.

### 2. Green Phase

#### 2.1 Implement BlockchainService (Coordinator)

```typescript
// libs/blockchain/src/blockchain.service.ts

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { TransactionPollerService } from './services/transaction-poller.service';
import { DbService } from '@app/db';

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
        // AC-6.2: Log error and pause if no wallet configured
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
    return this.pollerService.getState() === 'POLLING';
  }
}
```

#### 2.2 Configure BlockchainModule

```typescript
// libs/blockchain/src/blockchain.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DbModule } from '@app/db';

import blockchainConfig from './config/blockchain.config';
import { BlockchainService } from './blockchain.service';
import { TronGridClient } from './clients/trongrid.client';
import { DeduplicationService } from './services/deduplication.service';
import { TransactionProcessorService } from './services/transaction-processor.service';
import { TransactionPollerService } from './services/transaction-poller.service';

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
```

#### 2.3 Update index.ts Exports

```typescript
// libs/blockchain/src/index.ts

// Module
export * from './blockchain.module';
export * from './blockchain.service';

// Configuration
export { default as blockchainConfig, BlockchainConfig } from './config/blockchain.config';

// Constants
export * from './constants/contracts';

// Interfaces
export * from './interfaces/transaction.interface';
export * from './interfaces/trongrid-response.interface';

// Events
export * from './events/transaction.events';

// Services (for testing/mocking)
export * from './services/deduplication.service';
export * from './services/transaction-processor.service';
export * from './services/transaction-poller.service';

// Clients (for testing/mocking)
export * from './clients/trongrid.client';
```

### 3. Refactor Phase
- Ensure all imports are correct
- Verify no circular dependencies
- Check that exports cover all public APIs

## Verification Steps

### 1. Import BlockchainModule in AppModule
```typescript
// src/app.module.ts
import { BlockchainModule } from '@app/blockchain';

@Module({
  imports: [
    // ... other modules
    BlockchainModule,
  ],
})
export class AppModule {}
```

### 2. Start Application
```bash
pnpm run start:dev

# Expected logs:
# [BlockchainService] Initializing BlockchainService...
# [BlockchainService] Monitoring wallet: T...
# [TransactionPollerService] Starting polling with interval 5000ms...
```

### 3. Verify Graceful Shutdown
```bash
# Send SIGTERM
kill -SIGTERM <pid>

# Or Ctrl+C in terminal

# Expected logs:
# [BlockchainService] Shutting down BlockchainService...
# [TransactionPollerService] Shutting down poller...
# [TransactionPollerService] Poller stopped
# [BlockchainService] BlockchainService shut down successfully
```

### 4. Verify Exports
```typescript
// In a test file
import {
  BlockchainModule,
  BlockchainService,
  Transaction,
  TransactionType,
  TransactionNewEvent,
  TRANSACTION_NEW_EVENT,
  USDT_CONTRACT_ADDRESS,
} from '@app/blockchain';

// All imports should resolve
```

## Completion Criteria
- [x] BlockchainService implements OnModuleInit and OnModuleDestroy
- [x] BlockchainService loads wallet address from DB (AC-6.1)
- [x] BlockchainService handles missing wallet gracefully (AC-6.2)
- [x] BlockchainModule imports ConfigModule.forFeature with blockchain config
- [x] BlockchainModule imports EventEmitterModule
- [x] All providers registered correctly
- [x] All exports available from `@app/blockchain`
- [x] Application starts without errors
- [x] Graceful shutdown works correctly
- [x] All existing integration tests pass
- [x] Operation verified: L1 (Functional Operation) - application starts and polls
- [x] `pnpm run check` passes

## Related Acceptance Criteria
- AC-6.1: Load wallet address from DB on start
- AC-6.2: Pause polling if no wallet configured
- AC-6.3: No restart required for wallet change

## Notes
- Impact scope: Modify 3 existing files in `libs/blockchain/src/`
- Constraints: Must not break existing tests
- BlockchainModule is a feature module that can be imported into AppModule
- EventEmitterModule.forRoot() should only be called once; if already in AppModule, use without .forRoot()
