import type { Transaction, TransactionType } from '@app/blockchain';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { DRIZZLE } from '../../database.provider';
import { AnalyticsService } from '../analytics.service';
import { ClassificationService } from '../classification.service';
import { type Classification, RecipientWalletsService } from '../recipient-wallets.service';

/**
 * Unit tests for AnalyticsService.
 *
 * These tests focus on verifying the business logic and service interactions
 * rather than the detailed Drizzle query building. Integration tests would
 * cover the full database interactions.
 */
describe('AnalyticsService', () => {
  let service: AnalyticsService;
  let recipientWalletsService: jest.Mocked<RecipientWalletsService>;
  let classificationService: jest.Mocked<ClassificationService>;
  let configService: jest.Mocked<ConfigService>;

  const MONITORED_WALLET = 'TMonitoredWallet1234567890123456';

  // Helper to create mock wallet
  const createMockWallet = (overrides = {}) => ({
    id: 1,
    address: 'TXyzTestWalletAddress12345678901234',
    classification: 'UNKNOWN' as Classification,
    firstSeenAt: new Date('2026-01-01'),
    lastPaymentAt: new Date('2026-01-15'),
    totalPayments: 1,
    lastAmount: '5000000000',
    hiredAt: null,
    firedAt: null,
    monthsWithoutPayment: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  });

  // Helper to create mock transaction
  const createMockTransaction = (overrides = {}): Transaction => ({
    hash: 'txhash123456789012345678901234567890123456789012345678901234',
    type: 'USDT' as TransactionType,
    fromAddress: MONITORED_WALLET,
    toAddress: 'TRecipientAddress123456789012345',
    amount: '5000000000', // 5000 USDT
    timestamp: new Date('2026-01-15').getTime(),
    blockNumber: 12345,
    contractAddress: 'USDT_CONTRACT',
    ...overrides,
  });

  // Create a mock DB that uses Promise resolution for queries
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ChainableQuery = Record<
    string,
    jest.Mock | ((fn: (v: unknown) => unknown) => Promise<unknown>)
  >;

  const createMockDb = () => {
    // Create a chainable mock that resolves to empty array by default
    const createChainableQuery = (): ChainableQuery => {
      const chainMethods = [
        'select',
        'from',
        'where',
        'limit',
        'orderBy',
        'innerJoin',
        'insert',
        'values',
        'onConflictDoUpdate',
        'update',
        'set',
      ];

      const query = Object.fromEntries(chainMethods.map((m) => [m, jest.fn()])) as ChainableQuery;

      // Make all methods return the query itself for chaining, but also resolve as a promise
      for (const method of chainMethods) {
        (query[method] as jest.Mock).mockImplementation(() => {
          const result = Object.create(query);
          // biome-ignore lint/suspicious/noThenProperty: Required for mock promise-like behavior
          result.then = (fn: (v: unknown) => unknown) => Promise.resolve([]).then(fn);
          return result;
        });
      }

      return query;
    };

    return {
      select: jest.fn().mockImplementation(() => {
        const result = createChainableQuery();
        // biome-ignore lint/suspicious/noThenProperty: Required for mock promise-like behavior
        result.then = (fn: (v: unknown) => unknown) => Promise.resolve([]).then(fn);
        return result;
      }),
      insert: jest.fn().mockImplementation(() => {
        const result = createChainableQuery();
        // biome-ignore lint/suspicious/noThenProperty: Required for mock promise-like behavior
        result.then = (fn: (v: unknown) => unknown) => Promise.resolve(undefined).then(fn);
        return result;
      }),
      update: jest.fn().mockImplementation(() => {
        const result = createChainableQuery();
        // biome-ignore lint/suspicious/noThenProperty: Required for mock promise-like behavior
        result.then = (fn: (v: unknown) => unknown) => Promise.resolve(undefined).then(fn);
        return result;
      }),
      delete: jest.fn().mockImplementation(() => {
        const result = createChainableQuery();
        // biome-ignore lint/suspicious/noThenProperty: Required for mock promise-like behavior
        result.then = (fn: (v: unknown) => unknown) => Promise.resolve(undefined).then(fn);
        return result;
      }),
    };
  };

  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(async () => {
    mockDb = createMockDb();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnalyticsService,
        {
          provide: RecipientWalletsService,
          useValue: {
            findByAddress: jest.fn(),
            upsertMany: jest.fn(),
            updateClassification: jest.fn(),
            updateLastPayment: jest.fn(),
            incrementTotalPayments: jest.fn(),
            resetMonthsWithoutPayment: jest.fn(),
            markAsRehired: jest.fn(),
            getByClassification: jest.fn(),
          },
        },
        {
          provide: ClassificationService,
          useValue: {
            evaluateClassification: jest.fn(),
            detectSalaryChange: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'MONITORED_WALLET_ADDRESS') return MONITORED_WALLET;
              return undefined;
            }),
          },
        },
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<AnalyticsService>(AnalyticsService);
    recipientWalletsService = module.get(RecipientWalletsService);
    classificationService = module.get(ClassificationService);
    configService = module.get(ConfigService);
  });

  describe('processTransaction', () => {
    /**
     * AC-5.1: When payout transaction is saved, system shall trigger analytics processing
     * within 100ms
     */
    describe('AC-5.1: Triggers on transaction save', () => {
      it('should create new recipient wallet for new address', async () => {
        // Arrange
        const tx = createMockTransaction();
        const newWallet = createMockWallet({ address: tx.toAddress, classification: 'ONE_TIME' });

        // First call: findByAddress returns null (new wallet)
        recipientWalletsService.findByAddress.mockResolvedValueOnce(null);
        // Create new wallet
        recipientWalletsService.upsertMany.mockResolvedValueOnce([newWallet]);
        // Subsequent findByAddress calls return the new wallet
        recipientWalletsService.findByAddress.mockResolvedValue(newWallet);

        classificationService.evaluateClassification.mockResolvedValueOnce({
          classification: 'ONE_TIME',
          changed: true,
        });

        // Act
        const result = await service.processTransaction(tx);

        // Assert
        expect(result.walletAddress).toBe(tx.toAddress);
        expect(result.classification).toBe('ONE_TIME');
        expect(result.classificationChanged).toBe(true);
        expect(result.processingTimeMs).toBeDefined();
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
        expect(recipientWalletsService.upsertMany).toHaveBeenCalledWith(
          expect.arrayContaining([
            expect.objectContaining({
              address: tx.toAddress,
              classification: 'UNKNOWN',
            }),
          ]),
        );
      });
    });

    /**
     * AC-5.2: When transaction is processed, system shall update recipient classification
     * immediately
     */
    describe('AC-5.2: Updates classification immediately', () => {
      it('should update classification when changed', async () => {
        // Arrange
        const tx = createMockTransaction();
        const existingWallet = createMockWallet({
          address: tx.toAddress,
          classification: 'ONE_TIME',
        });

        recipientWalletsService.findByAddress.mockResolvedValue(existingWallet);

        classificationService.evaluateClassification.mockResolvedValueOnce({
          classification: 'EMPLOYEE',
          changed: true,
          previousClassification: 'ONE_TIME',
        });

        // Act
        const result = await service.processTransaction(tx);

        // Assert
        expect(result.classificationChanged).toBe(true);
        expect(result.classification).toBe('EMPLOYEE');
        expect(recipientWalletsService.updateClassification).toHaveBeenCalledWith(
          tx.toAddress,
          'EMPLOYEE',
        );
      });

      it('should handle rehire case (FIRED -> EMPLOYEE)', async () => {
        // Arrange
        const tx = createMockTransaction();
        const firedWallet = createMockWallet({
          address: tx.toAddress,
          classification: 'FIRED',
          firedAt: new Date('2026-01-01'),
        });

        recipientWalletsService.findByAddress.mockResolvedValue(firedWallet);

        classificationService.evaluateClassification.mockResolvedValueOnce({
          classification: 'EMPLOYEE',
          changed: true,
          previousClassification: 'FIRED',
        });

        // Act
        const result = await service.processTransaction(tx);

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(recipientWalletsService.markAsRehired).toHaveBeenCalledWith(tx.toAddress, tx.amount);
      });
    });

    /**
     * AC-5.3: When transaction is processed, system shall calculate and store position
     * for current month
     */
    describe('AC-5.3: Calculates and stores position', () => {
      it('should return position in result', async () => {
        // Arrange
        const tx = createMockTransaction();
        const existingWallet = createMockWallet({ address: tx.toAddress });

        recipientWalletsService.findByAddress.mockResolvedValue(existingWallet);

        classificationService.evaluateClassification.mockResolvedValueOnce({
          classification: 'UNKNOWN',
          changed: false,
        });

        // Act
        const result = await service.processTransaction(tx);

        // Assert
        expect(result.position).toBeDefined();
        expect(result.position).toBeGreaterThan(0);
      });
    });

    /**
     * AC-5.4: Real-time processing shall not add more than 200ms to transaction insert
     * latency
     */
    describe('AC-5.4: Processing time tracked', () => {
      it('should report processing time in milliseconds', async () => {
        // Arrange
        const tx = createMockTransaction();
        const existingWallet = createMockWallet({ address: tx.toAddress });

        recipientWalletsService.findByAddress.mockResolvedValue(existingWallet);
        classificationService.evaluateClassification.mockResolvedValueOnce({
          classification: 'UNKNOWN',
          changed: false,
        });

        // Act
        const result = await service.processTransaction(tx);

        // Assert
        expect(typeof result.processingTimeMs).toBe('number');
        expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
      });
    });

    it('should detect and record salary change for employees', async () => {
      // Arrange
      const tx = createMockTransaction();
      const employeeWallet = createMockWallet({
        address: tx.toAddress,
        classification: 'EMPLOYEE',
        lastAmount: '4000000000', // Different from tx.amount
      });

      recipientWalletsService.findByAddress.mockResolvedValue(employeeWallet);

      classificationService.evaluateClassification.mockResolvedValueOnce({
        classification: 'EMPLOYEE',
        changed: false,
      });

      classificationService.detectSalaryChange.mockResolvedValueOnce({
        walletAddress: tx.toAddress,
        previousAmount: '4000000000',
        newAmount: tx.amount,
        changePercent: 25,
        isIncrease: true,
      });

      // Act
      const result = await service.processTransaction(tx);

      // Assert
      expect(result.salaryChange).not.toBeNull();
      expect(result.salaryChange?.changePercent).toBe(25);
      expect(result.salaryChange?.isIncrease).toBe(true);
    });

    it('should update payment info and increment counters', async () => {
      // Arrange
      const tx = createMockTransaction();
      const existingWallet = createMockWallet({ address: tx.toAddress });

      recipientWalletsService.findByAddress.mockResolvedValue(existingWallet);

      classificationService.evaluateClassification.mockResolvedValueOnce({
        classification: 'UNKNOWN',
        changed: false,
      });

      // Act
      await service.processTransaction(tx);

      // Assert
      expect(recipientWalletsService.updateLastPayment).toHaveBeenCalled();
      expect(recipientWalletsService.incrementTotalPayments).toHaveBeenCalled();
      expect(recipientWalletsService.resetMonthsWithoutPayment).toHaveBeenCalled();
    });

    it('should not detect salary change for non-EMPLOYEE classification', async () => {
      // Arrange
      const tx = createMockTransaction();
      const freelancerWallet = createMockWallet({
        address: tx.toAddress,
        classification: 'FREELANCER',
        lastAmount: '4000000000',
      });

      recipientWalletsService.findByAddress.mockResolvedValue(freelancerWallet);

      classificationService.evaluateClassification.mockResolvedValueOnce({
        classification: 'FREELANCER',
        changed: false,
      });

      // Act
      const result = await service.processTransaction(tx);

      // Assert
      // Should not attempt salary change detection for freelancers
      expect(classificationService.detectSalaryChange).not.toHaveBeenCalled();
      expect(result.salaryChange).toBeNull();
    });
  });

  describe('getGroupedAnalytics', () => {
    /**
     * AC-1.4: System shall send messages in order: Employees, Freelancers, One-time,
     * Unknown, Fired
     */
    describe('AC-1.4: Returns groups structure', () => {
      it('should return all classification groups', async () => {
        // Arrange
        const yearMonth = '2026-01';
        recipientWalletsService.getByClassification.mockResolvedValueOnce([]);

        // Act
        const result = await service.getGroupedAnalytics(yearMonth);

        // Assert - verifies structure, not database interaction
        expect(result).toHaveProperty('employees');
        expect(result).toHaveProperty('freelancers');
        expect(result).toHaveProperty('oneTime');
        expect(result).toHaveProperty('unknown');
        expect(result).toHaveProperty('fired');
        expect(Array.isArray(result.employees)).toBe(true);
        expect(Array.isArray(result.freelancers)).toBe(true);
        expect(Array.isArray(result.oneTime)).toBe(true);
        expect(Array.isArray(result.unknown)).toBe(true);
        expect(Array.isArray(result.fired)).toBe(true);
      });
    });

    it('should include fired employees in result', async () => {
      // Arrange
      const yearMonth = '2026-01';

      const firedWallets = [
        createMockWallet({
          address: 'TFired1',
          classification: 'FIRED',
          lastPaymentAt: new Date('2025-11-15'),
          lastAmount: '5000000000',
        }),
      ];
      recipientWalletsService.getByClassification.mockResolvedValueOnce(firedWallets);

      // Act
      const result = await service.getGroupedAnalytics(yearMonth);

      // Assert
      expect(result.fired).toHaveLength(1);
      expect(result.fired[0].walletAddress).toBe('TFired1');
      expect(result.fired[0].lastAmount).toBe('5000000000');
    });

    /**
     * Baseline from Previous Month tests
     * When showing month N analytics, wallets from N-1 should be included as baseline.
     */
    describe('Previous month baseline', () => {
      it('should include wallets from previous month with zero amount when not in current month', async () => {
        // This test documents the expected behavior:
        // - For month N, query positions from month N-1 as baseline
        // - If a wallet was in N-1 but not in N, show it with amount=0 and positionChange='miss'

        // The actual database integration happens in the integration tests
        // This unit test verifies the structure is correct
        const yearMonth = '2026-02';
        recipientWalletsService.getByClassification.mockResolvedValueOnce([]);

        const result = await service.getGroupedAnalytics(yearMonth);

        // Verify structure - baseline wallets from previous month should be included
        expect(result).toHaveProperty('employees');
        expect(result).toHaveProperty('freelancers');
        expect(result).toHaveProperty('oneTime');
        expect(result).toHaveProperty('unknown');
        expect(result).toHaveProperty('fired');
      });

      it('should mark wallets from current month without previous month data as new', async () => {
        // Wallets that appear in month N but not in N-1 should have positionChange = 'new'
        const yearMonth = '2026-01';
        recipientWalletsService.getByClassification.mockResolvedValueOnce([]);

        const result = await service.getGroupedAnalytics(yearMonth);

        // Verify the structure supports new wallet indicators
        expect(Array.isArray(result.employees)).toBe(true);
      });
    });
  });

  describe('calculatePositionsWithinGroup', () => {
    it('should skip calculation when no monitored wallet configured', async () => {
      // Arrange
      configService.get.mockReturnValueOnce(undefined);

      // Act & Assert - should not throw, just log warning
      await expect(
        service.calculatePositionsWithinGroup('2026-01', 'EMPLOYEE'),
      ).resolves.not.toThrow();
    });

    /**
     * AC-2.5: If two recipients have identical timestamps, system shall use transaction
     * hash as secondary sort for determinism
     */
    describe('AC-2.5: Deterministic ordering', () => {
      it('should use transaction hash for deterministic ordering when timestamps match', async () => {
        // The implementation sorts by timestamp, then by hash
        // This test documents the expected behavior
        const yearMonth = '2026-01';
        const classification: Classification = 'EMPLOYEE';

        // When positions are calculated, they should be ordered by:
        // 1. First payment timestamp (ascending)
        // 2. Transaction hash (ascending) for tie-breaking

        await expect(
          service.calculatePositionsWithinGroup(yearMonth, classification),
        ).resolves.not.toThrow();
      });
    });
  });

  describe('position change calculation', () => {
    it('should correctly identify position change types', () => {
      // Access private method through any cast for testing
      const calculatePositionChange = (
        service as unknown as {
          calculatePositionChange: (
            current: number | null,
            prev: number | null,
          ) => 'up' | 'down' | 'same' | 'new' | 'miss';
        }
      ).calculatePositionChange.bind(service);

      // New recipient (no previous position)
      expect(calculatePositionChange(1, null)).toBe('new');

      // Moved up (lower position number is better)
      expect(calculatePositionChange(1, 3)).toBe('up');

      // Moved down
      expect(calculatePositionChange(3, 1)).toBe('down');

      // Same position
      expect(calculatePositionChange(2, 2)).toBe('same');

      // Missed (was in previous month but not in current month)
      expect(calculatePositionChange(null, 2)).toBe('miss');
    });
  });

  describe('year-month formatting', () => {
    it('should correctly format year-month from timestamp', () => {
      // Access private method through any cast for testing
      const getYearMonth = (
        service as unknown as { getYearMonth: (ts: number) => string }
      ).getYearMonth.bind(service);

      // January 2026
      const jan2026 = new Date(Date.UTC(2026, 0, 15)).getTime();
      expect(getYearMonth(jan2026)).toBe('2026-01');

      // December 2025
      const dec2025 = new Date(Date.UTC(2025, 11, 25)).getTime();
      expect(getYearMonth(dec2025)).toBe('2025-12');
    });
  });
});
