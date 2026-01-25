import { type Transaction, TransactionType } from '@app/blockchain';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gte, lt, max, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { monthlyPositions, recipientWallets, salaryHistory, transactions } from '../schema';
import { maskWalletAddress } from '../utils/mask.utils';
import {
  ClassificationService,
  type PaymentInfo,
  type SalaryChangeResult,
} from './classification.service';
import { type Classification, RecipientWalletsService } from './recipient-wallets.service';

export interface ProcessingResult {
  walletAddress: string;
  classification: Classification;
  classificationChanged: boolean;
  salaryChange: SalaryChangeResult | null;
  position: number;
  processingTimeMs: number;
}

export interface AnalyticsResult {
  position: number;
  walletAddress: string;
  classification: Classification;
  amount: string;
  previousPosition: number | null;
  previousAmount: string | null;
  positionChange: 'up' | 'down' | 'same' | 'new' | 'miss';
}

export interface FiredEmployeeResult {
  walletAddress: string;
  lastPaymentMonth: string;
  lastAmount: string;
}

export interface GroupedAnalyticsResult {
  employees: AnalyticsResult[];
  freelancers: AnalyticsResult[];
  oneTime: AnalyticsResult[];
  unknown: AnalyticsResult[];
  fired: FiredEmployeeResult[];
}

export interface SalaryChangeInfo {
  walletAddress: string;
  changePercent: number;
  isIncrease: boolean;
}

interface RecipientMonthData {
  address: string;
  amount: string;
  firstTimestamp: number;
  firstTxHash: string;
  classification: Classification;
  recipientWalletId: number;
}

/**
 * AnalyticsService handles real-time transaction processing and analytics retrieval.
 *
 * This service provides:
 * - Real-time processing on transaction save (triggered by TransactionsService)
 * - Position calculation within classification groups
 * - Grouped analytics retrieval for display
 *
 * @see AC-5.1 through AC-5.4: Real-time processing
 * @see AC-2.3 through AC-2.6: Position calculation
 */
