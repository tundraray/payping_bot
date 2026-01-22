# Task: Update TransactionListener (Per-User Localization)

**Task ID**: i18n-task-10
**Phase**: Phase 4 - Handler Updates
**Estimated Effort**: 2-3 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Implement per-user localized notifications in TransactionListener. Each subscriber receives notifications in their preferred language using the new i18n utils and consolidated locale keys from Task 03.

## Context

Currently, TransactionListener sends hardcoded English notifications to all users. With Ukrainian locale added and language preferences stored in database, we need to send localized notifications. TransactionListener doesn't have grammY context, so it uses the standalone i18n.utils (Task 02).

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\listeners\transaction.listener.ts`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\listeners\transaction.listener.spec.ts` (update or create)

## Dependencies

**Depends On**:
- Task 01 (telegram format utils) - formatUsdtDisplay exists
- Task 02 (i18n utils) - translate function exists
- Task 03 (locale files) - consolidated message keys exist
- Task 06 (getActiveSubscribers languageCode) - returns languageCode
- Task 08 (Remove formatUsdtDisplay from db) - enforces correct import

**Blocks**:
- Task 11 (QA verification) - all handlers updated

## Implementation Steps

### Step 1: Update imports

**Before**:
```typescript
import { formatUsdtDisplay, SubscriptionsService } from '@app/db';
import type { Transaction } from '@app/db';
```

**After**:
```typescript
import { SubscriptionsService } from '@app/db';
import type { Transaction } from '@app/db';
import { formatUsdtDisplay } from '../utils';
import { translate } from '../utils/i18n.utils';
```

### Step 2: Update formatNotificationMessage signature

Add `languageCode` parameter:

**Before**:
```typescript
private formatNotificationMessage(transaction: Transaction): string {
  const amount = formatUsdtDisplay(transaction.amount);
  return [
    'New Transaction',
    `Amount: ${amount} USDT`,
    `From: ${transaction.fromAddress}`,
    `Hash: ${transaction.hash}`,
  ].join('\n');
}
```

**After**:
```typescript
private formatNotificationMessage(
  transaction: Transaction,
  languageCode: string,
): string {
  // Format amount for display
  const amount = formatUsdtDisplay(transaction.amount);

  // Format timestamp
  const time = transaction.timestamp.toLocaleString(languageCode, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  // Truncate addresses and hash for readability
  const address = this.truncateAddress(transaction.fromAddress);
  const hash = this.truncateHash(transaction.hash);

  // Use Fluent for localized message
  return translate(languageCode, 'notification', {
    amount,
    address,
    time,
    hash,
  });
}
```

### Step 3: Add helper methods for truncation

Add private methods to make addresses/hashes more readable:

