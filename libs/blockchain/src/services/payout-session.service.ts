import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Interval } from '@nestjs/schedule';
import { Mutex } from 'async-mutex';
import { TronGridClient } from '../clients/trongrid.client';
import type { BlockchainConfig, PayoutConfig } from '../config/blockchain.config';
import {
  PAYOUT_END_EVENT,
  PAYOUT_START_EVENT,
  PAYOUT_TRANSACTION_EVENT,
  type PayoutEndEvent,
  type PayoutEndReason,
  type PayoutStartEvent,
  type PayoutTransactionEvent,
} from '../events/payout.events';
import type { Transaction } from '../interfaces/transaction.interface';

/**
 * In-memory state for payout session tracking.
 * Session tracks salary disbursement activity from the monitored wallet.
 */
export interface PayoutSessionState {
  /** Whether a payout session is currently active */
  isActive: boolean;
  /** Session start timestamp */
  startedAt: Date | null;
  /** USDT balance at session start (raw units, 6 decimals) */
  startBalance: string | null;
  /** Timestamp of last outgoing transaction */
  lastTransactionAt: Date | null;
  /** Number of outgoing transactions in current session */
  transactionCount: number;
  /** Cumulative amount paid out (raw units, 6 decimals) */
  totalAmount: string;
  /** Hash of first transaction that started the session */
  firstTransactionHash: string | null;
}

/**
 * Initial state for payout session (IDLE state).
 */
const INITIAL_STATE: PayoutSessionState = {
  isActive: false,
  startedAt: null,
  startBalance: null,
  lastTransactionAt: null,
  transactionCount: 0,
  totalAmount: '0',
  firstTransactionHash: null,
};

/**
 * Service for managing payout session state machine.
 *
 * Payout sessions track salary disbursement activity from the monitored wallet.
 * Sessions start on first outgoing transaction and end when balance drops below
 * threshold or timeout occurs.
 *
 * State Machine:
 * - IDLE: No active payout session (isActive = false)
 * - ACTIVE: Payout session in progress (isActive = true)
 *
 * Transitions:
 * - IDLE -> ACTIVE: First outgoing transaction detected
 * - ACTIVE -> ACTIVE: Subsequent outgoing transactions (statistics updated)
 * - ACTIVE -> IDLE: Balance threshold or timeout (handled in Task 06)
 *
 * @responsibility Session state management, state transitions, event emission
 * @layer Application
 */
@Injectable()
export class PayoutSessionService {
  private readonly logger = new Logger(PayoutSessionService.name);
  private readonly mutex = new Mutex();
  private readonly walletAddress: string;
  private readonly payoutConfig: PayoutConfig;

  /**
   * In-memory session state. Lost on service restart (acceptable per ADR-0004).
   */
  private state: PayoutSessionState = { ...INITIAL_STATE };

  constructor(
    private readonly tronGridClient: TronGridClient,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {
    const config = this.configService.get<BlockchainConfig>('blockchain');
    if (!config) {
      throw new Error('Blockchain configuration not found');
    }
    this.payoutConfig = config.payout;

    // Get wallet address from environment (required for balance checks)
    const walletAddress = this.configService.get<string>('MONITORED_WALLET_ADDRESS');
    if (!walletAddress) {
      throw new Error('MONITORED_WALLET_ADDRESS environment variable is required');
    }
    this.walletAddress = walletAddress;

    this.logger.log('PayoutSessionService initialized', {
      walletAddress: `${this.walletAddress.substring(0, 8)}...`,
      balanceThresholdUsdt: this.payoutConfig.balanceThresholdUsdt,
      timeoutMinutes: this.payoutConfig.timeoutMinutes,
      checkIntervalMs: this.payoutConfig.checkIntervalMs,
    });
  }

  /**
   * Handle outgoing transaction for payout session tracking.
   *
   * If session is IDLE, starts new session and emits payout.start event.
   * If session is ACTIVE, updates statistics only.
   * In both cases, emits payout.transaction event for each transaction.
   *
   * Protected by mutex to prevent race conditions during rapid transaction sequences.
   *
   * @param tx - Outgoing transaction from monitored wallet
   *
   * @see AC-1.1 - IDLE -> ACTIVE transition on first outgoing TX
   * @see AC-1.2 - Records start info (timestamp, balance, hash)
   * @see AC-1.3 - Subsequent TXs update statistics only (no start event)
   * @see AC-6.1 - Emits payout.transaction for each outgoing TX
   * @see AC-6.5 - First TX emits both payout.start AND payout.transaction
   */
  async handleOutgoingTransaction(tx: Transaction): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.state.isActive) {
        // First transaction - start session
        await this.startSession(tx);
      } else {
        // Subsequent transaction - update statistics
        this.updateSession(tx);
      }

