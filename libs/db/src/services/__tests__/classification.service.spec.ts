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
     * AC-4.3: When wallet has regular payments with stable amounts (within 20% variance
     * over 2-3 months), system shall classify as EMPLOYEE
     */
    describe('AC-4.3: Regular payments + stable amounts (<=20% variance) returns EMPLOYEE', () => {
      it('should return EMPLOYEE for stable payments over 2 months', async () => {
        // Arrange
        const walletAddress = 'TEmployee12345678901234567890123';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'ONE_TIME',
          totalPayments: 3,
        });

        // Payments with ~5% variance (well within 20%)
        const payments: PaymentInfo[] = [
          { amount: '5000000000', timestamp: new Date('2026-01-15') }, // 5000 USDT
          { amount: '5100000000', timestamp: new Date('2026-02-15') }, // 5100 USDT (+2%)
          { amount: '4900000000', timestamp: new Date('2026-03-15') }, // 4900 USDT (-2%)
        ];
        const newPayment: PaymentInfo = {
          amount: '5050000000',
          timestamp: new Date('2026-03-15'),
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('ONE_TIME');
      });
    });

    /**
     * AC-4.4: When wallet has >1 payment with high variance (>20%), system shall classify
     * as FREELANCER
     */
    describe('AC-4.4: Multiple payments + high variance (>20%) returns FREELANCER', () => {
      it('should return FREELANCER for varying amounts over 2 months', async () => {
        // Arrange
        const walletAddress = 'TFreelancer1234567890123456789012';
        const mockWallet = createMockWallet({
          address: walletAddress,
          classification: 'ONE_TIME',
          totalPayments: 3,
        });

        // Payments with >20% variance
        const payments: PaymentInfo[] = [
          { amount: '5000000000', timestamp: new Date('2026-01-15') }, // 5000 USDT
          { amount: '8000000000', timestamp: new Date('2026-02-15') }, // 8000 USDT (+60%)
          { amount: '3000000000', timestamp: new Date('2026-03-15') }, // 3000 USDT (-40%)
        ];
        const newPayment: PaymentInfo = {
          amount: '3000000000',
          timestamp: new Date('2026-03-15'),
        };

        recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

        // Act
        const result = await service.evaluateClassification(walletAddress, payments, newPayment);

        // Assert
        expect(result.classification).toBe('FREELANCER');
        expect(result.changed).toBe(true);
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

    it('should keep current classification when payments < 2', async () => {
      // Arrange
      const walletAddress = 'TExistingWallet12345678901234567';
      const mockWallet = createMockWallet({
        address: walletAddress,
        classification: 'ONE_TIME',
        totalPayments: 1,
      });

      const payments: PaymentInfo[] = [{ amount: '5000000000', timestamp: new Date('2026-01-15') }];
      const newPayment: PaymentInfo = {
        amount: '5000000000',
        timestamp: new Date('2026-01-20'),
      };

      recipientWalletsService.findByAddress.mockResolvedValueOnce(mockWallet);

      // Act
      const result = await service.evaluateClassification(walletAddress, payments, newPayment);

      // Assert
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

  describe('calculateVariance', () => {
    it('should return 0 for single amount', () => {
      const result = service.calculateVariance(['5000000000']);
      expect(result).toBe(0);
    });

    it('should return 0 for identical amounts', () => {
      const result = service.calculateVariance(['5000000000', '5000000000', '5000000000']);
      expect(result).toBe(0);
    });

    it('should calculate correct variance for varying amounts', () => {
      // amounts: 4000, 5000, 6000 => mean = 5000, stddev ~= 816.5
      // coefficient of variation = 816.5 / 5000 ~= 0.163
      const result = service.calculateVariance(['4000000000', '5000000000', '6000000000']);
      expect(result).toBeCloseTo(0.163, 2);
    });

    it('should return 0 for empty array', () => {
      const result = service.calculateVariance([]);
      expect(result).toBe(0);
    });
  });
});
