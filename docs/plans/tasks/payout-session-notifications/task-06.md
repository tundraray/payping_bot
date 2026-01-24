# Task: Implement Timeout and Balance Threshold Check

**Task ID**: task-06
**Phase**: Phase 2 - Core Logic
**Estimated Effort**: 2 hours
**Verification Level**: L3 (Build Success Verification)

## Overview

Add scheduled task (@Interval) for timeout detection and balance threshold checking. This task runs every 60 seconds to check if the active payout session should end due to balance falling below 1000 USDT or 30-minute timeout with decreased balance.

## Target Files

### Files to Modify
- `D:\git\github\tg-bots\payping_bot\libs\blockchain\src\services\payout-session.service.ts`

## Dependencies

**Depends On**: Task 05 (PayoutSessionService exists)

**Blocks**: Task 09 (Unit tests need complete service)

## Implementation Steps

### Step 1: Add checkTimeout method with @Interval decorator

```typescript
import { Interval } from '@nestjs/schedule';
import { PAYOUT_END_EVENT, PayoutEndEvent, PayoutEndReason } from '../events';

@Interval(60000) // Check every 60 seconds
async checkTimeout(): Promise<void> {
  await this.mutex.runExclusive(async () => {
    if (!this.state.isActive || !this.state.lastTransactionAt) {
      return; // No active session
    }

    try {
      const walletAddress = this.configService.get<string>('blockchain.walletAddress');
      const currentBalance = await this.tronGridClient.getUSDTBalance(walletAddress);

      // Check balance threshold
      const threshold = this.configService.get<number>('blockchain.payout.balanceThresholdUsdt');
      const thresholdRaw = (threshold * 1_000_000).toString(); // Convert to raw units

      if (BigInt(currentBalance) < BigInt(thresholdRaw)) {
        await this.endSession('BALANCE_THRESHOLD', currentBalance);
        return;
      }

      // Check timeout with balance decrease
      const timeoutMinutes = this.configService.get<number>('blockchain.payout.timeoutMinutes');
      const elapsed = Date.now() - this.state.lastTransactionAt.getTime();
      const timeoutMs = timeoutMinutes * 60 * 1000;

      if (elapsed >= timeoutMs) {
        const balanceDecreased = BigInt(currentBalance) < BigInt(this.state.startBalance!);

        if (balanceDecreased) {
          await this.endSession('TIMEOUT', currentBalance);
        } else {
          this.logger.debug('Timeout elapsed but balance not decreased, continuing session');
        }
      }
    } catch (error) {
      // Log error but don't end session - retry on next interval
      this.logger.error('Balance check failed, will retry', { error });
    }
  });
}
```

### Step 2: Implement endSession method

```typescript
/**
 * End the payout session and emit payout.end event.
 *
 * @param reason - Reason for session end
 * @param endingBalance - Wallet balance at session end
 */
private async endSession(reason: PayoutEndReason, endingBalance: string): Promise<void> {
  const durationMs = Date.now() - this.state.startedAt!.getTime();
  const durationMinutes = Math.round(durationMs / 60000);

  const event: PayoutEndEvent = {
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
    durationMinutes,
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
```

### Step 3: Verify build

```bash
pnpm build
```

## Acceptance Criteria

- [x] **AC-2.1**: Balance checked periodically (every 60s)
- [x] **AC-2.2**: Session ends when balance < 1000 USDT
- [x] **AC-2.3**: Balance check failure logs error, session continues
- [x] **AC-3.1**: Session ends after 30 min + balance decreased
- [x] **AC-3.2**: Balance checked to confirm decrease
- [x] **AC-3.3**: Session does NOT end if balance not decreased
- [x] @Interval(60000) decorator applied
- [x] Build succeeds

## Verification Steps

1. Build: `pnpm build`
2. Verify @Interval decorator present
3. Verify dual-purpose check (threshold + timeout)

## Implementation Notes

### Dual-Purpose Interval

The 60-second interval serves two purposes:
1. **Balance threshold check**: If balance < 1000 USDT, end session immediately
2. **Timeout check**: If 30 min elapsed AND balance decreased, end session

### Error Handling

Balance check failures:
- Log error with context
- Do NOT end session
- Allow retry on next interval (60s later)

### Timeout Logic

```
IF session ACTIVE AND 30 min elapsed:
  IF balance decreased:
    End session with TIMEOUT reason
  ELSE:
    Continue session (balance may be replenished)
```

## References

- Design Doc: Section "Implementation Guidance - Interval Dual Purpose"
- Work Plan: Task 2.2
- ADR-0004: Timeout detection approach

## Completion Checklist

- [x] @Interval decorator added
- [x] checkTimeout() method implemented
- [x] Balance threshold check implemented
- [x] Timeout check with balance decrease implemented
- [x] endSession() method implemented
- [x] resetState() method implemented
- [x] Error handling for balance failures
- [x] Build succeeds
