import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { salaryHistory } from '../schema';
import { type Classification, RecipientWalletsService } from './recipient-wallets.service';

export interface RegularityResult {
  uniqueMonths: number; // Count of distinct months with payments
  spanMonths: number; // Total span from first to last payment in months
  regularity: number; // Regularity percentage (0.0 to 1.0)
}

export interface SalaryChangeResult {
  walletAddress: string;
  previousAmount: string;
  newAmount: string;
  changePercent: number;
  isIncrease: boolean;
}

export interface FiredWallet {
  walletAddress: string;
  lastPaymentMonth: string;
  monthsWithoutPayment: number;
}

export interface PaymentInfo {
  amount: string;
  timestamp: Date;
}

export interface ClassificationResult {
  classification: Classification;
  changed: boolean;
  previousClassification?: Classification;
  salaryChange?: SalaryChangeResult;
  regularity?: number; // Include regularity for logging
}

/**
 * ClassificationService implements automatic classification logic.
 *
 * This service evaluates payment patterns to automatically classify recipients:
 * - UNKNOWN: Payment < 500 USDT
 * - ONE_TIME: First payment >= 500 USDT, or < 3 payments, or span < 3 months
 * - EMPLOYEE: 3+ payments, span >= 3 months, max >= 500 USDT, regularity >= 70%
 * - FREELANCER: 3+ payments, span >= 3 months, max >= 500 USDT, regularity < 70%
 * - FIRED: Employee without payment for 2+ months
 *
 * Regularity is calculated as: unique_months / span_months
 * where span_months = months from first_seen_at to last_payment_at (inclusive)
 *
 * Also handles salary change detection and fired/rehired status tracking.
 *
 * @see AC-1.1, AC-2.1-2.3: UNKNOWN and ONE_TIME rules
 * @see AC-3.1-3.4: EMPLOYEE classification
 * @see AC-4.1: FREELANCER classification
 * @see AC-5.1: FIRED classification
 * @see AC-6.1, AC-6.2: Salary tracking
 * @see AC-7.1: Fired/rehired status
 */
