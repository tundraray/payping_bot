# Task: Transaction Processor Service

Metadata:
- Phase: 3 (Application)
- Dependencies: task-2-2 (DeduplicationService), task-3-1 (transaction.events.ts), task-1-2 (transaction.interface.ts)
- Provides: TransactionProcessorService for processing and event emission
- Size: Medium (2 files: implementation + integration tests)

## Implementation Content
Create the transaction processor service that:
1. Filters incoming transactions (to_address = wallet)
2. Uses DeduplicationService to check/mark duplicates
3. Emits `transaction.new` events for new transactions
4. Handles event emission failures gracefully (log and continue)

Reference: Design Doc "TransactionProcessorService" component section.

## Target Files
- [x] `libs/blockchain/src/services/transaction-processor.service.ts` (new)
- [x] `libs/blockchain/src/services/transaction-processor.service.spec.ts` (new - unit tests)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Add Event Emission Tests to Existing Test File

Update `deduplication.int.test.ts` to include TransactionProcessorService tests:

```typescript
// Add to libs/blockchain/src/services/deduplication.int.test.ts

import { EventEmitter2 } from '@nestjs/event-emitter';
import { TransactionProcessorService } from './transaction-processor.service';
import { TRANSACTION_NEW_EVENT } from '../events/transaction.events';

// Add new describe block for TransactionProcessorService
describe('TransactionProcessorService Integration Tests', () => {
  let processorService: TransactionProcessorService;
  let deduplicationService: jest.Mocked<DeduplicationService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;

  const mockWalletAddress = 'TMonitoredWallet123';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TransactionProcessorService,
        {
          provide: DeduplicationService,
          useValue: {
            isDuplicate: jest.fn(),
            markProcessed: jest.fn(),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    processorService = module.get<TransactionProcessorService>(TransactionProcessorService);
    deduplicationService = module.get(DeduplicationService);
    eventEmitter = module.get(EventEmitter2);
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-3.1, AC-3.2
   */
  describe('AC-3.1/AC-3.2: filters incoming transactions', () => {
    it('should process only incoming transactions (to_address = wallet)', async () => {
      const incomingTx = createMockTransaction('incoming-hash');
      incomingTx.toAddress = mockWalletAddress;
      incomingTx.fromAddress = 'TSomeOtherAddress';

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processUSDTTransaction(incomingTx, mockWalletAddress);

      expect(deduplicationService.isDuplicate).toHaveBeenCalledWith(incomingTx.hash);
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    it('should ignore outgoing transactions (from_address = wallet)', async () => {
      const outgoingTx = createMockTransaction('outgoing-hash');
      outgoingTx.fromAddress = mockWalletAddress;
      outgoingTx.toAddress = 'TSomeOtherAddress';

      await processorService.processUSDTTransaction(outgoingTx, mockWalletAddress);

      expect(deduplicationService.isDuplicate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-5.1, AC-5.2
   */
  describe('AC-5.1/AC-5.2: emits transaction.new event with correct payload', () => {
    it('should emit transaction.new event for new incoming transaction', async () => {
      const incomingTx = createMockTransaction('new-tx-hash');
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processUSDTTransaction(incomingTx, mockWalletAddress);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TRANSACTION_NEW_EVENT,
        expect.objectContaining({
          transaction: expect.objectContaining({
            hash: 'new-tx-hash',
            type: TransactionType.USDT,
            fromAddress: expect.any(String),
            toAddress: mockWalletAddress,
            amount: expect.any(String),
            timestamp: expect.any(Number),
            contractAddress: USDT_CONTRACT_ADDRESS,
          }),
          detectedAt: expect.any(Number),
        }),
      );
    });

    it('should NOT emit event for duplicate transaction', async () => {
      const duplicateTx = createMockTransaction('duplicate-hash');
      duplicateTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(true);

      await processorService.processUSDTTransaction(duplicateTx, mockWalletAddress);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(deduplicationService.markProcessed).not.toHaveBeenCalled();
    });
  });

  /**
   * @category edge-case
   * @complexity medium
   * @covers AC-5.3
   */
  describe('AC-5.3: logs error and continues when event emission fails', () => {
    it('should log error but not throw when event emission fails', async () => {
      const incomingTx = createMockTransaction('emit-fail-hash');
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);
      eventEmitter.emit.mockImplementationOnce(() => {
        throw new Error('Event listener failed');
      });

      // Should not throw
      await expect(
        processorService.processUSDTTransaction(incomingTx, mockWalletAddress),
      ).resolves.not.toThrow();

      // Transaction should still be marked as processed
      expect(deduplicationService.markProcessed).toHaveBeenCalled();
    });
  });
});
```