      // Emit transaction event for every outgoing TX (AC-6.1)
      this.emitTransactionEvent(tx);
    });
  }

  /**
   * Start a new payout session.
   *
   * Fetches current balance, sets state to ACTIVE, and emits payout.start event.
   *
   * @param tx - First transaction of the session
   *
   * @see AC-1.1 - State transitions to ACTIVE
   * @see AC-1.2 - Records start timestamp, starting balance, first transaction hash
   * @see AC-1.4 - Emits payout.start event with correct payload
   */
  private async startSession(tx: Transaction): Promise<void> {
    try {
      // Fetch starting balance (AC-1.2)
      const balance = await this.tronGridClient.getUSDTBalance(this.walletAddress);
      const startedAt = new Date();

      // Update state to ACTIVE (AC-1.1)
      this.state = {
        isActive: true,
        startedAt,
        startBalance: balance,
        lastTransactionAt: new Date(tx.timestamp),
        transactionCount: 1,
        totalAmount: tx.amount,
        firstTransactionHash: tx.hash,
      };

      // Emit payout.start event (AC-1.4)
      const event: PayoutStartEvent = {
        startedAt: startedAt.getTime(),
        firstTransactionHash: tx.hash,
        startBalance: balance,
      };

      this.eventEmitter.emit(PAYOUT_START_EVENT, event);

      this.logger.log('Payout session started', {
        txHash: `${tx.hash.substring(0, 16)}...`,
        startBalance: balance,
        startBalanceUsdt: this.formatUsdtAmount(balance),
      });
    } catch (error) {
      this.logger.error('Failed to start payout session', {
        error,
        txHash: tx.hash,
      });
      throw error;
    }
  }

  /**
   * Update session statistics for subsequent transactions.
   *
   * @param tx - Transaction to add to session
   *
   * @see AC-1.3 - Updates statistics without emitting start event
   */
  private updateSession(tx: Transaction): void {
    this.state.transactionCount += 1;
    this.state.lastTransactionAt = new Date(tx.timestamp);

    // Add amount to total using BigInt for precision
    const currentTotal = BigInt(this.state.totalAmount);
    const txAmount = BigInt(tx.amount);
    this.state.totalAmount = (currentTotal + txAmount).toString();

    this.logger.debug('Session updated', {
      txHash: `${tx.hash.substring(0, 16)}...`,
      transactionCount: this.state.transactionCount,
      totalAmount: this.state.totalAmount,
      totalAmountUsdt: this.formatUsdtAmount(this.state.totalAmount),
    });
  }

  /**
   * Emit payout.transaction event for an outgoing transaction.
   *
   * @param tx - Transaction to emit event for
   *
   * @see AC-6.1 - Emits payout.transaction for each outgoing TX during active session
   */
  private emitTransactionEvent(tx: Transaction): void {
    const event: PayoutTransactionEvent = {
      transactionHash: tx.hash,
      amount: tx.amount,
      recipientAddress: tx.toAddress,
      timestamp: tx.timestamp,
      sessionTotalAmount: this.state.totalAmount,
      transactionNumber: this.state.transactionCount,
    };

    this.eventEmitter.emit(PAYOUT_TRANSACTION_EVENT, event);

    this.logger.debug('Transaction event emitted', {
      txHash: `${tx.hash.substring(0, 16)}...`,
      amount: tx.amount,
      amountUsdt: this.formatUsdtAmount(tx.amount),
      transactionNumber: this.state.transactionCount,
    });
  }

  /**
   * Get current session state (for testing and monitoring).
   *
   * @returns Copy of current session state
   */
  getState(): Readonly<PayoutSessionState> {
    return { ...this.state };
  }

  /**
   * Check if session is currently active.
   *
   * @returns true if session is in ACTIVE state
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * Periodic check for session timeout and balance threshold.
   *
   * Runs every 60 seconds (configurable via PAYOUT_CHECK_INTERVAL_MS).
   * Checks two end conditions:
   * 1. Balance < threshold (default 1000 USDT) - ends session with BALANCE_THRESHOLD
   * 2. Timeout (default 30 min) + balance decreased - ends session with TIMEOUT
   *
   * Protected by mutex to prevent race conditions with transaction handling.
   *
   * @see AC-2.1 - Balance checked periodically (every 60s)
   * @see AC-2.2 - Session ends when balance < 1000 USDT
   * @see AC-2.3 - Balance check failure logs error, session continues
   * @see AC-3.1 - Session ends after 30 min + balance decreased
   * @see AC-3.2 - Balance checked to confirm decrease
   * @see AC-3.3 - Session does NOT end if balance not decreased
   */
  @Interval(60000)
  async checkTimeout(): Promise<void> {
    await this.mutex.runExclusive(async () => {
      if (!this.state.isActive || !this.state.lastTransactionAt) {
        return; // No active session
      }

      try {
        const currentBalance = await this.tronGridClient.getUSDTBalance(this.walletAddress);

        // Check balance threshold (AC-2.2)
        const thresholdRaw = BigInt(this.payoutConfig.balanceThresholdUsdt) * BigInt(1_000_000);

        if (BigInt(currentBalance) < thresholdRaw) {
          this.logger.log('Balance below threshold, ending session', {
            currentBalance,
            currentBalanceUsdt: this.formatUsdtAmount(currentBalance),
            thresholdUsdt: this.payoutConfig.balanceThresholdUsdt,
          });
          await this.endSession('BALANCE_THRESHOLD', currentBalance);
          return;
        }

        // Check timeout with balance decrease (AC-3.1, AC-3.2, AC-3.3)
        const timeoutMs = this.payoutConfig.timeoutMinutes * 60 * 1000;
        const elapsed = Date.now() - this.state.lastTransactionAt.getTime();

        if (elapsed >= timeoutMs) {
          // biome-ignore lint/style/noNonNullAssertion: checkTimeout only runs when session is active, startBalance is always set
          const balanceDecreased = BigInt(currentBalance) < BigInt(this.state.startBalance!);

          if (balanceDecreased) {
            this.logger.log('Timeout elapsed with balance decrease, ending session', {
              elapsedMinutes: Math.round(elapsed / 60000),
              timeoutMinutes: this.payoutConfig.timeoutMinutes,
              startBalance: this.state.startBalance,
              currentBalance,
            });
            await this.endSession('TIMEOUT', currentBalance);
          } else {
            this.logger.debug('Timeout elapsed but balance not decreased, continuing session', {
              elapsedMinutes: Math.round(elapsed / 60000),
              startBalance: this.state.startBalance,
              currentBalance,
            });
          }
        }
      } catch (error) {
        // AC-2.3: Log error but don't end session - retry on next interval
        this.logger.error('Balance check failed, will retry on next interval', {
          error: error instanceof Error ? error.message : String(error),
          walletAddress: `${this.walletAddress.substring(0, 8)}...`,
        });
      }
    });
  }

  /**
   * End the payout session and emit payout.end event.
   *
   * @param reason - Reason for session end (BALANCE_THRESHOLD or TIMEOUT)
   * @param endingBalance - Wallet balance at session end (raw units)
   */
  private async endSession(reason: PayoutEndReason, endingBalance: string): Promise<void> {
    // biome-ignore lint/style/noNonNullAssertion: endSession is only called when session is active, startedAt is always set
    const durationMs = Date.now() - this.state.startedAt!.getTime();
    const durationMinutes = Math.round(durationMs / 60000);

    const event: PayoutEndEvent = {
      // biome-ignore lint/style/noNonNullAssertion: endSession is only called when session is active, startedAt is always set
      startedAt: this.state.startedAt!.getTime(),
      endedAt: Date.now(),
      endReason: reason,
      transactionCount: this.state.transactionCount,
      totalAmount: this.state.totalAmount,
      endingBalance,
      durationMinutes,
    };

    this.eventEmitter.emit(PAYOUT_END_EVENT, event);

    this.logger.log('Payout session ended', {
      reason,
      transactionCount: this.state.transactionCount,
      totalAmount: this.state.totalAmount,
      totalAmountUsdt: this.formatUsdtAmount(this.state.totalAmount),
      durationMinutes,
      endingBalance,
      endingBalanceUsdt: this.formatUsdtAmount(endingBalance),
    });

    // Reset to IDLE
    this.resetState();
  }

  /**
   * Reset session state to IDLE.
   */
  private resetState(): void {
    this.state = {
      isActive: false,
      startedAt: null,
      startBalance: null,
      lastTransactionAt: null,
      transactionCount: 0,
      totalAmount: '0',
      firstTransactionHash: null,
    };
  }

  /**
   * Format raw USDT amount (6 decimals) to human-readable string.
   *
   * @param rawAmount - Amount in raw units (6 decimals)
   * @returns Formatted amount string (e.g., "1234.56")
   */
  private formatUsdtAmount(rawAmount: string): string {
    const amount = BigInt(rawAmount);
    const divisor = BigInt(1_000_000);
    const whole = amount / divisor;
    const fraction = amount % divisor;
    const fractionStr = fraction.toString().padStart(6, '0').replace(/0+$/, '');
    return fractionStr ? `${whole}.${fractionStr}` : whole.toString();
  }
}
