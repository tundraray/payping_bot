/**
 * SubscriptionsService Integration Tests
 *
 * These tests verify SubscriptionsService with a real PostgreSQL database connection.
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Migrations applied before test run (handled by DatabaseProvider)
 *
 * Mock Boundaries: None - uses real PostgreSQL for integration testing
 *
 * @see AC-9.1, AC-9.2
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
import { subscriptions, users } from '../../schema';
import { SubscriptionsService } from '../subscriptions.service';
import { UsersService } from '../users.service';

describe('SubscriptionsService Integration Tests', () => {
  let module: TestingModule;
  let subscriptionsService: SubscriptionsService;
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
      providers: [SqlClientProvider, DatabaseProvider, SubscriptionsService, UsersService],
    }).compile();

    subscriptionsService = module.get<SubscriptionsService>(SubscriptionsService);
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

    // Clean subscriptions table first (due to foreign key constraint)
    await db.delete(subscriptions);
    // Clean users table
    await db.delete(users);
  });

  // Skip all tests if DATABASE_URL is not set
  const conditionalIt = process.env.DATABASE_URL ? it : it.skip;

  // ---------------------------------------------------------------------------
  // AC-9.1: Create Subscription
  // ---------------------------------------------------------------------------
  describe('Create Subscription (AC-9.1)', () => {
    // AC-9.1: "When SubscriptionsService.create() is called,
    //          the system shall create subscription with status 'active'"
    // ROI: 7.0 | Business Value: 9 (subscription management) | Frequency: 7 (new subscriptions)
    conditionalIt('AC-9.1: creates subscription with status active', async () => {
      // Arrange: Create a test user first
      const testUser = await createTestUser();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now

      // Act: Create subscription
      const result = await subscriptionsService.create(testUser.id, expiresAt);

      // Assert: Subscription is created with correct fields
      expect(result).not.toBeNull();
      expect(result.userId).toBe(testUser.id);
      expect(result.status).toBe('active');
      expect(result.expiresAt.getTime()).toBe(expiresAt.getTime());
      expect(result.startsAt).toBeInstanceOf(Date);
      expect(result.startsAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    conditionalIt('AC-9.1: throws error for non-existent user (foreign key)', async () => {
      // Arrange: Non-existent user ID
      const nonExistentUserId = 999999;
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Act & Assert: Should throw foreign key violation
      await expect(subscriptionsService.create(nonExistentUserId, expiresAt)).rejects.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-9.2: Get Active Subscription
  // ---------------------------------------------------------------------------
  describe('Get Active Subscription (AC-9.2)', () => {
    // AC-9.2: "When SubscriptionsService.getActive() is called,
    //          the system shall return subscription where status='active' AND expires_at > now"
    // ROI: 8.0 | Business Value: 9 (subscription check) | Frequency: 9 (every bot command)
    conditionalIt('AC-9.2: returns active non-expired subscription', async () => {
      // Arrange: Create user and active subscription
      const testUser = await createTestUser();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      const createdSub = await subscriptionsService.create(testUser.id, expiresAt);

      // Act: Get active subscription
      const result = await subscriptionsService.getActive(testUser.id);

      // Assert: Returns the active subscription
      expect(result).not.toBeNull();
      expect(result?.id).toBe(createdSub.id);
      expect(result?.status).toBe('active');
      expect(result?.userId).toBe(testUser.id);
    });

    conditionalIt('AC-9.2: returns null when subscription is expired', async () => {
      // Arrange: Create user with already expired subscription
      const testUser = await createTestUser();
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      await subscriptionsService.create(testUser.id, expiredDate);

      // Act: Get active subscription
      const result = await subscriptionsService.getActive(testUser.id);

      // Assert: Returns null because subscription is expired
      expect(result).toBeNull();
    });

    conditionalIt('AC-9.2: returns null when subscription status is not active', async () => {
      // Arrange: Create user with subscription and expire it
      const testUser = await createTestUser();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const sub = await subscriptionsService.create(testUser.id, expiresAt);

      // Expire the subscription
      await subscriptionsService.expire(sub.id);

      // Act: Get active subscription
      const result = await subscriptionsService.getActive(testUser.id);

      // Assert: Returns null because status is 'expired'
      expect(result).toBeNull();
    });

    conditionalIt('AC-9.2: returns null when no subscription exists', async () => {
      // Arrange: Create user without any subscription
      const testUser = await createTestUser();

      // Act: Get active subscription
      const result = await subscriptionsService.getActive(testUser.id);

      // Assert: Returns null
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Additional tests: getActiveSubscribers and expire
  // ---------------------------------------------------------------------------
  describe('Get Active Subscribers', () => {
    conditionalIt('returns users with active subscriptions', async () => {
      // Arrange: Create 3 users, 2 with active subscriptions
      const user1 = await createTestUser();
      const user2 = await createTestUser();
      const user3 = await createTestUser();

      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const expiredDate = new Date(Date.now() - 1000);

      await subscriptionsService.create(user1.id, futureDate); // Active
      await subscriptionsService.create(user2.id, futureDate); // Active
      await subscriptionsService.create(user3.id, expiredDate); // Expired

      // Act: Get active subscribers
      const result = await subscriptionsService.getActiveSubscribers();

      // Assert: Returns 2 users with active subscriptions
      expect(result).toHaveLength(2);
      const userIds = result.map((u) => u.id);
      expect(userIds).toContain(user1.id);
      expect(userIds).toContain(user2.id);
      expect(userIds).not.toContain(user3.id);
    });

    conditionalIt('returns empty array when no active subscriptions', async () => {
      // Arrange: Create user with expired subscription
      const user = await createTestUser();
      const expiredDate = new Date(Date.now() - 1000);
      await subscriptionsService.create(user.id, expiredDate);

      // Act: Get active subscribers
      const result = await subscriptionsService.getActiveSubscribers();

      // Assert: Returns empty array
      expect(result).toHaveLength(0);
    });

    conditionalIt('excludes users whose subscription status is expired', async () => {
      // Arrange: Create user with subscription and expire it manually
      const user = await createTestUser();
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const sub = await subscriptionsService.create(user.id, futureDate);
      await subscriptionsService.expire(sub.id);

      // Act: Get active subscribers
      const result = await subscriptionsService.getActiveSubscribers();

      // Assert: User not included
      expect(result).toHaveLength(0);
    });
  });

  describe('Expire Subscription', () => {
    conditionalIt('marks subscription as expired', async () => {
      // Arrange: Create active subscription
      const testUser = await createTestUser();
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const sub = await subscriptionsService.create(testUser.id, expiresAt);

      // Verify it's active
      const activeSub = await subscriptionsService.getActive(testUser.id);
      expect(activeSub).not.toBeNull();

      // Act: Expire the subscription
      await subscriptionsService.expire(sub.id);

      // Assert: Subscription is no longer active
      const result = await subscriptionsService.getActive(testUser.id);
      expect(result).toBeNull();
    });

    conditionalIt('handles non-existent subscription id gracefully', async () => {
      // Arrange: Non-existent subscription ID
      const nonExistentId = 999999;

      // Act: Should not throw (update with no matches is valid)
      await expect(subscriptionsService.expire(nonExistentId)).resolves.not.toThrow();
    });
  });
});
