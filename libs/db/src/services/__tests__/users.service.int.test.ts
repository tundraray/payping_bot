/**
 * UsersService Integration Tests
 *
 * These tests verify UsersService with a real PostgreSQL database connection.
 *
 * Test Database Requirements:
 * - PostgreSQL test instance (Docker container recommended)
 * - DATABASE_URL environment variable set for test database
 * - Migrations applied before test run (handled by DatabaseProvider)
 *
 * Mock Boundaries: None - uses real PostgreSQL for integration testing
 *
 * @see AC-8.1, AC-8.2
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
import { users } from '../../schema';
import { UsersService } from '../users.service';

describe('UsersService Integration Tests', () => {
  let module: TestingModule;
  let usersService: UsersService;
  let db: DrizzleDB;

  // Test data factory
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
      providers: [SqlClientProvider, DatabaseProvider, UsersService],
    }).compile();

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

    // Clean users table before each test
    await db.delete(users);
  });

  // Skip all tests if DATABASE_URL is not set
  const conditionalIt = process.env.DATABASE_URL ? it : it.skip;

  // ---------------------------------------------------------------------------
  // AC-8.1: User Create (Upsert behavior)
  // ---------------------------------------------------------------------------
  describe('User Create (AC-8.1)', () => {
    // AC-8.1: "When UsersService.create() is called with telegram_id,
    //          the system shall create or return existing user"
    // ROI: 6.5 | Business Value: 8 (user management) | Frequency: 8 (new users)
    conditionalIt('AC-8.1: creates new user when telegram_id does not exist', async () => {
      // Arrange: Create unique user data
      const userData = createTestUserDto();

      // Act: Call create
      const result = await usersService.create(userData);

      // Assert: User is created with correct fields
      expect(result).not.toBeNull();
      expect(result.telegramId).toBe(userData.telegramId);
      expect(result.username).toBe(userData.username);
      expect(result.firstName).toBe(userData.firstName);
      expect(result.lastName).toBe(userData.lastName);
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    conditionalIt('AC-8.1: returns existing user when telegram_id already exists', async () => {
      // Arrange: Create user first
      const userData = createTestUserDto();
      const firstUser = await usersService.create(userData);

      // Act: Call create with same telegram_id but different data
      const secondUserData = {
        ...userData,
        username: 'different_username',
        firstName: 'Different',
      };
      const secondUser = await usersService.create(secondUserData);

      // Assert: Same user is returned (not created new one)
      expect(secondUser.id).toBe(firstUser.id);
      expect(secondUser.telegramId).toBe(firstUser.telegramId);
      // Username should remain from first creation (no update on duplicate)
      expect(secondUser.username).toBe(userData.username);
    });

    conditionalIt('AC-8.1: handles null optional fields correctly', async () => {
      // Arrange: Create user with null optional fields
      const userData = createTestUserDto({
        username: null,
        firstName: null,
        lastName: null,
      });

      // Act: Create user
      const result = await usersService.create(userData);

      // Assert: User created with null fields
      expect(result).not.toBeNull();
      expect(result.telegramId).toBe(userData.telegramId);
      expect(result.username).toBeNull();
      expect(result.firstName).toBeNull();
      expect(result.lastName).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // AC-8.2: User Find by Telegram ID
  // ---------------------------------------------------------------------------
  describe('User Find by Telegram ID (AC-8.2)', () => {
    // AC-8.2: "When UsersService.findByTelegramId() is called,
    //          the system shall return user or null"
    // ROI: 6.5 | Business Value: 8 (user lookup) | Frequency: 8 (frequent)
    conditionalIt('AC-8.2: returns user when telegram_id exists', async () => {
      // Arrange: Create user first
      const userData = createTestUserDto();
      const createdUser = await usersService.create(userData);

      // Act: Find by telegram_id
      const result = await usersService.findByTelegramId(userData.telegramId);

      // Assert: User is found with all fields
      expect(result).not.toBeNull();
      expect(result?.id).toBe(createdUser.id);
      expect(result?.telegramId).toBe(userData.telegramId);
      expect(result?.username).toBe(userData.username);
      expect(result?.firstName).toBe(userData.firstName);
      expect(result?.lastName).toBe(userData.lastName);
    });

    conditionalIt('AC-8.2: returns null when telegram_id does not exist', async () => {
      // Arrange: Generate non-existent telegram_id
      const nonExistentTelegramId = 999999999999;

      // Act: Find by non-existent telegram_id
      const result = await usersService.findByTelegramId(nonExistentTelegramId);

      // Assert: Result is null (not undefined, not empty object)
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Additional tests: Update and FindById
  // ---------------------------------------------------------------------------
  describe('User Update', () => {
    conditionalIt('updates user fields and returns updated user', async () => {
      // Arrange: Create user first
      const userData = createTestUserDto();
      const createdUser = await usersService.create(userData);
      const originalUpdatedAt = createdUser.updatedAt;

      // Wait a bit to ensure updatedAt changes
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Act: Update user
      const updateData = {
        username: 'updated_username',
        firstName: 'Updated',
        lastName: 'Name',
      };
      const result = await usersService.update(userData.telegramId, updateData);

      // Assert: User is updated with new fields
      expect(result).not.toBeNull();
      expect(result?.id).toBe(createdUser.id);
      expect(result?.telegramId).toBe(userData.telegramId);
      expect(result?.username).toBe(updateData.username);
      expect(result?.firstName).toBe(updateData.firstName);
      expect(result?.lastName).toBe(updateData.lastName);
      // updatedAt should be updated (either same or later due to $onUpdateFn)
      expect(result?.updatedAt.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt.getTime());
    });

    conditionalIt('returns null when updating non-existent user', async () => {
      // Arrange: Non-existent telegram_id
      const nonExistentTelegramId = 999999999999;

      // Act: Try to update
      const result = await usersService.update(nonExistentTelegramId, {
        username: 'new_username',
      });

      // Assert: Result is null
      expect(result).toBeNull();
    });

    conditionalIt('updates only provided fields', async () => {
      // Arrange: Create user first
      const userData = createTestUserDto({
        username: 'original_username',
        firstName: 'Original',
        lastName: 'Name',
      });
      await usersService.create(userData);

      // Act: Update only username
      const result = await usersService.update(userData.telegramId, {
        username: 'new_username',
      });

      // Assert: Only username is updated, other fields unchanged
      expect(result).not.toBeNull();
      expect(result?.username).toBe('new_username');
      expect(result?.firstName).toBe('Original');
      expect(result?.lastName).toBe('Name');
    });
  });

  describe('User Find by ID', () => {
    conditionalIt('returns user when id exists', async () => {
      // Arrange: Create user first
      const userData = createTestUserDto();
      const createdUser = await usersService.create(userData);

      // Act: Find by internal id
      const result = await usersService.findById(createdUser.id);

      // Assert: User is found
      expect(result).not.toBeNull();
      expect(result?.id).toBe(createdUser.id);
      expect(result?.telegramId).toBe(userData.telegramId);
    });

    conditionalIt('returns null when id does not exist', async () => {
      // Arrange: Non-existent id
      const nonExistentId = 999999;

      // Act: Find by non-existent id
      const result = await usersService.findById(nonExistentId);

      // Assert: Result is null
      expect(result).toBeNull();
    });
  });
});
