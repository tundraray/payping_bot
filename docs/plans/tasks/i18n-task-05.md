# Task: Add updateLanguage Method to UsersService

**Task ID**: i18n-task-05
**Phase**: Phase 2 - Database Layer
**Estimated Effort**: 1 hour
**Verification Level**: L2 (Test Operation Verification)

## Overview

Add `updateLanguage()` method to UsersService to update a user's language preference in the database. This method will be called by StartHandler when a user interacts with the bot.

## Context

When a user sends `/start`, Telegram provides their language preference via `ctx.from.language_code`. We need to persist this preference so TransactionListener can send localized notifications.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\db\src\services\users.service.ts`
- `D:\git\github\tg-bots\payping_bot\libs\db\src\services\__tests__\users.service.int.test.ts`

## Dependencies

**Depends On**:
- Task 04 (users schema languageCode) - column must exist

**Blocks**:
- Task 09 (Update StartHandler) - will call this method

## Implementation Steps

### Step 1: Add updateLanguage method

Update `libs/db/src/services/users.service.ts`:

```typescript
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '../schema';

@Injectable()
export class UsersService {
  constructor(private readonly db: PostgresJsDatabase<typeof schema>) {}

  // ... existing methods (ensureExists, etc.)

  /**
   * Update user's language preference.
   *
   * @param telegramId - User's Telegram ID
   * @param languageCode - Language code (e.g., 'en', 'ru', 'uk')
   * @returns Promise that resolves when update completes
   */
  async updateLanguage(
    telegramId: number,
    languageCode: string,
  ): Promise<void> {
    await this.db
      .update(schema.users)
      .set({ languageCode })
      .where(eq(schema.users.telegramId, telegramId));
  }
}
```

**Design Notes**:
- Returns `Promise<void>` - no need to return updated row
- Uses Drizzle's `update().set().where()` pattern
- No error thrown if user doesn't exist (Drizzle silently updates 0 rows)
- Caller responsible for ensuring user exists (typically via `ensureExists()` first)

### Step 2: Add integration test

Update `libs/db/src/services/__tests__/users.service.int.test.ts`:

Add test case in the describe block:

```typescript
describe('UsersService', () => {
  // ... existing tests

  describe('updateLanguage', () => {
    it('should update user language preference', async () => {
      // Arrange: Ensure user exists
      const telegramId = 123456789;
      await usersService.ensureExists(telegramId);

      // Act: Update language
      await usersService.updateLanguage(telegramId, 'uk');

      // Assert: Verify language updated
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.telegramId, telegramId));

      expect(user.languageCode).toBe('uk');
    });

    it('should update language multiple times', async () => {
      // Arrange
      const telegramId = 987654321;
      await usersService.ensureExists(telegramId);

      // Act: Update language twice
      await usersService.updateLanguage(telegramId, 'en');
      await usersService.updateLanguage(telegramId, 'ru');

      // Assert: Verify latest language
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.telegramId, telegramId));

      expect(user.languageCode).toBe('ru');
    });

    it('should allow setting language to null', async () => {
      // Arrange
      const telegramId = 111222333;
      await usersService.ensureExists(telegramId);
      await usersService.updateLanguage(telegramId, 'en');

      // Act: Clear language
      await usersService.updateLanguage(telegramId, null);

      // Assert: Verify language is null
      const [user] = await db
        .select()
        .from(schema.users)
        .where(eq(schema.users.telegramId, telegramId));

      expect(user.languageCode).toBeNull();
    });
  });
});
```

### Step 3: Run integration tests

```bash
pnpm test libs/db/src/services/__tests__/users.service.int.test.ts
```

### Step 4: Build verification

```bash
pnpm build
```

## Acceptance Criteria

- [ ] `updateLanguage(telegramId, languageCode)` method exists (AC-7.2)
- [ ] Method updates user's language_code in database (AC-7.2)
- [ ] Integration tests pass (3 test cases)
- [ ] Build succeeds
- [ ] No lint errors

## Verification Steps

1. Run integration tests: `pnpm test users.service.int.test.ts`
2. Verify all 3 test cases pass:
   - Update language successfully
   - Update language multiple times
   - Set language to null
3. Run build: `pnpm build`
4. Run lint: `pnpm lint`

## Test Cases Coverage

| Test Case | Scenario | Expected |
|-----------|----------|----------|
| 1 | Update language for existing user | languageCode = 'uk' |
| 2 | Update language multiple times | languageCode = last value ('ru') |
| 3 | Set language to null | languageCode = NULL |

## Edge Cases Considered

**User doesn't exist**:
- Drizzle silently updates 0 rows (no error thrown)
- Caller should ensure user exists first via `ensureExists()`
- Integration test creates user before updating

**Language code validation**:
- No validation in this method (accept any string)
- Validation happens in application layer (StartHandler normalizes to 2-letter codes)

**Concurrent updates**:
- Last write wins (standard SQL behavior)
- Not a problem: updates are infrequent (only on /start)

## Method Signature

```typescript
async updateLanguage(
  telegramId: number,
  languageCode: string,
): Promise<void>
```

**Parameters**:
- `telegramId`: User's Telegram ID (must exist in database)
- `languageCode`: Language code string (e.g., 'en', 'ru', 'uk')

**Returns**: Promise\<void\> (no return value)

**Throws**: None (Drizzle doesn't throw on 0 rows updated)

## Usage Example (from Task 09)

```typescript
// In StartHandler
const telegramId = ctx.from.id;
const languageCode = ctx.from.language_code || 'en';

await this.usersService.ensureExists(telegramId);
await this.usersService.updateLanguage(telegramId, languageCode);
```

## Notes

- **No return value**: Void return simplifies caller code
- **No validation**: Accepts any string (application layer validates)
- **Idempotent**: Can call multiple times with same value (no side effects)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (AC-7.2)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 2.2)
- Drizzle Update Docs: https://orm.drizzle.team/docs/update

## Completion Checklist

- [ ] `updateLanguage` method added to UsersService
- [ ] Method uses Drizzle update syntax
- [ ] Integration test added with 3 test cases
- [ ] All tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] JSDoc comment added
