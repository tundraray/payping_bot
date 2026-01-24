# Task: Create PayoutSessionService with State Machine

**Task ID**: task-05
**Phase**: Phase 2 - Core Logic
**Estimated Effort**: 3 hours
**Verification Level**: L3 (Build Success Verification)

## Overview

Implement PayoutSessionService with in-memory state machine for payout session management. The service handles IDLE/ACTIVE state transitions, records session statistics, and emits payout.start events when first outgoing transaction is detected.

## Context

This is the core of the payout session feature. The service:
- Maintains in-memory session state (IDLE or ACTIVE)
- Detects first outgoing transaction and starts session
- Updates session statistics for subsequent transactions
- Emits payout.start event on session start
- Uses mutex to prevent race conditions in rapid transaction sequences

## Target Files

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\services\payout-session.service.ts`

## Dependencies

**Depends On**:
- Task 01 (Config) - needs PayoutConfig
- Task 02 (Events) - needs event interfaces
- Task 03 (Balance API) - needs getUSDTBalance()

**Blocks**:
- Task 06 (Timeout check) - needs service instance
- Task 07 (TX event emission) - needs service instance
- Task 08 (TransactionProcessor hook) - needs service to call
- Task 09 (Unit tests) - needs implementation to test

## Implementation Steps

### Step 1: Install async-mutex dependency

```bash
pnpm add async-mutex
```

### Step 2: Create PayoutSessionState interface

```typescript
interface PayoutSessionState {
  isActive: boolean;
  startedAt: Date | null;
  startBalance: string | null;
  lastTransactionAt: Date | null;
  transactionCount: number;
  totalAmount: string;
  firstTransactionHash: string | null;
}
```

### Step 3: Create PayoutSessionService class skeleton

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Mutex } from 'async-mutex';
import { TronGridClient } from '../clients/trongrid.client';
import {
  PAYOUT_START_EVENT,
  PayoutStartEvent,
  type Transaction,
} from '../events';

@Injectable()
export class PayoutSessionService {
  private readonly logger = new Logger(PayoutSessionService.name);
  private readonly mutex = new Mutex();

  private state: PayoutSessionState = {
    isActive: false,
    startedAt: null,
    startBalance: null,
    lastTransactionAt: null,
    transactionCount: 0,
    totalAmount: '0',
    firstTransactionHash: null,
  };

  constructor(
    private readonly tronGridClient: TronGridClient,
    private readonly eventEmitter: EventEmitter2,
    private readonly configService: ConfigService,
  ) {}

  // Methods in following steps
}
```

### Step 4: Implement handleOutgoingTransaction method

```typescript
/**
 * Handle outgoing transaction for payout session tracking.
 *
 * If session is IDLE, starts new session. If ACTIVE, updates statistics.
 * Protected by mutex to prevent race conditions.
 *
 * @param tx - Outgoing transaction from monitored wallet
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
  });
}
```

### Step 5: Implement startSession method

```typescript
/**
 * Start a new payout session.
 *
 * Fetches current balance, sets state to ACTIVE, and emits payout.start event.
 *
 * @param tx - First transaction of the session
 */
private async startSession(tx: Transaction): Promise<void> {
  try {
    // Fetch starting balance
    const walletAddress = this.configService.get<string>('blockchain.walletAddress');
    const balance = await this.tronGridClient.getUSDTBalance(walletAddress);

    // Update state to ACTIVE
    this.state = {
      isActive: true,
      startedAt: new Date(),
      startBalance: balance,
      lastTransactionAt: new Date(tx.timestamp),
      transactionCount: 1,
      totalAmount: tx.amount,
      firstTransactionHash: tx.hash,
    };

    // Emit payout.start event
    const event: PayoutStartEvent = {
      startedAt: this.state.startedAt.getTime(),
      firstTransactionHash: tx.hash,
      startBalance: balance,
    };

    this.eventEmitter.emit(PAYOUT_START_EVENT, event);

    this.logger.log('Payout session started', {
      txHash: tx.hash,
      startBalance: balance,
    });
  } catch (error) {
    this.logger.error('Failed to start payout session', { error, txHash: tx.hash });
    throw error;
  }
}
```

### Step 6: Implement updateSession method

```typescript
/**
 * Update session statistics for subsequent transactions.
 *
 * @param tx - Transaction to add to session
 */
private updateSession(tx: Transaction): void {
  this.state.transactionCount += 1;
  this.state.lastTransactionAt = new Date(tx.timestamp);

  // Add amount to total using BigInt for precision
  const currentTotal = BigInt(this.state.totalAmount);
  const txAmount = BigInt(tx.amount);
  this.state.totalAmount = (currentTotal + txAmount).toString();

  this.logger.debug('Session updated', {
    txHash: tx.hash,
    transactionCount: this.state.transactionCount,
    totalAmount: this.state.totalAmount,
  });
}
```

### Step 7: Implement getState and isActive methods

```typescript
/**
 * Get current session state (for testing and monitoring).
 */
getState(): Readonly<PayoutSessionState> {
  return { ...this.state };
}

/**
 * Check if session is currently active.
 */
isActive(): boolean {
  return this.state.isActive;
}
```

### Step 8: Verify build

```bash
pnpm build
```

## Acceptance Criteria

- [x] **AC-1.1**: IDLE -> ACTIVE transition on first outgoing TX
- [x] **AC-1.2**: Start info recorded (timestamp, balance, hash)
- [x] **AC-1.3**: Subsequent TXs update statistics only
- [x] **AC-1.4**: payout.start event emitted with correct payload
- [x] Mutex prevents race conditions
- [x] Build succeeds: `pnpm build`

## Verification Steps

1. Run build: `pnpm build`
2. Verify no TypeScript errors
3. Verify all methods implemented
4. Verify mutex wraps state transitions

## Implementation Notes

### State Machine Rules

- **Initial state**: IDLE (isActive = false)
- **IDLE -> ACTIVE**: First outgoing TX triggers startSession()
- **ACTIVE -> ACTIVE**: Subsequent TXs call updateSession()
- **ACTIVE -> IDLE**: Handled in Task 06 (timeout/balance check)

### Mutex Usage

The mutex ensures:
- Only one transaction is processed at a time
- State reads and writes are atomic
- No race condition between handleOutgoingTransaction() and checkTimeout()

### BigInt for Amount Arithmetic

Use BigInt to avoid JavaScript number precision issues:
```typescript
const total = BigInt(state.totalAmount) + BigInt(tx.amount);
state.totalAmount = total.toString();
```

## Notes

- **In-memory state**: State is lost on service restart (acceptable per ADR-0004)
- **Fire-and-forget**: Event emission does not block transaction processing
- **Error handling**: Balance fetch errors are logged and re-thrown
- **Thread-safe**: Mutex protects all state modifications

## References

- Design Doc: `docs/design/payout-session-notifications-design.md` (PayoutSessionService section)
- Work Plan: `docs/plans/payout-session-notifications-plan.md` (Task 2.1)
- ADR-0004: Payout Session Detection

## Completion Checklist

- [x] async-mutex installed
- [x] PayoutSessionState interface created
- [x] Service class skeleton created
- [x] handleOutgoingTransaction() implemented
- [x] startSession() implemented
- [x] updateSession() implemented
- [x] getState() and isActive() implemented
- [x] Mutex wraps state transitions
- [x] Logger statements added
- [x] Build succeeds
