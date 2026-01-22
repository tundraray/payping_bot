import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { users } from '../schema';
import type { CreateUserDto, UpdateUserDto } from '../types/dto';

/**
 * User type inferred from the users schema.
 * Represents a complete user record from the database.
 */
export type User = typeof users.$inferSelect;

/**
 * UsersService provides database operations for Telegram user management.
 *
 * This service supports user registration and profile management for the
 * subscription system. It provides CRUD operations with idempotent create
 * behavior (create returns existing user if telegram_id already exists).
 *
 * All methods follow fail-fast error handling - errors are logged and re-thrown.
 *
 * @see AC-8.1, AC-8.2
 */
@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Finds a user by their Telegram ID.
   *
   * Used to check if a user exists and retrieve their profile information.
   * Query uses indexed telegram_id column for optimal performance.
   *
   * @param telegramId - Telegram user ID
   * @returns User if found, null otherwise
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-8.2: Returns User when telegram_id exists, null otherwise
   */
  async findByTelegramId(telegramId: number): Promise<User | null> {
    try {
      const result = await this.db
        .select()
        .from(users)
        .where(eq(users.telegramId, telegramId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      this.logger.error('Failed to find user by telegram_id', {
        telegramId,
        error,
      });
      throw error;
    }
  }

  /**
   * Creates a new user or returns existing user if telegram_id already exists.
   *
   * This method is idempotent - multiple calls with the same telegram_id will
   * return the same user without creating duplicates.
   *
   * Note: createdAt and updatedAt are set automatically by the schema defaults.
   *
   * @param data - User creation data including telegram_id and optional profile fields
   * @returns Created user or existing user with matching telegram_id
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-8.1: Creates or returns existing user
   */
  async create(data: CreateUserDto): Promise<User> {
    try {
      // Check if user already exists (idempotent behavior)
      const existingUser = await this.findByTelegramId(data.telegramId);
      if (existingUser) {
        return existingUser;
      }

      // Insert new user
      const result = await this.db
        .insert(users)
        .values({
          telegramId: data.telegramId,
          username: data.username ?? null,
          firstName: data.firstName ?? null,
          lastName: data.lastName ?? null,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logger.error('Failed to create user', {
        telegramId: data.telegramId,
        error,
      });
      throw error;
    }
  }

  /**
   * Updates an existing user's profile fields.
   *
   * Only provided fields in the UpdateUserDto are updated; other fields remain unchanged.
   * The updatedAt timestamp is automatically updated via $onUpdateFn.
   *
   * @param telegramId - Telegram user ID to update
   * @param data - Fields to update (username, firstName, lastName)
   * @returns Updated user if found, null if user doesn't exist
   * @throws Error on database failure (fail-fast)
   */
  async update(telegramId: number, data: UpdateUserDto): Promise<User | null> {
    try {
      // Check if user exists first
      const existingUser = await this.findByTelegramId(telegramId);
      if (!existingUser) {
        return null;
      }

      // Build update object with only provided fields
      const updateValues: Partial<{
        username: string | null;
        firstName: string | null;
        lastName: string | null;
      }> = {};

      if (data.username !== undefined) {
        updateValues.username = data.username;
      }
      if (data.firstName !== undefined) {
        updateValues.firstName = data.firstName;
      }
      if (data.lastName !== undefined) {
        updateValues.lastName = data.lastName;
      }

      // If no fields to update, return existing user
      if (Object.keys(updateValues).length === 0) {
        return existingUser;
      }

      // Update user
      const result = await this.db
        .update(users)
        .set(updateValues)
        .where(eq(users.telegramId, telegramId))
        .returning();

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      this.logger.error('Failed to update user', {
        telegramId,
        error,
      });
      throw error;
    }
  }

  /**
   * Finds a user by their internal database ID.
   *
   * Used primarily for internal operations and foreign key references.
   *
   * @param id - Internal database ID
   * @returns User if found, null otherwise
   * @throws Error on database failure (fail-fast)
   */
  async findById(id: number): Promise<User | null> {
    try {
      const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      this.logger.error('Failed to find user by id', {
        id,
        error,
      });
      throw error;
    }
  }
}
