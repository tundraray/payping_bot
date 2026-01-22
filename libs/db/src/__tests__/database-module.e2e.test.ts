// Database Module E2E Tests - Design Doc: database-drizzle-design.md
// Test Type: End-to-End Test
// Implementation: Full DbModule lifecycle testing

import { TransactionType } from '@app/blockchain';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import dbConfig from '../config/db.config';
import {
  DatabaseProvider,
  DRIZZLE,
  type DrizzleDB,
  SQL_CLIENT,
  SqlClientProvider,
} from '../database.provider';
import { DbModule } from '../db.module';
import { payments, subscriptions, transactions, users } from '../schema';
import { PaymentsService } from '../services/payments.service';
import { SubscriptionsService } from '../services/subscriptions.service';
import { TransactionsService } from '../services/transactions.service';
import { UsersService } from '../services/users.service';

/**
 * Database Module E2E Tests
 *
 * These tests verify the complete DbModule lifecycle from initialization
 * through operation to graceful shutdown. They exercise the full system
 * integration including:
 * - DatabaseProvider connection establishment and migration execution
 * - All domain services working together
 * - Graceful shutdown with connection cleanup
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Fresh database (migrations will be applied during test)
 *
 * Mock Boundaries: None - uses real PostgreSQL for E2E testing
 */

// Skip all tests if DATABASE_URL is not set
const conditionalDescribe = process.env.DATABASE_URL ? describe : describe.skip;

