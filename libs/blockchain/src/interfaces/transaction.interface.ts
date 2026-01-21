/**
 * Supported transaction types for blockchain monitoring
 */
export enum TransactionType {
  USDT = 'USDT',
}

/**
 * Domain model for a TRON blockchain transaction
 * Used throughout the blockchain monitoring system
 */
export interface Transaction {
  /** Transaction hash (64-character hex string) */
  hash: string;
  /** Type of transaction (USDT) */
  type: TransactionType;
  /** Sender address */
  fromAddress: string;
  /** Recipient address */
  toAddress: string;
  /** Amount as string to preserve precision (6 decimals for USDT) */
  amount: string;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** Block number where transaction was confirmed */
  blockNumber: number;
  /** USDT TRC20 contract address */
  contractAddress: string;
  /** Original API response for debugging */
  raw?: unknown;
}

/**
 * Event payload emitted when a new transaction is detected
 * Used by event listeners to receive transaction notifications
 */
export interface TransactionNewEvent {
  /** The detected transaction */
  transaction: Transaction;
  /** Timestamp when the transaction was detected (Unix ms) */
  detectedAt: number;
}
