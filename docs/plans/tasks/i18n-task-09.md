# Task: Update StartHandler (Save Language, Use New Utils)

**Task ID**: i18n-task-09
**Phase**: Phase 4 - Handler Updates
**Estimated Effort**: 1-2 hours
**Verification Level**: L2 (Test Operation Verification)

## Overview

Refactor StartHandler to use new formatting utilities from telegram module, save user's language preference to database, and handle raw amounts from TransactionsService.

## Context

StartHandler currently has a private `formatWithSeparators()` method (duplicating functionality from @app/db) and doesn't save user language preferences. This task removes the duplication, uses the new utility from Task 01, saves language via Task 05, and handles raw amounts from Task 07.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\handlers\start.handler.ts`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\handlers\start.handler.spec.ts`

## Dependencies

**Depends On**:
- Task 01 (telegram format utils) - formatUsdtDisplay exists
- Task 05 (UsersService.updateLanguage) - method exists
- Task 07 (TransactionsService raw return) - getMonthlySum returns raw
- Task 08 (Remove formatUsdtDisplay from db) - enforces correct import

**Blocks**:
- Task 11 (QA verification) - all handlers updated

## Implementation Steps

### Step 1: Update imports

**Before**:
```typescript
import { formatUsdtDisplay, TransactionsService } from '@app/db';
```

**After**:
```typescript
import { TransactionsService } from '@app/db';
import { formatUsdtDisplay } from '../utils';
```

### Step 2: Remove private formatWithSeparators method

Locate and delete the private method (should be near bottom of class):

```typescript
// DELETE THIS
private formatWithSeparators(value: string): string {
  const [integer, decimal] = value.split('.');
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal ? `${formattedInteger}.${decimal}` : formattedInteger;
}
```

### Step 3: Update buildMessage to use formatUsdtDisplay

**Before**:
```typescript
private buildMessage(analytics: {
  currentMonthSum: string; // Formatted "1234.56"
  expectedSum?: string;    // Formatted "5000.00"
  monthsCount?: number;
}): string {
  const currentAmount = this.formatWithSeparators(analytics.currentMonthSum);
  const expectedAmount = analytics.expectedSum
    ? this.formatWithSeparators(analytics.expectedSum)
    : null;

  // ... rest of message building
}
```

**After**:
```typescript
private buildMessage(analytics: {
  currentMonthSum: string; // Raw "1234560000"
  expectedSum?: string;    // Raw "5000000000"
  monthsCount?: number;
}): string {
  const currentAmount = formatUsdtDisplay(analytics.currentMonthSum);
  const expectedAmount = analytics.expectedSum
    ? formatUsdtDisplay(analytics.expectedSum)
    : null;

  // ... rest of message building (use analytics-with-history or analytics-no-history keys)
}
```

### Step 4: Save user language in handleStart

Add language save after ensuring user exists:

**Before**:
```typescript
async handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from.id;

  // Ensure user exists
  await this.usersService.ensureExists(telegramId);

  // Get analytics...
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const currentMonthSum = await this.transactionsService.getMonthlySum(year, month);
  // ...
}
```

**After**:
```typescript
async handleStart(ctx: Context): Promise<void> {
  const telegramId = ctx.from.id;

  // Ensure user exists
  await this.usersService.ensureExists(telegramId);

  // Save user's language preference
  const languageCode = ctx.from.language_code || 'en';
  await this.usersService.updateLanguage(telegramId, languageCode);

  // Get analytics...
  const currentDate = new Date();
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth() + 1;

  const currentMonthSum = await this.transactionsService.getMonthlySum(year, month);
  // ... (currentMonthSum is now raw, buildMessage formats it)
}
```

### Step 5: Update unit tests

Update `libs/telegram/src/handlers/start.handler.spec.ts`:

