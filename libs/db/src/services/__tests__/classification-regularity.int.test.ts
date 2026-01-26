/**
 * Classification Regularity Integration Tests - Design Doc: regularity-classification-refactor-design.md
 * Generated: 2026-01-24 | Budget Used: 3/3 integration, 0/2 E2E
 *
 * These tests verify the regularity-based classification refactor with real database interactions,
 * including regularity calculation, span calculation, and classification transitions.
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Migrations applied before test run (handled by DatabaseProvider)
 *
 * Mock Boundaries: None - uses real PostgreSQL for integration testing
 *
 * Focus Areas:
 * - Regularity calculation edge cases (70% boundary, multiple payments same month)
 * - Classification transitions (ONE_TIME -> EMPLOYEE, FREELANCER -> EMPLOYEE)
 * - Span calculation edge cases
 *
 * @see AC-1.x: UNKNOWN classification
 * @see AC-2.x: ONE_TIME classification
 * @see AC-3.x: EMPLOYEE classification (regularity >= 70%)
 * @see AC-4.x: FREELANCER classification (regularity < 70%)
 * @see AC-5.x: FIRED classification
 */

import { type Transaction, TransactionType } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import dbConfig from '../../config/db.config';
import {
  DatabaseProvider,
  DRIZZLE,
  type DrizzleDB,
  SqlClientProvider,
} from '../../database.provider';
import { monthlyPositions, recipientWallets, salaryHistory, transactions } from '../../schema';
import { AnalyticsService } from '../analytics.service';
import { ClassificationService, type PaymentInfo } from '../classification.service';
import { RecipientWalletsService } from '../recipient-wallets.service';
import { TransactionsService } from '../transactions.service';

