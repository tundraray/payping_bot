# Task: Update getActiveSubscribers to Return languageCode

**Task ID**: i18n-task-06
**Phase**: Phase 2 - Database Layer
**Estimated Effort**: 1 hour
**Verification Level**: L2 (Test Operation Verification)

## Overview

Modify `getActiveSubscribers()` method in SubscriptionsService to return `languageCode` alongside `telegramId`. This enables TransactionListener to send localized notifications to each subscriber.

## Context

Currently, `getActiveSubscribers()` returns only `telegramId`. TransactionListener needs the user's language preference to send localized notifications. This task adds `languageCode` to the return type by joining with the users table.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\db\src\services\subscriptions.service.ts`
- `D:\git\github\tg-bots\payping_bot\libs\db\src\services\__tests__\subscriptions.service.int.test.ts` (if exists)

## Dependencies

**Depends On**:
- Task 04 (users schema languageCode) - column must exist

**Blocks**:
- Task 10 (Update TransactionListener) - uses languageCode from this method

## Implementation Steps

### Step 1: Locate getActiveSubscribers method

Find the current implementation in `libs/db/src/services/subscriptions.service.ts`.

Current signature (expected):
```typescript
async getActiveSubscribers(): Promise<{ telegramId: number }[]>
```

### Step 2: Update return type

Add `languageCode` to return type:

```typescript
async getActiveSubscribers(): Promise<
  { telegramId: number; languageCode: string | null }[]
>
```

### Step 3: Update query to join users table

Modify the query to join with users table and select languageCode:

**Before**:
```typescript
async getActiveSubscribers(): Promise<{ telegramId: number }[]> {
  const now = new Date();

  const activeSubscriptions = await this.db
    .select({
      telegramId: schema.subscriptions.telegramId,
    })
    .from(schema.subscriptions)
    .where(gt(schema.subscriptions.expiresAt, now));

  return activeSubscriptions;
}
```

**After**:
```typescript
import { gt } from 'drizzle-orm';
import { eq } from 'drizzle-orm'; // Add if not already imported

async getActiveSubscribers(): Promise<
  { telegramId: number; languageCode: string | null }[]
> {
  const now = new Date();

  const activeSubscriptions = await this.db
    .select({
      telegramId: schema.subscriptions.telegramId,
      languageCode: schema.users.languageCode,
    })
    .from(schema.subscriptions)
    .innerJoin(
      schema.users,
      eq(schema.subscriptions.telegramId, schema.users.telegramId),
    )
    .where(gt(schema.subscriptions.expiresAt, now));

  return activeSubscriptions;
}
```

**Key Changes**:
- Added `languageCode: schema.users.languageCode` to select
- Added `.innerJoin()` to join with users table
- Join condition: `eq(subscriptions.telegramId, users.telegramId)`

### Step 4: Update integration tests (if they exist)

Update `libs/db/src/services/__tests__/subscriptions.service.int.test.ts`:

```typescript
describe('getActiveSubscribers', () => {
  it('should return languageCode for active subscribers', async () => {
    // Arrange: Create user with language preference
    const telegramId = 123456789;
    await usersService.ensureExists(telegramId);
    await usersService.updateLanguage(telegramId, 'uk');

    // Create active subscription
    const expiresAt = new Date(Date.now() + 86400000); // 1 day from now
    await subscriptionsService.create({
      telegramId,
      expiresAt,
      /* other required fields */
    });

    // Act: Get active subscribers
    const subscribers = await subscriptionsService.getActiveSubscribers();

    // Assert: Verify languageCode returned
    expect(subscribers).toHaveLength(1);
    expect(subscribers[0].telegramId).toBe(telegramId);
    expect(subscribers[0].languageCode).toBe('uk');
  });

  it('should return null languageCode if not set', async () => {
    // Arrange: Create user without language
    const telegramId = 987654321;
    await usersService.ensureExists(telegramId);
    // Don't call updateLanguage - languageCode should be null

    // Create active subscription
    const expiresAt = new Date(Date.now() + 86400000);
    await subscriptionsService.create({
      telegramId,
      expiresAt,
    });

    // Act
    const subscribers = await subscriptionsService.getActiveSubscribers();

    // Assert: languageCode should be null
    const subscriber = subscribers.find(s => s.telegramId === telegramId);
    expect(subscriber).toBeDefined();
    expect(subscriber?.languageCode).toBeNull();
  });
});
```

### Step 5: Run integration tests

```bash
pnpm test libs/db/src/services/__tests__/subscriptions.service.int.test.ts
```

### Step 6: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [ ] `getActiveSubscribers()` return type includes `languageCode` field (AC-8.1)
- [ ] Query joins with users table to fetch languageCode
- [ ] languageCode is null for users without language set
- [ ] Existing tests updated and pass
- [ ] Build succeeds
- [ ] No lint errors

## Verification Steps

1. Verify return type updated
2. Verify query includes innerJoin with users table
3. Run integration tests: `pnpm test subscriptions.service.int.test.ts`
4. Run build: `pnpm build`
5. Run lint: `pnpm lint`

## Return Type After Change

```typescript
type Subscriber = {
  telegramId: number;
  languageCode: string | null;
};

Promise<Subscriber[]>
```

## Query Structure After Change

```typescript
SELECT
  subscriptions.telegram_id,
  users.language_code
FROM subscriptions
INNER JOIN users ON subscriptions.telegram_id = users.telegram_id
WHERE subscriptions.expires_at > NOW()
```

## Edge Cases Considered

**User without language set**:
- languageCode will be null
- TransactionListener falls back to 'en' (handled in Task 10)

**Subscription without matching user**:
- Should not happen (foreign key constraint or application logic ensures user exists)
- INNER JOIN excludes orphaned subscriptions

**Multiple active subscriptions per user**:
- Current schema may allow multiple subscriptions per user
- Query will return multiple rows with same telegramId
- Caller should deduplicate if needed (Task 10 handles this)

## Notes

- **Inner join**: Assumes every subscription has matching user (safe assumption)
- **Null handling**: Application layer handles null languageCode
- **Performance**: Join is on indexed column (telegramId), performant

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (AC-8.1)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 2.3)
- Drizzle Join Docs: https://orm.drizzle.team/docs/joins

## Completion Checklist

- [ ] Return type updated to include languageCode
- [ ] Query updated with innerJoin to users table
- [ ] Integration tests updated (2 test cases)
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] Code reviewed for join correctness