@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  /** Minimum payment threshold for meaningful classification (500 USDT in raw format) */
  private static readonly MIN_SIGNIFICANT_AMOUNT = 500_000_000; // 500 USDT * 10^6

  /** Minimum regularity for EMPLOYEE classification (70%) */
  private static readonly EMPLOYEE_REGULARITY_THRESHOLD = 0.7;

  /** Minimum span in months for EMPLOYEE/FREELANCER classification */
  private static readonly MIN_SPAN_MONTHS = 3;

  /** Minimum payment count for pattern analysis */
  private static readonly MIN_PAYMENTS_FOR_PATTERN = 3;

  /** Salary change detection threshold (5%) */
  private static readonly SALARY_CHANGE_THRESHOLD = 0.05;

  /** Months without payment to mark as fired */
  private static readonly FIRED_MONTHS_THRESHOLD = 2;

  constructor(
    private readonly recipientWalletsService: RecipientWalletsService,
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
  ) {}

  /**
   * Evaluate and determine classification based on payment patterns.
   *
   * @param walletAddress - Wallet address to classify
   * @param payments - Recent payment history (last 3 months)
   * @param newPayment - Current payment being processed
   * @returns Classification result with change information
   *
   * @see AC-1.1: First payment < 500 -> UNKNOWN
   * @see AC-2.1: First payment >= 500 -> ONE_TIME
   * @see AC-3.1: 3+ payments, span >= 3 months, regularity >= 70% -> EMPLOYEE
   * @see AC-4.1: 3+ payments, span >= 3 months, regularity < 70% -> FREELANCER
   * @see AC-7.1: FIRED + new payment -> EMPLOYEE (rehire)
   */
  async evaluateClassification(
    walletAddress: string,
    payments: PaymentInfo[],
    newPayment: PaymentInfo,
  ): Promise<ClassificationResult> {
    const wallet = await this.recipientWalletsService.findByAddress(walletAddress);
    const amount = Number.parseFloat(newPayment.amount);

    this.logger.debug('Evaluating classification', {
      walletAddress: `${walletAddress.slice(0, 8)}...`,
      newPaymentAmount: newPayment.amount,
      parsedAmount: amount,
      threshold: ClassificationService.MIN_SIGNIFICANT_AMOUNT,
      isAboveThreshold: amount >= ClassificationService.MIN_SIGNIFICANT_AMOUNT,
      existingWallet: !!wallet,
      paymentsCount: payments.length,
    });

    if (!wallet) {
      // New wallet - initial classification
      const classification: Classification =
        amount < ClassificationService.MIN_SIGNIFICANT_AMOUNT ? 'UNKNOWN' : 'ONE_TIME';

      this.logger.log(
        `New wallet classification: ${walletAddress.slice(0, 8)}... -> ${classification} (amount: ${amount}, threshold: ${ClassificationService.MIN_SIGNIFICANT_AMOUNT})`,
      );

      return {
        classification,
        changed: true,
        previousClassification: undefined,
      };
    }

    const previousClassification = wallet.classification;

    // Handle rehire case (AC-7.1: FIRED -> EMPLOYEE on new payment)
    if (wallet.classification === 'FIRED') {
      this.logger.log(`Rehire detected: ${walletAddress}`);

      return {
        classification: 'EMPLOYEE',
        changed: true,
        previousClassification: 'FIRED',
      };
    }

    // Include new payment in analysis
    const allPayments = [...payments, newPayment];
    const totalPayments = allPayments.length;
    const maxAmount = Math.max(...allPayments.map((p) => Number.parseFloat(p.amount)));

    // Check if we have enough data for pattern analysis (need 3+ payments)
    if (totalPayments < ClassificationService.MIN_PAYMENTS_FOR_PATTERN) {
      // Check if UNKNOWN should upgrade to ONE_TIME based on amount threshold
      if (
        wallet.classification === 'UNKNOWN' &&
        amount >= ClassificationService.MIN_SIGNIFICANT_AMOUNT
      ) {
        this.logger.log(
          `Upgrading classification: ${walletAddress.slice(0, 8)}... UNKNOWN -> ONE_TIME (amount ${amount} >= threshold ${ClassificationService.MIN_SIGNIFICANT_AMOUNT})`,
        );
        return {
          classification: 'ONE_TIME',
          changed: true,
          previousClassification: 'UNKNOWN',
        };
      }

      this.logger.debug(
        `Keeping classification: ${walletAddress.slice(0, 8)}... -> ${wallet.classification} (only ${totalPayments} payment(s), need ${ClassificationService.MIN_PAYMENTS_FOR_PATTERN}+ for pattern analysis)`,
      );
      return {
        classification: wallet.classification,
        changed: false,
      };
    }

    // Max amount must be >= 500 USDT for EMPLOYEE/FREELANCER
    if (maxAmount < ClassificationService.MIN_SIGNIFICANT_AMOUNT) {
      this.logger.debug(
        `Keeping classification: ${walletAddress.slice(0, 8)}... -> ${wallet.classification} (max amount ${maxAmount} < threshold ${ClassificationService.MIN_SIGNIFICANT_AMOUNT})`,
      );
      return {
        classification: wallet.classification,
        changed: false,
      };
    }

    // Calculate regularity using the new algorithm
    const newPaymentTimestamp =
      newPayment.timestamp instanceof Date ? newPayment.timestamp.getTime() : newPayment.timestamp;
    const { uniqueMonths, spanMonths, regularity } = this.calculateRegularity(
      allPayments,
      wallet.firstSeenAt,
      newPaymentTimestamp,
    );

    this.logger.debug('Pattern analysis', {
      walletAddress: `${walletAddress.slice(0, 8)}...`,
      paymentsCount: totalPayments,
      uniqueMonths,
      spanMonths,
      regularity,
      regularityThreshold: ClassificationService.EMPLOYEE_REGULARITY_THRESHOLD,
      currentClassification: wallet.classification,
    });

    // Span must be >= 3 months for EMPLOYEE/FREELANCER
    if (spanMonths < ClassificationService.MIN_SPAN_MONTHS) {
      // Check if UNKNOWN should upgrade to ONE_TIME
      if (
        wallet.classification === 'UNKNOWN' &&
        maxAmount >= ClassificationService.MIN_SIGNIFICANT_AMOUNT
      ) {
        this.logger.debug(
          `Classification decision: ${walletAddress.slice(0, 8)}... -> ONE_TIME (span ${spanMonths} < ${ClassificationService.MIN_SPAN_MONTHS} months, upgrading from UNKNOWN)`,
        );
        return {
          classification: 'ONE_TIME',
          changed: true,
          previousClassification: 'UNKNOWN',
        };
      }
      this.logger.debug(
        `Keeping classification: ${walletAddress.slice(0, 8)}... -> ${wallet.classification} (span ${spanMonths} < ${ClassificationService.MIN_SPAN_MONTHS} months)`,
      );
      return {
        classification: wallet.classification,
        changed: false,
      };
    }

    // Determine classification based on regularity (AC-3.1, AC-4.1)
    const newClassification: Classification =
      regularity >= ClassificationService.EMPLOYEE_REGULARITY_THRESHOLD ? 'EMPLOYEE' : 'FREELANCER';

    // Log classification decision
    this.logger.debug('Classification decision', {
      walletAddress: `${walletAddress.slice(0, 8)}...`,
      decision: newClassification,
      reason: `${spanMonths} months span, ${uniqueMonths} unique months, regularity ${(regularity * 100).toFixed(0)}% ${regularity >= ClassificationService.EMPLOYEE_REGULARITY_THRESHOLD ? '>=' : '<'} 70%`,
    });

    const changed = newClassification !== previousClassification;

    if (changed) {
      this.logger.log(
        `Classification CHANGED: ${walletAddress.slice(0, 8)}... ${previousClassification} -> ${newClassification}`,
      );
    }

    return {
      classification: newClassification,
      changed,
      previousClassification: changed ? previousClassification : undefined,
      regularity,
    };
  }

  /**
   * Detect salary changes for EMPLOYEE recipients.
   *
   * Only tracks changes >5% for employees with existing salary data.
   * Records change in salary_history table.
   *
   * @param walletAddress - Wallet address
   * @param newAmount - New payment amount
   * @param transactionHash - Transaction hash for reference
   * @param transactionTimestamp - Transaction timestamp for detectedAt
   * @returns Salary change details if detected, null otherwise
   *
   * @see AC-6.1: Detects changes >5% for employees
   * @see AC-6.3: Records in salary_history table
   */
  async detectSalaryChange(
    walletAddress: string,
    newAmount: string,
    transactionHash: string,
    transactionTimestamp: number,
  ): Promise<SalaryChangeResult | null> {
    try {
      const wallet = await this.recipientWalletsService.findByAddress(walletAddress);

      // Only track salary changes for employees with existing salary data
      if (!wallet || wallet.classification !== 'EMPLOYEE' || !wallet.lastAmount) {
        return null;
      }

      const previousAmount = Number.parseFloat(wallet.lastAmount);
      const currentAmount = Number.parseFloat(newAmount);

      // Avoid division by zero
      if (previousAmount === 0) {
        return null;
      }

      // Calculate percentage change
      const changePercent = Math.abs(currentAmount - previousAmount) / previousAmount;

      // Only report changes > 5%
      if (changePercent <= ClassificationService.SALARY_CHANGE_THRESHOLD) {
        return null;
      }

      const changePercentFormatted = Number((changePercent * 100).toFixed(2));
      const isIncrease = currentAmount > previousAmount;

      // Record in salary_history
      await this.db.insert(salaryHistory).values({
        recipientWalletId: wallet.id,
        previousAmount: wallet.lastAmount,
        newAmount,
        changePercent: changePercentFormatted.toString(),
        detectedAt: new Date(transactionTimestamp),
        transactionHash,
      });

      this.logger.log(
        `Salary change detected: ${walletAddress} ${isIncrease ? '+' : '-'}${changePercentFormatted.toFixed(1)}%`,
      );

      return {
        walletAddress,
        previousAmount: wallet.lastAmount,
        newAmount,
        changePercent: changePercentFormatted,
        isIncrease,
      };
    } catch (error) {
      this.logger.error('Failed to detect salary change', { walletAddress, error });
      throw error;
    }
  }

  /**
   * Batch job to check for employees without recent payments.
   * Run this periodically (e.g., monthly) to detect terminated employees.
   *
   * @returns List of wallets marked as fired
   *
   * @see AC-7.1: Batch check for 2+ months no payment
   * @see AC-4.5: EMPLOYEE + 2 months no payment -> FIRED
   */
  async checkEmploymentStatus(): Promise<FiredWallet[]> {
    try {
      const employees = await this.recipientWalletsService.getByClassification('EMPLOYEE');
      const firedWallets: FiredWallet[] = [];
      const currentDate = new Date();

      for (const wallet of employees) {
        // Calculate months since last payment
        const lastPayment = new Date(wallet.lastPaymentAt);
        const monthsDiff =
          (currentDate.getFullYear() - lastPayment.getFullYear()) * 12 +
          (currentDate.getMonth() - lastPayment.getMonth());

        if (monthsDiff >= ClassificationService.FIRED_MONTHS_THRESHOLD) {
          // Mark as fired (AC-7.2)
          await this.recipientWalletsService.markAsFired(wallet.address, currentDate);

          firedWallets.push({
            walletAddress: wallet.address,
            lastPaymentMonth: `${lastPayment.getFullYear()}-${String(lastPayment.getMonth() + 1).padStart(2, '0')}`,
            monthsWithoutPayment: monthsDiff,
          });

          this.logger.log(
            `Marked as fired: ${wallet.address} (${monthsDiff} months without payment)`,
          );
        }
      }

      return firedWallets;
    } catch (error) {
      this.logger.error('Failed to check employment status', { error });
      throw error;
    }
  }

  /**
   * Calculate payment regularity based on unique months with payments.
   *
   * Regularity = unique_months / span_months
   * - 100% regularity: payments every month
   * - 70% regularity: payments in 7 out of 10 months
   * - Lower regularity: larger gaps between payments
   *
   * @param payments - All payments to analyze (including new payment)
   * @param firstSeenAt - First payment timestamp for this wallet
   * @param referenceTimestamp - Latest payment timestamp (usually new payment)
   * @returns RegularityResult with unique months, span, and regularity ratio
   */
  calculateRegularity(
    payments: Array<{ timestamp: Date | number }>,
    firstSeenAt: Date,
    referenceTimestamp: number,
  ): RegularityResult {
    // Extract unique months from all payments using UTC
    const uniqueMonthsSet = new Set(
      payments.map((p) => {
        const date = p.timestamp instanceof Date ? p.timestamp : new Date(p.timestamp);
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1; // 0-indexed, convert to 1-12
        return `${year}-${String(month).padStart(2, '0')}`;
      }),
    );

    // Calculate span from first_seen_at to reference timestamp (inclusive)
    const firstDate = new Date(firstSeenAt);
    const lastDate = new Date(referenceTimestamp);

    const spanMonths =
      (lastDate.getUTCFullYear() - firstDate.getUTCFullYear()) * 12 +
      (lastDate.getUTCMonth() - firstDate.getUTCMonth()) +
      1; // +1 for inclusive span

    const uniqueMonths = uniqueMonthsSet.size;
    const regularity = spanMonths > 0 ? uniqueMonths / spanMonths : 0;

    return { uniqueMonths, spanMonths, regularity };
  }
}
