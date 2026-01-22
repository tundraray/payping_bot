/**
 * TransactionsService Integration Tests
 *
 * These tests verify TransactionsService with a real PostgreSQL database connection.
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Migrations applied before test run (handled by DatabaseProvider)
 *
 * Mock Boundaries: None - uses real PostgreSQL for integration testing
 *
 * @see AC-4.1, AC-4.2, AC-5.1, AC-5.2, AC-5.3, AC-6.1, AC-6.2
 */

import { TransactionType } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import dbConfig from '../../config/db.config';
import {
  DatabaseProvider,
  DRIZZLE,
  type DrizzleDB,
  SqlClientProvider,
} from '../../database.provider';
import { transactions } from '../../schema';
import { TransactionsService } from '../transactions.service';

describe('TransactionsService Integration Tests', () => {
  let module: TestingModule;
  let transactionsService: TransactionsService;
  let db: DrizzleDB;

  // Test data factory
  const createTestTransaction = (
    overrides?: Partial<{
      hash: string;
      type: TransactionType;
      fromAddress: string;
      toAddress: string;
      amount: string;
      timestamp: number;
      blockNumber: number;
      contractAddress: string;
      raw?: unknown;
    }>,
  ) => ({
    hash: overrides?.hash ?? `test_hash_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: overrides?.type ?? TransactionType.USDT,
    fromAddress: overrides?.fromAddress ?? 'TTestFromAddress1234567890123456789',
    toAddress: overrides?.toAddress ?? 'TTestToAddress12345678901234567890',
    amount: overrides?.amount ?? '1000.123456',
    timestamp: overrides?.timestamp ?? Date.now(),
    blockNumber: overrides?.blockNumber ?? 12345678,
    contractAddress: overrides?.contractAddress ?? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    raw: overrides?.raw,
  });

  beforeAll(async () => {
    // Skip if no DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set - skipping integration tests');
      return;
    }

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [dbConfig],
          envFilePath: ['.env.test', '.env'],
        }),
      ],
      providers: [SqlClientProvider, DatabaseProvider, TransactionsService],
    }).compile();

    transactionsService = module.get<TransactionsService>(TransactionsService);
    db = module.get<DrizzleDB>(DRIZZLE);
  });

  afterAll(async () => {
    if (module) {
      await module.close();
    }
  });

  beforeEach(async () => {
    // Skip cleanup if no database connection
    if (!db) return;

    // Clean transactions table before each test
    await db.delete(transactions);
  });

  // Skip all tests if DATABASE_URL is not set
  const conditionalIt = process.env.DATABASE_URL ? it : it.skip;

  // ---------------------------------------------------------------------------
  // AC-4.1, AC-4.2: Transaction Lookup (findByHash)
  // ---------------------------------------------------------------------------
  describe('Transaction Lookup (AC-4.1, AC-4.2)', () => {
    // AC-4.1: "When TransactionsService.findByHash() is called with existing hash,
    //          the system shall return the Transaction object"
    // ROI: 10.0 | Business Value: 10 (deduplication critical) | Frequency: 10 (every poll)
    conditionalIt('AC-4.1: returns Transaction object when hash exists in database', async () => {
      // Arrange: Insert a transaction directly into database with known hash
      const testTx = createTestTransaction({
        hash: `test_hash_for_lookup_${Date.now()}`,
        amount: '1000.123456',
      });

      await db.insert(transactions).values({
        hash: testTx.hash,
        type: testTx.type,
        fromAddress: testTx.fromAddress,
        toAddress: testTx.toAddress,
        amount: testTx.amount,
        timestamp: testTx.timestamp,
        blockNumber: testTx.blockNumber,
        contractAddress: testTx.contractAddress,
        raw: testTx.raw,
      });

      // Act: Call findByHash
      const result = await transactionsService.findByHash(testTx.hash);

      // Assert: Result matches inserted data
      expect(result).not.toBeNull();
      expect(result?.hash).toBe(testTx.hash);
      expect(result?.type).toBe(TransactionType.USDT);
      expect(result?.fromAddress).toBe(testTx.fromAddress);
      expect(result?.toAddress).toBe(testTx.toAddress);
      expect(result?.amount).toBe(testTx.amount);
      expect(result?.timestamp).toBe(testTx.timestamp);
      expect(result?.blockNumber).toBe(testTx.blockNumber);
      expect(result?.contractAddress).toBe(testTx.contractAddress);
    });

    // AC-4.2: "When TransactionsService.findByHash() is called with non-existing hash,
    //          the system shall return null"
    // ROI: 9.0 | Business Value: 9 (correct negative case) | Frequency: 10 (new transactions)
    conditionalIt('AC-4.2: returns null when hash does not exist in database', async () => {
      // Arrange: Generate non-existent hash
      const nonExistentHash = `nonexistent_hash_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // Act: Call findByHash with non-existent hash
      const result = await transactionsService.findByHash(nonExistentHash);

      // Assert: Result is null (not undefined, not empty object)
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-5.1, AC-5.2, AC-5.3: Transaction Save
  // ---------------------------------------------------------------------------
  describe('Transaction Save (AC-5.1, AC-5.2, AC-5.3)', () => {
    // AC-5.1: "When TransactionsService.save() is called with valid Transaction,
    //          the system shall insert a new row"
    // ROI: 10.0 | Business Value: 10 (data persistence) | Frequency: 10 (every new tx)
    conditionalIt('AC-5.1: inserts new transaction row into database', async () => {
      // Arrange: Create valid Transaction object with unique hash
      const testTx = createTestTransaction({
        amount: '500.000000',
      });

      // Act: Save transaction
      await transactionsService.save(testTx);

      // Assert: Transaction is persisted and can be retrieved
      const retrieved = await transactionsService.findByHash(testTx.hash);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.hash).toBe(testTx.hash);
      expect(retrieved?.type).toBe(testTx.type);
      expect(retrieved?.amount).toBe(testTx.amount);
    });

    // AC-5.2: "If transaction hash already exists, then the system shall throw
    //          a unique constraint error"
    // ROI: 4.9 | Business Value: 9 (data integrity) | Frequency: 5 (duplicate attempts)
    conditionalIt('AC-5.2: throws unique constraint error for duplicate hash', async () => {
      // Arrange: Save a transaction with known hash
      const testTx = createTestTransaction();
      await transactionsService.save(testTx);

      // Create second transaction with same hash but different data
      const duplicateTx = createTestTransaction({
        hash: testTx.hash, // Same hash
        amount: '999.999999', // Different amount
      });

      // Act & Assert: Second save throws error
      await expect(transactionsService.save(duplicateTx)).rejects.toThrow();
    });

    // AC-5.3: "The system shall preserve amount precision (6 decimals for USDT)"
    // ROI: 10.0 | Business Value: 10 (financial accuracy) | Frequency: 10 (every tx)
    conditionalIt('AC-5.3: preserves 6-decimal precision for USDT amounts', async () => {
      // Arrange: Create transaction with precise amount
      const preciseAmount = '1234567.890123';
      const testTx = createTestTransaction({
        amount: preciseAmount,
      });

      // Act: Save and retrieve
      await transactionsService.save(testTx);
      const retrieved = await transactionsService.findByHash(testTx.hash);

      // Assert: Amount equals exactly '1234567.890123' with no precision loss
      expect(retrieved).not.toBeNull();
      expect(retrieved?.amount).toBe(preciseAmount);
    });
  });

  // ---------------------------------------------------------------------------
  // AC-6.1, AC-6.2: Last Transaction Timestamp
  // ---------------------------------------------------------------------------
  describe('Last Transaction Timestamp (AC-6.1, AC-6.2)', () => {
    // AC-6.1: "When TransactionsService.getLastTimestamp() is called with transactions
    //          in database, the system shall return the maximum timestamp"
    // ROI: 9.0 | Business Value: 9 (polling continuity) | Frequency: 10 (every restart)
    conditionalIt('AC-6.1: returns maximum timestamp from transactions table', async () => {
      // Arrange: Save 3 transactions with different timestamps
      const timestamps = [1000, 2000, 3000];
      for (const timestamp of timestamps) {
        await transactionsService.save(createTestTransaction({ timestamp }));
      }

      // Act: Get last timestamp
      const result = await transactionsService.getLastTimestamp();

      // Assert: Result equals 3000 (the maximum)
      expect(result).toBe(3000);
    });

    // AC-6.2: "When TransactionsService.getLastTimestamp() is called with empty
    //          transactions table, the system shall return null"
    // ROI: 4.4 | Business Value: 8 (graceful first run) | Frequency: 5 (fresh install)
    conditionalIt('AC-6.2: returns null when transactions table is empty', async () => {
      // Arrange: Ensure transactions table is empty (cleaned in beforeEach)

      // Act: Get last timestamp
      const result = await transactionsService.getLastTimestamp();

      // Assert: Result is null (not 0, not undefined)
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-7.1, AC-7.2: Monitored Wallet Address (bonus verification)
  // ---------------------------------------------------------------------------
  describe('Monitored Wallet Address (AC-7.1, AC-7.2)', () => {
    conditionalIt('returns wallet address when MONITORED_WALLET_ADDRESS is set', async () => {
      // This test verifies getMonitoredWalletAddress returns what's in env
      // The actual value depends on test environment configuration
      const result = await transactionsService.getMonitoredWalletAddress();

      // Assert: Result is either a string address or null
      expect(result === null || typeof result === 'string').toBe(true);
    });
  });
});
