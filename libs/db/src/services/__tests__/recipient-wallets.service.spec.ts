import { Test, type TestingModule } from '@nestjs/testing';
import { DRIZZLE, type DrizzleDB } from '../../database.provider';
import {
  type Classification,
  type RecipientWalletInput,
  RecipientWalletsService,
} from '../recipient-wallets.service';

describe('RecipientWalletsService', () => {
  let service: RecipientWalletsService;
  let mockDb: jest.Mocked<Partial<DrizzleDB>>;

  // Mock wallet data for testing
  const mockWallet = {
    id: 1,
    address: 'TXyzTestWalletAddress12345678901234',
    classification: 'UNKNOWN' as Classification,
    firstSeenAt: new Date('2026-01-01'),
    lastPaymentAt: new Date('2026-01-15'),
    totalPayments: 3,
    lastAmount: '5000000000',
    hiredAt: null,
    firedAt: null,
    monthsWithoutPayment: 0,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
  };

  beforeEach(async () => {
    // Create mock database
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecipientWalletsService,
        {
          provide: DRIZZLE,
          useValue: mockDb,
        },
      ],
    }).compile();

    service = module.get<RecipientWalletsService>(RecipientWalletsService);
  });

  describe('findByAddress', () => {
    it('should return wallet when found', async () => {
      // Arrange
      const address = 'TXyzTestWalletAddress12345678901234';
      (mockDb.limit as jest.Mock).mockResolvedValueOnce([mockWallet]);

      // Act
      const result = await service.findByAddress(address);

      // Assert
      expect(result).toEqual(mockWallet);
      expect(mockDb.select).toHaveBeenCalled();
      expect(mockDb.from).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(1);
    });

    it('should return null when wallet not found', async () => {
      // Arrange
      const address = 'TNotFoundAddress1234567890123456';
      (mockDb.limit as jest.Mock).mockResolvedValueOnce([]);

      // Act
      const result = await service.findByAddress(address);

      // Assert
      expect(result).toBeNull();
    });

    it('should throw error on database failure (fail-fast)', async () => {
      // Arrange
      const address = 'TXyzTestWalletAddress12345678901234';
      const dbError = new Error('Database connection failed');
      (mockDb.limit as jest.Mock).mockRejectedValueOnce(dbError);

      // Act & Assert
      await expect(service.findByAddress(address)).rejects.toThrow('Database connection failed');
    });
  });

  describe('upsertMany', () => {
    it('should create new wallet when address not found (AC-3.1)', async () => {
      // Arrange
      const input: RecipientWalletInput = {
        address: 'TNewWalletAddress123456789012345',
        firstSeenAt: new Date('2026-01-20'),
        lastPaymentAt: new Date('2026-01-20'),
        totalPayments: 1,
        lastAmount: '5000000000',
        classification: 'ONE_TIME',
      };

      const newWallet = { ...mockWallet, ...input, id: 2 };

      // findByAddress returns null (wallet not found)
      (mockDb.limit as jest.Mock).mockResolvedValueOnce([]);
      // insert returns created wallet
      (mockDb.returning as jest.Mock).mockResolvedValueOnce([newWallet]);

      // Act
      const result = await service.upsertMany([input]);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].address).toBe(input.address);
      expect(mockDb.insert).toHaveBeenCalled();
    });

    it('should update existing wallet (AC-3.2, AC-3.3)', async () => {
      // Arrange
      const input: RecipientWalletInput = {
        address: mockWallet.address,
        firstSeenAt: new Date('2026-01-01'),
        lastPaymentAt: new Date('2026-01-25'),
        totalPayments: 4,
        lastAmount: '6000000000',
      };

      const updatedWallet = { ...mockWallet, ...input };

      // findByAddress returns existing wallet
      (mockDb.limit as jest.Mock).mockResolvedValueOnce([mockWallet]);
      // update returns updated wallet
      (mockDb.returning as jest.Mock).mockResolvedValueOnce([updatedWallet]);

      // Act
      const result = await service.upsertMany([input]);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].lastAmount).toBe('6000000000');
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('updateLastPayment', () => {
    it('should update lastAmount and lastPaymentAt (AC-3.3)', async () => {
      // Arrange
      const address = mockWallet.address;
      const amount = '7000000000';
      const paymentAt = new Date('2026-01-26');

      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.updateLastPayment(address, amount, paymentAt);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
      expect(mockDb.where).toHaveBeenCalled();
    });
  });

  describe('updateClassification', () => {
    it('should update classification', async () => {
      // Arrange
      const address = mockWallet.address;
      const classification: Classification = 'EMPLOYEE';

      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.updateClassification(address, classification);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('markAsFired (AC-7.2)', () => {
    it('should set firedAt timestamp and classification to FIRED', async () => {
      // Arrange
      const address = mockWallet.address;
      const firedAt = new Date('2026-03-01');

      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.markAsFired(address, firedAt);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('markAsRehired (AC-7.3)', () => {
    it('should clear firedAt, set classification to EMPLOYEE, and update hiredAt', async () => {
      // Arrange
      const address = mockWallet.address;
      const newAmount = '8000000000';

      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.markAsRehired(address, newAmount);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalled();
    });
  });

  describe('incrementMonthsWithoutPayment', () => {
    it('should do nothing when addresses array is empty', async () => {
      // Act
      await service.incrementMonthsWithoutPayment([]);

      // Assert
      expect(mockDb.update).not.toHaveBeenCalled();
    });

    it('should increment counter for provided addresses', async () => {
      // Arrange
      const addresses = ['TAddress1', 'TAddress2'];
      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.incrementMonthsWithoutPayment(addresses);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('resetMonthsWithoutPayment', () => {
    it('should reset counter to 0', async () => {
      // Arrange
      const address = mockWallet.address;
      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.resetMonthsWithoutPayment(address);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
    });
  });

  describe('getAll', () => {
    it('should return all wallets', async () => {
      // Arrange
      const wallets = [mockWallet, { ...mockWallet, id: 2, address: 'TSecondWallet' }];
      (mockDb.from as jest.Mock).mockResolvedValueOnce(wallets);

      // Act
      const result = await service.getAll();

      // Assert
      expect(result).toHaveLength(2);
      expect(mockDb.select).toHaveBeenCalled();
    });
  });

  describe('getByClassification', () => {
    it('should return wallets with matching classification', async () => {
      // Arrange
      const classification: Classification = 'EMPLOYEE';
      const employeeWallets = [{ ...mockWallet, classification: 'EMPLOYEE' }];
      (mockDb.where as jest.Mock).mockResolvedValueOnce(employeeWallets);

      // Act
      const result = await service.getByClassification(classification);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].classification).toBe('EMPLOYEE');
    });
  });

  describe('incrementTotalPayments', () => {
    it('should increment total payments counter', async () => {
      // Arrange
      const address = mockWallet.address;
      (mockDb.where as jest.Mock).mockResolvedValueOnce(undefined);

      // Act
      await service.incrementTotalPayments(address);

      // Assert
      expect(mockDb.update).toHaveBeenCalled();
    });
  });
});
