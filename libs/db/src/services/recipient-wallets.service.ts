import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { type NewRecipientWallet, type RecipientWallet, recipientWallets } from '../schema';

export type Classification = 'UNKNOWN' | 'ONE_TIME' | 'EMPLOYEE' | 'FREELANCER' | 'FIRED';

export interface RecipientWalletInput {
  address: string;
  firstSeenAt: Date;
  lastPaymentAt: Date;
  totalPayments?: number;
  lastAmount?: string;
  hiredAt?: Date;
  classification?: Classification;
}

/**
 * RecipientWalletsService provides database operations for recipient wallet management.
 *
 * This service supports the payout analytics feature by enabling:
 * - Recipient wallet CRUD operations
 * - Classification tracking and updates
 * - Salary tracking for EMPLOYEE classification
 * - Employment status management (fired/rehired detection)
 *
 * All methods follow fail-fast error handling - errors are logged and re-thrown.
 *
 * @see AC-3.1, AC-3.2, AC-3.3, AC-3.4, AC-7.2, AC-7.3
 */
@Injectable()
export class RecipientWalletsService {
  private readonly logger = new Logger(RecipientWalletsService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}

  /**
   * Find wallet by address.
   *
   * @param address - Wallet address (34 chars, starts with T)
   * @returns Wallet record or null if not found
   * @throws Error on database failure (fail-fast)
   */
  async findByAddress(address: string): Promise<RecipientWallet | null> {
    try {
      const [wallet] = await this.db
        .select()
        .from(recipientWallets)
        .where(eq(recipientWallets.address, address))
        .limit(1);

      return wallet ?? null;
    } catch (error) {
      this.logger.error('Failed to find wallet by address', { address, error });
      throw error;
    }
  }