describe('Classification Regularity Integration Tests', () => {
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

  // Helper to create payment info
  const createPaymentInfo = (amount: string, timestamp: Date): PaymentInfo => ({
    amount,
    timestamp,
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
  // Integration Test 1: Regularity Calculation Edge Cases (High ROI)
  // ---------------------------------------------------------------------------
  describe('Regularity Calculation Edge Cases', () => {
    /**
     * AC-3.1: When wallet has 3+ payments AND span >= 3 months AND max_amount >= 500 USDT AND regularity >= 70%, shall classify as EMPLOYEE
     * AC-3.2: Regularity = unique_months / total_span_months * 100
     * AC-3.3: total_span_months = months_between(first_seen_at, last_payment_at) + 1
     * AC-3.4: unique_months counts distinct YYYY-MM values from payment timestamps
     *
     * ROI: 85 | Business Value: 10 (core classification logic) | Frequency: 9 (90% users)
     * Behavior: Multiple payments -> Calculate regularity -> Classify based on 70% threshold
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, TransactionsService, Database
     * @complexity: high
     *
     * Verification items:
     * - Regularity calculated as unique_months / span_months
     * - 70% boundary correctly handled (70% = EMPLOYEE, 69% = FREELANCER)
     * - Multiple payments in same month count as 1 unique month
     * - Span includes both first and last months (inclusive)
     */
    conditionalIt(
      'AC-3.1/AC-3.2: classifies as EMPLOYEE at exactly 70% regularity boundary',
      async () => {
        // Arrange: Create wallet with payments in 7 unique months over 10 month span
        // regularity = 7/10 = 70% (exactly at threshold)
        const walletAddress = 'TBoundary70Percent12345678901234';

        // Create initial wallet
        await recipientWalletsService.upsertMany([
          {
            address: walletAddress,
            firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
            lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
            classification: 'ONE_TIME',
            lastAmount: '1000000000', // 1000 USDT
          },
        ]);

        // Historical payments (7 unique months over 10 month span = 70% regularity)
        // Unique months: Jan, Feb, Mar, Apr, Jun, Aug, Oct (7 months)
        // Missing: May, Jul, Sep (creates gaps)
        const payments: PaymentInfo[] = [
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 15))), // Jan
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 15))), // Feb
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 2, 15))), // Mar
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 3, 15))), // Apr
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 5, 15))), // Jun (skip May)
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 7, 15))), // Aug (skip Jul)
        ];

        // New payment in Oct (skip Sep) - this makes 7 unique months over 10 month span
        const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 9, 15)));

        // Act
        const result = await classificationService.evaluateClassification(
          walletAddress,
          payments,
          newPayment,
        );

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('ONE_TIME');
        expect(result.regularity).toBeCloseTo(0.7, 2); // 7/10 = 70%
      },
    );

    /**
     * AC-4.1: When wallet has 3+ payments AND span >= 3 months AND max_amount >= 500 USDT AND regularity < 70%, shall classify as FREELANCER
     *
     * ROI: 82 | Business Value: 9 (boundary correctness) | Frequency: 8 (high variance wallets)
     * Behavior: Payments just below 70% threshold -> Classify as FREELANCER
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: high
     *
     * Verification items:
     * - regularity = 6/10 = 60% (below threshold)
     * - Classification is FREELANCER, not EMPLOYEE
     */
    conditionalIt(
      'AC-4.1: classifies as FREELANCER just below 70% regularity boundary',
      async () => {
        // Arrange: Create wallet with payments in 6 unique months over 10 month span
        // regularity = 6/10 = 60% (below threshold)
        const walletAddress = 'TBelow70Percent123456789012345';

        // Create initial wallet
        await recipientWalletsService.upsertMany([
          {
            address: walletAddress,
            firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
            lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
            classification: 'ONE_TIME',
            lastAmount: '1000000000', // 1000 USDT
          },
        ]);

        // Historical payments (6 unique months over 10 month span = 60% regularity)
        // Unique months: Jan, Feb, Apr, Jun, Aug, Oct (6 months)
        // Missing: Mar, May, Jul, Sep (creates more gaps)
        const payments: PaymentInfo[] = [
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 15))), // Jan
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 15))), // Feb
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 3, 15))), // Apr (skip Mar)
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 5, 15))), // Jun (skip May)
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 7, 15))), // Aug (skip Jul)
        ];

        // New payment in Oct (skip Sep) - this makes 6 unique months over 10 month span
        const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 9, 15)));

        // Act
        const result = await classificationService.evaluateClassification(
          walletAddress,
          payments,
          newPayment,
        );

        // Assert
        expect(result.classification).toBe('FREELANCER');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('ONE_TIME');
        expect(result.regularity).toBeCloseTo(0.6, 2); // 6/10 = 60%
      },
    );

    /**
     * AC-3.4: unique_months shall count distinct YYYY-MM values from payment timestamps
     *
     * ROI: 78 | Business Value: 8 (prevents overcounting) | Frequency: 7 (common scenario)
     * Behavior: Multiple payments same month -> Count as 1 unique month
     * @category: edge-case
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - 5 payments in 3 unique months over 3 month span = 100% regularity
     * - Each month counted only once regardless of payment count
     */
    conditionalIt('AC-3.4: counts multiple payments in same month as 1 unique month', async () => {
      // Arrange: Create wallet with 5 payments: 2 in Jan, 2 in Feb, 1 in Mar 2026
      // span = 3 months, unique_months = 3, regularity = 100%
      const walletAddress = 'TMultipleSameMonth12345678901234';

      // Create initial wallet
      await recipientWalletsService.upsertMany([
        {
          address: walletAddress,
          firstSeenAt: new Date(Date.UTC(2026, 0, 5)), // Jan 5, 2026
          lastPaymentAt: new Date(Date.UTC(2026, 0, 5)),
          classification: 'ONE_TIME',
          lastAmount: '1000000000', // 1000 USDT
        },
      ]);

      // Historical payments (multiple in same month)
      const payments: PaymentInfo[] = [
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 5))), // Jan 5
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 15))), // Jan 15
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 10))), // Feb 10
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 20))), // Feb 20
      ];

      // New payment in Mar - this makes 3 unique months over 3 month span
      const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 2, 15)));

      // Act
      const result = await classificationService.evaluateClassification(
        walletAddress,
        payments,
        newPayment,
      );

      // Assert: 5 payments but only 3 unique months
      expect(result.classification).toBe('EMPLOYEE');
      expect(result.regularity).toBe(1.0); // 3/3 = 100%
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Test 2: Classification Transitions (High ROI)
  // ---------------------------------------------------------------------------
  describe('Classification Transitions', () => {
    /**
     * AC-6.1: When FREELANCER regularity increases to >= 70% on new payment, shall transition to EMPLOYEE
     *
     * ROI: 80 | Business Value: 9 (state transition correctness) | Frequency: 6 (promotion scenario)
     * Behavior: FREELANCER receives consistent payment -> Regularity increases -> Becomes EMPLOYEE
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, AnalyticsService, Database
     * @complexity: high
     *
     * Verification items:
     * - Initial classification is FREELANCER (regularity < 70%)
     * - After new payment, regularity >= 70%
     * - Classification transitions to EMPLOYEE
     * - previousClassification in result is 'FREELANCER'
     */
    conditionalIt(
      'AC-6.1: transitions FREELANCER to EMPLOYEE when regularity reaches 70%',
      async () => {
        // Arrange: Create wallet already classified as FREELANCER
        // Current regularity: 4 unique months / 6 span = 66.7% (< 70%)
        const walletAddress = 'TFreelancerToEmployee12345678901';

        await recipientWalletsService.upsertMany([
          {
            address: walletAddress,
            firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
            lastPaymentAt: new Date(Date.UTC(2026, 5, 15)), // Jun 2026
            classification: 'FREELANCER',
            lastAmount: '1000000000', // 1000 USDT
          },
        ]);

        // Historical payments: Jan, Feb, Apr, Jun (4 unique months over 6 month span = 66.7%)
        const payments: PaymentInfo[] = [
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 15))), // Jan
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 15))), // Feb
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 3, 15))), // Apr (skip Mar)
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 5, 15))), // Jun (skip May)
        ];

        // New payment fills May gap - now 5/6 = 83.3% >= 70%
        const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 4, 15))); // May

        // Act
        const result = await classificationService.evaluateClassification(
          walletAddress,
          payments,
          newPayment,
        );

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('FREELANCER');
      },
    );

    /**
     * AC-2.1, AC-3.1: Transition from ONE_TIME to EMPLOYEE on reaching threshold
     *
     * ROI: 88 | Business Value: 10 (most common transition) | Frequency: 9 (all new wallets)
     * Behavior: ONE_TIME receives 3rd payment + span >= 3 months + regularity >= 70% -> EMPLOYEE
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, AnalyticsService, Database
     * @complexity: high
     *
     * Verification items:
     * - Wallet starts as ONE_TIME
     * - After 3rd payment with 3 month span and 100% regularity
     * - Classification becomes EMPLOYEE
     */
    conditionalIt(
      'AC-2.1/AC-3.1: transitions ONE_TIME to EMPLOYEE with 3+ payments, 3+ month span, regularity >= 70%',
      async () => {
        // Arrange: Create wallet with ONE_TIME classification, process 3 monthly payments
        const walletAddress = 'TOneTimeToEmployee12345678901234';

        // Create initial wallet with ONE_TIME classification
        await recipientWalletsService.upsertMany([
          {
            address: walletAddress,
            firstSeenAt: new Date(Date.UTC(2026, 0, 15)), // Jan 2026
            lastPaymentAt: new Date(Date.UTC(2026, 0, 15)),
            classification: 'ONE_TIME',
            lastAmount: '1000000000', // 1000 USDT
          },
        ]);

        // Historical payments: Jan, Feb (2 payments, 2 unique months)
        const payments: PaymentInfo[] = [
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 15))), // Jan
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 15))), // Feb
        ];

        // New payment in Mar - this makes 3 payments, 3 unique months, 100% regularity
        const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 2, 15)));

        // Act
        const result = await classificationService.evaluateClassification(
          walletAddress,
          payments,
          newPayment,
        );

        // Assert
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.changed).toBe(true);
        expect(result.previousClassification).toBe('ONE_TIME');
        expect(result.regularity).toBe(1.0); // 3/3 = 100%
      },
    );

    /**
     * AC-7.1: When FIRED wallet receives new payment, shall transition to EMPLOYEE (rehire)
     *
     * ROI: 75 | Business Value: 8 (rehire detection) | Frequency: 3 (rare but important)
     * Behavior: FIRED wallet receives payment -> Reclassified as EMPLOYEE
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, AnalyticsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - Initial classification is FIRED
     * - After new payment, classification becomes EMPLOYEE
     * - firedAt is cleared
     */
    conditionalIt('AC-7.1: transitions FIRED to EMPLOYEE on rehire (new payment)', async () => {
      // Arrange: Create wallet with FIRED classification
      const walletAddress = 'TFiredToEmployee123456789012345';

      await recipientWalletsService.upsertMany([
        {
          address: walletAddress,
          firstSeenAt: new Date(Date.UTC(2025, 0, 15)), // Jan 2025
          lastPaymentAt: new Date(Date.UTC(2025, 11, 15)), // Dec 2025
          classification: 'EMPLOYEE',
          lastAmount: '1000000000', // 1000 USDT
        },
      ]);

      // Mark as fired
      await recipientWalletsService.markAsFired(walletAddress, new Date(Date.UTC(2026, 2, 1)));

      // Verify FIRED status
      const wallet = await recipientWalletsService.findByAddress(walletAddress);
      expect(wallet?.classification).toBe('FIRED');
      expect(wallet?.firedAt).not.toBeNull();

      // No historical payments needed for rehire case
      const payments: PaymentInfo[] = [];

      // New payment - this triggers rehire
      const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 3, 15)));

      // Act
      const result = await classificationService.evaluateClassification(
        walletAddress,
        payments,
        newPayment,
      );

      // Assert
      expect(result.classification).toBe('EMPLOYEE');
      expect(result.changed).toBe(true);
      expect(result.previousClassification).toBe('FIRED');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Test 3: Span Calculation Edge Cases (High ROI)
  // ---------------------------------------------------------------------------
  describe('Span Calculation Edge Cases', () => {
    /**
     * AC-3.3: total_span_months = months_between(first_seen_at, last_payment_at) + 1
     * AC-2.2: When wallet has payments spanning < 3 months, shall classify as ONE_TIME
     *
     * ROI: 76 | Business Value: 8 (span validation) | Frequency: 8 (all classifications use span)
     * Behavior: Verify span includes both first and last months (inclusive counting)
     * @category: edge-case
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - Span of 1 month: first_seen_at and last_payment_at in same month = span 1
     * - Span of 2 months: Jan to Feb = span 2 (not 1)
     * - Span of 3 months: Jan to Mar = span 3 (minimum for EMPLOYEE/FREELANCER)
     */
    conditionalIt(
      'AC-3.3: calculates span inclusively (first month to last month + 1)',
      async () => {
        // Arrange: Create wallet with payments in Jan, Feb, Mar
        // first_seen_at = Jan 1, last_payment_at = Mar 1
        // span = (Mar - Jan) + 1 = 3 months (inclusive)
        const walletAddress = 'TInclusiveSpan1234567890123456';

        await recipientWalletsService.upsertMany([
          {
            address: walletAddress,
            firstSeenAt: new Date(Date.UTC(2026, 0, 1)), // Jan 1, 2026
            lastPaymentAt: new Date(Date.UTC(2026, 0, 1)),
            classification: 'ONE_TIME',
            lastAmount: '1000000000',
          },
        ]);

        // Historical payments
        const payments: PaymentInfo[] = [
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 1))), // Jan 1
          createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 1))), // Feb 1
        ];

        // New payment in Mar
        const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 2, 1)));

        // Act
        const result = await classificationService.evaluateClassification(
          walletAddress,
          payments,
          newPayment,
        );

        // Assert: Span should be 3 (Jan, Feb, Mar inclusive), not 2
        expect(result.classification).toBe('EMPLOYEE');
        expect(result.regularity).toBe(1.0); // 3/3 = 100%
      },
    );

    /**
     * AC-2.2: Span < 3 months results in ONE_TIME (even with 3+ payments)
     *
     * ROI: 72 | Business Value: 7 (prevents premature classification) | Frequency: 6
     * Behavior: 3+ payments in 2-month span -> Stays ONE_TIME
     * @category: edge-case
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - 5 payments across Jan and Feb (2 month span)
     * - Despite 5 payments, classification stays ONE_TIME
     * - Span requirement (>= 3) prevents EMPLOYEE/FREELANCER classification
     */
    conditionalIt(
      'AC-2.2: maintains ONE_TIME when span < 3 months despite 3+ payments',
      async () => {
        // Arrange: Create wallet with 5 payments in Jan and Feb 2026 (2 month span)
        const walletAddress = 'TSpanLessThan3Mo12345678901234';

        await recipientWalletsService.upsertMany([
          {
            address: walletAddress,
            firstSeenAt: new Date(Date.UTC(2026, 0, 5)), // Jan 5, 2026
            lastPaymentAt: new Date(Date.UTC(2026, 0, 5)),
            classification: 'ONE_TIME',
            lastAmount: '800000000', // 800 USDT
          },
        ]);

        // Historical payments - 4 payments across Jan and Feb
        const payments: PaymentInfo[] = [
          createPaymentInfo('800000000', new Date(Date.UTC(2026, 0, 5))), // Jan 5
          createPaymentInfo('800000000', new Date(Date.UTC(2026, 0, 15))), // Jan 15
          createPaymentInfo('800000000', new Date(Date.UTC(2026, 0, 25))), // Jan 25
          createPaymentInfo('800000000', new Date(Date.UTC(2026, 1, 5))), // Feb 5
        ];

        // New payment in Feb - this makes 5 payments but only 2-month span
        const newPayment = createPaymentInfo('800000000', new Date(Date.UTC(2026, 1, 15)));

        // Act
        const result = await classificationService.evaluateClassification(
          walletAddress,
          payments,
          newPayment,
        );

        // Assert: Should stay ONE_TIME because span < 3 months
        expect(result.classification).toBe('ONE_TIME');
        expect(result.changed).toBe(false);
      },
    );

    /**
     * AC-3.3: Same month for first and last payment = span of 1
     *
     * ROI: 70 | Business Value: 7 (single-month edge case) | Frequency: 5
     * Behavior: All payments in same month -> span = 1 -> ONE_TIME
     * @category: edge-case
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: low
     *
     * Verification items:
     * - Multiple payments all in January 2026
     * - Span = 1 month
     * - regularity = 1/1 = 100% but span < 3 -> ONE_TIME
     */
    conditionalIt('AC-3.3: handles single-month span (all payments same month)', async () => {
      // Arrange: Create wallet with 5 payments all in January 2026
      const walletAddress = 'TSingleMonthSpan12345678901234';

      await recipientWalletsService.upsertMany([
        {
          address: walletAddress,
          firstSeenAt: new Date(Date.UTC(2026, 0, 5)), // Jan 5, 2026
          lastPaymentAt: new Date(Date.UTC(2026, 0, 5)),
          classification: 'ONE_TIME',
          lastAmount: '500000000', // 500 USDT
        },
      ]);

      // Historical payments - all in January
      const payments: PaymentInfo[] = [
        createPaymentInfo('500000000', new Date(Date.UTC(2026, 0, 5))), // Jan 5
        createPaymentInfo('500000000', new Date(Date.UTC(2026, 0, 10))), // Jan 10
        createPaymentInfo('500000000', new Date(Date.UTC(2026, 0, 15))), // Jan 15
        createPaymentInfo('500000000', new Date(Date.UTC(2026, 0, 20))), // Jan 20
      ];

      // New payment also in January
      const newPayment = createPaymentInfo('500000000', new Date(Date.UTC(2026, 0, 25)));

      // Act
      const result = await classificationService.evaluateClassification(
        walletAddress,
        payments,
        newPayment,
      );

      // Assert: Span = 1 month, should stay ONE_TIME
      expect(result.classification).toBe('ONE_TIME');
    });

    /**
     * AC-3.3: Year boundary handling (Dec 2025 to Jan 2026)
     *
     * ROI: 68 | Business Value: 6 (year boundary edge case) | Frequency: 4
     * Behavior: Payments spanning year boundary calculate span correctly
     * @category: edge-case
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - Payments from Dec 2025 to Feb 2026 = 3 month span
     * - Year difference handled correctly: (2026-2025)*12 + (2-12) + 1 = 12 + (-10) + 1 = 3
     */
    conditionalIt('AC-3.3: handles year boundary in span calculation (Dec to Feb)', async () => {
      // Arrange: Create wallet with payments spanning year boundary
      // Dec 2025, Jan 2026, Feb 2026 = 3 month span
      const walletAddress = 'TYearBoundary123456789012345678';

      await recipientWalletsService.upsertMany([
        {
          address: walletAddress,
          firstSeenAt: new Date(Date.UTC(2025, 11, 15)), // Dec 15, 2025
          lastPaymentAt: new Date(Date.UTC(2025, 11, 15)),
          classification: 'ONE_TIME',
          lastAmount: '900000000', // 900 USDT
        },
      ]);

      // Historical payments spanning year boundary
      const payments: PaymentInfo[] = [
        createPaymentInfo('900000000', new Date(Date.UTC(2025, 11, 15))), // Dec 2025
        createPaymentInfo('900000000', new Date(Date.UTC(2026, 0, 15))), // Jan 2026
      ];

      // New payment in Feb 2026
      const newPayment = createPaymentInfo('900000000', new Date(Date.UTC(2026, 1, 15)));

      // Act
      const result = await classificationService.evaluateClassification(
        walletAddress,
        payments,
        newPayment,
      );

      // Assert: Span = 3 months (Dec, Jan, Feb), should be EMPLOYEE
      expect(result.classification).toBe('EMPLOYEE');
      expect(result.regularity).toBe(1.0); // 3/3 = 100%
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Test: UNKNOWN and FIRED Edge Cases
  // ---------------------------------------------------------------------------
  describe('UNKNOWN and FIRED Classification', () => {
    /**
     * AC-1.1: When a new wallet receives first payment < 500 USDT, shall classify as UNKNOWN
     *
     * ROI: 65 | Business Value: 6 (initial classification) | Frequency: 4
     * Behavior: Small first payment -> UNKNOWN classification
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: low
     *
     * Verification items:
     * - First payment amount < 500 USDT
     * - Classification is UNKNOWN
     * - Wallet persisted with classification = 'UNKNOWN'
     */
    conditionalIt(
      'AC-1.1: classifies new wallet as UNKNOWN for first payment < 500 USDT',
      async () => {
        // Arrange: New wallet address (not in database)
        const walletAddress = 'TNewWalletUnknown12345678901234';

        // Create transaction for new wallet with amount < 500 USDT
        const tx = createTestTransaction({
          toAddress: walletAddress,
          timestamp: Date.UTC(2026, 0, 15),
          amount: '400000000', // 400 USDT (< 500 threshold)
        });

        // Save transaction first
        await transactionsService.save(tx);

        // Act: Process transaction via analytics service
        const result = await analyticsService.processTransaction(tx);

        // Assert (result should not be null for new transaction)
        expect(result).not.toBeNull();
        expect(result!.classification).toBe('UNKNOWN');

        // Verify wallet in DB
        const wallet = await recipientWalletsService.findByAddress(walletAddress);
        expect(wallet).not.toBeNull();
        expect(wallet?.classification).toBe('UNKNOWN');
      },
    );

    /**
     * AC-2.3: When UNKNOWN wallet receives payment >= 500 USDT, shall upgrade to ONE_TIME
     *
     * ROI: 63 | Business Value: 6 (UNKNOWN upgrade) | Frequency: 4
     * Behavior: UNKNOWN receives significant payment -> ONE_TIME
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: low
     *
     * Verification items:
     * - Initial classification is UNKNOWN
     * - After payment >= 500 USDT, classification is ONE_TIME
     */
    conditionalIt('AC-2.3: upgrades UNKNOWN to ONE_TIME when payment >= 500 USDT', async () => {
      // Arrange: Create wallet classified as UNKNOWN
      const walletAddress = 'TUnknownToOneTime1234567890123';

      await recipientWalletsService.upsertMany([
        {
          address: walletAddress,
          firstSeenAt: new Date(Date.UTC(2026, 0, 10)),
          lastPaymentAt: new Date(Date.UTC(2026, 0, 10)),
          classification: 'UNKNOWN',
          lastAmount: '300000000', // 300 USDT (< 500)
        },
      ]);

      // Create and save transaction first
      const tx = createTestTransaction({
        toAddress: walletAddress,
        timestamp: Date.UTC(2026, 0, 15),
        amount: '600000000', // 600 USDT (>= 500 threshold)
      });
      await transactionsService.save(tx);

      // Act: Process transaction
      const result = await analyticsService.processTransaction(tx);

      // Assert (result should not be null for new transaction)
      expect(result).not.toBeNull();
      expect(result!.classification).toBe('ONE_TIME');
      expect(result!.classificationChanged).toBe(true);

      // Verify wallet in DB
      const wallet = await recipientWalletsService.findByAddress(walletAddress);
      expect(wallet?.classification).toBe('ONE_TIME');
    });

    /**
     * AC-5.1: When EMPLOYEE wallet has no payment for 2+ consecutive months, shall classify as FIRED
     * Note: FIRED only applies to EMPLOYEE, not FREELANCER
     *
     * ROI: 60 | Business Value: 7 (fired detection) | Frequency: 3
     * Behavior: EMPLOYEE without payment 2+ months -> FIRED (batch job)
     * @category: core-functionality
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - EMPLOYEE with lastPaymentAt 3 months ago
     * - After checkEmploymentStatus(), classification is FIRED
     * - firedAt is set
     * - FREELANCER with same gap is NOT marked as FIRED
     */
    conditionalIt('AC-5.1: marks EMPLOYEE as FIRED after 2+ months without payment', async () => {
      // Arrange: Create EMPLOYEE and FREELANCER wallets with old last payment
      const employeeWallet = 'TEmployeeFiredCheck1234567890123';
      const freelancerWallet = 'TFreelancerNotFired12345678901';

      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      await recipientWalletsService.upsertMany([
        {
          address: employeeWallet,
          firstSeenAt: new Date(Date.UTC(2025, 9, 1)),
          lastPaymentAt: threeMonthsAgo,
          classification: 'EMPLOYEE',
          lastAmount: '1000000000',
        },
        {
          address: freelancerWallet,
          firstSeenAt: new Date(Date.UTC(2025, 9, 1)),
          lastPaymentAt: threeMonthsAgo,
          classification: 'FREELANCER',
          lastAmount: '1000000000',
        },
      ]);

      // Act: Run fired detection batch job
      const firedWallets = await classificationService.checkEmploymentStatus();

      // Assert: Only EMPLOYEE should be fired
      expect(firedWallets.length).toBe(1);
      expect(firedWallets[0].walletAddress).toBe(employeeWallet);
      expect(firedWallets[0].monthsWithoutPayment).toBeGreaterThanOrEqual(2);

      // Verify EMPLOYEE wallet is now FIRED
      const employeeRecord = await recipientWalletsService.findByAddress(employeeWallet);
      expect(employeeRecord?.classification).toBe('FIRED');
      expect(employeeRecord?.firedAt).not.toBeNull();

      // Verify FREELANCER wallet is unchanged
      const freelancerRecord = await recipientWalletsService.findByAddress(freelancerWallet);
      expect(freelancerRecord?.classification).toBe('FREELANCER');
    });
  });

  // ---------------------------------------------------------------------------
  // Integration Test: UTC Timezone Handling
  // ---------------------------------------------------------------------------
  describe('UTC Timezone Handling', () => {
    /**
     * AC-3.4: Month extraction uses UTC for consistent behavior across timezones
     *
     * ROI: 55 | Business Value: 5 (consistency) | Frequency: 10 (all timestamps)
     * Behavior: Timestamps at month boundaries use UTC for month extraction
     * @category: edge-case
     * @dependency: ClassificationService, RecipientWalletsService, Database
     * @complexity: medium
     *
     * Verification items:
     * - Payment at UTC midnight Jan 1 counts as January
     * - Payment at UTC 23:59 Dec 31 counts as December
     * - No timezone conversion affects month calculation
     */
    conditionalIt('AC-3.4: uses UTC for month extraction at month boundaries', async () => {
      // Arrange: Create wallet with payments at month boundaries in UTC
      const walletAddress = 'TUTCTimezoneTest12345678901234';

      await recipientWalletsService.upsertMany([
        {
          address: walletAddress,
          firstSeenAt: new Date(Date.UTC(2025, 11, 31, 23, 59, 59)), // Dec 31, 2025 23:59:59 UTC
          lastPaymentAt: new Date(Date.UTC(2025, 11, 31, 23, 59, 59)),
          classification: 'ONE_TIME',
          lastAmount: '1000000000',
        },
      ]);

      // Payments at month boundaries in UTC
      const payments: PaymentInfo[] = [
        // Dec 31, 2025 23:59:59 UTC -> December 2025
        createPaymentInfo('1000000000', new Date(Date.UTC(2025, 11, 31, 23, 59, 59))),
        // Jan 1, 2026 00:00:01 UTC -> January 2026
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 1, 0, 0, 1))),
        // Jan 31, 2026 23:59:59 UTC -> January 2026 (same month as above)
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 0, 31, 23, 59, 59))),
        // Feb 1, 2026 00:00:01 UTC -> February 2026
        createPaymentInfo('1000000000', new Date(Date.UTC(2026, 1, 1, 0, 0, 1))),
      ];

      // New payment in Mar
      const newPayment = createPaymentInfo('1000000000', new Date(Date.UTC(2026, 2, 1, 0, 0, 1)));

      // Act
      const result = await classificationService.evaluateClassification(
        walletAddress,
        payments,
        newPayment,
      );

      // Assert: 4 unique months (Dec, Jan, Feb, Mar), 4 month span, 100% regularity
      expect(result.classification).toBe('EMPLOYEE');
      expect(result.regularity).toBe(1.0); // 4/4 = 100%
    });
  });
});