Run tests to confirm they fail:
```bash
pnpm run test libs/blockchain/src/services/deduplication.int.test.ts
```

### 2. Green Phase - Implement TransactionProcessorService

```typescript
// libs/blockchain/src/services/transaction-processor.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DeduplicationService } from './deduplication.service';
import { Transaction, TransactionNewEvent } from '../interfaces/transaction.interface';
import { TRANSACTION_NEW_EVENT } from '../events/transaction.events';

@Injectable()
export class TransactionProcessorService {
  private readonly logger = new Logger(TransactionProcessorService.name);

  constructor(
    private readonly deduplicationService: DeduplicationService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Process a USDT transaction.
   * Only processes incoming transactions (to_address = walletAddress).
   * Deduplicates and emits events for new transactions.
   *
   * @param transaction - The transaction to process
   * @param walletAddress - The monitored wallet address
   */
  async processUSDTTransaction(
    transaction: Transaction,
    walletAddress: string,
  ): Promise<void> {
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
      this.logger.debug(
        `Skipping duplicate transaction: ${transaction.hash.substring(0, 16)}...`,
      );
      return;
    }

    // Mark as processed (persist to cache + DB)
    await this.deduplicationService.markProcessed(transaction.hash, transaction);

    // Emit event for new transaction
    this.emitTransactionEvent(transaction);
  }

  /**
   * Process multiple USDT transactions.
   *
   * @param transactions - Array of transactions to process
   * @param walletAddress - The monitored wallet address
   */
  async processUSDTTransactions(
    transactions: Transaction[],
    walletAddress: string,
  ): Promise<{ processed: number; skipped: number }> {
    let processed = 0;
    let skipped = 0;

    for (const transaction of transactions) {
      const wasIncoming = this.isIncomingTransaction(transaction, walletAddress);

      if (wasIncoming) {
        const isDuplicate = await this.deduplicationService.isDuplicate(transaction.hash);

        if (!isDuplicate) {
          await this.deduplicationService.markProcessed(transaction.hash, transaction);
          this.emitTransactionEvent(transaction);
          processed++;
        } else {
          skipped++;
        }
      } else {
        skipped++;
      }
    }

    return { processed, skipped };
  }

  /**
   * Check if transaction is incoming (to_address = wallet).
   */
  private isIncomingTransaction(
    transaction: Transaction,
    walletAddress: string,
  ): boolean {
    return transaction.toAddress.toLowerCase() === walletAddress.toLowerCase();
  }

  /**
   * Emit transaction.new event.
   * Catches and logs errors but does not throw (AC-5.3).
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
      this.logger.error(
        `Failed to emit ${TRANSACTION_NEW_EVENT}: ${error}`,
        { transactionHash: transaction.hash },
      );
      // Do not re-throw - processing should continue
    }
  }
}
```

Run tests to confirm they pass:
```bash
pnpm run test libs/blockchain/src/services/deduplication.int.test.ts
```

### 3. Refactor Phase
- Review logging for consistency
- Ensure error handling follows Design Doc
- Consider extracting address comparison logic

## Completion Criteria
- [x] TransactionProcessorService created
- [x] Event emission tests pass (AC-5.1, AC-5.2, AC-5.3)
- [x] Incoming filtering tests pass (AC-3.1, AC-3.2)
- [x] Event emission errors are logged but don't crash processing
- [x] Operation verified: L2 (Test Operation) - all tests pass
- [x] `pnpm run check` passes

## Related Acceptance Criteria
- AC-3.1: Process only transactions where to_address matches monitored wallet
- AC-3.2: Ignore outgoing transactions (from_address = wallet)
- AC-5.1: Emit `transaction.new` event for new transactions
- AC-5.2: Event contains all required fields
- AC-5.3: Event emission failure logged, processing continues

## Notes
- Impact scope: New file + update to existing test file
- Constraints: Must use DeduplicationService for all duplicate checks
- Event emission must be resilient to listener failures
- Address comparison is case-insensitive (TRON addresses can vary in case)