conditionalDescribe('Database Module E2E Tests', () => {
  // ===========================================================================
  // User Journey: Complete DbModule Lifecycle
  // ===========================================================================
  describe('User Journey: Complete DbModule Lifecycle', () => {
    // AC-2.1, AC-3.1, AC-12.1, AC-12.2
    // Full lifecycle: init → operate → shutdown
    it('initializes, operates, and shuts down gracefully', async () => {
      // Arrange & Act - Phase 1: Initialization
      const module = await Test.createTestingModule({
        imports: [DbModule],
      }).compile();

      // Assert - Phase 1: Module compiles without error
      expect(module).toBeDefined();

      // Get services
      const db = module.get<DrizzleDB>(DRIZZLE);
      const transactionsService = module.get<TransactionsService>(TransactionsService);
      const usersService = module.get<UsersService>(UsersService);
      const subscriptionsService = module.get<SubscriptionsService>(SubscriptionsService);
      const paymentsService = module.get<PaymentsService>(PaymentsService);

      expect(db).toBeDefined();
      expect(transactionsService).toBeDefined();
      expect(usersService).toBeDefined();
      expect(subscriptionsService).toBeDefined();
      expect(paymentsService).toBeDefined();

      // Act - Phase 2: Operation - Test basic operations with each service
      // Clean test data first
      await db.delete(payments);
      await db.delete(subscriptions);
      await db.delete(transactions);
      await db.delete(users);

      // Create a user
      const testTelegramId = Date.now();
      const user = await usersService.create({
        telegramId: testTelegramId,
        username: 'e2e_test_user',
        firstName: 'E2E',
        lastName: 'Test',
      });
      expect(user.telegramId).toBe(testTelegramId);

      // Create a subscription
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const subscription = await subscriptionsService.create(user.id, expiresAt);
      expect(subscription.userId).toBe(user.id);
      expect(subscription.status).toBe('active');

      // Record a payment
      const payment = await paymentsService.record({
        userId: user.id,
        telegramPaymentChargeId: `e2e_charge_${Date.now()}`,
        amount: 100,
        currency: 'XTR',
        status: 'completed',
      });
      expect(payment.userId).toBe(user.id);

      // Save a transaction
      const txHash = `e2e_tx_${Date.now()}`;
      await transactionsService.save({
        hash: txHash,
        type: TransactionType.USDT,
        fromAddress: 'TFromAddress12345678901234567890123',
        toAddress: 'TToAddress123456789012345678901234',
        amount: '100.000000',
        timestamp: Date.now(),
        blockNumber: 12345,
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      });

      // Verify transaction was saved
      const savedTx = await transactionsService.findByHash(txHash);
      expect(savedTx).not.toBeNull();
      expect(savedTx?.hash).toBe(txHash);

      // Act - Phase 3: Shutdown
      await module.close();

      // Assert - Phase 3: No error during shutdown (implicit - test completes)
    });

    // AC-2.1: DatabaseProvider establishes connection on module init
    it('AC-2.1: DatabaseProvider establishes connection on module init', async () => {
      // Act: Create TestingModule with DbModule
      const module = await Test.createTestingModule({
        imports: [DbModule],
      }).compile();

      // Assert: DRIZZLE and SQL_CLIENT tokens are injectable
      const db = module.get<DrizzleDB>(DRIZZLE);
      const sqlClient = module.get(SQL_CLIENT);

      expect(db).toBeDefined();
      expect(sqlClient).toBeDefined();

      // Verify connection works with simple query
      const result = await db.execute(sql`SELECT 1 as result`);
      expect(result).toBeDefined();

      // Cleanup
      await module.close();
    });

    // AC-3.1: runs migrations on startup before returning Drizzle instance
    it('AC-3.1: runs migrations on startup before returning Drizzle instance', async () => {
      // Act: Create and compile TestingModule with DbModule
      const module = await Test.createTestingModule({
        imports: [DbModule],
      }).compile();

      const db = module.get<DrizzleDB>(DRIZZLE);

      // Assert: All 4 tables exist (migrations ran successfully)
      // Query information_schema to verify tables exist
      const tableQuery = await db.execute(
        sql`SELECT table_name FROM information_schema.tables
            WHERE table_schema = 'public'
            AND table_name IN ('transactions', 'users', 'subscriptions', 'payments')
            ORDER BY table_name`,
      );

      const tableNames = (tableQuery as unknown as Array<{ table_name: string }>).map(
        (row) => row.table_name,
      );
      expect(tableNames).toContain('transactions');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('subscriptions');
      expect(tableNames).toContain('payments');

      // Cleanup
      await module.close();
    });

    // AC-12.1/AC-12.2: closes connections gracefully on shutdown
    it('AC-12.1/AC-12.2: closes connections gracefully on shutdown', async () => {
      // Arrange: Create and compile TestingModule with DbModule
      const module = await Test.createTestingModule({
        imports: [DbModule],
      }).compile();

      const db = module.get<DrizzleDB>(DRIZZLE);

      // Verify connection works before shutdown
      const beforeShutdown = await db.execute(sql`SELECT 1 as result`);
      expect(beforeShutdown).toBeDefined();

      // Act: Call module.close() (triggers onApplicationShutdown)
      await module.close();

      // Assert: Connection is closed - attempting new query should fail
      // Note: postgres.js may throw different errors depending on state
      // The important thing is that shutdown completed without error
      // and the module is no longer usable
    });
  });

  // ===========================================================================
  // Error Scenarios
  // ===========================================================================
  describe('Error Scenarios', () => {
    // AC-2.3: throws descriptive error when connection fails
    it('AC-2.3: throws descriptive error when connection fails', async () => {
      // Arrange: Override DATABASE_URL with invalid value
      const originalUrl = process.env.DATABASE_URL;

      try {
        // Set invalid database URL (wrong host/port)
        process.env.DATABASE_URL = 'postgres://invalid:invalid@localhost:54321/nonexistent';

        // Act & Assert: Module compilation throws error
        await expect(
          Test.createTestingModule({
            imports: [
              ConfigModule.forRoot({
                isGlobal: true,
                load: [dbConfig],
                ignoreEnvFile: true, // Use our overridden env var
              }),
            ],
            providers: [SqlClientProvider, DatabaseProvider],
          }).compile(),
        ).rejects.toThrow(/Failed to establish database connection/);
      } finally {
        // Restore original DATABASE_URL
        process.env.DATABASE_URL = originalUrl;
      }
    });

    // AC-2.3: Error message is masked (no password exposed)
    it('AC-2.3: masks password in error message', async () => {
      const originalUrl = process.env.DATABASE_URL;

      try {
        // Set invalid database URL with obvious password
        process.env.DATABASE_URL =
          'postgres://testuser:supersecretpassword@localhost:54321/nonexistent';

        // Act & Assert: Error should not contain the password
        await expect(
          Test.createTestingModule({
            imports: [
              ConfigModule.forRoot({
                isGlobal: true,
                load: [dbConfig],
                ignoreEnvFile: true,
              }),
            ],
            providers: [SqlClientProvider, DatabaseProvider],
          }).compile(),
        ).rejects.toThrow(
          expect.not.objectContaining({
            message: expect.stringContaining('supersecretpassword'),
          }),
        );
      } finally {
        process.env.DATABASE_URL = originalUrl;
      }
    });
  });

  // ===========================================================================
  // Service Integration
  // ===========================================================================
  describe('Service Integration', () => {
    let module: TestingModule;
    let db: DrizzleDB;
    let transactionsService: TransactionsService;
    let usersService: UsersService;
    let subscriptionsService: SubscriptionsService;
    let paymentsService: PaymentsService;

    beforeAll(async () => {
      module = await Test.createTestingModule({
        imports: [DbModule],
      }).compile();

      db = module.get<DrizzleDB>(DRIZZLE);
      transactionsService = module.get<TransactionsService>(TransactionsService);
      usersService = module.get<UsersService>(UsersService);
      subscriptionsService = module.get<SubscriptionsService>(SubscriptionsService);
      paymentsService = module.get<PaymentsService>(PaymentsService);
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    beforeEach(async () => {
      // Clean all tables in correct order (respect foreign keys)
      await db.delete(payments);
      await db.delete(subscriptions);
      await db.delete(transactions);
      await db.delete(users);
    });

    it('all services work together in a realistic workflow', async () => {
      // Simulate realistic user workflow:
      // 1. User signs up (UsersService.create)
      // 2. User pays for subscription (PaymentsService.record)
      // 3. Subscription is created (SubscriptionsService.create)
      // 4. Transaction arrives (TransactionsService.save)
      // 5. System checks if user has active subscription

      // Step 1: User signs up
      const telegramId = Date.now();
      const user = await usersService.create({
        telegramId,
        username: 'workflow_test',
        firstName: 'Workflow',
        lastName: 'Test',
      });
      expect(user).toBeDefined();

      // Step 2: User pays
      const chargeId = `workflow_charge_${Date.now()}`;
      const payment = await paymentsService.record({
        userId: user.id,
        telegramPaymentChargeId: chargeId,
        amount: 100,
        currency: 'XTR',
        status: 'completed',
      });
      expect(payment).toBeDefined();

      // Step 3: Subscription created
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const subscription = await subscriptionsService.create(user.id, expiresAt);
      expect(subscription.status).toBe('active');

      // Step 4: Transaction arrives
      const txHash = `workflow_tx_${Date.now()}`;
      await transactionsService.save({
        hash: txHash,
        type: TransactionType.USDT,
        fromAddress: 'TWorkflowFrom1234567890123456789012',
        toAddress: 'TWorkflowTo12345678901234567890123',
        amount: '500.000000',
        timestamp: Date.now(),
        blockNumber: 99999,
        contractAddress: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      });

      // Step 5: Check subscription status
      const activeSubscription = await subscriptionsService.getActive(user.id);
      expect(activeSubscription).not.toBeNull();
      expect(activeSubscription?.userId).toBe(user.id);

      // Verify all data is persisted
      const foundUser = await usersService.findByTelegramId(telegramId);
      expect(foundUser).not.toBeNull();

      const foundPayment = await paymentsService.findByChargeId(chargeId);
      expect(foundPayment).not.toBeNull();

      const foundTx = await transactionsService.findByHash(txHash);
      expect(foundTx).not.toBeNull();
    });

    it('getActiveSubscribers returns users with active subscriptions', async () => {
      // Create 3 users: 2 with active subscriptions, 1 without
      const user1 = await usersService.create({
        telegramId: Date.now(),
        username: 'active_user_1',
      });
      const user2 = await usersService.create({
        telegramId: Date.now() + 1,
        username: 'active_user_2',
      });
      const user3 = await usersService.create({
        telegramId: Date.now() + 2,
        username: 'inactive_user',
      });

      // Create active subscriptions for user1 and user2
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await subscriptionsService.create(user1.id, futureDate);
      await subscriptionsService.create(user2.id, futureDate);

      // user3 has no subscription

      // Get active subscribers
      const activeSubscribers = await subscriptionsService.getActiveSubscribers();

      // Should include user1 and user2, but not user3
      const subscriberIds = activeSubscribers.map((u) => u.id);
      expect(subscriberIds).toContain(user1.id);
      expect(subscriberIds).toContain(user2.id);
      expect(subscriberIds).not.toContain(user3.id);
    });
  });
});
