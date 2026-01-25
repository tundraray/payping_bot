# Task: Create Payout Event Definitions

**Task ID**: task-02
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 45 minutes
**Verification Level**: L3 (Build Success Verification)

## Overview

Define payout event constants and TypeScript interfaces for the three payout session lifecycle events: session start, individual transactions, and session end. These contracts will be shared between PayoutSessionService (event emitter) and PayoutListener (event consumer).

## Context

The payout session feature uses event-driven architecture with three distinct event types:
1. **payout.start**: Emitted when first outgoing transaction detected (session begins)
2. **payout.transaction**: Emitted for each outgoing transaction during active session
3. **payout.end**: Emitted when session ends (balance threshold or timeout)

These events carry structured payloads with session statistics, transaction details, and end reasons.

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\events\payout.events.ts`

### Files to Modify
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\events\index.ts` (add exports)

## Dependencies

**Depends On**: None (can start immediately)

**Blocks**:
- Task 05 (PayoutSessionService) - needs event interfaces for emission
- Task 07 (TX event emission) - needs PayoutTransactionEvent interface
- Task 11 (PayoutListener) - needs event interfaces for handling

## Implementation Steps

### Step 1: Create payout.events.ts

Create `libs/blockchain/src/events/payout.events.ts` with the following content:

```typescript
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
```

### Step 2: Update events/index.ts

Add exports to `libs/blockchain/src/events/index.ts`:

```typescript
export * from './payout.events';
```

### Step 3: Verify build

```bash
pnpm build
```

## Acceptance Criteria

- [x] All 3 event constants defined (AC-1.4, AC-6.1)
- [x] `PayoutEndReason` type defined with 2 values
- [x] `PayoutStartEvent` interface with 3 fields (startedAt, firstTransactionHash, startBalance)
- [x] `PayoutTransactionEvent` interface with 6 fields
- [x] `PayoutEndEvent` interface with 7 fields
- [x] `PayoutEvents` convenience object defined
- [x] All exports from events/index.ts
- [x] Build succeeds: `pnpm build`
- [x] JSDoc comments for all exported symbols

## Verification Steps

1. Run build: `pnpm build`
2. Verify no TypeScript errors
3. Verify all types are exported
4. Verify JSDoc comments are complete

## Contract Details

### PayoutStartEvent
- **startedAt**: Unix timestamp in milliseconds (not seconds)
- **firstTransactionHash**: 64-character hex string
- **startBalance**: String format to preserve precision (6 decimals)

### PayoutTransactionEvent
- **transactionNumber**: 1-based (first TX = 1, not 0)
- **sessionTotalAmount**: Running total AFTER this transaction
- **amount**: Raw units (e.g., "1000000" = 1 USDT)

### PayoutEndEvent
- **durationMinutes**: Rounded to nearest minute
- **endReason**: Either 'BALANCE_THRESHOLD' or 'TIMEOUT'
- **endingBalance**: May be below threshold or same as start (timeout case)

## Notes

- **Raw units**: All amounts use raw TRC20 units (6 decimals for USDT)
- **String format**: Amounts are strings to avoid JavaScript number precision issues
- **Event naming**: Follows `resource.action` pattern (e.g., `payout.start`)
- **Timestamps**: Unix milliseconds for consistency with JavaScript Date.now()

## References

- Design Doc: `docs/design/payout-session-notifications-design.md` (Contract Definitions section)
- Work Plan: `docs/plans/payout-session-notifications-plan.md` (Task 1.2)
- ADR-0004: Payout Session Detection

## Completion Checklist

- [x] payout.events.ts created
- [x] All 3 event constants defined
- [x] PayoutEndReason type created
- [x] PayoutStartEvent interface created
- [x] PayoutTransactionEvent interface created
- [x] PayoutEndEvent interface created
- [x] PayoutEvents const object created
- [x] Exports added to index.ts (note: codebase uses direct export from blockchain index.ts, not events/index.ts)
- [x] JSDoc comments complete
- [x] Build succeeds
