# Task: Transaction Events Constants

Metadata:
- Phase: 3 (Application)
- Dependencies: None (uses standard string constants)
- Provides: Event name constants for TransactionProcessorService
- Size: Small (1 file)

## Implementation Content
Create the event name constants used for NestJS EventEmitter. These constants ensure type-safe event names across the application.

Reference: Design Doc "Event Emission" section (AC-5.1).

## Target Files
- [x] `libs/blockchain/src/events/transaction.events.ts` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
No tests needed for pure constants - TypeScript compiler and usage tests provide verification.

### 2. Green Phase - Implement Event Constants

```typescript
// libs/blockchain/src/events/transaction.events.ts

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
 * All blockchain-related event names for type-safe access.
 */
export const TransactionEvents = {
  NEW: TRANSACTION_NEW_EVENT,
} as const;
```

### 3. Refactor Phase
- Ensure JSDoc comments are complete
- Verify event name follows NestJS conventions

## Completion Criteria
- [x] Event constants file created
- [x] Constants exported correctly
- [x] Operation verified: L3 (Build Success) - `pnpm run check` passes

## Related Acceptance Criteria
- AC-5.1: When a new transaction is verified, the system shall emit a `transaction.new` event

## Notes
- Impact scope: New file only
- Constraints: Event name must be exactly `transaction.new` per Design Doc
- This constant is used by TransactionProcessorService (emitter) and TelegramService (listener)
