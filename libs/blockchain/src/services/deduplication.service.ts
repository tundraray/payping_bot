import { DbService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LRUCache } from 'lru-cache';
import type { BlockchainConfig } from '../config/blockchain.config';
import type { Transaction } from '../interfaces/transaction.interface';

/**
 * Service for transaction deduplication using two-tier strategy:
 * 1. LRU cache (fast path) - in-memory, bounded size
 * 2. Database (slow path) - persistent, used when cache misses
 *
 * Error handling strategy:
 * - isDuplicate: fail-open (returns false on DB error to not miss transactions)
 * - markProcessed: fail-fast (throws on DB error to ensure data integrity)
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);
  private readonly cache: LRUCache<string, boolean>;

  constructor(
    private readonly configService: ConfigService,
    private readonly dbService: DbService,
  ) {
    const config = this.configService.get<BlockchainConfig>('blockchain');
    if (!config) {
      throw new Error('Blockchain configuration not found');
    }

    this.cache = new LRUCache<string, boolean>({
      max: config.lruCache.maxSize,
      ttl: config.lruCache.ttlMs,
    });

    this.logger.log(
      `Initialized LRU cache with max size: ${config.lruCache.maxSize}, TTL: ${config.lruCache.ttlMs}ms`,
    );
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
    // Use get() instead of has() to update recency for LRU eviction
    if (this.cache.get(hash) !== undefined) {
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
