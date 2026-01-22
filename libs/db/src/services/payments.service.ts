import { Inject, Injectable, Logger } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { payments } from '../schema';
import type { CreatePaymentDto } from '../types/dto';

/**
 * Payment type inferred from the payments schema.
 * Represents a complete payment record from the database.
 */
export type Payment = typeof payments.$inferSelect;

/**
 * PaymentsService provides database operations for Telegram Stars payment management.
 *
 * This service supports the Telegram subscription module by enabling:
 * - Recording new payments from Telegram Stars transactions
 * - Querying payment history for users
 * - Looking up payments by Telegram charge ID for deduplication
 *
 * All methods follow fail-fast error handling - errors are logged and re-thrown.
 *
 * @see AC-10.1
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Records a new payment transaction.
   *
   * Used by TelegramModule to persist Telegram Stars payment transactions.
   * Currency defaults to 'XTR' for Telegram Stars if not specified.
   *
   * @param data - Payment data including userId, chargeId, amount, and status
   * @returns Created payment record
   * @throws Error on unique constraint violation (duplicate chargeId) or database failure
   *
   * @see AC-10.1: Inserts payment record
   */
  async record(data: CreatePaymentDto): Promise<Payment> {
    try {
      const result = await this.db
        .insert(payments)
        .values({
          userId: data.userId,
          telegramPaymentChargeId: data.telegramPaymentChargeId,
          amount: data.amount,
          currency: data.currency ?? 'XTR',
          status: data.status,
        })
        .returning();

      return result[0];
    } catch (error) {
      this.logger.error('Failed to record payment', {
        userId: data.userId,
        chargeId: data.telegramPaymentChargeId,
        error,
      });
      throw error;
    }
  }

  /**
   * Gets all payments for a user ordered by creation date (newest first).
   *
   * Used for displaying payment history to users.
   *
   * @param userId - Internal database user ID
   * @returns Array of payments ordered by createdAt descending, empty array if none
   * @throws Error on database failure (fail-fast)
   */
  async findByUser(userId: number): Promise<Payment[]> {
    try {
      const result = await this.db
        .select()
        .from(payments)
        .where(eq(payments.userId, userId))
        .orderBy(desc(payments.createdAt));

      return result;
    } catch (error) {
      this.logger.error('Failed to find payments by user', {
        userId,
        error,
      });
      throw error;
    }
  }

  /**
   * Finds a payment by its Telegram payment charge ID.
   *
   * Used for payment deduplication and status lookup.
   * The chargeId is unique per payment transaction.
   *
   * @param chargeId - Telegram payment charge ID
   * @returns Payment if found, null otherwise
   * @throws Error on database failure (fail-fast)
   */
  async findByChargeId(chargeId: string): Promise<Payment | null> {
    try {
      const result = await this.db
        .select()
        .from(payments)
        .where(eq(payments.telegramPaymentChargeId, chargeId))
        .limit(1);

      return result.length > 0 ? result[0] : null;
    } catch (error) {
      this.logger.error('Failed to find payment by charge ID', {
        chargeId,
        error,
      });
      throw error;
    }
  }
}
