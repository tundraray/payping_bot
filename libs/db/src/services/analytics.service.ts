import { type Transaction, TransactionType } from '@app/blockchain';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, asc, eq, gte, lt, max, sql } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database.provider';
import { monthlyPositions, recipientWallets, salaryHistory, transactions } from '../schema';
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
   * @param tx - Transaction to process
   * @returns Processing result with classification and position
   *
   * @see AC-5.1: Triggers within 100ms of save
   * @see AC-5.2: Updates classification immediately
   * @see AC-5.3: Calculates and stores position
   * @see AC-5.4: Completes within 200ms
   */
  async processTransaction(tx: Transaction): Promise<ProcessingResult> {
    const startTime = Date.now();
    const toAddress = tx.toAddress;

    try {
      // Step 1: Find or create recipient wallet
      let wallet = await this.recipientWalletsService.findByAddress(toAddress);

      if (!wallet) {
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
        wallet = created;
      }

      // Step 2: Get recent payments for classification (relative to transaction date)
      const recentPayments = await this.getRecentPayments(toAddress, 3, tx.timestamp);

      // Step 3: Evaluate classification
      const newPayment: PaymentInfo = {
        amount: tx.amount,
        timestamp: new Date(tx.timestamp),
      };

      const classificationResult = await this.classificationService.evaluateClassification(
        toAddress,
        recentPayments,
        newPayment,
      );

      // Step 4: Update wallet if classification changed
      if (classificationResult.changed) {
        await this.recipientWalletsService.updateClassification(
          toAddress,
          classificationResult.classification,
        );

        // Handle rehire case
        if (classificationResult.previousClassification === 'FIRED') {
          await this.recipientWalletsService.markAsRehired(toAddress, tx.amount);
        }
      }

      // Step 5: Detect salary change for employees
      let salaryChange: SalaryChangeResult | null = null;
      if (classificationResult.classification === 'EMPLOYEE' && wallet.lastAmount) {
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

      // Step 7: Calculate and store position
      const yearMonth = this.getYearMonth(tx.timestamp);
      const position = await this.calculateAndStorePosition(
        wallet.id,
        toAddress,
        yearMonth,
        classificationResult.classification,
        tx.hash,
        tx.amount,
        tx.timestamp,
      );

      const processingTimeMs = Date.now() - startTime;

      this.logger.log('Transaction processed for analytics', {
        txHash: tx.hash,
        toAddress,
        classification: classificationResult.classification,
        classificationChanged: classificationResult.changed,
        salaryChangeDetected: !!salaryChange,
        position,
        processingTimeMs,
      });

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
          wallet: p.walletAddress.slice(0, 8),
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
   * Get recent payments for a wallet address.
   *
   * @param address - Wallet address
   * @param months - Number of months to look back
   * @param referenceTimestamp - Reference timestamp (transaction date) to calculate from
   * @returns Array of payment info
   */
  private async getRecentPayments(
    address: string,
    months: number,
    referenceTimestamp: number,
  ): Promise<PaymentInfo[]> {
    const monitoredWallet = this.configService.get<string>('MONITORED_WALLET_ADDRESS');

    if (!monitoredWallet) {
      this.logger.warn('MONITORED_WALLET_ADDRESS not configured, cannot get recent payments');
      return [];
    }

    // Calculate start date relative to transaction date, not current date
    const referenceDate = new Date(referenceTimestamp);
    const startDate = new Date(
      Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - months, 1),
    );
    const startTimestamp = startDate.getTime();

    this.logger.debug('Fetching recent payments', {
      recipientAddress: `${address.slice(0, 8)}...`,
      fromWallet: `${monitoredWallet.slice(0, 8)}...`,
      months,
      referenceDate: referenceDate.toISOString(),
      startDate: startDate.toISOString(),
    });

    const result = await this.db
      .select({
        amount: transactions.amount,
        timestamp: transactions.timestamp,
      })
      .from(transactions)
      .where(
        and(
          eq(transactions.fromAddress, monitoredWallet), // Outgoing from monitored wallet
          eq(transactions.toAddress, address), // To recipient
          gte(transactions.timestamp, startTimestamp), // Within time window
          lt(transactions.timestamp, referenceTimestamp), // Before current transaction
        ),
      )
      .orderBy(asc(transactions.timestamp));

    this.logger.debug('Found payments', {
      recipientAddress: `${address.slice(0, 8)}...`,
      count: result.length,
      amounts: result.slice(0, 5).map((r) => r.amount),
    });

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
      // Update existing position with accumulated amount
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

  /**
   * Backfill analytics from existing transactions.
   * Processes all outgoing transactions from monitored wallet that haven't been processed yet.
   *
   * @returns Number of transactions processed
   */
  async backfillAnalytics(): Promise<number> {
    const monitoredWallet = await this.getMonitoredWalletAddress();
    if (!monitoredWallet) {
      this.logger.warn('No monitored wallet configured, cannot backfill');
      return 0;
    }

    this.logger.log('Starting analytics backfill', { monitoredWallet });

    // Get all outgoing transactions ordered by timestamp
    // Use case-insensitive comparison because TRON addresses can vary in case
    const outgoingTxs = await this.db
      .select()
      .from(transactions)
      .where(sql`lower(${transactions.fromAddress}) = lower(${monitoredWallet})`)
      .orderBy(asc(transactions.timestamp));

    this.logger.log(`Found ${outgoingTxs.length} outgoing transactions to process`);

    let processed = 0;
    for (const tx of outgoingTxs) {
      try {
        await this.processTransaction({
          hash: tx.hash,
          fromAddress: tx.fromAddress,
          toAddress: tx.toAddress,
          amount: tx.amount,
          timestamp: tx.timestamp,
          type: tx.type as TransactionType,
          blockNumber: tx.blockNumber,
          contractAddress: tx.contractAddress,
          raw: tx.raw as Record<string, unknown>,
        });
        processed++;

        if (processed % 10 === 0) {
          this.logger.log(`Backfill progress: ${processed}/${outgoingTxs.length}`);
        }
      } catch (error) {
        this.logger.error('Failed to process transaction during backfill', {
          hash: tx.hash,
          error,
        });
      }
    }

    this.logger.log(
      `Backfill completed: ${processed}/${outgoingTxs.length} transactions processed`,
    );
    return processed;
  }
}
