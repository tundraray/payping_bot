/**
 * Payout session event constants and interfaces.
 *
 * Payout sessions track salary disbursement activity from the monitored wallet.
 * Sessions start on first outgoing transaction and end when balance drops below
 * threshold or timeout occurs.
 */

/**
 * Event emitted when payout session starts (first outgoing transaction).
 */
export const PAYOUT_START_EVENT = 'payout.start';

/**
 * Event emitted for each outgoing transaction during active payout session.
 */
export const PAYOUT_TRANSACTION_EVENT = 'payout.transaction';

/**
 * Event emitted when payout session ends (balance threshold or timeout).
 */
export const PAYOUT_END_EVENT = 'payout.end';

/**
 * Reason for payout session end.
 */
export type PayoutEndReason = 'BALANCE_THRESHOLD' | 'TIMEOUT';

/**
 * Payload for payout session start event.
 */
export interface PayoutStartEvent {
  /** Session start timestamp (Unix milliseconds) */
  startedAt: number;
  /** First outgoing transaction hash that triggered session */
  firstTransactionHash: string;
  /** USDT balance at session start (raw units, 6 decimals) */
  startBalance: string;
}

/**
 * Payload for individual outgoing transaction during payout session.
 */
export interface PayoutTransactionEvent {
  /** Transaction hash */
  transactionHash: string;
  /** Transaction amount (raw units, 6 decimals) */
  amount: string;
  /** Recipient wallet address */
  recipientAddress: string;
  /** Transaction timestamp (Unix milliseconds) */
  timestamp: number;
  /** Session running total after this transaction (raw units) */
  sessionTotalAmount: string;
  /** Transaction number in current session (1-based) */
  transactionNumber: number;
}

/**
 * Payload for payout session end event.
 */
export interface PayoutEndEvent {
  /** Session start timestamp (Unix milliseconds) */
  startedAt: number;
  /** Session end timestamp (Unix milliseconds) */
  endedAt: number;
  /** Reason for session end */
  endReason: PayoutEndReason;
  /** Number of outgoing transactions in session */
  transactionCount: number;
  /** Total amount paid out during session (raw units) */
  totalAmount: string;
  /** USDT balance at session end (raw units) */
  endingBalance: string;
  /** Session duration in minutes */
  durationMinutes: number;
}

/**
 * Convenience object grouping all payout event names.
 */
export const PayoutEvents = {
  START: PAYOUT_START_EVENT,
  TRANSACTION: PAYOUT_TRANSACTION_EVENT,
  END: PAYOUT_END_EVENT,
} as const;
