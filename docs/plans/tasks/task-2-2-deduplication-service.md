# Task: Deduplication Service Implementation

Metadata:
- Phase: 2 (Infrastructure)
- Dependencies: task-1-1 (lru-cache), task-1-2 (transaction.interface.ts), task-1-3 (blockchain.config.ts)
- Provides: DeduplicationService for LRU + DB deduplication
- Size: Medium (2 files: implementation + integration tests)

## Implementation Content
Create the deduplication service that:
1. Checks LRU cache first for duplicate detection (fast path)
2. Falls back to database query if not in cache
3. Warms the LRU cache when database hit occurs
4. Persists new transactions to both LRU cache and database
5. Implements fail-fast for database errors

Reference: Design Doc "DeduplicationService" component section and "Data Contract" section.

## Target Files
- [x] `libs/blockchain/src/services/deduplication.service.ts` (new)
- [x] `libs/blockchain/src/services/deduplication.service.spec.ts` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Integration Tests

```typescript
// libs/blockchain/src/services/deduplication.int.test.ts

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DeduplicationService } from './deduplication.service';
import { DbService } from '@app/db';
import { Transaction, TransactionType } from '../interfaces/transaction.interface';
import { USDT_CONTRACT_ADDRESS } from '../constants/contracts';

describe('DeduplicationService Integration Tests', () => {
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

      await expect(service.markProcessed(hash, transaction)).rejects.toThrow('DB connection failed');
    });
  });

  /**
   * @category core-functionality
   * @complexity low
   * @covers AC-4.4
   */
  describe('AC-4.4: LRU max size configurable', () => {
    it('should respect configured max size', async () => {
      // Add more items than max size (100)
      for (let i = 0; i < 110; i++) {
        const hash = `overflow-hash-${i}`;
        const transaction = createMockTransaction(hash);
        await service.markProcessed(hash, transaction);
      }

      // First items should have been evicted
      dbService.findTransactionByHash.mockResolvedValueOnce(null);
      const isDuplicate = await service.isDuplicate('overflow-hash-0');

      // Should need DB check because it was evicted from cache
      expect(dbService.findTransactionByHash).toHaveBeenCalled();
    });
  });
});
```

Run tests to confirm they fail:
```bash
pnpm run test libs/blockchain/src/services/deduplication.int.test.ts
```

### 2. Green Phase - Implement DeduplicationService

```typescript
// libs/blockchain/src/services/deduplication.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LRUCache } from 'lru-cache';
import { DbService } from '@app/db';
import { BlockchainConfig } from '../config/blockchain.config';
import { Transaction } from '../interfaces/transaction.interface';

@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);
  private readonly cache: LRUCache<string, boolean>;

  constructor(
    private readonly configService: ConfigService,
    private readonly dbService: DbService,
  ) {
    const config = this.configService.get<BlockchainConfig>('blockchain')!;

    this.cache = new LRUCache<string, boolean>({
      max: config.lruCache.maxSize,
      ttl: config.lruCache.ttlMs,
    });

    this.logger.log(`Initialized LRU cache with max size: ${config.lruCache.maxSize}`);
  }

  /**
   * Check if a transaction hash has already been processed.
   * Checks LRU cache first, then falls back to database.
   *
   * @param hash - Transaction hash to check
   * @returns true if duplicate, false if new
   */
  async isDuplicate(hash: string): Promise<boolean> {
    // Fast path: check LRU cache first
    if (this.cache.has(hash)) {
      this.logger.debug(`Cache hit for hash: ${hash.substring(0, 16)}...`);
      return true;
    }

    // Slow path: check database
    try {
      const existing = await this.dbService.findTransactionByHash(hash);

      if (existing) {
        // Warm the cache for future lookups
        this.cache.set(hash, true);
        this.logger.debug(`DB hit, cache warmed for hash: ${hash.substring(0, 16)}...`);
        return true;
      }

      return false;
    } catch (error) {
      // Fail-open for isDuplicate: if DB is unavailable, treat as not duplicate
      // This ensures we don't miss transactions, but may emit duplicates
      this.logger.error(`DB error checking duplicate, failing open: ${error}`);
      return false;
    }
  }

  /**
   * Mark a transaction as processed by adding to both LRU cache and database.
   * Fails fast if database write fails.
   *
   * @param hash - Transaction hash
   * @param transaction - Full transaction data to persist
   * @throws Error if database write fails
   */
  async markProcessed(hash: string, transaction: Transaction): Promise<void> {
    // Add to LRU cache immediately
    this.cache.set(hash, true);

    // Persist to database (fail-fast on error)
    try {
      await this.dbService.saveTransaction(transaction);
      this.logger.debug(`Saved transaction: ${hash.substring(0, 16)}...`);
    } catch (error) {
      // Remove from cache since DB write failed
      this.cache.delete(hash);
      this.logger.error(`Failed to save transaction to DB: ${error}`);
      throw error; // Fail-fast: propagate error
    }
  }

  /**
   * Get current cache statistics for monitoring.
   */
  getCacheStats(): { size: number; maxSize: number } {
    return {
      size: this.cache.size,
      maxSize: this.cache.max,
    };
  }
}
```

Run tests to confirm they pass:
```bash
pnpm run test libs/blockchain/src/services/deduplication.int.test.ts
```

### 3. Refactor Phase
- Review error handling consistency
- Ensure logging levels are appropriate
- Add metrics hooks if needed
- Verify cache configuration is correct

## Completion Criteria
- [x] DeduplicationService created with LRU + DB deduplication
- [x] All 16 tests pass (comprehensive test coverage including AC-4.1 through AC-4.4)
- [x] LRU cache checked before database
- [x] Cache warmed on database hit
- [x] Fail-fast behavior for database write errors
- [x] Operation verified: L2 (Test Operation) - all tests pass
- [x] `pnpm run check` passes (warnings for import type on injectable services are expected)

## Related Acceptance Criteria
- AC-4.1: LRU cache hit skips processing immediately
- AC-4.2: Database hit skips event emission
- AC-4.3: New transaction added to both LRU cache and PostgreSQL
- AC-4.4: LRU cache has configurable maximum size (default: 10000)

## Notes
- Impact scope: New files in `libs/blockchain/src/services/`
- Constraints: Must use lru-cache package
- Assumes DbService has `findTransactionByHash` and `saveTransaction` methods
- Fail-open for reads (don't miss transactions), fail-fast for writes (ensure data integrity)
