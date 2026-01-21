import { DbService } from '@app/db';
import { ConfigService } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';
import { type Transaction, TransactionType } from '../interfaces/transaction.interface';
import { DeduplicationService } from './deduplication.service';

describe('DeduplicationService', () => {
  let service: DeduplicationService;
  let dbService: jest.Mocked<DbService>;

  const mockConfig = {
    lruCache: {
      maxSize: 100,
      ttlMs: 3600000,
    },
  };

  const createMockTransaction = (hash: string): Transaction => ({
    hash,
    type: TransactionType.USDT,
    fromAddress: 'TFromAddress',
    toAddress: 'TToAddress',
    amount: '1000000',
    timestamp: Date.now(),
    blockNumber: 12345,
    contractAddress: USDT_CONTRACT_ADDRESS,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeduplicationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'blockchain') return mockConfig;
              return undefined;
            }),
          },
        },
        {
          provide: DbService,
          useValue: {
            findTransactionByHash: jest.fn(),
            saveTransaction: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<DeduplicationService>(DeduplicationService);
    dbService = module.get(DbService);
  });

  describe('constructor', () => {
    it('should initialize LRU cache with configured maxSize', () => {
      const stats = service.getCacheStats();
      expect(stats.maxSize).toBe(100);
    });

    it('should start with empty cache', () => {
      const stats = service.getCacheStats();
      expect(stats.size).toBe(0);
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-4.1
   */
  describe('AC-4.1: LRU cache hit skips processing', () => {
    it('should return true immediately when hash exists in LRU cache', async () => {
      const hash = 'cached-hash-123';
      const transaction = createMockTransaction(hash);

      // First, mark as processed to add to cache
      await service.markProcessed(hash, transaction);

      // Reset DB mock to ensure we're not hitting DB
      dbService.findTransactionByHash.mockClear();

      // Check duplicate - should hit cache
      const isDuplicate = await service.isDuplicate(hash);

      expect(isDuplicate).toBe(true);
      expect(dbService.findTransactionByHash).not.toHaveBeenCalled();
    });

    it('should not hit database when hash is in LRU cache', async () => {
      const hash = 'cached-only-hash';
      const transaction = createMockTransaction(hash);

      // Add to cache
      await service.markProcessed(hash, transaction);
      dbService.findTransactionByHash.mockClear();
      dbService.saveTransaction.mockClear();

      // Multiple checks should all hit cache
      for (let i = 0; i < 5; i++) {
        const result = await service.isDuplicate(hash);
        expect(result).toBe(true);
      }

      expect(dbService.findTransactionByHash).not.toHaveBeenCalled();
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-4.2
   */
  describe('AC-4.2: DB hit after LRU miss', () => {
    it('should check database when hash not in LRU cache', async () => {
      const hash = 'db-only-hash-456';
      const transaction = createMockTransaction(hash);

      dbService.findTransactionByHash.mockResolvedValueOnce(transaction);

      const isDuplicate = await service.isDuplicate(hash);

      expect(isDuplicate).toBe(true);
      expect(dbService.findTransactionByHash).toHaveBeenCalledWith(hash);
    });

    it('should warm LRU cache after database hit', async () => {
      const hash = 'warm-cache-hash-789';
      const transaction = createMockTransaction(hash);

      dbService.findTransactionByHash.mockResolvedValueOnce(transaction);

      // First call - hits DB
      await service.isDuplicate(hash);

      // Clear DB mock
      dbService.findTransactionByHash.mockClear();

      // Second call - should hit warmed cache
      const isDuplicate = await service.isDuplicate(hash);

      expect(isDuplicate).toBe(true);
      expect(dbService.findTransactionByHash).not.toHaveBeenCalled();
    });

    it('should return false when hash not in cache and not in database', async () => {
      const hash = 'new-transaction-hash';

      dbService.findTransactionByHash.mockResolvedValueOnce(null);

      const isDuplicate = await service.isDuplicate(hash);

      expect(isDuplicate).toBe(false);
      expect(dbService.findTransactionByHash).toHaveBeenCalledWith(hash);
    });
  });

  /**
   * @category core-functionality
   * @complexity medium
   * @covers AC-4.3
   */
  describe('AC-4.3: new transaction added to LRU + DB', () => {
    it('should return false for new transaction and add to both stores', async () => {
      const hash = 'new-hash-abc';
      const transaction = createMockTransaction(hash);

      dbService.findTransactionByHash.mockResolvedValueOnce(null);
      dbService.saveTransaction.mockResolvedValueOnce(undefined);

      // Check - should be new
      const isDuplicate = await service.isDuplicate(hash);
      expect(isDuplicate).toBe(false);

      // Mark as processed
      await service.markProcessed(hash, transaction);

      expect(dbService.saveTransaction).toHaveBeenCalledWith(transaction);

      // Now should be duplicate (in cache)
      dbService.findTransactionByHash.mockClear();
      const isDuplicateNow = await service.isDuplicate(hash);
      expect(isDuplicateNow).toBe(true);
      expect(dbService.findTransactionByHash).not.toHaveBeenCalled();
    });

    it('should throw error if database save fails (fail-fast)', async () => {
      const hash = 'fail-save-hash';
      const transaction = createMockTransaction(hash);

      dbService.saveTransaction.mockRejectedValueOnce(new Error('DB connection failed'));

      await expect(service.markProcessed(hash, transaction)).rejects.toThrow(
        'DB connection failed',
      );
    });

    it('should remove from cache if database save fails', async () => {
      const hash = 'rollback-hash';
      const transaction = createMockTransaction(hash);

      dbService.saveTransaction.mockRejectedValueOnce(new Error('DB connection failed'));

      try {
        await service.markProcessed(hash, transaction);
      } catch {
        // Expected to fail
      }

      // Hash should not be in cache after failed DB write
      dbService.findTransactionByHash.mockResolvedValueOnce(null);
      const isDuplicate = await service.isDuplicate(hash);
      expect(isDuplicate).toBe(false);
    });
  });

  /**
   * @category core-functionality
   * @complexity low
   * @covers AC-4.4
   */
  describe('AC-4.4: LRU max size configurable', () => {
    it('should respect configured max size and evict oldest entries', async () => {
      // Add more items than max size (100)
      for (let i = 0; i < 110; i++) {
        const hash = `overflow-hash-${i}`;
        const transaction = createMockTransaction(hash);
        await service.markProcessed(hash, transaction);
      }

      // First items should have been evicted
      dbService.findTransactionByHash.mockResolvedValueOnce(null);
      await service.isDuplicate('overflow-hash-0');

      // Should need DB check because it was evicted from cache
      expect(dbService.findTransactionByHash).toHaveBeenCalled();
    });

    it('should keep recently accessed items in cache', async () => {
      // Add items up to max size
      for (let i = 0; i < 100; i++) {
        const hash = `fill-hash-${i}`;
        const transaction = createMockTransaction(hash);
        await service.markProcessed(hash, transaction);
      }

      // Access the first item to make it recently used
      dbService.findTransactionByHash.mockClear();
      await service.isDuplicate('fill-hash-0');
      expect(dbService.findTransactionByHash).not.toHaveBeenCalled();

      // Add more items to cause eviction
      for (let i = 100; i < 110; i++) {
        const hash = `overflow-hash-${i}`;
        const transaction = createMockTransaction(hash);
        await service.markProcessed(hash, transaction);
      }

      // First item should still be in cache (LRU keeps recently accessed)
      dbService.findTransactionByHash.mockClear();
      const isDuplicate = await service.isDuplicate('fill-hash-0');
      expect(isDuplicate).toBe(true);
      expect(dbService.findTransactionByHash).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should return false (fail-open) when database query fails in isDuplicate', async () => {
      const hash = 'db-error-hash';

      dbService.findTransactionByHash.mockRejectedValueOnce(new Error('Database unavailable'));

      // Should fail-open: return false to not miss transactions
      const isDuplicate = await service.isDuplicate(hash);

      expect(isDuplicate).toBe(false);
    });

    it('should propagate error (fail-fast) when database write fails in markProcessed', async () => {
      const hash = 'write-error-hash';
      const transaction = createMockTransaction(hash);

      dbService.saveTransaction.mockRejectedValueOnce(new Error('Write failed'));

      await expect(service.markProcessed(hash, transaction)).rejects.toThrow('Write failed');
    });
  });

  describe('getCacheStats', () => {
    it('should return current cache size', async () => {
      const transaction = createMockTransaction('stats-hash-1');
      await service.markProcessed('stats-hash-1', transaction);

      const stats = service.getCacheStats();
      expect(stats.size).toBe(1);
    });

    it('should return configured max size', () => {
      const stats = service.getCacheStats();
      expect(stats.maxSize).toBe(100);
    });
  });
});
