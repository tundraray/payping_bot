/**
 * Analytics Performance Benchmark Tests
 *
 * These tests verify performance requirements under realistic load conditions:
 * - /analytics response time with 100 recipients (< 3 seconds)
 * - Query execution time with 6 months historical data (< 2 seconds)
 * - Aggregate calculation (< 500ms)
 * - Real-time transaction processing (< 200ms)
 *
 * Test Database Requirements:
 * - PostgreSQL test instance with sufficient performance
 * - DATABASE_URL environment variable set
 * - Clean database before running (or dedicated perf test database)
 *
 * Note: These tests create significant test data and may take longer to run.
 *
 * @see AC-1.1: /analytics responds within 3 seconds with 100 recipients
 * @see AC-5.4: Real-time processing < 200ms
 */

import { type Transaction, TransactionType } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import dbConfig from '../config/db.config';
import { DatabaseProvider, DRIZZLE, type DrizzleDB, SqlClientProvider } from '../database.provider';
import { monthlyPositions, recipientWallets, salaryHistory, transactions } from '../schema';
import { AnalyticsService } from '../services/analytics.service';
import { ClassificationService } from '../services/classification.service';
import {
  type RecipientWalletInput,
  RecipientWalletsService,
} from '../services/recipient-wallets.service';
import { TransactionsService } from '../services/transactions.service';