  /**
   * Upsert multiple wallets (batch operation).
   *
   * For existing wallets, updates payment information.
   * For new wallets, creates with initial classification.
   *
   * @param wallets - Array of wallet inputs
   * @returns Created/updated wallet records
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-3.1: Creates recipient_wallet record for new addresses
   * @see AC-3.2: Stores first_seen_at, last_payment_at timestamps
   * @see AC-3.3: Tracks total_payments count and last_amount
   */
  async upsertMany(wallets: RecipientWalletInput[]): Promise<RecipientWallet[]> {
    const results: RecipientWallet[] = [];

    try {
      for (const input of wallets) {
        const existing = await this.findByAddress(input.address);

        if (existing) {
          // Update existing wallet
          const [updated] = await this.db
            .update(recipientWallets)
            .set({
              lastPaymentAt: input.lastPaymentAt,
              totalPayments: input.totalPayments ?? existing.totalPayments,
              lastAmount: input.lastAmount ?? existing.lastAmount,
              updatedAt: new Date(),
            })
            .where(eq(recipientWallets.id, existing.id))
            .returning();

          results.push(updated);
        } else {
          // Insert new wallet
          const [created] = await this.db
            .insert(recipientWallets)
            .values({
              address: input.address,
              firstSeenAt: input.firstSeenAt,
              lastPaymentAt: input.lastPaymentAt,
              totalPayments: input.totalPayments ?? 1,
              lastAmount: input.lastAmount,
              classification: input.classification ?? 'UNKNOWN',
              hiredAt: input.hiredAt,
            } satisfies NewRecipientWallet)
            .returning();

          results.push(created);
        }
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to upsert wallets', { count: wallets.length, error });
      throw error;
    }
  }

  /**
   * Update last payment information.
   *
   * @param address - Wallet address
   * @param amount - Payment amount (raw format)
   * @param paymentAt - Payment timestamp
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-3.3: Tracks last_amount for each recipient
   */
  async updateLastPayment(address: string, amount: string, paymentAt: Date): Promise<void> {
    try {
      await this.db
        .update(recipientWallets)
        .set({
          lastAmount: amount,
          lastPaymentAt: paymentAt,
          updatedAt: new Date(),
        })
        .where(eq(recipientWallets.address, address));
    } catch (error) {
      this.logger.error('Failed to update last payment', { address, amount, error });
      throw error;
    }
  }

  /**
   * Update wallet classification.
   *
   * @param address - Wallet address
   * @param classification - New classification
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-4.1 through AC-4.6: Classification transitions
   */
  async updateClassification(address: string, classification: Classification): Promise<void> {
    try {
      await this.db
        .update(recipientWallets)
        .set({
          classification,
          updatedAt: new Date(),
        })
        .where(eq(recipientWallets.address, address));
    } catch (error) {
      this.logger.error('Failed to update classification', { address, classification, error });
      throw error;
    }
  }

  /**
   * Mark wallet as fired (set firedAt timestamp and classification).
   *
   * @param address - Wallet address
   * @param firedAt - Termination date
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-7.2: Sets fired_at timestamp and changes classification
   */
  async markAsFired(address: string, firedAt: Date): Promise<void> {
    try {
      await this.db
        .update(recipientWallets)
        .set({
          classification: 'FIRED',
          firedAt,
          updatedAt: new Date(),
        })
        .where(eq(recipientWallets.address, address));

      this.logger.debug(`Marked as fired: ${address.slice(0, 8)}...`);
    } catch (error) {
      this.logger.error('Failed to mark wallet as fired', { address, error });
      throw error;
    }
  }

  /**
   * Mark wallet as rehired (clear firedAt, reset to EMPLOYEE).
   *
   * @param address - Wallet address
   * @param newAmount - New salary amount
   * @throws Error on database failure (fail-fast)
   *
   * @see AC-7.3: Clears fired_at, changes to EMPLOYEE, and logs rehire
   */
  async markAsRehired(address: string, newAmount: string): Promise<void> {
    try {
      await this.db
        .update(recipientWallets)
        .set({
          classification: 'EMPLOYEE',
          firedAt: null,
          lastAmount: newAmount,
          monthsWithoutPayment: 0,
          hiredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(recipientWallets.address, address));

      this.logger.debug(`Rehired: ${address.slice(0, 8)}...`);
    } catch (error) {
      this.logger.error('Failed to mark wallet as rehired', { address, error });
      throw error;
    }
  }

  /**
   * Increment months without payment counter (batch operation).
   * Used by fired detection algorithm.
   *
   * @param addresses - Array of wallet addresses
   * @throws Error on database failure (fail-fast)
   */
  async incrementMonthsWithoutPayment(addresses: string[]): Promise<void> {
    if (addresses.length === 0) return;

    try {
      // Use Drizzle update with SQL expression for increment
      await this.db
        .update(recipientWallets)
        .set({
          monthsWithoutPayment: sql`${recipientWallets.monthsWithoutPayment} + 1`,
          updatedAt: new Date(),
        })
        .where(sql`${recipientWallets.address} = ANY(${addresses})`);
    } catch (error) {
      this.logger.error('Failed to increment months without payment', {
        count: addresses.length,
        error,
      });
      throw error;
    }
  }

  /**
   * Reset months without payment counter (wallet received payment).
   *
   * @param address - Wallet address
   * @throws Error on database failure (fail-fast)
   */
  async resetMonthsWithoutPayment(address: string): Promise<void> {
    try {
      await this.db
        .update(recipientWallets)
        .set({
          monthsWithoutPayment: 0,
          updatedAt: new Date(),
        })
        .where(eq(recipientWallets.address, address));
    } catch (error) {
      this.logger.error('Failed to reset months without payment', { address, error });
      throw error;
    }
  }

  /**
   * Get all wallets.
   *
   * @returns All recipient wallet records
   * @throws Error on database failure (fail-fast)
   */
  async getAll(): Promise<RecipientWallet[]> {
    try {
      return await this.db.select().from(recipientWallets);
    } catch (error) {
      this.logger.error('Failed to get all wallets', { error });
      throw error;
    }
  }

  /**
   * Get wallets by classification.
   *
   * @param classification - Classification type
   * @returns Wallets with specified classification
   * @throws Error on database failure (fail-fast)
   */
  async getByClassification(classification: Classification): Promise<RecipientWallet[]> {
    try {
      return await this.db
        .select()
        .from(recipientWallets)
        .where(eq(recipientWallets.classification, classification));
    } catch (error) {
      this.logger.error('Failed to get wallets by classification', { classification, error });
      throw error;
    }
  }

  /**
   * Increment total payments counter for a wallet.
   *
   * @param address - Wallet address
   * @throws Error on database failure (fail-fast)
   */
  async incrementTotalPayments(address: string): Promise<void> {
    try {
      await this.db
        .update(recipientWallets)
        .set({
          totalPayments: sql`${recipientWallets.totalPayments} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(recipientWallets.address, address));
    } catch (error) {
      this.logger.error('Failed to increment total payments', { address, error });
      throw error;
    }
  }
}
