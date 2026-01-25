import { Test, type TestingModule } from '@nestjs/testing';
import { DRIZZLE, type DrizzleDB } from '../../database.provider';
import { ClassificationService, type PaymentInfo } from '../classification.service';
import { type Classification, RecipientWalletsService } from '../recipient-wallets.service';

describe('ClassificationService', () => {
  let service: ClassificationService;
  let recipientWalletsService: jest.Mocked<RecipientWalletsService>;
  let mockDb: jest.Mocked<Partial<DrizzleDB>>;

  // Helper to create mock wallet
  const createMockWallet = (overrides = {}) => ({
    id: 1,
    address: 'TXyzTestWalletAddress12345678901234',
    classification: 'UNKNOWN' as Classification,
    firstSeenAt: new Date('2026-01-01'),
    lastPaymentAt: new Date('2026-01-15'),
    totalPayments: 1,
    lastAmount: '5000000000', // 5000 USDT in raw format
    hiredAt: null,
    firedAt: null,
    monthsWithoutPayment: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  });

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClassificationService,
        {
          provide: RecipientWalletsService,
          useValue: {
            findByAddress: jest.fn(),
            getByClassification: jest.fn(),
            markAsFired: jest.fn(),
          },
        },
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<ClassificationService>(ClassificationService);
    recipientWalletsService = module.get(RecipientWalletsService);
  });

  describe('evaluateClassification', () => {
    /**
     * AC-4.1: When payment amount < 500 USDT, system shall classify as UNKNOWN
     */
    describe('AC-4.1: First payment < 500 returns UNKNOWN', () => {
      it('should return UNKNOWN for new wallet with payment < 500 USDT', async () => {
        // Arrange
        const walletAddress = 'TNewWallet123456789012345678901234';
        const payments: PaymentInfo[] = [];
        const newPayment: PaymentInfo = {
          amount: '400000000', // 400 USDT < 500 threshold
          timestamp: new Date('2026-01-20'),
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(null);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('UNKNOWN');
        expect(result.changed).toBe(true);
      });
    });

    /**
     * AC-4.2: When first payment >= 500 USDT, system shall classify as ONE_TIME
     */
    describe('AC-4.2: First payment >= 500 returns ONE_TIME', () => {
      it('should return ONE_TIME for new wallet with payment >= 500 USDT', async () => {
        // Arrange
        const walletAddress = 'TNewWallet123456789012345678901234';
        const payments: PaymentInfo[] = [];
        const newPayment: PaymentInfo = {
          amount: '500000000', // 500 USDT = threshold
          timestamp: new Date('2026-01-20'),
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(null);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('ONE_TIME');
        expect(result.changed).toBe(true);
      });

      it('should return ONE_TIME for payment much greater than 500 USDT', async () => {
        // Arrange
        const walletAddress = 'TNewWallet123456789012345678901234';
        const payments: PaymentInfo[] = [];
        const newPayment: PaymentInfo = {
          amount: '10000000000', // 10000 USDT
          timestamp: new Date('2026-01-20'),
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(null);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('ONE_TIME');
      });
    });

    /**
     * AC-3.1: When wallet has 3+ payments AND span >= 3 months AND regularity >= 70%,
     * system shall classify as EMPLOYEE
     */
    describe('AC-3.1: 3+ payments, span >= 3 months, regularity >= 70% returns EMPLOYEE', () => {
      it('should return EMPLOYEE for consecutive monthly payments over 3 months', async () => {
        // Arrange
        const walletAddress = 'TEmployee12345678901234567890123';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'ONE_TIME',
          totalPayments: 2, // Will become 3 with new payment
          firstSeenAt: new Date('2026-01-15'),
        });

        // Payments in Jan, Feb -> 100% regularity so far
        const payments: PaymentInfo[] = [
          { amount: '5000000000', timestamp: new Date('2026-01-15') }, // Jan
          { amount: '5100000000', timestamp: new Date('2026-02-15') }, // Feb
        ];
        // New payment in Mar -> 3/3 months = 100% regularity >= 70%
        const newPayment: PaymentInfo = {
          amount: '5050000000',
          timestamp: new Date('2026-03-15'), // Mar
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('ONE_TIME');
        expect(result.regularity).toBe(1.0); // 3/3 = 100%
      });
    });

    /**
     * AC-4.1: When wallet has 3+ payments AND span >= 3 months AND regularity < 70%,
     * system shall classify as FREELANCER
     */
    describe('AC-4.1: 3+ payments, span >= 3 months, regularity < 70% returns FREELANCER', () => {
      it('should return FREELANCER for irregular payment pattern over 5 months', async () => {
        // Arrange
        const walletAddress = 'TFreelancer1234567890123456789012';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'ONE_TIME',
          totalPayments: 2, // Will become 3 with new payment
          firstSeenAt: new Date('2026-01-15'),
        });

        // Payments in Jan, Mar (skipping Feb) -> pattern with gaps
        const payments: PaymentInfo[] = [
          { amount: '5000000000', timestamp: new Date('2026-01-15') }, // Jan
          { amount: '8000000000', timestamp: new Date('2026-03-15') }, // Mar (skipped Feb)
        ];
        // New payment in May -> 3 unique months over 5-month span = 60% regularity < 70%
        const newPayment: PaymentInfo = {
          amount: '3000000000',
          timestamp: new Date('2026-05-15'), // May (skipped Apr)
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('FREELANCER');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('ONE_TIME');
        expect(result.regularity).toBeCloseTo(0.6, 2); // 3/5 = 60%
      });
    });

    /**
     * AC-4.6: When FIRED wallet receives new payment, system shall reclassify as EMPLOYEE
     */
    describe('AC-4.6: FIRED + new payment returns EMPLOYEE (rehire)', () => {
      it('should return EMPLOYEE when FIRED wallet receives payment', async () => {
        // Arrange
        const walletAddress = 'TFiredWallet123456789012345678901';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'FIRED',
          firedAt: new Date('2026-02-01'),
        });

        const payments: PaymentInfo[] = [];
        const newPayment: PaymentInfo = {
          amount: '5000000000',
          timestamp: new Date('2026-04-15'),
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('FIRED');
      });
    });

    /**
     * AC-2.1: When wallet has < 3 payments, system shall keep ONE_TIME classification
     * (not enough data for pattern analysis)
     */
    it('should keep current classification when payments < 3 (not enough for pattern analysis)', async () => {
      // Arrange
      const walletAddress = 'TExistingWallet12345678901234567';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 1,
        firstSeenAt: new Date('2026-01-15'),
      });

      const payments: PaymentInfo[] = [{ amount: '5000000000', timestamp: new Date('2026-01-15') }];
      const newPayment: PaymentInfo = {
        amount: '5000000000',
        timestamp: new Date('2026-02-15'),
      };

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert - only 2 payments, need 3+ for pattern analysis
      expect(result.classification).toBe('ONE_TIME');
      expect(result.changed).toBe(false);
    });
  });

  describe('detectSalaryChange', () => {
    /**
     * AC-6.1: When EMPLOYEE payment amount differs from previous by >5%, system shall
     * log potential salary change
     */
    describe('AC-6.1: Detects changes >5% for employees', () => {
      it('should return null for change < 5%', async () => {
        // Arrange
        const walletAddress = 'TEmployee12345678901234567890123';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'EMPLOYEE',
          lastAmount: '5000000000', // 5000 USDT
        });

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act - 4% change (within threshold)
        const result = await service.detectSalaryChange(
          walletAddress,
          '5200000000', // 5200 USDT (4% increase)
          'txhash123',
          Date.now(),
        );

        // Assert
        expect(result).toBeNull();
      });

      it('should return result for change >= 5%', async () => {
        // Arrange
        const walletAddress = 'TEmployee12345678901234567890123';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'EMPLOYEE',
          lastAmount: '5000000000', // 5000 USDT
        });

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act - 10% change
        const result = await service.detectSalaryChange(
          walletAddress,
          '5500000000', // 5500 USDT (10% increase)
          'txhash123',
          Date.now(),
        );

        // Assert
        expect(result).not.toBeNull();
        expect(result?.changePercent).toBeCloseTo(10, 0);
        expect(result?.isIncrease).toBe(true);
        expect(mockDb.insert).toHaveBeenCalled();
      });

      it('should detect salary decrease', async () => {
        // Arrange
        const walletAddress = 'TEmployee12345678901234567890123';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'EMPLOYEE',
          lastAmount: '5000000000', // 5000 USDT
        });

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act - 20% decrease
        const result = await service.detectSalaryChange(
          walletAddress,
          '4000000000', // 4000 USDT (20% decrease)
          'txhash123',
          Date.now(),
        );

        // Assert
        expect(result).not.toBeNull();
        expect(result?.changePercent).toBeCloseTo(20, 0);
        expect(result?.isIncrease).toBe(false);
      });
    });

    it('should return null for non-EMPLOYEE wallets', async () => {
      // Arrange
      const walletAddress = 'TFreelancer1234567890123456789012';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'FREELANCER',
        lastAmount: '5000000000',
      });

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.detectSalaryChange(
        walletAddress,
        '6000000000',
        'txhash123',
        Date.now(),
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when wallet not found', async () => {
      // Arrange
      recipientWalletsService.findByAddress.mockResolvedValueOnce(null);

      // Act
      const result = await service.detectSalaryChange(
        'TNotFound123456789012345678901234',
        '5000000000',
        'txhash123',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when wallet has no lastAmount', async () => {
      // Arrange
      const mockWallet = createMockWallet({
        classification: 'EMPLOYEE',
        lastAmount: null,
      });

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.detectSalaryChange(
        mockWallet.address,
        '5000000000',
        'txhash123',
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('checkEmploymentStatus', () => {
    /**
     * AC-7.1: System shall run batch check for fired employees (2+ months no payment)
     * AC-4.5: When EMPLOYEE wallet has no payments for 2 consecutive months, system
     * shall classify as FIRED
     */
    describe('AC-7.1, AC-4.5: Identifies wallets without recent payments', () => {
      it('should mark employees with 2+ months without payment as FIRED', async () => {
        // Arrange
        const threeMonthsAgo = new Date();
        threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

        const employeeWallets = [
          createMockWallet({
            id: 1,
            address: 'TEmployee1',
            classification: 'EMPLOYEE',
            lastPaymentAt: threeMonthsAgo, // 3 months ago
          }),
          createMockWallet({
            id: 2,
            address: 'TEmployee2',
            classification: 'EMPLOYEE',
            lastPaymentAt: new Date(), // Current month - should NOT be fired
          }),
        ];

        recipientWalletsService.getByClassification.mockResolvedValueOnce(employeeWallets);
        recipientWalletsService.markAsFired.mockResolvedValue(undefined);

        // Act
        const result = await service.checkEmploymentStatus();

        // Assert
        expect(result).toHaveLength(1);
        expect(result[0].walletAddress).toBe('TEmployee1');
        expect(result[0].monthsWithoutPayment).toBeGreaterThanOrEqual(2);
        expect(recipientWalletsService.markAsFired).toHaveBeenCalledTimes(1);
      });

      it('should not mark employees with recent payments', async () => {
        // Arrange
        const lastMonth = new Date();
        lastMonth.setMonth(lastMonth.getMonth() - 1);

        const employeeWallets = [
          createMockWallet({
            id: 1,
            address: 'TEmployee1',
            classification: 'EMPLOYEE',
            lastPaymentAt: lastMonth, // 1 month ago - should NOT be fired
          }),
        ];

        recipientWalletsService.getByClassification.mockResolvedValueOnce(employeeWallets);

        // Act
        const result = await service.checkEmploymentStatus();

        // Assert
        expect(result).toHaveLength(0);
        expect(recipientWalletsService.markAsFired).not.toHaveBeenCalled();
      });

      it('should return empty array when no employees exist', async () => {
        // Arrange
        recipientWalletsService.getByClassification.mockResolvedValueOnce([]);

        // Act
        const result = await service.checkEmploymentStatus();

        // Assert
        expect(result).toHaveLength(0);
      });
    });
  });

  /**
   * Classification Boundaries tests
   * Tests for boundary conditions and edge cases in the classification algorithm
   * @see AC-2.2 (span requirement), AC-3.1 (70% boundary)
   */
  describe('Classification Boundaries', () => {
    it('should classify as EMPLOYEE at exactly 70% regularity', async () => {
      // Arrange: 7 unique months over 10-month span = 70% exactly
      const walletAddress = 'TBoundary70123456789012345678901';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 6, // Will become 7 with new payment
        firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
      });

      // Payments in Jan, Feb, Mar, Apr, Jun, Aug (6 payments)
      const payments: PaymentInfo[] = [
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 0, 15)) }, // Jan (1)
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 1, 15)) }, // Feb (2)
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 2, 15)) }, // Mar (3)
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 3, 15)) }, // Apr (4)
        // Skip May
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 5, 15)) }, // Jun (5)
        // Skip Jul
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 7, 15)) }, // Aug (6)
        // Skip Sep
      ];

      // New payment in Oct (7th payment)
      const newPayment: PaymentInfo = {
        amount: '1000000000',
        timestamp: new Date(Date.UTC(2026, 9, 15)), // Oct (7)
      };
      // Span: Jan to Oct = 10 months
      // Unique: 7 months (Jan, Feb, Mar, Apr, Jun, Aug, Oct)
      // Regularity: 7/10 = 70% exactly

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert
      expect(result.classification).toBe('EMPLOYEE'); // >= 70% includes boundary
      expect(result.changed).toBe(true);
      expect(result.regularity).toBeCloseTo(0.7, 2);
    });

    it('should classify as FREELANCER just below 70% regularity', async () => {
      // Arrange: 6 unique months over 10-month span = 60% < 70%
      const walletAddress = 'TBoundary60123456789012345678901';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 5, // Will become 6 with new payment
        firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
      });

      // Payments in Jan, Feb, Apr, Jun, Aug (5 payments)
      const payments: PaymentInfo[] = [
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 0, 15)) }, // Jan (1)
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 1, 15)) }, // Feb (2)
        // Skip Mar
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 3, 15)) }, // Apr (3)
        // Skip May
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 5, 15)) }, // Jun (4)
        // Skip Jul
        { amount: '1000000000', timestamp: new Date(Date.UTC(2026, 7, 15)) }, // Aug (5)
      ];

      // New payment in Oct (6th payment)
      const newPayment: PaymentInfo = {
        amount: '1000000000',
        timestamp: new Date(Date.UTC(2026, 9, 15)), // Oct (6)
      };
      // Span: Jan to Oct = 10 months
      // Unique: 6 months (Jan, Feb, Apr, Jun, Aug, Oct)
      // Regularity: 6/10 = 60% < 70%

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert
      expect(result.classification).toBe('FREELANCER'); // < 70%
      expect(result.changed).toBe(true);
      expect(result.regularity).toBeCloseTo(0.6, 2);
    });

    it('should stay ONE_TIME when span < 3 months regardless of regularity', async () => {
      // Arrange: 2 payments in 2 consecutive months (100% regularity but span < 3)
      const walletAddress = 'TSpanShort12345678901234567890123';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 1,
        firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
      });

      const payments: PaymentInfo[] = [
        { amount: '600000000', timestamp: new Date(Date.UTC(2026, 0, 15)) }, // Jan
      ];

      const newPayment: PaymentInfo = {
        amount: '600000000',
        timestamp: new Date(Date.UTC(2026, 1, 15)), // Feb
      };
      // Span: Jan to Feb = 2 months (< 3)
      // Regularity: 2/2 = 100%
      // But span < 3 months, so should stay ONE_TIME

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert
      expect(result.classification).toBe('ONE_TIME'); // Span < 3 months
      expect(result.changed).toBe(false);
    });

    it('should stay ONE_TIME when 3+ payments but span < 3 months', async () => {
      // Arrange: 3 payments in 2-month span
      const walletAddress = 'TThreePayShort123456789012345678';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 2,
        firstSeenAt: new Date(Date.UTC(2026, 0, 5)), // Jan 5, 2026
      });

      const payments: PaymentInfo[] = [
        { amount: '600000000', timestamp: new Date(Date.UTC(2026, 0, 5)) }, // Jan 5
        { amount: '600000000', timestamp: new Date(Date.UTC(2026, 0, 15)) }, // Jan 15
      ];

      const newPayment: PaymentInfo = {
        amount: '600000000',
        timestamp: new Date(Date.UTC(2026, 1, 10)), // Feb 10
      };
      // 3 payments total
      // Span: Jan to Feb = 2 months (< 3)
      // Should stay ONE_TIME despite 3+ payments

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert
      expect(result.classification).toBe('ONE_TIME'); // Span < 3 months
      expect(result.changed).toBe(false);
    });

    it('should handle year boundary correctly in classification', async () => {
      // Arrange: Payments spanning Dec 2025 to Feb 2026 (3 months across year)
      const walletAddress = 'TYearBound123456789012345678901';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 2,
        firstSeenAt: new Date(Date.UTC(2025, 11, 15)), // Dec 15, 2025
      });

      const payments: PaymentInfo[] = [
        { amount: '700000000', timestamp: new Date(Date.UTC(2025, 11, 15)) }, // Dec 2025
        { amount: '700000000', timestamp: new Date(Date.UTC(2026, 0, 15)) }, // Jan 2026
      ];

      const newPayment: PaymentInfo = {
        amount: '700000000',
        timestamp: new Date(Date.UTC(2026, 1, 15)), // Feb 2026
      };
      // 3 payments
      // Span: Dec 2025 to Feb 2026 = 3 months
      // Regularity: 3/3 = 100%
      // Should classify as EMPLOYEE

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert
      expect(result.classification).toBe('EMPLOYEE');
      expect(result.changed).toBe(true);
      expect(result.regularity).toBeCloseTo(1.0, 2);
    });
  });

  describe('calculateRegularity', () => {
    // Helper to create timestamp for specific month
    const monthTimestamp = (year: number, month: number, day = 15): Date => {
      return new Date(Date.UTC(year, month - 1, day));
    };

    it('should return 100% regularity for consecutive months', () => {
      // Payments in Jan, Feb, Mar (3 months span, 3 unique months)
      const payments = [
        { timestamp: monthTimestamp(2026, 1) },
        { timestamp: monthTimestamp(2026, 2) },
        { timestamp: monthTimestamp(2026, 3) },
      ];
      const firstSeenAt = monthTimestamp(2026, 1);
      const referenceTimestamp = monthTimestamp(2026, 3).getTime();

      const result = service.calculateRegularity(payments, firstSeenAt, referenceTimestamp);

      expect(result.uniqueMonths).toBe(3);
      expect(result.spanMonths).toBe(3);
      expect(result.regularity).toBe(1.0); // 3/3 = 100%
    });

    it('should return 60% regularity for every other month pattern', () => {
      // Payments in Jan, Mar, May (5 months span, 3 unique months)
      const payments = [
        { timestamp: monthTimestamp(2026, 1) },
        { timestamp: monthTimestamp(2026, 3) },
        { timestamp: monthTimestamp(2026, 5) },
      ];
      const firstSeenAt = monthTimestamp(2026, 1);
      const referenceTimestamp = monthTimestamp(2026, 5).getTime();

      const result = service.calculateRegularity(payments, firstSeenAt, referenceTimestamp);

      expect(result.uniqueMonths).toBe(3);
      expect(result.spanMonths).toBe(5);
      expect(result.regularity).toBeCloseTo(0.6, 2); // 3/5 = 60%
    });

    it('should handle multiple payments in same month as 1 unique month', () => {
      // Multiple payments in January only
      const payments = [
        { timestamp: monthTimestamp(2026, 1, 5) },
        { timestamp: monthTimestamp(2026, 1, 15) },
        { timestamp: monthTimestamp(2026, 1, 25) },
      ];
      const firstSeenAt = monthTimestamp(2026, 1, 5);
      const referenceTimestamp = monthTimestamp(2026, 1, 25).getTime();

      const result = service.calculateRegularity(payments, firstSeenAt, referenceTimestamp);

      expect(result.uniqueMonths).toBe(1);
      expect(result.spanMonths).toBe(1);
      expect(result.regularity).toBe(1.0); // 1/1 = 100%
    });

    it('should return 70% regularity at EMPLOYEE threshold boundary', () => {
      // Payments in 7 unique months over 10-month span
      const payments = [
        { timestamp: monthTimestamp(2026, 1) },
        { timestamp: monthTimestamp(2026, 2) },
        { timestamp: monthTimestamp(2026, 3) },
        { timestamp: monthTimestamp(2026, 4) },
        { timestamp: monthTimestamp(2026, 6) },
        { timestamp: monthTimestamp(2026, 8) },
        { timestamp: monthTimestamp(2026, 10) },
      ];
      const firstSeenAt = monthTimestamp(2026, 1);
      const referenceTimestamp = monthTimestamp(2026, 10).getTime();

      const result = service.calculateRegularity(payments, firstSeenAt, referenceTimestamp);

      expect(result.uniqueMonths).toBe(7);
      expect(result.spanMonths).toBe(10);
      expect(result.regularity).toBeCloseTo(0.7, 2); // 7/10 = 70%
    });

    it('should handle year boundary correctly in span calculation', () => {
      // Payments across year boundary: Dec 2025 -> Jan 2026 -> Feb 2026
      const payments = [
        { timestamp: monthTimestamp(2025, 12) }, // Dec 2025
        { timestamp: monthTimestamp(2026, 1) }, // Jan 2026
        { timestamp: monthTimestamp(2026, 2) }, // Feb 2026
      ];
      const firstSeenAt = monthTimestamp(2025, 12);
      const referenceTimestamp = monthTimestamp(2026, 2).getTime();

      const result = service.calculateRegularity(payments, firstSeenAt, referenceTimestamp);

      // Dec 2025 to Feb 2026 = 3 months span (Dec, Jan, Feb)
      expect(result.uniqueMonths).toBe(3);
      expect(result.spanMonths).toBe(3);
      expect(result.regularity).toBe(1.0); // 3/3 = 100%
    });
  });
});