```typescript
describe('StartHandler', () => {
  let handler: StartHandler;
  let mockUsersService: jest.Mocked<UsersService>;
  let mockTransactionsService: jest.Mocked<TransactionsService>;

  beforeEach(() => {
    mockUsersService = {
      ensureExists: jest.fn(),
      updateLanguage: jest.fn(), // NEW MOCK
    } as any;

    mockTransactionsService = {
      getMonthlySum: jest.fn().mockResolvedValue('1234560000'), // Raw amount
      getRollingAverage: jest.fn().mockResolvedValue('5000.00'), // Formatted
    } as any;

    handler = new StartHandler(mockUsersService, mockTransactionsService);
  });

  it('should save user language on /start', async () => {
    const ctx = {
      from: { id: 123456789, language_code: 'uk' },
      reply: jest.fn(),
    } as any;

    await handler.handleStart(ctx);

    expect(mockUsersService.updateLanguage).toHaveBeenCalledWith(123456789, 'uk');
  });

  it('should fallback to "en" if language_code is undefined', async () => {
    const ctx = {
      from: { id: 123456789, language_code: undefined },
      reply: jest.fn(),
    } as any;

    await handler.handleStart(ctx);

    expect(mockUsersService.updateLanguage).toHaveBeenCalledWith(123456789, 'en');
  });

  it('should format raw amounts for display', async () => {
    const ctx = {
      from: { id: 123456789, language_code: 'en' },
      reply: jest.fn(),
    } as any;

    mockTransactionsService.getMonthlySum.mockResolvedValue('1234560000'); // Raw

    await handler.handleStart(ctx);

    // Verify reply contains formatted amount "1,234.56"
    expect(ctx.reply).toHaveBeenCalled();
    const message = ctx.reply.mock.calls[0][0];
    expect(message).toContain('1,234.56');
  });
});
```

### Step 6: Run unit tests

```bash
pnpm test libs/telegram/src/handlers/start.handler.spec.ts
```

### Step 7: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [ ] Private `formatWithSeparators()` method removed (AC-6.1)
- [ ] `formatUsdtDisplay` imported from `../utils` (AC-6.2)
- [ ] User's language_code saved to database on /start (AC-6.3)
- [ ] Handler handles raw amounts from getMonthlySum
- [ ] Unit tests pass (3+ test cases)
- [ ] Build succeeds
- [ ] No lint errors

## Verification Steps

1. Verify private method removed
2. Verify import from `../utils` (not `@app/db`)
3. Verify `updateLanguage` called in handleStart
4. Run unit tests: `pnpm test start.handler.spec.ts`
5. Run build: `pnpm build`
6. Run lint: `pnpm lint`

## Code Changes Summary

| Change | Before | After |
|--------|--------|-------|
| Import source | `@app/db` | `../utils` |
| Private method | `formatWithSeparators()` exists | Removed |
| Language save | Not saved | Saved on /start |
| Amount format | Formats formatted strings | Formats raw amounts |

## Edge Cases Handled

**Language code undefined**:
- Fallback to 'en' in `handleStart()`
- `ctx.from.language_code || 'en'`

**Language code with region**:
- Telegram may provide 'uk-UA' or 'en-US'
- Saved as-is (normalization happens in i18n.utils when loading bundles)

**User exists, language already set**:
- `updateLanguage` overwrites previous value (last write wins)
- Idempotent operation (safe to call multiple times)

## Notes

- **Language normalization**: Not needed here (i18n.utils handles it)
- **Fallback to 'en'**: Consistent with design decision (AC-7.3)
- **Raw amount handling**: getMonthlySum now returns raw, formatUsdtDisplay converts for display

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (AC-6, Integration Point 3)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 4.1)
- Task 01: formatUsdtDisplay utility
- Task 05: updateLanguage method
- Task 07: getMonthlySum returns raw

## Completion Checklist

- [ ] Imports updated (remove @app/db formatUsdtDisplay, add ../utils)
- [ ] Private formatWithSeparators removed
- [ ] buildMessage uses formatUsdtDisplay on raw amounts
- [ ] handleStart saves user language via updateLanguage
- [ ] Language fallback to 'en' if undefined
- [ ] Unit tests updated (3 test cases)
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] Code reviewed for import correctness