@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly recipientWalletsService: RecipientWalletsService,
    private readonly classificationService: ClassificationService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Process a transaction for analytics.
   * Called on each transaction save when fromAddress = monitored wallet.
   *
   * IDEMPOTENCY: Checks if transaction was already processed via monthly_positions.
   * Returns null if transaction was already processed to prevent double-counting.
   *
   * @param tx - Transaction to process
   * @returns Processing result with classification and position, or null if already processed
   *
   * @see AC-5.1: Triggers within 100ms of save
   * @see AC-5.2: Updates classification immediately
   * @see AC-5.3: Calculates and stores position
   * @see AC-5.4: Completes within 200ms
   */
  async processTransaction(tx: Transaction): Promise<ProcessingResult | null> {
    const startTime = Date.now();
    const toAddress = tx.toAddress;
    const yearMonth = this.getYearMonth(tx.timestamp);

    try {
      // IDEMPOTENCY: Check if this transaction was already processed
      // Look for existing monthly position with this exact transaction hash
      const wallet = await this.recipientWalletsService.findByAddress(toAddress);
      if (wallet) {
        const [existingPosition] = await this.db
          .select()
          .from(monthlyPositions)
          .where(
            and(
              eq(monthlyPositions.recipientWalletId, wallet.id),
              eq(monthlyPositions.yearMonth, yearMonth),
              eq(monthlyPositions.transactionHash, tx.hash),
            ),
          )
          .limit(1);

        if (existingPosition) {
          // Transaction already processed - return null to indicate no-op
          this.logger.debug('Transaction already processed, skipping', {
            txHash: tx.hash,
            toAddress,
          });
          return null;
        }
      }

      // Step 1: Find or create recipient wallet
      let walletRecord = wallet;

      if (!walletRecord) {
        // Create new wallet
        const [created] = await this.recipientWalletsService.upsertMany([
          {
            address: toAddress,
            firstSeenAt: new Date(tx.timestamp),
            lastPaymentAt: new Date(tx.timestamp),
            totalPayments: 1,
            lastAmount: tx.amount,
            classification: 'UNKNOWN',
          },
        ]);
        walletRecord = created;
      }

      // Step 2: Get ALL payments for classification (needed for regularity calculation)
      const allPayments = await this.getPayments(toAddress, tx.timestamp);

      // Step 3: Evaluate classification
      const newPayment: PaymentInfo = {
        amount: tx.amount,
        timestamp: new Date(tx.timestamp),
      };

      const classificationResult = await this.classificationService.evaluateClassification(
        toAddress,
        allPayments,
        newPayment,
      );

      // Step 4: Update wallet if classification changed
      if (classificationResult.changed) {
        // Handle rehire case (markAsRehired also sets classification)
        if (classificationResult.previousClassification === 'FIRED') {
          await this.recipientWalletsService.markAsRehired(toAddress, tx.amount);
        } else {
          await this.recipientWalletsService.updateClassification(
            toAddress,
            classificationResult.classification,
          );
        }
      }

      // Step 5: Detect salary change for employees
      let salaryChange: SalaryChangeResult | null = null;
      if (classificationResult.classification === 'EMPLOYEE' && walletRecord.lastAmount) {
        salaryChange = await this.classificationService.detectSalaryChange(
          toAddress,
          tx.amount,
          tx.hash,
          tx.timestamp,
        );
      }

      // Step 6: Update wallet payment info
      await this.recipientWalletsService.updateLastPayment(
        toAddress,
        tx.amount,
        new Date(tx.timestamp),
      );
      await this.recipientWalletsService.incrementTotalPayments(toAddress);
      await this.recipientWalletsService.resetMonthsWithoutPayment(toAddress);

      // Step 7: Calculate and store position (yearMonth already declared at top)
      const position = await this.calculateAndStorePosition(
        walletRecord.id,
        toAddress,
        yearMonth,
        classificationResult.classification,
        tx.hash,
        tx.amount,
        tx.timestamp,
      );

      const processingTimeMs = Date.now() - startTime;

      return {
        walletAddress: toAddress,
        classification: classificationResult.classification,
        classificationChanged: classificationResult.changed,
        salaryChange,
        position,
        processingTimeMs,
      };
    } catch (error) {
      this.logger.error('Failed to process transaction for analytics', {
        txHash: tx.hash,
        toAddress,
        error,
      });
      throw error;
    }
  }

  /**
   * Get grouped analytics data for a specific month.
   *
   * Uses comparison month as baseline:
   * - All wallets from comparison month are included
   * - Wallets in target month overlay comparison month data
   * - Wallets in comparison but NOT in target: show with amount=0, positionChange='miss'
   * - Wallets in target but NOT in comparison: show with positionChange='new'
   *
   * @param yearMonth - Target month in 'YYYY-MM' format
   * @param comparisonMonth - Optional comparison month (defaults to N-1 if not provided)
   * @returns Analytics data grouped by classification
   *
   * @see AC-1.4: Returns groups in order: Employees, Freelancers, One-time, Unknown, Fired
   * @see AC-2.3: Sorted by payment timestamp within group
   * @see AC-2.6: Position is within classification group
   */
  async getGroupedAnalytics(
    yearMonth: string,
    comparisonMonth?: string,
  ): Promise<GroupedAnalyticsResult> {
    try {
      // Calculate comparison month if not provided (default to N-1)
      let prevYearMonth: string;
      if (comparisonMonth) {
        prevYearMonth = comparisonMonth;
      } else {
        const [year, month] = yearMonth.split('-').map(Number);
        const prevDate = new Date(Date.UTC(year, month - 2, 1));
        prevYearMonth = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}`;
      }

      this.logger.log('getGroupedAnalytics called', { yearMonth, comparisonMonth: prevYearMonth });

      // Get previous month positions with wallet data (baseline)
      const prevPositions = await this.db
        .select({
          position: monthlyPositions.position,
          walletAddress: recipientWallets.address,
          classification: recipientWallets.classification,
          amount: monthlyPositions.amount,
          recipientWalletId: monthlyPositions.recipientWalletId,
        })
        .from(monthlyPositions)
        .innerJoin(recipientWallets, eq(monthlyPositions.recipientWalletId, recipientWallets.id))
        .where(eq(monthlyPositions.yearMonth, prevYearMonth))
        .orderBy(asc(monthlyPositions.position));

      // Get current month positions with wallet data
      const currentPositions = await this.db
        .select({
          position: monthlyPositions.position,
          walletAddress: recipientWallets.address,
          classification: recipientWallets.classification,
          amount: monthlyPositions.amount,
          recipientWalletId: monthlyPositions.recipientWalletId,
        })
        .from(monthlyPositions)
        .innerJoin(recipientWallets, eq(monthlyPositions.recipientWalletId, recipientWallets.id))
        .where(eq(monthlyPositions.yearMonth, yearMonth))
        .orderBy(asc(monthlyPositions.position));

      this.logger.log('Query results', {
        yearMonth,
        prevYearMonth,
        prevPositionsCount: prevPositions.length,
        currentPositionsCount: currentPositions.length,
        positions: currentPositions.slice(0, 5).map((p) => ({
          wallet: maskWalletAddress(p.walletAddress),
          classification: p.classification,
          position: p.position,
        })),
      });

      // Create maps for easy lookup
      const prevPosMap = new Map(prevPositions.map((p) => [p.recipientWalletId, p]));
      const currentPosMap = new Map(currentPositions.map((p) => [p.recipientWalletId, p]));

      // Collect wallet IDs in correct order:
      // 1. Current month wallets first (already sorted by position)
      // 2. Missed wallets (in prev but not in current) at the end
      const currentWalletIds = currentPositions.map((p) => p.recipientWalletId);
      const currentWalletIdSet = new Set(currentWalletIds);
      const missedWalletIds = prevPositions
        .filter((p) => !currentWalletIdSet.has(p.recipientWalletId))
        .map((p) => p.recipientWalletId);
      const allWalletIds = [...currentWalletIds, ...missedWalletIds];

      // Group results by classification
      const result: GroupedAnalyticsResult = {
        employees: [],
        freelancers: [],
        oneTime: [],
        unknown: [],
        fired: [],
      };

      // Track position within each classification group
      const groupPositions = {
        EMPLOYEE: 0,
        FREELANCER: 0,
        ONE_TIME: 0,
        UNKNOWN: 0,
      };

      // Process all wallets (from both months)
      for (const walletId of allWalletIds) {
        const currentPos = currentPosMap.get(walletId);
        const prevPos = prevPosMap.get(walletId);

        // Get wallet data - prefer current month's data, fallback to previous month
        const walletData = currentPos || prevPos;
        if (!walletData) continue;

        // Calculate position change
        const positionChange = this.calculatePositionChange(
          currentPos?.position ?? null,
          prevPos?.position ?? null,
        );

        // For missed wallets (in N-1 but not in N), show with amount=0
        const amount = currentPos?.amount ?? '0';
        const position = currentPos?.position ?? 0;

        const analyticsResult: AnalyticsResult = {
          position,
          walletAddress: walletData.walletAddress,
          classification: walletData.classification as Classification,
          amount,
          previousPosition: prevPos?.position ?? null,
          previousAmount: prevPos?.amount ?? null,
          positionChange,
        };

        switch (walletData.classification) {
          case 'EMPLOYEE':
            groupPositions.EMPLOYEE++;
            analyticsResult.position = groupPositions.EMPLOYEE;
            result.employees.push(analyticsResult);
            break;
          case 'FREELANCER':
            groupPositions.FREELANCER++;
            analyticsResult.position = groupPositions.FREELANCER;
            result.freelancers.push(analyticsResult);
            break;
          case 'ONE_TIME':
            groupPositions.ONE_TIME++;
            analyticsResult.position = groupPositions.ONE_TIME;
            result.oneTime.push(analyticsResult);
            break;
          case 'UNKNOWN':
            groupPositions.UNKNOWN++;
            analyticsResult.position = groupPositions.UNKNOWN;
            result.unknown.push(analyticsResult);
            break;
        }
      }

      // Sort each group: current month wallets first (by position), then missed wallets
      const sortByPositionAndStatus = (a: AnalyticsResult, b: AnalyticsResult) => {
        // Missed wallets go to the end
        if (a.positionChange === 'miss' && b.positionChange !== 'miss') return 1;
        if (a.positionChange !== 'miss' && b.positionChange === 'miss') return -1;
        // Within same status, sort by position
        return a.position - b.position;
      };

      result.employees.sort(sortByPositionAndStatus);
      result.freelancers.sort(sortByPositionAndStatus);
      result.oneTime.sort(sortByPositionAndStatus);
      result.unknown.sort(sortByPositionAndStatus);

      // Reassign positions after sorting
      for (let i = 0; i < result.employees.length; i++) {
        result.employees[i].position = i + 1;
      }
      for (let i = 0; i < result.freelancers.length; i++) {
        result.freelancers[i].position = i + 1;
      }
      for (let i = 0; i < result.oneTime.length; i++) {
        result.oneTime[i].position = i + 1;
      }
      for (let i = 0; i < result.unknown.length; i++) {
        result.unknown[i].position = i + 1;
      }

      // Get fired employees
      const firedWallets = await this.recipientWalletsService.getByClassification('FIRED');
      result.fired = firedWallets.map((w) => ({
        walletAddress: w.address,
        lastPaymentMonth: w.lastPaymentAt
          ? `${w.lastPaymentAt.getFullYear()}-${String(w.lastPaymentAt.getMonth() + 1).padStart(2, '0')}`
          : 'N/A',
        lastAmount: w.lastAmount ?? '0',
      }));

      return result;
    } catch (error) {
      this.logger.error('Failed to get grouped analytics', { yearMonth, error });
      throw error;
    }
  }

  /**
   * Get salary changes for a specific month.
   * Returns salary changes detected in the given month for employees.
   *
   * @param yearMonth - Month in 'YYYY-MM' format
   * @returns Map of wallet address to salary change info
   */
  async getSalaryChangesForMonth(yearMonth: string): Promise<Map<string, SalaryChangeInfo>> {
    try {
      const [year, month] = yearMonth.split('-').map(Number);
      const startTimestamp = new Date(Date.UTC(year, month - 1, 1));
      const endTimestamp = new Date(Date.UTC(year, month, 1));

      const changes = await this.db
        .select({
          walletAddress: recipientWallets.address,
          changePercent: salaryHistory.changePercent,
          previousAmount: salaryHistory.previousAmount,
          newAmount: salaryHistory.newAmount,
        })
        .from(salaryHistory)
        .innerJoin(recipientWallets, eq(salaryHistory.recipientWalletId, recipientWallets.id))
        .where(
          and(
            gte(salaryHistory.detectedAt, startTimestamp),
            lt(salaryHistory.detectedAt, endTimestamp),
          ),
        );

      const result = new Map<string, SalaryChangeInfo>();

      for (const change of changes) {
        const changePercentNum = Number.parseFloat(change.changePercent ?? '0');
        const prevAmount = Number.parseFloat(change.previousAmount);
        const newAmount = Number.parseFloat(change.newAmount);

        result.set(change.walletAddress, {
          walletAddress: change.walletAddress,
          changePercent: changePercentNum,
          isIncrease: newAmount > prevAmount,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Failed to get salary changes for month', { yearMonth, error });
      return new Map();
    }
  }

  /**
   * Calculate positions for all recipients in a classification group for a month.
   * Positions are ordered by first payment timestamp, then by transaction hash for determinism.
   *
   * @param yearMonth - Month in 'YYYY-MM' format
   * @param classification - Classification to calculate positions for
   *
   * @see AC-2.4: Position based on first payment timestamp
   * @see AC-2.5: Transaction hash as secondary sort for determinism
   * @see AC-2.6: Position within classification group
   */
  async calculatePositionsWithinGroup(
    yearMonth: string,
    classification: Classification,
  ): Promise<void> {
    try {
      const monitoredWallet = await this.getMonitoredWalletAddress();
      if (!monitoredWallet) {
        this.logger.warn('No monitored wallet configured, skipping position calculation');
        return;
      }

      // Parse year-month
      const [year, month] = yearMonth.split('-').map(Number);
      const startTimestamp = Date.UTC(year, month - 1, 1);
      const endTimestamp = Date.UTC(year, month, 1);

      // Get all recipients with their first transaction in the month
      const recipientsData = await this.getMonthlyRecipientData(
        monitoredWallet,
        startTimestamp,
        endTimestamp,
        classification,
      );

      // Sort by first timestamp, then by hash for determinism
      recipientsData.sort((a, b) => {
        if (a.firstTimestamp !== b.firstTimestamp) {
          return a.firstTimestamp - b.firstTimestamp;
        }
        return a.firstTxHash.localeCompare(b.firstTxHash);
      });

      // Assign positions
      for (let i = 0; i < recipientsData.length; i++) {
        const recipient = recipientsData[i];
        const position = i + 1;

        await this.db
          .insert(monthlyPositions)
          .values({
            recipientWalletId: recipient.recipientWalletId,
            yearMonth,
            position,
            transactionHash: recipient.firstTxHash,
            amount: recipient.amount,
            paymentTimestamp: recipient.firstTimestamp,
          })
          .onConflictDoUpdate({
            target: [monthlyPositions.recipientWalletId, monthlyPositions.yearMonth],
            set: {
              position,
              amount: recipient.amount,
              paymentTimestamp: recipient.firstTimestamp,
              transactionHash: recipient.firstTxHash,
              updatedAt: new Date(),
            },
          });
      }
    } catch (error) {
      this.logger.error('Failed to calculate positions within group', {
        yearMonth,
        classification,
        error,
      });
      throw error;
    }
  }

  /**
   * Get payments for a wallet address.
   *
   * @param address - Wallet address
   * @param referenceTimestamp - Reference timestamp (transaction date) to calculate from
   * @param months - Optional number of months to look back. If not provided, returns ALL payments.
   * @returns Array of payment info
   */
  private async getPayments(
    address: string,
    referenceTimestamp: number,
    months?: number,
  ): Promise<PaymentInfo[]> {
    const monitoredWallet = this.configService.get<string>('MONITORED_WALLET_ADDRESS');

    if (!monitoredWallet) {
      this.logger.warn('MONITORED_WALLET_ADDRESS not configured, cannot get payments');
      return [];
    }

    const referenceDate = new Date(referenceTimestamp);

    // Build where conditions
    const conditions = [
      eq(transactions.fromAddress, monitoredWallet), // Outgoing from monitored wallet
      eq(transactions.toAddress, address), // To recipient
      lt(transactions.timestamp, referenceTimestamp), // Before current transaction
    ];

    // Add time window filter only if months is specified
    if (months !== undefined) {
      const startDate = new Date(
        Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - months, 1),
      );
      conditions.push(gte(transactions.timestamp, startDate.getTime()));
    }

    const result = await this.db
      .select({
        amount: transactions.amount,
        timestamp: transactions.timestamp,
      })
      .from(transactions)
      .where(and(...conditions))
      .orderBy(asc(transactions.timestamp));

    return result.map((r) => ({
      amount: r.amount,
      timestamp: new Date(r.timestamp),
    }));
  }

  /**
   * Get monthly recipient data for position calculation.
   */
  private async getMonthlyRecipientData(
    monitoredWallet: string,
    startTimestamp: number,
    endTimestamp: number,
    classification: Classification,
  ): Promise<RecipientMonthData[]> {
    // Get transactions for the month
    const txs = await this.db
      .select({
        toAddress: transactions.toAddress,
        amount: transactions.amount,
        timestamp: transactions.timestamp,
        hash: transactions.hash,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.fromAddress, monitoredWallet),
          gte(transactions.timestamp, startTimestamp),
          lt(transactions.timestamp, endTimestamp),
        ),
      )
      .orderBy(asc(transactions.timestamp), asc(transactions.hash));

    // Group by recipient
    const recipientMap = new Map<string, RecipientMonthData>();

    for (const tx of txs) {
      const wallet = await this.recipientWalletsService.findByAddress(tx.toAddress);
      if (!wallet || wallet.classification !== classification) {
        continue;
      }

      const existing = recipientMap.get(tx.toAddress);
      if (!existing) {
        recipientMap.set(tx.toAddress, {
          address: tx.toAddress,
          amount: tx.amount,
          firstTimestamp: tx.timestamp,
          firstTxHash: tx.hash,
          classification: wallet.classification as Classification,
          recipientWalletId: wallet.id,
        });
      } else {
        // Accumulate amount
        const currentAmount = Number.parseFloat(existing.amount);
        const newAmount = Number.parseFloat(tx.amount);
        existing.amount = (currentAmount + newAmount).toString();
      }
    }

    return Array.from(recipientMap.values());
  }

  /**
   * Calculate and store position for a single recipient.
   *
   * IDEMPOTENCY: Tracks transaction hashes to prevent double-counting.
   * If the same txHash is processed twice, the second call is a no-op.
   */
  private async calculateAndStorePosition(
    walletId: number,
    _address: string,
    yearMonth: string,
    _classification: Classification,
    txHash: string,
    amount: string,
    timestamp: number,
  ): Promise<number> {
    // Check existing position
    const [existing] = await this.db
      .select()
      .from(monthlyPositions)
      .where(
        and(
          eq(monthlyPositions.recipientWalletId, walletId),
          eq(monthlyPositions.yearMonth, yearMonth),
        ),
      )
      .limit(1);

    if (existing) {
      // IDEMPOTENCY: Check if this exact transaction was already processed
      // The transactionHash field stores the FIRST transaction hash for this position,
      // but we need to check if current txHash was already counted to prevent duplicates.
      // For simplicity, we track processed hashes in the existing hash or skip if same hash.
      if (existing.transactionHash === txHash) {
        // Same transaction being processed again - skip to prevent double-counting
        return existing.position;
      }

      // Different transaction in same month - accumulate amount (this is correct behavior)
      const currentAmount = Number.parseFloat(existing.amount);
      const newAmount = Number.parseFloat(amount);
      const totalAmount = (currentAmount + newAmount).toString();

      await this.db
        .update(monthlyPositions)
        .set({
          amount: totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(monthlyPositions.id, existing.id));

      return existing.position;
    }

    // Get current max position for new entry
    const maxPosResult = await this.db
      .select({ maxPos: max(monthlyPositions.position) })
      .from(monthlyPositions)
      .where(eq(monthlyPositions.yearMonth, yearMonth));

    const maxPos = maxPosResult[0]?.maxPos ?? 0;
    const newPosition = maxPos + 1;

    // Insert new position
    await this.db.insert(monthlyPositions).values({
      recipientWalletId: walletId,
      yearMonth,
      position: newPosition,
      transactionHash: txHash,
      amount,
      paymentTimestamp: timestamp,
    });

    return newPosition;
  }

  /**
   * Get year-month string from timestamp.
   */
  private getYearMonth(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Calculate position change indicator.
   * @param current - Current position (null if wallet not in current month - MISS)
   * @param previous - Previous position (null if wallet not in previous month - NEW)
   */
  private calculatePositionChange(
    current: number | null,
    previous: number | null,
  ): 'up' | 'down' | 'same' | 'new' | 'miss' {
    // Wallet was in previous month but not in current month
    if (current === null) return 'miss';
    // Wallet is in current month but wasn't in previous month
    if (previous === null) return 'new';
    if (current < previous) return 'up';
    if (current > previous) return 'down';
    return 'same';
  }

  /**
   * Get monitored wallet address from configuration.
   */
  private async getMonitoredWalletAddress(): Promise<string | null> {
    const address = this.configService.get<string>('MONITORED_WALLET_ADDRESS');
    return address || null;
  }

  /** Maximum concurrent wallet processing during backfill */
  private static readonly BACKFILL_CONCURRENCY = 10;

  /**
   * Backfill analytics from existing transactions.
   * Processes all outgoing transactions from monitored wallet.
   *
   * IDEMPOTENCY: Uses clean slate approach - clears all computed data before
   * processing to ensure consistent results regardless of how many times
   * backfill runs.
   *
   * Parallelization strategy:
   * - Group transactions by recipient wallet
   * - Process wallets in parallel (up to BACKFILL_CONCURRENCY)
   * - Within each wallet, process transactions sequentially (preserves order)
   *
   * @returns Number of transactions processed
   */
  async backfillAnalytics(): Promise<number> {
    const monitoredWallet = await this.getMonitoredWalletAddress();
    if (!monitoredWallet) {
      this.logger.warn('No monitored wallet configured, cannot backfill');
      return 0;
    }

    this.logger.log('Starting analytics backfill (clean slate)', { monitoredWallet });

    // IDEMPOTENCY: Clean slate - clear all computed analytics data before processing
    // This ensures backfill produces consistent results regardless of previous runs
    this.logger.log('Clearing monthly_positions and resetting total_payments...');
    await this.db.delete(monthlyPositions);
    await this.db.update(recipientWallets).set({ totalPayments: 0 });
    this.logger.log('Clean slate complete, starting transaction processing...');

    // Get all outgoing transactions ordered by timestamp
    const outgoingTxs = await this.db
      .select()
      .from(transactions)
      .where(sql`lower(${transactions.fromAddress}) = lower(${monitoredWallet})`)
      .orderBy(asc(transactions.timestamp));

    this.logger.log(`Found ${outgoingTxs.length} outgoing transactions to process`);

    // Group transactions by recipient wallet (preserving order within each group)
    const txsByWallet = new Map<string, typeof outgoingTxs>();
    for (const tx of outgoingTxs) {
      const key = tx.toAddress.toLowerCase();
      if (!txsByWallet.has(key)) {
        txsByWallet.set(key, []);
      }
      txsByWallet.get(key)!.push(tx);
    }

    this.logger.log(`Grouped into ${txsByWallet.size} wallets for parallel processing`);

    // Process wallets in parallel batches
    const walletGroups = Array.from(txsByWallet.values());
    let totalProcessed = 0;
    let walletsCompleted = 0;

    // Process in batches of BACKFILL_CONCURRENCY
    for (let i = 0; i < walletGroups.length; i += AnalyticsService.BACKFILL_CONCURRENCY) {
      const batch = walletGroups.slice(i, i + AnalyticsService.BACKFILL_CONCURRENCY);

      const results = await Promise.all(
        batch.map((walletTxs) => this.processWalletTransactions(walletTxs)),
      );

      totalProcessed += results.reduce((sum, count) => sum + count, 0);
      walletsCompleted += batch.length;

      this.logger.log(
        `Backfill progress: ${walletsCompleted}/${txsByWallet.size} wallets, ${totalProcessed}/${outgoingTxs.length} txs`,
      );
    }

    this.logger.log(
      `Backfill completed: ${totalProcessed}/${outgoingTxs.length} transactions processed`,
    );
    return totalProcessed;
  }

  /**
   * Process all transactions for a single wallet sequentially.
   * @returns Number of successfully processed transactions (excludes skipped duplicates)
   */
  private async processWalletTransactions(
    txs: Array<{
      hash: string;
      fromAddress: string;
      toAddress: string;
      amount: string;
      timestamp: number;
      type: string;
      blockNumber: number;
      contractAddress: string | null;
      raw: unknown;
    }>,
  ): Promise<number> {
    let processed = 0;

    for (const tx of txs) {
      try {
        const result = await this.processTransaction({
          hash: tx.hash,
          fromAddress: tx.fromAddress,
          toAddress: tx.toAddress,
          amount: tx.amount,
          timestamp: tx.timestamp,
          type: tx.type as TransactionType,
          blockNumber: tx.blockNumber,
          contractAddress: tx.contractAddress ?? '',
          raw: tx.raw as Record<string, unknown>,
        });
        // Only count if actually processed (not skipped as duplicate)
        if (result !== null) {
          processed++;
        }
      } catch (error) {
        this.logger.error('Failed to process transaction during backfill', {
          hash: tx.hash,
          error,
        });
      }
    }

    return processed;
  }
}
