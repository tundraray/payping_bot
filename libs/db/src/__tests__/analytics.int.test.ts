/**
 * Analytics Integration Tests
 *
 * These tests verify the analytics feature with real database interactions,
 * including position calculation, classification changes, salary detection,
 * and fired status detection.
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Migrations applied before test run (handled by DatabaseProvider)
 *
 * Mock Boundaries: None - uses real PostgreSQL for integration testing
 *
 * @see AC-2.3, AC-2.4, AC-2.5: Position calculation
 * @see AC-4.1 through AC-4.6: Classification logic
 * @see AC-5.1 through AC-5.4: Real-time processing
 * @see AC-6.1: Salary change detection
 * @see AC-7.1: Fired status detection
 */

import { type Transaction, TransactionType } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import dbConfig from '../config/db.config';
import { DatabaseProvider, DRIZZLE, type DrizzleDB, SqlClientProvider } from '../database.provider';
import { monthlyPositions, recipientWallets, salaryHistory, transactions } from '../schema';
import { AnalyticsService } from '../services/analytics.service';
import { ClassificationService } from '../services/classification.service';
import { RecipientWalletsService } from '../services/recipient-wallets.service';
import { TransactionsService } from '../services/transactions.service';

describe('Analytics Integration Tests', () => {
  let module: TestingModule;
  let analyticsService: AnalyticsService;
  let classificationService: ClassificationService;
  let recipientWalletsService: RecipientWalletsService;
  let transactionsService: TransactionsService;
  let db: DrizzleDB;

  const MONITORED_WALLET = 'TMonitoredWallet1234567890123456';

  // Test data factory
  const createTestTransaction = (overrides?: Partial<Transaction>): Transaction => ({
    hash: overrides?.hash ?? `test_hash_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    type: overrides?.type ?? TransactionType.USDT,
    fromAddress: overrides?.fromAddress ?? MONITORED_WALLET,
    toAddress: overrides?.toAddress ?? `TRecipient${Date.now().toString(36)}12345678901`,
    amount: overrides?.amount ?? '5000000000', // 5000 USDT in raw format
    timestamp: overrides?.timestamp ?? Date.now(),
    blockNumber: overrides?.blockNumber ?? 12345678,
    contractAddress: overrides?.contractAddress ?? 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
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
    classificationService = module.get<ClassificationService>(ClassificationService);
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

    // Clean tables in correct order (foreign key constraints)
    await db.delete(salaryHistory);
    await db.delete(monthlyPositions);
    await db.delete(recipientWallets);
    await db.delete(transactions);
  });

  // Skip all tests if DATABASE_URL is not set
  const conditionalIt = process.env.DATABASE_URL ? it : it.skip;

  // ---------------------------------------------------------------------------
  // Position Calculation Integration (AC-2.3, AC-2.4, AC-2.5)
  // ---------------------------------------------------------------------------
  describe('Position Calculation (AC-2.3, AC-2.4, AC-2.5)', () => {
    /**
     * AC-2.3: System shall sort recipients by first payment timestamp within month
     */
    conditionalIt('AC-2.3: calculates positions based on first payment timestamp', async () => {
      // Arrange: Create transactions with different timestamps
      const jan2026Start = Date.UTC(2026, 0, 1);
      const yearMonth = '2026-01';

      // Create 3 recipients with different first payment timestamps
      const recipient1 = 'TRecipient1First12345678901234567';
      const recipient2 = 'TRecipient2Second123456789012345';
      const recipient3 = 'TRecipient3Third1234567890123456';

      // First create recipient wallets
      await recipientWalletsService.upsertMany([
        {
          address: recipient1,
          firstSeenAt: new Date(jan2026Start + 1000),
          lastPaymentAt: new Date(jan2026Start + 1000),
          classification: 'EMPLOYEE',
        },
        {
          address: recipient2,
          firstSeenAt: new Date(jan2026Start + 2000),
          lastPaymentAt: new Date(jan2026Start + 2000),
          classification: 'EMPLOYEE',
        },
        {
          address: recipient3,
          firstSeenAt: new Date(jan2026Start + 3000),
          lastPaymentAt: new Date(jan2026Start + 3000),
          classification: 'EMPLOYEE',
        },
      ]);

      // Create transactions (recipient 2 pays first, then 1, then 3)
      await transactionsService.save(
        createTestTransaction({
          toAddress: recipient2,
          timestamp: jan2026Start + 1000, // First
          amount: '3000000000',
        }),
      );
      await transactionsService.save(
        createTestTransaction({
          toAddress: recipient1,
          timestamp: jan2026Start + 2000, // Second
          amount: '5000000000',
        }),
      );
      await transactionsService.save(
        createTestTransaction({
          toAddress: recipient3,
          timestamp: jan2026Start + 3000, // Third
          amount: '4000000000',
        }),
      );

      // Act: Calculate positions
      await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');

      // Assert: Positions are based on timestamp order
      const result = await analyticsService.getGroupedAnalytics(yearMonth);

      expect(result.employees.length).toBe(3);
      expect(result.employees[0].walletAddress).toBe(recipient2);
      expect(result.employees[0].position).toBe(1);
      expect(result.employees[1].walletAddress).toBe(recipient1);
      expect(result.employees[1].position).toBe(2);
      expect(result.employees[2].walletAddress).toBe(recipient3);
      expect(result.employees[2].position).toBe(3);
    });

    /**
     * AC-2.4: System shall aggregate multiple payments to same recipient in single month
     */
    conditionalIt(
      'AC-2.4: aggregates multiple payments to same recipient in single position',
      async () => {
        // Arrange
        const jan2026Start = Date.UTC(2026, 0, 1);
        const yearMonth = '2026-01';
        const recipient = 'TRecipientMultiPay12345678901234';

        // Create wallet
        await recipientWalletsService.upsertMany([
          {
            address: recipient,
            firstSeenAt: new Date(jan2026Start + 1000),
            lastPaymentAt: new Date(jan2026Start + 3000),
            classification: 'EMPLOYEE',
          },
        ]);

        // Create multiple transactions to same recipient
        await transactionsService.save(
          createTestTransaction({
            toAddress: recipient,
            timestamp: jan2026Start + 1000,
            amount: '1000000000', // 1000 USDT
          }),
        );
        await transactionsService.save(
          createTestTransaction({
            toAddress: recipient,
            timestamp: jan2026Start + 2000,
            amount: '2000000000', // 2000 USDT
          }),
        );
        await transactionsService.save(
          createTestTransaction({
            toAddress: recipient,
            timestamp: jan2026Start + 3000,
            amount: '500000000', // 500 USDT
          }),
        );

        // Act: Calculate positions
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');

        // Assert: Single position with aggregated amount
        const result = await analyticsService.getGroupedAnalytics(yearMonth);

        expect(result.employees.length).toBe(1);
        expect(result.employees[0].walletAddress).toBe(recipient);
        // Amount should be aggregated: 1000 + 2000 + 500 = 3500 USDT (3500000000)
        const totalAmount = Number.parseFloat(result.employees[0].amount);
        expect(totalAmount).toBeCloseTo(3500000000, 0);
      },
    );

    /**
     * AC-2.5: System shall use transaction hash for deterministic ordering when timestamps match
     */
    conditionalIt(
      'AC-2.5: uses transaction hash for deterministic ordering on timestamp tie',
      async () => {
        // Arrange
        const jan2026Start = Date.UTC(2026, 0, 1);
        const yearMonth = '2026-01';
        const sameTimestamp = jan2026Start + 1000;

        // Create two recipients with same timestamp but different hashes
        const recipient1 = 'TRecipientTie1_1234567890123456';
        const recipient2 = 'TRecipientTie2_1234567890123456';

        await recipientWalletsService.upsertMany([
          {
            address: recipient1,
            firstSeenAt: new Date(sameTimestamp),
            lastPaymentAt: new Date(sameTimestamp),
            classification: 'EMPLOYEE',
          },
          {
            address: recipient2,
            firstSeenAt: new Date(sameTimestamp),
            lastPaymentAt: new Date(sameTimestamp),
            classification: 'EMPLOYEE',
          },
        ]);

        // Hash starting with 'a' should come before 'z' alphabetically
        await transactionsService.save(
          createTestTransaction({
            hash: 'z_hash_should_be_second_______________________________________',
            toAddress: recipient1,
            timestamp: sameTimestamp,
          }),
        );
        await transactionsService.save(
          createTestTransaction({
            hash: 'a_hash_should_be_first________________________________________',
            toAddress: recipient2,
            timestamp: sameTimestamp,
          }),
        );

        // Act: Calculate positions
        await analyticsService.calculatePositionsWithinGroup(yearMonth, 'EMPLOYEE');

        // Assert: Hash determines order when timestamps tie
        const result = await analyticsService.getGroupedAnalytics(yearMonth);

        expect(result.employees.length).toBe(2);
        // Recipient2 has hash starting with 'a', should be position 1
        expect(result.employees[0].walletAddress).toBe(recipient2);
        expect(result.employees[1].walletAddress).toBe(recipient1);
      },
    );
  });

  // ---------------------------------------------------------------------------
  // Real-time Classification Update (AC-5.2)
  // ---------------------------------------------------------------------------
  describe('Real-time Classification (AC-5.2)', () => {
    /**
     * AC-5.2: System shall update classification immediately on transaction save
     */
    conditionalIt(
      'AC-5.2: updates classification from ONE_TIME to EMPLOYEE on consistent payments',
      async () => {
        // Arrange: Create wallet with ONE_TIME classification
        const recipient = 'TRecipientToEmployee12345678901';
        const jan2026Start = Date.UTC(2026, 0, 1);
        const feb2026Start = Date.UTC(2026, 1, 1);

        // Create transaction for January
        const tx1 = createTestTransaction({
          toAddress: recipient,
          timestamp: jan2026Start + 1000,
          amount: '5000000000',
        });
        await transactionsService.save(tx1);

        // Process first transaction
        await analyticsService.processTransaction(tx1);

        // Verify initial classification is ONE_TIME
        let wallet = await recipientWalletsService.findByAddress(recipient);
        expect(wallet?.classification).toBe('ONE_TIME');

        // Act: Process second consistent payment in different month
        const tx2 = createTestTransaction({
          toAddress: recipient,
          timestamp: feb2026Start + 1000,
          amount: '5100000000', // Within 20% variance
        });
        await transactionsService.save(tx2);

        const result = await analyticsService.processTransaction(tx2);

        // Assert: Classification changed to EMPLOYEE
        expect(result.classificationChanged).toBe(true);
        expect(result.classification).toBe('EMPLOYEE');

        wallet = await recipientWalletsService.findByAddress(recipient);
        expect(wallet?.classification).toBe('EMPLOYEE');
      },
    );

    /**
     * Test classification to FREELANCER for high variance payments
     */
    conditionalIt('classifies as FREELANCER for high variance payments across months', async () => {
      // Arrange
      const recipient = 'TRecipientToFreelancer12345678';
      const jan2026Start = Date.UTC(2026, 0, 1);
      const feb2026Start = Date.UTC(2026, 1, 1);

      // First payment
      const tx1 = createTestTransaction({
        toAddress: recipient,
        timestamp: jan2026Start + 1000,
        amount: '5000000000',
      });
      await transactionsService.save(tx1);
      await analyticsService.processTransaction(tx1);

      // Second payment with > 20% variance
      const tx2 = createTestTransaction({
        toAddress: recipient,
        timestamp: feb2026Start + 1000,
        amount: '8000000000', // 60% increase
      });
      await transactionsService.save(tx2);

      // Act
      const result = await analyticsService.processTransaction(tx2);

      // Assert
      expect(result.classificationChanged).toBe(true);
      expect(result.classification).toBe('FREELANCER');
    });
  });

  // ---------------------------------------------------------------------------
  // Salary Change Detection (AC-6.1)
  // ---------------------------------------------------------------------------
  describe('Salary Change Detection (AC-6.1)', () => {
    /**
     * AC-6.1: System shall detect salary changes > 5% for EMPLOYEE
     */
    conditionalIt('AC-6.1: detects and records salary change > 5%', async () => {
      // Arrange: Create EMPLOYEE wallet with known salary
      const recipient = 'TEmployeeSalaryChange12345678901';

      // Create wallet with EMPLOYEE classification
      await recipientWalletsService.upsertMany([
        {
          address: recipient,
          firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
          lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
          lastAmount: '5000000000', // 5000 USDT
          classification: 'EMPLOYEE',
        },
      ]);

      // Act: Process transaction with 10% salary increase
      const result = await classificationService.detectSalaryChange(
        recipient,
        '5500000000', // 5500 USDT (10% increase)
        'tx_hash_salary_change_detection_test',
        Date.now(),
      );

      // Assert: Salary change detected and recorded
      expect(result).not.toBeNull();
      expect(result?.changePercent).toBeCloseTo(10, 0);
      expect(result?.isIncrease).toBe(true);

      // Verify recorded in salary_history
      const history = await db.select().from(salaryHistory);
      expect(history.length).toBe(1);
      expect(history[0].previousAmount).toBe('5000000000');
      expect(history[0].newAmount).toBe('5500000000');
    });

    /**
     * No detection for changes < 5%
     */
    conditionalIt('does not detect salary change < 5%', async () => {
      // Arrange
      const recipient = 'TEmployeeSmallChange123456789012';

      await recipientWalletsService.upsertMany([
        {
          address: recipient,
          firstSeenAt: new Date(Date.UTC(2026, 0, 1)),
          lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
          lastAmount: '5000000000',
          classification: 'EMPLOYEE',
        },
      ]);

      // Act: 4% change (below threshold)
      const result = await classificationService.detectSalaryChange(
        recipient,
        '5200000000', // 5200 USDT (4% increase)
        'tx_hash_small_change',
        Date.now(),
      );

      // Assert: No salary change detected
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Fired Status Detection (AC-7.1, AC-4.5)
  // ---------------------------------------------------------------------------
  describe('Fired Status Detection (AC-7.1, AC-4.5)', () => {
    /**
     * AC-7.1, AC-4.5: System shall mark EMPLOYEE as FIRED after 2+ months without payment
     */
    conditionalIt('AC-7.1: marks employee as FIRED after 2 months without payment', async () => {
      // Arrange: Create EMPLOYEE wallet with old last payment
      const recipient = 'TEmployeeFiredDetection123456789';
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      await recipientWalletsService.upsertMany([
        {
          address: recipient,
          firstSeenAt: new Date(Date.UTC(2025, 9, 1)),
          lastPaymentAt: threeMonthsAgo,
          lastAmount: '5000000000',
          classification: 'EMPLOYEE',
        },
      ]);

      // Act: Run fired detection batch job
      const firedWallets = await classificationService.checkEmploymentStatus();

      // Assert: Wallet marked as fired
      expect(firedWallets.length).toBe(1);
      expect(firedWallets[0].walletAddress).toBe(recipient);
      expect(firedWallets[0].monthsWithoutPayment).toBeGreaterThanOrEqual(2);

      const wallet = await recipientWalletsService.findByAddress(recipient);
      expect(wallet?.classification).toBe('FIRED');
      expect(wallet?.firedAt).not.toBeNull();
    });

    /**
     * No firing for recent payments
     */
    conditionalIt('does not fire employee with recent payment', async () => {
      // Arrange: Create EMPLOYEE with recent payment
      const recipient = 'TEmployeeRecentPayment12345678901';
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);

      await recipientWalletsService.upsertMany([
        {
          address: recipient,
          firstSeenAt: new Date(Date.UTC(2025, 9, 1)),
          lastPaymentAt: lastMonth, // 1 month ago
          lastAmount: '5000000000',
          classification: 'EMPLOYEE',
        },
      ]);

      // Act
      const firedWallets = await classificationService.checkEmploymentStatus();

      // Assert: Not fired
      expect(firedWallets.find((w) => w.walletAddress === recipient)).toBeUndefined();

      const wallet = await recipientWalletsService.findByAddress(recipient);
      expect(wallet?.classification).toBe('EMPLOYEE');
    });
  });

  // ---------------------------------------------------------------------------
  // Rehire Detection (AC-4.6)
  // ---------------------------------------------------------------------------
  describe('Rehire Detection (AC-4.6)', () => {
    /**
     * AC-4.6: System shall reclassify FIRED wallet to EMPLOYEE on new payment
     */
    conditionalIt('AC-4.6: reclassifies FIRED wallet to EMPLOYEE on new payment', async () => {
      // Arrange: Create FIRED wallet
      const recipient = 'TFiredWalletRehire123456789012345';

      await recipientWalletsService.upsertMany([
        {
          address: recipient,
          firstSeenAt: new Date(Date.UTC(2025, 9, 1)),
          lastPaymentAt: new Date(Date.UTC(2025, 11, 15)),
          lastAmount: '5000000000',
          classification: 'EMPLOYEE',
        },
      ]);

      // Mark as fired
      await recipientWalletsService.markAsFired(recipient, new Date(Date.UTC(2026, 0, 1)));

      let wallet = await recipientWalletsService.findByAddress(recipient);
      expect(wallet?.classification).toBe('FIRED');

      // Act: Process new transaction (rehire)
      const tx = createTestTransaction({
        toAddress: recipient,
        timestamp: Date.UTC(2026, 0, 15),
        amount: '5500000000',
      });
      await transactionsService.save(tx);

      const result = await analyticsService.processTransaction(tx);

      // Assert: Reclassified as EMPLOYEE
      expect(result.classificationChanged).toBe(true);
      expect(result.classification).toBe('EMPLOYEE');

      wallet = await recipientWalletsService.findByAddress(recipient);
      expect(wallet?.classification).toBe('EMPLOYEE');
      expect(wallet?.firedAt).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Cache Write-Through Verification (AC-5.3)
  // ---------------------------------------------------------------------------
  describe('Cache Write-Through (AC-5.3)', () => {
    /**
     * AC-5.3: System shall calculate and store position for current month
     */
    conditionalIt('AC-5.3: stores position in monthly_positions cache', async () => {
      // Arrange
      const recipient = 'TRecipientCacheTest1234567890123';
      const jan2026Start = Date.UTC(2026, 0, 1);

      // Act: Process transaction
      const tx = createTestTransaction({
        toAddress: recipient,
        timestamp: jan2026Start + 1000,
        amount: '5000000000',
      });
      await transactionsService.save(tx);

      await analyticsService.processTransaction(tx);

      // Assert: Position stored in cache
      const positions = await db.select().from(monthlyPositions);
      const cachedPosition = positions.find(
        (p) => p.yearMonth === '2026-01' && p.transactionHash === tx.hash,
      );

      expect(cachedPosition).toBeDefined();
      expect(cachedPosition?.position).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Month Comparison (AC-5.1)
  // ---------------------------------------------------------------------------
  describe('Month Comparison (AC-5.1)', () => {
    /**
     * Test position change indicator calculation
     */
    conditionalIt('calculates position change indicators correctly', async () => {
      // Arrange: Create data for December 2025 and January 2026
      const dec2025Start = Date.UTC(2025, 11, 1);
      const jan2026Start = Date.UTC(2026, 0, 1);

      const recipient1 = 'TRecipientChangeDec12345678901234';
      const recipient2 = 'TRecipientChangeJan12345678901234';

      // Create wallets
      await recipientWalletsService.upsertMany([
        {
          address: recipient1,
          firstSeenAt: new Date(dec2025Start + 1000),
          lastPaymentAt: new Date(jan2026Start + 2000),
          classification: 'EMPLOYEE',
        },
        {
          address: recipient2,
          firstSeenAt: new Date(jan2026Start + 1000),
          lastPaymentAt: new Date(jan2026Start + 1000),
          classification: 'EMPLOYEE',
        },
      ]);

      // December transactions
      await transactionsService.save(
        createTestTransaction({
          toAddress: recipient1,
          timestamp: dec2025Start + 1000,
          amount: '5000000000',
        }),
      );

      // January transactions (new recipient joins, pushes recipient1 down)
      await transactionsService.save(
        createTestTransaction({
          toAddress: recipient2,
          timestamp: jan2026Start + 1000, // Earlier in Jan
          amount: '5000000000',
        }),
      );
      await transactionsService.save(
        createTestTransaction({
          toAddress: recipient1,
          timestamp: jan2026Start + 2000, // Later in Jan
          amount: '5000000000',
        }),
      );

      // Calculate positions for both months
      await analyticsService.calculatePositionsWithinGroup('2025-12', 'EMPLOYEE');
      await analyticsService.calculatePositionsWithinGroup('2026-01', 'EMPLOYEE');

      // Act: Get January analytics
      const result = await analyticsService.getGroupedAnalytics('2026-01');

      // Assert: Position changes calculated correctly
      expect(result.employees.length).toBe(2);

      // Recipient2 is NEW (no December data)
      const newRecipient = result.employees.find((e) => e.walletAddress === recipient2);
      expect(newRecipient?.positionChange).toBe('new');

      // Recipient1 moved down (was #1 in Dec, now #2 in Jan)
      const existingRecipient = result.employees.find((e) => e.walletAddress === recipient1);
      expect(existingRecipient?.positionChange).toBe('down');
    });
  });

  // ---------------------------------------------------------------------------
  // Grouped Analytics Retrieval
  // ---------------------------------------------------------------------------
  describe('Grouped Analytics Retrieval', () => {
    /**
     * Verifies all classification groups are returned
     */
    conditionalIt('returns all classification groups', async () => {
      // Arrange: Create wallets with different classifications
      const jan2026Start = Date.UTC(2026, 0, 1);

      await recipientWalletsService.upsertMany([
        {
          address: 'TEmployee123456789012345678901234',
          firstSeenAt: new Date(jan2026Start),
          lastPaymentAt: new Date(jan2026Start),
          classification: 'EMPLOYEE',
        },
        {
          address: 'TFreelancer1234567890123456789012',
          firstSeenAt: new Date(jan2026Start),
          lastPaymentAt: new Date(jan2026Start),
          classification: 'FREELANCER',
        },
        {
          address: 'TOneTime1234567890123456789012345',
          firstSeenAt: new Date(jan2026Start),
          lastPaymentAt: new Date(jan2026Start),
          classification: 'ONE_TIME',
        },
        {
          address: 'TUnknown12345678901234567890123456',
          firstSeenAt: new Date(jan2026Start),
          lastPaymentAt: new Date(jan2026Start),
          classification: 'UNKNOWN',
        },
        {
          address: 'TFired1234567890123456789012345678',
          firstSeenAt: new Date(jan2026Start - 90 * 24 * 60 * 60 * 1000),
          lastPaymentAt: new Date(jan2026Start - 90 * 24 * 60 * 60 * 1000),
          classification: 'FIRED',
        },
      ]);

      // Act
      const result = await analyticsService.getGroupedAnalytics('2026-01');

      // Assert: All groups present
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
      expect(result.fired.length).toBe(1);
    });
  });
});
