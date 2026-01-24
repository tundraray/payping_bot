// TransactionProcessorService Unit Tests - TDD Red Phase
// Covers: AC-3.1, AC-3.2, AC-5.1, AC-5.2, AC-5.3

import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test, type TestingModule } from '@nestjs/testing';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';
import { TRANSACTION_NEW_EVENT } from '../events/transaction.events';
import { type Transaction, TransactionType } from '../interfaces/transaction.interface';
import { DeduplicationService } from './deduplication.service';
import { PayoutSessionService } from './payout-session.service';
import { TransactionProcessorService } from './transaction-processor.service';

/**
 * Helper function to create mock Transaction objects
 */
function createMockTransaction(hash: string): Transaction {
  return {
    hash,
    type: TransactionType.USDT,
    fromAddress: 'TSenderAddress123456789012345678901',
    toAddress: 'TReceiverAddress12345678901234567890',
    amount: '100.000000',
    timestamp: Date.now(),
    blockNumber: 12345678,
    contractAddress: USDT_CONTRACT_ADDRESS,
  };
}

describe('TransactionProcessorService', () => {
  let processorService: TransactionProcessorService;
  let deduplicationService: jest.Mocked<DeduplicationService>;
  let eventEmitter: jest.Mocked<EventEmitter2>;
  let payoutSessionService: jest.Mocked<PayoutSessionService>;

  const mockWalletAddress = 'TMonitoredWallet123456789012345678901';

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
            emit: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: PayoutSessionService,
          useValue: {
            handleOutgoingTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    processorService = module.get<TransactionProcessorService>(TransactionProcessorService);
    deduplicationService = module.get(DeduplicationService);
    eventEmitter = module.get(EventEmitter2);
    payoutSessionService = module.get(PayoutSessionService);
  });

  // ===========================================================================
  // AC-3.1, AC-3.2: Filters incoming transactions
  // ===========================================================================
  describe('AC-3.1/AC-3.2: filters incoming transactions', () => {
    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-3.1
     */
    it('should process only incoming transactions (to_address = wallet)', async () => {
      const incomingTx = createMockTransaction('incoming-hash-001');
      incomingTx.toAddress = mockWalletAddress;
      incomingTx.fromAddress = 'TSomeOtherAddress123456789012345678';

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processTransaction(incomingTx, mockWalletAddress);

      expect(deduplicationService.isDuplicate).toHaveBeenCalledWith(incomingTx.hash);
      expect(eventEmitter.emit).toHaveBeenCalled();
    });

    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-3.2
     */
    it('should ignore outgoing transactions (from_address = wallet)', async () => {
      const outgoingTx = createMockTransaction('outgoing-hash-001');
      outgoingTx.fromAddress = mockWalletAddress;
      outgoingTx.toAddress = 'TSomeOtherAddress123456789012345678';

      await processorService.processTransaction(outgoingTx, mockWalletAddress);

      expect(deduplicationService.isDuplicate).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    /**
     * @category core-functionality
     * @complexity low
     * @covers AC-3.1
     */
    it('should handle case-insensitive address comparison', async () => {
      const incomingTx = createMockTransaction('case-insensitive-hash');
      incomingTx.toAddress = mockWalletAddress.toLowerCase();
      incomingTx.fromAddress = 'TSomeOtherAddress123456789012345678';

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processTransaction(incomingTx, mockWalletAddress.toUpperCase());

      expect(deduplicationService.isDuplicate).toHaveBeenCalled();
      expect(eventEmitter.emit).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // AC-5.1, AC-5.2: Emits transaction.new event with correct payload
  // ===========================================================================
  describe('AC-5.1/AC-5.2: emits transaction.new event with correct payload', () => {
    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-5.1, AC-5.2
     */
    it('should emit transaction.new event for new incoming transaction', async () => {
      const incomingTx = createMockTransaction('new-tx-hash-001');
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processTransaction(incomingTx, mockWalletAddress);

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TRANSACTION_NEW_EVENT,
        expect.objectContaining({
          transaction: expect.objectContaining({
            hash: 'new-tx-hash-001',
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

    /**
     * @category core-functionality
     * @complexity medium
     * @covers AC-5.1
     */
    it('should NOT emit event for duplicate transaction', async () => {
      const duplicateTx = createMockTransaction('duplicate-hash-001');
      duplicateTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(true);

      await processorService.processTransaction(duplicateTx, mockWalletAddress);

      expect(eventEmitter.emit).not.toHaveBeenCalled();
      expect(deduplicationService.markProcessed).not.toHaveBeenCalled();
    });

    /**
     * @category core-functionality
     * @complexity low
     * @covers AC-5.2
     */
    it('should include detectedAt timestamp in event payload', async () => {
      const beforeTime = Date.now();
      const incomingTx = createMockTransaction('timestamp-test-hash');
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processTransaction(incomingTx, mockWalletAddress);
      const afterTime = Date.now();

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        TRANSACTION_NEW_EVENT,
        expect.objectContaining({
          detectedAt: expect.any(Number),
        }),
      );

      const emitCall = eventEmitter.emit.mock.calls[0];
      const payload = emitCall[1] as { detectedAt: number };
      expect(payload.detectedAt).toBeGreaterThanOrEqual(beforeTime);
      expect(payload.detectedAt).toBeLessThanOrEqual(afterTime);
    });
  });

  // ===========================================================================
  // AC-5.3: Logs error and continues when event emission fails
  // ===========================================================================
  describe('AC-5.3: logs error and continues when event emission fails', () => {
    /**
     * @category edge-case
     * @complexity medium
     * @covers AC-5.3
     */
    it('should log error but not throw when event emission fails', async () => {
      const incomingTx = createMockTransaction('emit-fail-hash-001');
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);
      eventEmitter.emit.mockImplementationOnce(() => {
        throw new Error('Event listener failed');
      });

      // Should not throw
      await expect(
        processorService.processTransaction(incomingTx, mockWalletAddress),
      ).resolves.not.toThrow();

      // Transaction should still be marked as processed
      expect(deduplicationService.markProcessed).toHaveBeenCalled();
    });

    /**
     * @category edge-case
     * @complexity low
     * @covers AC-5.3
     */
    it('should continue processing after event emission failure', async () => {
      const failingTx = createMockTransaction('fail-tx-001');
      failingTx.toAddress = mockWalletAddress;

      const successTx = createMockTransaction('success-tx-001');
      successTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValue(false);
      deduplicationService.markProcessed.mockResolvedValue(undefined);
      eventEmitter.emit
        .mockImplementationOnce(() => {
          throw new Error('First emission failed');
        })
        .mockReturnValueOnce(true);

      // First transaction - event fails but should not throw
      await processorService.processTransaction(failingTx, mockWalletAddress);

      // Second transaction - should still work
      await processorService.processTransaction(successTx, mockWalletAddress);

      expect(deduplicationService.markProcessed).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // Deduplication Integration
  // ===========================================================================
  describe('Deduplication integration', () => {
    /**
     * @category core-functionality
     * @complexity medium
     */
    it('should mark transaction as processed after successful event emission', async () => {
      const incomingTx = createMockTransaction('mark-processed-hash');
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processTransaction(incomingTx, mockWalletAddress);

      expect(deduplicationService.markProcessed).toHaveBeenCalledWith(incomingTx.hash, incomingTx);
    });

    /**
     * @category core-functionality
     * @complexity low
     */
    it('should check isDuplicate before processing', async () => {
      const incomingTx = createMockTransaction('check-first-hash');
      incomingTx.toAddress = mockWalletAddress;

      // Track call order using mockImplementation
      const callOrder: string[] = [];
      deduplicationService.isDuplicate.mockImplementationOnce(async () => {
        callOrder.push('isDuplicate');
        return false;
      });
      deduplicationService.markProcessed.mockImplementationOnce(async () => {
        callOrder.push('markProcessed');
      });

      await processorService.processTransaction(incomingTx, mockWalletAddress);

      expect(deduplicationService.isDuplicate).toHaveBeenCalledWith(incomingTx.hash);
      expect(callOrder).toEqual(['isDuplicate', 'markProcessed']);
    });
  });

  // ===========================================================================
  // Payout Session Hook - Task 08 tests
  // ===========================================================================
  describe('Payout session hook for outgoing transactions', () => {
    /**
     * @category core-functionality
     * @complexity medium
     * @covers Task-08 - Hook outgoing transactions to PayoutSessionService
     */
    it('should call handleOutgoingTransaction for outgoing transactions in processUSDTTransactions', async () => {
      const outgoingTx = createMockTransaction('outgoing-tx-001');
      outgoingTx.fromAddress = mockWalletAddress;
      outgoingTx.toAddress = 'TSomeRecipient12345678901234567890';

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);
      payoutSessionService.handleOutgoingTransaction.mockResolvedValueOnce(undefined);

      await processorService.processUSDTTransactions([outgoingTx], mockWalletAddress);

      expect(payoutSessionService.handleOutgoingTransaction).toHaveBeenCalledWith(outgoingTx);
    });

    /**
     * @category core-functionality
     * @complexity low
     * @covers Task-08 - Do NOT call for incoming transactions
     */
    it('should NOT call handleOutgoingTransaction for incoming transactions', async () => {
      const incomingTx = createMockTransaction('incoming-tx-001');
      incomingTx.fromAddress = 'TSomeSender1234567890123456789012';
      incomingTx.toAddress = mockWalletAddress;

      deduplicationService.isDuplicate.mockResolvedValueOnce(false);
      deduplicationService.markProcessed.mockResolvedValueOnce(undefined);

      await processorService.processUSDTTransactions([incomingTx], mockWalletAddress);

      expect(payoutSessionService.handleOutgoingTransaction).not.toHaveBeenCalled();
    });

    /**
     * @category edge-case
     * @complexity medium
     * @covers Task-08 - Error handling for payout session
     */
    it('should continue processing when payout session handling fails', async () => {
      const outgoingTx1 = createMockTransaction('outgoing-tx-fail');
      outgoingTx1.fromAddress = mockWalletAddress;
      outgoingTx1.toAddress = 'TRecipient00000001234567890123456';

      const outgoingTx2 = createMockTransaction('outgoing-tx-success');
      outgoingTx2.fromAddress = mockWalletAddress;
      outgoingTx2.toAddress = 'TRecipient00000001234567890123457';

      deduplicationService.isDuplicate.mockResolvedValue(false);
      deduplicationService.markProcessed.mockResolvedValue(undefined);

      payoutSessionService.handleOutgoingTransaction
        .mockRejectedValueOnce(new Error('Payout session error'))
        .mockResolvedValueOnce(undefined);

      // Should not throw despite first tx handler error
      const result = await processorService.processUSDTTransactions(
        [outgoingTx1, outgoingTx2],
        mockWalletAddress,
      );

      // Both transactions should be processed (saved to DB)
      expect(result.processed).toBe(2);
      // Both should have called handleOutgoingTransaction
      expect(payoutSessionService.handleOutgoingTransaction).toHaveBeenCalledTimes(2);
    });

    /**
     * @category edge-case
     * @complexity low
     * @covers Task-08 - Skip duplicate outgoing transactions
     */
    it('should NOT call handleOutgoingTransaction for duplicate outgoing transactions', async () => {
      const duplicateOutgoingTx = createMockTransaction('duplicate-outgoing');
      duplicateOutgoingTx.fromAddress = mockWalletAddress;
      duplicateOutgoingTx.toAddress = 'TRecipient00000001234567890123456';

      deduplicationService.isDuplicate.mockResolvedValueOnce(true);

      await processorService.processUSDTTransactions([duplicateOutgoingTx], mockWalletAddress);

      expect(payoutSessionService.handleOutgoingTransaction).not.toHaveBeenCalled();
    });
  });
});
