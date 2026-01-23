import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { salaryHistory } from '../schema';
import { type Classification, RecipientWalletsService } from './recipient-wallets.service';

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
}

/**
 * ClassificationService implements automatic classification logic.
 *
 * This service evaluates payment patterns to automatically classify recipients:
 * - UNKNOWN: Payment < 500 USDT
 * - ONE_TIME: First payment >= 500 USDT
 * - EMPLOYEE: Regular payments with stable amounts (<=20% variance)
 * - FREELANCER: Multiple payments with high variance (>20%)
 * - FIRED: Employee without payment for 2+ months
 *
 * Also handles salary change detection and fired/rehired status tracking.
 *
 * @see AC-4.1 through AC-4.6: Classification rules
 * @see AC-6.1, AC-6.2: Salary tracking
 * @see AC-7.1 through AC-7.3: Fired/rehired status
 */
@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  /** Minimum payment threshold for meaningful classification (500 USDT in raw format) */
  private static readonly MIN_SIGNIFICANT_AMOUNT = 500_000_000; // 500 USDT * 10^6

  /** Variance threshold for EMPLOYEE classification (20%) */
  private static readonly EMPLOYEE_VARIANCE_THRESHOLD = 0.2;

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
   * @see AC-4.1: First payment < 500 -> UNKNOWN
   * @see AC-4.2: First payment >= 500 -> ONE_TIME
   * @see AC-4.3: Regular + stable (<=20% variance) -> EMPLOYEE
   * @see AC-4.4: Multiple + high variance (>20%) -> FREELANCER
   * @see AC-4.6: FIRED + new payment -> EMPLOYEE (rehire)
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

    // Handle rehire case (AC-4.6)
    if (wallet.classification === 'FIRED') {
      this.logger.log(`Rehire detected: ${walletAddress}`);

      return {
        classification: 'EMPLOYEE',
        changed: true,
        previousClassification: 'FIRED',
      };
    }

    // Need at least 2 payments for full pattern analysis
    if (payments.length < 2) {
      // But check if UNKNOWN should upgrade to ONE_TIME based on current payment
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
        `Keeping classification: ${walletAddress.slice(0, 8)}... -> ${wallet.classification} (only ${payments.length} payment(s), need 2+ for pattern analysis)`,
      );
      return {
        classification: wallet.classification,
        changed: false,
      };
    }

    // Calculate amount variance over recent payments
    const amounts = payments.map((p) => Number.parseFloat(p.amount));
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;

    // Calculate coefficient of variation (std dev / mean)
    const variance = amounts.reduce((sum, amt) => sum + (amt - avgAmount) ** 2, 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = avgAmount > 0 ? stdDev / avgAmount : 0;

    // Check if payments span multiple months
    const uniqueMonths = new Set(
      payments.map(
        (p) =>
          `${p.timestamp.getFullYear()}-${String(p.timestamp.getMonth() + 1).padStart(2, '0')}`,
      ),
    );

    this.logger.debug('Pattern analysis', {
      walletAddress: `${walletAddress.slice(0, 8)}...`,
      paymentsCount: payments.length,
      amounts: amounts.slice(0, 5), // First 5 for logging
      avgAmount,
      coefficientOfVariation: coefficientOfVariation.toFixed(3),
      varianceThreshold: ClassificationService.EMPLOYEE_VARIANCE_THRESHOLD,
      uniqueMonths: Array.from(uniqueMonths),
      currentClassification: wallet.classification,
    });

    // Classification logic (AC-4.3, AC-4.4)
    let newClassification: Classification = wallet.classification;

    if (uniqueMonths.size >= 2) {
      if (coefficientOfVariation <= ClassificationService.EMPLOYEE_VARIANCE_THRESHOLD) {
        // Regular payments across months with stable amounts (<=20% variance) -> EMPLOYEE
        newClassification = 'EMPLOYEE';
        this.logger.debug(
          `Classification decision: ${walletAddress.slice(0, 8)}... -> EMPLOYEE (${uniqueMonths.size} months, variance ${(coefficientOfVariation * 100).toFixed(1)}% <= ${ClassificationService.EMPLOYEE_VARIANCE_THRESHOLD * 100}%)`,
        );
      } else {
        // Multiple months with high variance -> FREELANCER
        newClassification = 'FREELANCER';
        this.logger.debug(
          `Classification decision: ${walletAddress.slice(0, 8)}... -> FREELANCER (${uniqueMonths.size} months, variance ${(coefficientOfVariation * 100).toFixed(1)}% > ${ClassificationService.EMPLOYEE_VARIANCE_THRESHOLD * 100}%)`,
        );
      }
    } else if (uniqueMonths.size === 1 && payments.length >= 2) {
      // Multiple payments same month, keep current classification or ONE_TIME
      if (wallet.classification === 'UNKNOWN') {
        const latestAmount = Number.parseFloat(newPayment.amount);
        if (latestAmount >= ClassificationService.MIN_SIGNIFICANT_AMOUNT) {
          newClassification = 'ONE_TIME';
          this.logger.debug(
            `Classification decision: ${walletAddress.slice(0, 8)}... -> ONE_TIME (multiple payments same month, amount >= threshold)`,
          );
        }
      } else {
        this.logger.debug(
          `Classification decision: ${walletAddress.slice(0, 8)}... -> keeping ${wallet.classification} (only 1 unique month)`,
        );
      }
    } else {
      this.logger.debug(
        `Classification decision: ${walletAddress.slice(0, 8)}... -> keeping ${wallet.classification} (no pattern match)`,
      );
    }

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
   * Calculate variance (coefficient of variation) for a set of amounts.
   * Exposed for testing purposes.
   *
   * @param amounts - Array of amounts (as strings)
   * @returns Coefficient of variation (0-1 scale)
   */
  calculateVariance(amounts: string[]): number {
    if (amounts.length < 2) return 0;

    const numericAmounts = amounts.map((a) => Number.parseFloat(a));
    const avgAmount = numericAmounts.reduce((sum, amt) => sum + amt, 0) / numericAmounts.length;

    if (avgAmount === 0) return 0;

    const variance =
      numericAmounts.reduce((sum, amt) => sum + (amt - avgAmount) ** 2, 0) / numericAmounts.length;
    const stdDev = Math.sqrt(variance);

    return stdDev / avgAmount;
  }
}
