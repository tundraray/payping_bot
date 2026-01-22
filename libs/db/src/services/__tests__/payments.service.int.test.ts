/**
 * PaymentsService Integration Tests
 *
 * These tests verify PaymentsService with a real PostgreSQL database connection.
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Migrations applied before test run (handled by DatabaseProvider)
 *
 * Mock Boundaries: None - uses real PostgreSQL for integration testing
 *
 * @see AC-10.1
 */

import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import dbConfig from '../../config/db.config';
import {
  DatabaseProvider,
  DRIZZLE,
  type DrizzleDB,
  SqlClientProvider,
} from '../../database.provider';
import { payments, users } from '../../schema';
import { PaymentsService } from '../payments.service';
import { UsersService } from '../users.service';

describe('PaymentsService Integration Tests', () => {
  let module: TestingModule;
  let paymentsService: PaymentsService;
  let usersService: UsersService;
  let db: DrizzleDB;

  // Test data factory for users
  const createTestUserDto = (
    overrides?: Partial<{
      telegramId: number;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
    }>,
  ) => ({
    telegramId: overrides?.telegramId ?? Math.floor(Math.random() * 1000000000) + Date.now(),
    username: overrides?.username ?? `testuser_${Date.now()}`,
    firstName: overrides?.firstName ?? 'Test',
    lastName: overrides?.lastName ?? 'User',
  });

  // Test data factory for payments
  const createTestPaymentDto = (
    userId: number,
    overrides?: Partial<{
      telegramPaymentChargeId: string;
      amount: number;
      currency: string;
      status: 'pending' | 'completed' | 'failed' | 'refunded';
    }>,
  ) => ({
    userId,
    telegramPaymentChargeId:
      overrides?.telegramPaymentChargeId ??
      `charge_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    amount: overrides?.amount ?? 100,
    currency: overrides?.currency,
    status: overrides?.status ?? ('completed' as const),
  });

  // Helper to create a test user and return their id
  const createTestUser = async () => {
    const user = await usersService.create(createTestUserDto());
    return user;
  };

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
      providers: [SqlClientProvider, DatabaseProvider, PaymentsService, UsersService],
    }).compile();

    paymentsService = module.get<PaymentsService>(PaymentsService);
    usersService = module.get<UsersService>(UsersService);
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

    // Clean payments table first (due to foreign key constraint)
    await db.delete(payments);
    // Clean users table
    await db.delete(users);
  });

  // Skip all tests if DATABASE_URL is not set
  const conditionalIt = process.env.DATABASE_URL ? it : it.skip;

  // ---------------------------------------------------------------------------
  // AC-10.1: Record Payment
  // ---------------------------------------------------------------------------
  describe('Record Payment (AC-10.1)', () => {
    // AC-10.1: "When PaymentsService.record() is called,
    //          the system shall insert a payment record"
    // ROI: 8.0 | Business Value: 9 (payment tracking) | Frequency: 7 (subscription purchases)
    conditionalIt('AC-10.1: inserts payment record with correct fields', async () => {
      // Arrange: Create test user first
      const testUser = await createTestUser();
      const paymentDto = createTestPaymentDto(testUser.id, {
        amount: 250,
        status: 'completed',
      });

      // Act: Record payment
      const result = await paymentsService.record(paymentDto);

      // Assert: Payment is created with correct fields
      expect(result).not.toBeNull();
      expect(result.userId).toBe(testUser.id);
      expect(result.telegramPaymentChargeId).toBe(paymentDto.telegramPaymentChargeId);
      expect(result.amount).toBe(250);
      expect(result.currency).toBe('XTR'); // Default currency
      expect(result.status).toBe('completed');
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    conditionalIt('AC-10.1: uses custom currency when provided', async () => {
      // Arrange: Create user and payment with custom currency
      const testUser = await createTestUser();
      const paymentDto = createTestPaymentDto(testUser.id, {
        currency: 'USD',
        amount: 100,
      });

      // Act: Record payment
      const result = await paymentsService.record(paymentDto);

      // Assert: Custom currency is used
      expect(result.currency).toBe('USD');
    });

    conditionalIt('AC-10.1: throws error for non-existent user (foreign key)', async () => {
      // Arrange: Non-existent user ID
      const nonExistentUserId = 999999;
      const paymentDto = createTestPaymentDto(nonExistentUserId);

      // Act & Assert: Should throw foreign key violation
      await expect(paymentsService.record(paymentDto)).rejects.toThrow();
    });

    conditionalIt('AC-10.1: throws error for duplicate charge ID (unique constraint)', async () => {
      // Arrange: Create user and first payment
      const testUser = await createTestUser();
      const chargeId = `duplicate_charge_${Date.now()}`;
      const firstPayment = createTestPaymentDto(testUser.id, {
        telegramPaymentChargeId: chargeId,
      });
      await paymentsService.record(firstPayment);

      // Create second payment with same charge ID
      const duplicatePayment = createTestPaymentDto(testUser.id, {
        telegramPaymentChargeId: chargeId,
        amount: 999,
      });

      // Act & Assert: Should throw unique constraint violation
      await expect(paymentsService.record(duplicatePayment)).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // Additional tests: findByUser and findByChargeId
  // ---------------------------------------------------------------------------
  describe('Find Payments by User', () => {
    conditionalIt('returns all payments for user ordered by createdAt desc', async () => {
      // Arrange: Create user with multiple payments
      const testUser = await createTestUser();

      // Create payments with small delays to ensure different timestamps
      const payment1 = await paymentsService.record(
        createTestPaymentDto(testUser.id, { amount: 100 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      const payment2 = await paymentsService.record(
        createTestPaymentDto(testUser.id, { amount: 200 }),
      );
      await new Promise((resolve) => setTimeout(resolve, 10));
      const payment3 = await paymentsService.record(
        createTestPaymentDto(testUser.id, { amount: 300 }),
      );

      // Act: Get user's payments
      const result = await paymentsService.findByUser(testUser.id);

      // Assert: All payments returned in desc order (newest first)
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(payment3.id);
      expect(result[1].id).toBe(payment2.id);
      expect(result[2].id).toBe(payment1.id);
    });

    conditionalIt('returns empty array when user has no payments', async () => {
      // Arrange: Create user without payments
      const testUser = await createTestUser();

      // Act: Get user's payments
      const result = await paymentsService.findByUser(testUser.id);

      // Assert: Empty array returned
      expect(result).toHaveLength(0);
    });

    conditionalIt('returns only payments for specified user', async () => {
      // Arrange: Create two users with payments
      const user1 = await createTestUser();
      const user2 = await createTestUser();

      await paymentsService.record(createTestPaymentDto(user1.id, { amount: 100 }));
      await paymentsService.record(createTestPaymentDto(user1.id, { amount: 200 }));
      await paymentsService.record(createTestPaymentDto(user2.id, { amount: 300 }));

      // Act: Get user1's payments
      const result = await paymentsService.findByUser(user1.id);

      // Assert: Only user1's payments returned
      expect(result).toHaveLength(2);
      for (const p of result) {
        expect(p.userId).toBe(user1.id);
      }
    });
  });

  describe('Find Payment by Charge ID', () => {
    conditionalIt('returns payment when charge ID exists', async () => {
      // Arrange: Create user and payment
      const testUser = await createTestUser();
      const chargeId = `charge_find_test_${Date.now()}`;
      const createdPayment = await paymentsService.record(
        createTestPaymentDto(testUser.id, {
          telegramPaymentChargeId: chargeId,
          amount: 500,
        }),
      );

      // Act: Find by charge ID
      const result = await paymentsService.findByChargeId(chargeId);

      // Assert: Payment found with correct data
      expect(result).not.toBeNull();
      expect(result?.id).toBe(createdPayment.id);
      expect(result?.telegramPaymentChargeId).toBe(chargeId);
      expect(result?.amount).toBe(500);
    });

    conditionalIt('returns null when charge ID does not exist', async () => {
      // Arrange: Non-existent charge ID
      const nonExistentChargeId = `nonexistent_${Date.now()}`;

      // Act: Find by non-existent charge ID
      const result = await paymentsService.findByChargeId(nonExistentChargeId);

      // Assert: Null returned
      expect(result).toBeNull();
    });
  });
});