```typescript
/**
 * Truncate Tron address to "TAbcd...xyz" format.
 */
private truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Truncate transaction hash to "abc...xyz" format.
 */
private truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-4)}`;
}
```

### Step 4: Update notification loop to use subscriber's language

**Before**:
```typescript
async handleNewTransaction(transaction: Transaction): Promise<void> {
  const subscribers = await this.subscriptionsService.getActiveSubscribers();
  const message = this.formatNotificationMessage(transaction);

  for (const subscriber of subscribers) {
    try {
      await this.bot.api.sendMessage(subscriber.telegramId, message, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error('Failed to send notification', {
        telegramId: subscriber.telegramId,
        error,
      });
    }
  }
}
```

**After**:
```typescript
async handleNewTransaction(transaction: Transaction): Promise<void> {
  const subscribers = await this.subscriptionsService.getActiveSubscribers();

  for (const subscriber of subscribers) {
    try {
      // Determine language (fallback to 'en' if not set)
      const lang = subscriber.languageCode || 'en';

      // Format message in subscriber's language
      const message = this.formatNotificationMessage(transaction, lang);

      // Send notification
      await this.bot.api.sendMessage(subscriber.telegramId, message, {
        parse_mode: 'HTML',
      });
    } catch (error) {
      this.logger.error('Failed to send notification', {
        telegramId: subscriber.telegramId,
        languageCode: subscriber.languageCode,
        error,
      });
    }
  }
}
```

### Step 5: Create or update unit tests

Create/update `libs/telegram/src/listeners/transaction.listener.spec.ts`:

```typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { TransactionListener } from './transaction.listener';
import type { SubscriptionsService } from '@app/db';
import type { Bot } from 'grammy';

describe('TransactionListener', () => {
  let listener: TransactionListener;
  let mockSubscriptionsService: jest.Mocked<SubscriptionsService>;
  let mockBot: jest.Mocked<Bot>;

  beforeEach(() => {
    mockSubscriptionsService = {
      getActiveSubscribers: jest.fn(),
    } as any;

    mockBot = {
      api: {
        sendMessage: jest.fn().mockResolvedValue({}),
      },
    } as any;

    listener = new TransactionListener(mockSubscriptionsService, mockBot);
  });

  it('should send localized notification to each subscriber', async () => {
    // Arrange
    mockSubscriptionsService.getActiveSubscribers.mockResolvedValue([
      { telegramId: 111, languageCode: 'en' },
      { telegramId: 222, languageCode: 'ru' },
      { telegramId: 333, languageCode: 'uk' },
    ]);

    const transaction = {
      hash: '0x1234567890abcdef',
      amount: '1234560000', // Raw amount
      fromAddress: 'TFromAddress123456',
      toAddress: 'TToAddress123456',
      timestamp: new Date('2026-01-22T10:30:00Z'),
      direction: 'incoming',
    };

    // Act
    await listener.handleNewTransaction(transaction);

    // Assert: 3 messages sent
    expect(mockBot.api.sendMessage).toHaveBeenCalledTimes(3);

    // Verify English message
    const enMessage = mockBot.api.sendMessage.mock.calls[0][1];
    expect(enMessage).toContain('Payment Received');
    expect(enMessage).toContain('1,234.56');

    // Verify Russian message
    const ruMessage = mockBot.api.sendMessage.mock.calls[1][1];
    expect(ruMessage).toContain('Платёж получен');

    // Verify Ukrainian message
    const ukMessage = mockBot.api.sendMessage.mock.calls[2][1];
    expect(ukMessage).toContain('Платіж отримано');
  });

  it('should fallback to English for subscribers without language', async () => {
    // Arrange
    mockSubscriptionsService.getActiveSubscribers.mockResolvedValue([
      { telegramId: 999, languageCode: null },
    ]);

    const transaction = {
      hash: '0xabc',
      amount: '1000000',
      fromAddress: 'TFrom',
      toAddress: 'TTo',
      timestamp: new Date(),
      direction: 'incoming',
    };

    // Act
    await listener.handleNewTransaction(transaction);

    // Assert: English message sent
    const message = mockBot.api.sendMessage.mock.calls[0][1];
    expect(message).toContain('Payment Received');
  });

  it('should format amount with separators', async () => {
    // Arrange
    mockSubscriptionsService.getActiveSubscribers.mockResolvedValue([
      { telegramId: 111, languageCode: 'en' },
    ]);

    const transaction = {
      hash: '0xabc',
      amount: '1234567890000', // 1,234,567.89 USDT
      fromAddress: 'TFrom',
      toAddress: 'TTo',
      timestamp: new Date(),
      direction: 'incoming',
    };

    // Act
    await listener.handleNewTransaction(transaction);

    // Assert: Formatted amount
    const message = mockBot.api.sendMessage.mock.calls[0][1];
    expect(message).toContain('1,234,567.89');
  });

  it('should truncate addresses and hashes', async () => {
    // Arrange
    mockSubscriptionsService.getActiveSubscribers.mockResolvedValue([
      { telegramId: 111, languageCode: 'en' },
    ]);

    const transaction = {
      hash: '0x1234567890abcdef1234567890abcdef',
      amount: '1000000',
      fromAddress: 'TAbcdefghijklmnopqrstuvwxyz123456',
      toAddress: 'TTo',
      timestamp: new Date(),
      direction: 'incoming',
    };

    // Act
    await listener.handleNewTransaction(transaction);

    // Assert: Addresses and hash truncated
    const message = mockBot.api.sendMessage.mock.calls[0][1];
    expect(message).toContain('TAbcde...3456'); // Truncated address
    expect(message).toContain('0x123456...cdef'); // Truncated hash
  });
});
```

### Step 6: Run unit tests

```bash
pnpm test libs/telegram/src/listeners/transaction.listener.spec.ts
```

### Step 7: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [ ] `formatUsdtDisplay` imported from `../utils` (AC-4.3)
- [ ] `translate` imported from `../utils/i18n.utils` (AC-8.3)
- [ ] `formatNotificationMessage` accepts `languageCode` parameter
- [ ] Notifications localized per subscriber's language (AC-8.2)
- [ ] Fallback to 'en' if languageCode is null (AC-8.4)
- [ ] Consolidated `notification` key used (from Task 03)
- [ ] Unit tests pass (4+ test cases)
- [ ] Build succeeds
- [ ] No lint errors

## Verification Steps

1. Verify imports from `../utils` (not `@app/db`)
2. Verify `formatNotificationMessage` has languageCode parameter
3. Verify notification loop uses subscriber.languageCode
4. Verify fallback to 'en' for null languageCode
5. Run unit tests: `pnpm test transaction.listener.spec.ts`
6. Run build: `pnpm build`
7. Run lint: `pnpm lint`

## Message Localization Example

**English** (languageCode = 'en'):
```
🎉 Payment Received!

💵 1,234.56 USDT

📍 From: TAbcde...xyz
🕐 Time: Jan 22, 2026, 10:30 AM
🔗 Tx: 0x12345678...abcd
```

**Russian** (languageCode = 'ru'):
```
🎉 Платёж получен!

💵 1,234.56 USDT

📍 От: TAbcde...xyz
🕐 Время: 22 янв. 2026 г., 10:30
🔗 Tx: 0x12345678...abcd
```

**Ukrainian** (languageCode = 'uk'):
```
🎉 Платіж отримано!

💵 1,234.56 USDT

📍 Від: TAbcde...xyz
🕐 Час: 22 січ. 2026 р., 10:30
🔗 Tx: 0x12345678...abcd
```

## Edge Cases Handled

**Subscriber without language**:
- languageCode is null
- Fallback to 'en' in notification loop

**Unknown language code**:
- i18n.utils handles fallback to 'en'
- No error thrown

**Address/hash truncation**:
- Addresses < 10 chars: not truncated
- Hashes < 12 chars: not truncated
- Improves readability in Telegram

## Notes

- **Consolidated notification key**: Uses single `notification` key with all variables ($amount, $address, $time, $hash)
- **No context required**: i18n.utils loads Fluent bundles without grammY context
- **Performance**: Fluent bundles cached (Task 02), no performance impact

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (AC-8, Message Categories)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 4.2)
- Task 02: i18n.utils (translate function)
- Task 03: Consolidated locale keys (notification)
- Task 06: getActiveSubscribers returns languageCode

## Completion Checklist

- [ ] Imports updated (remove @app/db formatUsdtDisplay, add ../utils imports)
- [ ] formatNotificationMessage signature updated with languageCode
- [ ] translate() used for notification message
- [ ] Helper methods added (truncateAddress, truncateHash)
- [ ] Notification loop uses subscriber.languageCode
- [ ] Fallback to 'en' for null languageCode
- [ ] Unit tests created/updated (4 test cases)
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] Code reviewed for localization correctness