describe('Analytics Performance Benchmark Tests', () => {
  let module: TestingModule;
  let analyticsService: AnalyticsService;
  let recipientWalletsService: RecipientWalletsService;
  let transactionsService: TransactionsService;
  let db: DrizzleDB;

  const MONITORED_WALLET = 'TMonitoredWalletPerf123456789012';
  const PERFORMANCE_THRESHOLD_ANALYTICS = 3000; // 3 seconds
  const PERFORMANCE_THRESHOLD_QUERY = 2000; // 2 seconds
  const PERFORMANCE_THRESHOLD_AGGREGATE = 500; // 500ms
  const PERFORMANCE_THRESHOLD_REALTIME = 200; // 200ms

  // Test data factory
  const createTestTransaction = (index: number, yearMonth: string): Transaction => {
    const [year, month] = yearMonth.split('-').map(Number);
    const baseTimestamp = Date.UTC(year, month - 1, 1);
    const timestamp = baseTimestamp + index * 1000; // Each 1 second apart

    return {
      hash: `perf_test_hash_${yearMonth}_${index.toString().padStart(6, '0')}_${Math.random().toString(36).slice(2, 8)}`,
      type: TransactionType.USDT,
      fromAddress: MONITORED_WALLET,
      toAddress: `TRecipient${index.toString().padStart(4, '0')}____12345678901`,
      amount: `${(5000 + Math.floor(Math.random() * 1000)) * 1000000}`, // 5000-6000 USDT
      timestamp,
      blockNumber: 12345678 + index,
      contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    };
  };

  beforeAll(async () => {
    // Skip if no DATABASE_URL is set
    if (!process.env.DATABASE_URL) {
      console.warn('DATABASE_URL not set - skipping performance tests');
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
      providers: [
        SqlClientProvider,
        DatabaseProvider,
        TransactionsService,
        RecipientWalletsService,
        ClassificationService,
        AnalyticsService,
      ],
    }).compile();

    analyticsService = module.get<AnalyticsService>(AnalyticsService);
    recipientWalletsService = module.get<RecipientWalletsService>(RecipientWalletsService);
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

    // Clean tables in correct order
    await db.delete(salaryHistory);
    await db.delete(monthlyPositions);
    await db.delete(recipientWallets);
    await db.delete(transactions);
  });

  // Skip all tests if DATABASE_URL is not set
  const conditionalIt = process.env.DATABASE_URL ? it : it.skip;

  // ---------------------------------------------------------------------------
  // Standard Load Test: 10-20 Recipients
  // ---------------------------------------------------------------------------
  describe('Standard load: 10-20 recipients', () => {
    conditionalIt('should complete analytics retrieval quickly with 20 recipients', async () => {
      // Arrange: Create 20 recipients with transactions
      const yearMonth = '2026-01';
      const recipientCount = 20;

      for (let i = 0; i < recipientCount; i++) {
        const tx = createTestTransaction(i, yearMonth);

        await recipientWalletsService.upsertMany([
          {
            address: tx.toAddress,
            firstSeenAt: new Date(tx.timestamp),
            lastPaymentAt: new Date(tx.timestamp),
            classification: i % 4 === 0 ? 'EMPLOYEE' : i % 4 === 1 ? 'FREELANCER' : 'ONE_TIME',
          },
        ]);

        await transactionsService.save(tx);
      }

      // Calculate positions
      await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');
      await analyticsService.calculatePositionsWithinGroup(yearMonth, 'FREELANCER');
      await analyticsService.calculatePositionsWithinGroup(yearMonth, 'ONE_TIME');

      // Act: Measure query time
      const startTime = Date.now();
      const result = await analyticsService.getGroupedAnalytics(yearMonth);
      const duration = Date.now() - startTime;

      // Assert
      expect(result.employees.length).toBeGreaterThan(0);
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_AGGREGATE);

      console.log(`Standard load (20 recipients): ${duration}ms`);
    });
  });

  // ---------------------------------------------------------------------------
  // High Recipient Count: 100 Recipients - AC-1.1
  // ---------------------------------------------------------------------------
  describe('High recipient count: 100 recipients (AC-1.1)', () => {
    conditionalIt(
      'AC-1.1: should respond within 3 seconds with 100 recipients',
      async () => {
        // Arrange: Create 100 recipients with transactions
        const yearMonth = '2026-01';
        const recipientCount = 100;

        const txBatch: Transaction[] = [];
        const walletBatch: RecipientWalletInput[] = [];

        for (let i = 0; i < recipientCount; i++) {
          const tx = createTestTransaction(i, yearMonth);
          txBatch.push(tx);
          walletBatch.push({
            address: tx.toAddress,
            firstSeenAt: new Date(tx.timestamp),
            lastPaymentAt: new Date(tx.timestamp),
            classification:
              i % 5 === 0
                ? 'EMPLOYEE'
                : i % 5 === 1
                  ? 'FREELANCER'
                  : i % 5 === 2
                    ? 'ONE_TIME'
                    : 'UNKNOWN',
          });
        }

        // Batch insert wallets
        await recipientWalletsService.upsertMany(walletBatch);

        // Insert transactions
        for (const tx of txBatch) {
          await transactionsService.save(tx);
        }

        // Calculate positions for all classification types
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'FREELANCER');
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'ONE_TIME');
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'UNKNOWN');

        // Act: Measure total analytics retrieval time
        const startTime = Date.now();
        const result = await analyticsService.getGroupedAnalytics(yearMonth);
        const duration = Date.now() - startTime;

        // Assert
        const totalRecipients =
          result.employees.length +
          result.freelancers.length +
          result.oneTime.length +
          result.unknown.length;

        expect(totalRecipients).toBeGreaterThanOrEqual(recipientCount * 0.8); // Allow for classification distribution
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_ANALYTICS);

        console.log(`High load (100 recipients): ${duration}ms`);
        console.log(`  Employees: ${result.employees.length}`);
        console.log(`  Freelancers: ${result.freelancers.length}`);
        console.log(`  One-time: ${result.oneTime.length}`);
        console.log(`  Unknown: ${result.unknown.length}`);
      },
      30000,
    ); // 30 second timeout for data setup
  });

  // ---------------------------------------------------------------------------
  // Historical Data: 6 Months
  // ---------------------------------------------------------------------------
  describe('Historical data: 6 months', () => {
    conditionalIt(
      'should handle 6 months of data with acceptable query time',
      async () => {
        // Arrange: Create data for 6 months
        const months = ['2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01'];
        const recipientsPerMonth = 20;

        // Create a set of consistent recipients
        const recipientAddresses: string[] = [];
        for (let i = 0; i < recipientsPerMonth; i++) {
          recipientAddresses.push(`TRecipientHist${i.toString().padStart(4, '0')}_1234567890`);
        }

        // Create wallets
        const [year, month] = months[0].split('-').map(Number);
        const baseTimestamp = Date.UTC(year, month - 1, 1);
        await recipientWalletsService.upsertMany(
          recipientAddresses.map((address, i) => ({
            address,
            firstSeenAt: new Date(baseTimestamp + i * 1000),
            lastPaymentAt: new Date(baseTimestamp + i * 1000),
            classification: i % 3 === 0 ? 'EMPLOYEE' : 'FREELANCER',
          })),
        );

        // Create transactions for each month
        for (const yearMonth of months) {
          for (let i = 0; i < recipientsPerMonth; i++) {
            const [y, m] = yearMonth.split('-').map(Number);
            const timestamp = Date.UTC(y, m - 1, 1) + i * 1000;

            await transactionsService.save({
              hash: `hist_tx_${yearMonth}_${i}_${Math.random().toString(36).slice(2, 8)}`,
              type: TransactionType.USDT,
              fromAddress: MONITORED_WALLET,
              toAddress: recipientAddresses[i],
              amount: `${(5000 + Math.floor(Math.random() * 500)) * 1000000}`,
              timestamp,
              blockNumber: 12345678 + i,
              contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
            });
          }

          // Calculate positions for this month
          await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');
          await analyticsService.calculatePositionsWithinGroup(yearMonth, 'FREELANCER');
        }

        // Act: Query most recent month (which requires previous month comparison)
        const startTime = Date.now();
        const result = await analyticsService.getGroupedAnalytics('2026-01');
        const duration = Date.now() - startTime;

        // Assert
        expect(result.employees.length + result.freelancers.length).toBeGreaterThan(0);
        expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_QUERY);

        console.log(
          `Historical data (6 months, ${recipientsPerMonth} recipients/month): ${duration}ms`,
        );

        // Verify position changes are calculated (comparing with previous month)
        const hasPositionChanges = [...result.employees, ...result.freelancers].some(
          (r) => r.previousPosition !== null,
        );
        expect(hasPositionChanges).toBe(true);
      },
      60000,
    ); // 60 second timeout
  });

  // ---------------------------------------------------------------------------
  // Real-time Processing: Transaction Save - AC-5.4
  // ---------------------------------------------------------------------------
  describe('Real-time processing: transaction save (AC-5.4)', () => {
    conditionalIt('AC-5.4: should process transaction within 200ms', async () => {
      // Arrange: Create a single transaction
      const recipient = 'TRecipientRealtime12345678901234';
      const tx = {
        hash: `realtime_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: TransactionType.USDT,
        fromAddress: MONITORED_WALLET,
        toAddress: recipient,
        amount: '5000000000',
        timestamp: Date.now(),
        blockNumber: 12345678,
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      };

      await transactionsService.save(tx);

      // Act: Process transaction for analytics
      const startTime = Date.now();
      const result = await analyticsService.processTransaction(tx);
      const duration = Date.now() - startTime;

      // Assert
      expect(result).not.toBeNull();
      expect(result!.walletAddress).toBe(recipient);
      expect(result!.processingTimeMs).toBeDefined();
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_REALTIME);

      console.log(`Real-time processing: ${duration}ms (reported: ${result!.processingTimeMs}ms)`);
    });

    conditionalIt('should maintain performance with existing wallet updates', async () => {
      // Arrange: Create wallet with existing data
      const recipient = 'TRecipientExisting12345678901234';
      const jan2026Start = Date.UTC(2026, 0, 1);

      await recipientWalletsService.upsertMany([
        {
          address: recipient,
          firstSeenAt: new Date(jan2026Start),
          lastPaymentAt: new Date(jan2026Start + 86400000),
          totalPayments: 5,
          lastAmount: '5000000000',
          classification: 'EMPLOYEE',
        },
      ]);

      // Create existing transaction
      await transactionsService.save({
        hash: `existing_tx_${Date.now()}`,
        type: TransactionType.USDT,
        fromAddress: MONITORED_WALLET,
        toAddress: recipient,
        amount: '5000000000',
        timestamp: jan2026Start + 86400000,
        blockNumber: 12345678,
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      });

      // New transaction
      const newTx = {
        hash: `new_tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        type: TransactionType.USDT,
        fromAddress: MONITORED_WALLET,
        toAddress: recipient,
        amount: '5100000000', // Slightly different amount
        timestamp: jan2026Start + 86400000 * 2,
        blockNumber: 12345679,
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      };

      await transactionsService.save(newTx);

      // Act
      const startTime = Date.now();
      const result = await analyticsService.processTransaction(newTx);
      const duration = Date.now() - startTime;

      // Assert
      expect(result).not.toBeNull();
      expect(result!.classification).toBe('EMPLOYEE');
      expect(duration).toBeLessThan(PERFORMANCE_THRESHOLD_REALTIME);

      console.log(`Update existing wallet: ${duration}ms`);
    });
  });

  // ---------------------------------------------------------------------------
  // Aggregate Calculation Performance
  // ---------------------------------------------------------------------------
  describe('Aggregate calculation performance', () => {
    conditionalIt(
      'should calculate aggregates within 500ms',
      async () => {
        // Arrange: Create wallets with positions already calculated
        const yearMonth = '2026-01';
        const recipientCount = 50;

        const [year, month] = yearMonth.split('-').map(Number);
        const baseTimestamp = Date.UTC(year, month - 1, 1);

        for (let i = 0; i < recipientCount; i++) {
          const address = `TRecipientAgg${i.toString().padStart(4, '0')}_123456789`;
          const timestamp = baseTimestamp + i * 1000;

          await recipientWalletsService.upsertMany([
            {
              address,
              firstSeenAt: new Date(timestamp),
              lastPaymentAt: new Date(timestamp),
              classification: 'EMPLOYEE',
            },
          ]);

          await transactionsService.save({
            hash: `agg_tx_${i}_${Math.random().toString(36).slice(2, 8)}`,
            type: TransactionType.USDT,
            fromAddress: MONITORED_WALLET,
            toAddress: address,
            amount: `${(5000 + i * 100) * 1000000}`,
            timestamp,
            blockNumber: 12345678 + i,
            contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
          });
        }

        // Calculate positions
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');

        // Act: Multiple calls to test consistent performance
        const durations: number[] = [];
        for (let i = 0; i < 3; i++) {
          const startTime = Date.now();
          await analyticsService.getGroupedAnalytics(yearMonth);
          durations.push(Date.now() - startTime);
        }

        // Assert
        const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
        expect(avgDuration).toBeLessThan(PERFORMANCE_THRESHOLD_AGGREGATE);

        console.log(
          `Aggregate calculation (${recipientCount} recipients): avg ${avgDuration.toFixed(0)}ms [${durations.join(', ')}ms]`,
        );
      },
      30000,
    );
  });

  // ---------------------------------------------------------------------------
  // Query Execution Time Measurement
  // ---------------------------------------------------------------------------
  describe('Query execution time measurement', () => {
    conditionalIt('should document query execution times', async () => {
      // Arrange: Create test data
      const yearMonth = '2026-01';
      const recipientCount = 30;

      for (let i = 0; i < recipientCount; i++) {
        const tx = createTestTransaction(i, yearMonth);

        await recipientWalletsService.upsertMany([
          {
            address: tx.toAddress,
            firstSeenAt: new Date(tx.timestamp),
            lastPaymentAt: new Date(tx.timestamp),
            classification: 'EMPLOYEE',
          },
        ]);

        await transactionsService.save(tx);
      }

      // Measure position calculation
      const posCalcStart = Date.now();
      await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');
      const posCalcDuration = Date.now() - posCalcStart;

      // Measure grouped analytics retrieval
      const analyticsStart = Date.now();
      const result = await analyticsService.getGroupedAnalytics(yearMonth);
      const analyticsDuration = Date.now() - analyticsStart;

      // Document results
      console.log('=== Query Execution Times ===');
      console.log(`Position calculation (${recipientCount} recipients): ${posCalcDuration}ms`);
      console.log(`Grouped analytics retrieval: ${analyticsDuration}ms`);
      console.log(`Results: ${result.employees.length} employees`);
      console.log('=============================');

      // Basic assertions
      expect(result.employees.length).toBe(recipientCount);
      expect(posCalcDuration).toBeLessThan(PERFORMANCE_THRESHOLD_QUERY);
      expect(analyticsDuration).toBeLessThan(PERFORMANCE_THRESHOLD_AGGREGATE);
    });
  });
});
