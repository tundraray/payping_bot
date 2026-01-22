import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gt } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { subscriptions, users } from '../schema';
import type { User } from './users.service';

/**
 * Subscription type inferred from the subscriptions schema.
 * Represents a complete subscription record from the database.
 */
export type Subscription = typeof subscriptions.$inferSelect;

/**
 * SubscriptionsService provides database operations for subscription management.
 *
 * This service supports the Telegram subscription module by enabling:
 * - Creating new subscriptions with active status
 * - Querying active (non-expired) subscriptions for users
 * - Retrieving all users with active subscriptions for notifications
 * - Expiring subscriptions when needed
 *
 * All methods follow fail-fast error handling - errors are logged and re-thrown.
 *
 * @see AC-9.1, AC-9.2
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Creates a new subscription with active status.
   *
   * The subscription starts immediately (startsAt = now) and expires at the
   * specified date. Status is always set to 'active' on creation.
   *
   * @param userId - Internal database user ID (foreign key to users table)
   * @param expiresAt - Subscription expiration date
   * @returns Created subscription record
   * @throws Error on database failure or foreign key violation (fail-fast)
   *
   * @see AC-9.1: Creates subscription with status 'active'
   */
  async create(userId: number, expiresAt: Date): Promise<Subscription> {
    try {
      const result = await this.db
        .insert(subscriptions)
        .values({
          userId,
          status: 'active',
          startsAt: new Date(),
          expiresAt,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logger.error('Failed to create subscription', {
        userId,
        expiresAt,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets the active subscription for a user.
   *
   * A subscription is considered active when:
   * - status = 'active' AND
   * - expires_at > current time
   *
   * If multiple active subscriptions exist, returns the first one found.
   *
   * @param userId - Internal database user ID
   * @returns Active subscription if found, null otherwise
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-9.2: Returns subscription where status='active' AND expires_at > now
   */
  async getActive(userId: number): Promise<Subscription | null> {
    try {
      const result = await this.db
        .select()
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.userId, userId),
            eq(subscriptions.status, 'active'),
            gt(subscriptions.expiresAt, new Date()),
          ),
        )
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      this.logger.error('Failed to get active subscription', {
        userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets all users with active subscriptions.
   *
   * Used for bulk notification operations when new transactions arrive.
   * Only returns users whose subscription is both active and not expired.
   *
   * @returns Array of users with active subscriptions
   * @throws Error on database failure (fail-fast)
   */
  async getActiveSubscribers(): Promise<User[]> {
    try {
      const result = await this.db
        .select({ user: users })
        .from(subscriptions)
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .where(and(eq(subscriptions.status, 'active'), gt(subscriptions.expiresAt, new Date())));

      return result.map((row) => row.user);
    } catch (error) {
      this.logger.error('Failed to get active subscribers', { error });
      throw error;
    }
  }

  /**
   * Marks a subscription as expired.
   *
   * Used to manually expire subscriptions or for batch expiration jobs.
   * The updatedAt timestamp is automatically updated via $onUpdateFn.
   *
   * @param subscriptionId - Internal subscription ID
   * @throws Error on database failure (fail-fast)
   */
  async expire(subscriptionId: number): Promise<void> {
    try {
      await this.db
        .update(subscriptions)
        .set({ status: 'expired' })
        .where(eq(subscriptions.id, subscriptionId));
    } catch (error) {
      this.logger.error('Failed to expire subscription', {
        subscriptionId,
        error,
      });
      throw error;
    }
  }
}
