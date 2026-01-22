/**
 * Event emitted when a new incoming transaction is detected.
 *
 * Payload: TransactionNewEvent
 * - transaction: Transaction object with all fields
 * - detectedAt: Unix timestamp when transaction was detected
 *
 * @example
 * // Emitting
 * this.eventEmitter.emit(TRANSACTION_NEW_EVENT, { transaction, detectedAt: Date.now() });
 *
 * // Listening
 * @OnEvent(TRANSACTION_NEW_EVENT)
 * handleNewTransaction(payload: TransactionNewEvent) { ... }
 */
export const TRANSACTION_NEW_EVENT = 'transaction.new';

/**
 * Event emitted when a transaction is confirmed (optional, for future use).
 *
 * Payload: TransactionConfirmedEvent (to be defined when needed)
 */
export const TRANSACTION_CONFIRMED_EVENT = 'transaction.confirmed';

/**
 * All blockchain-related event names for type-safe access.
 */
export const TransactionEvents = {
  NEW: TRANSACTION_NEW_EVENT,
  CONFIRMED: TRANSACTION_CONFIRMED_EVENT,
} as const;
