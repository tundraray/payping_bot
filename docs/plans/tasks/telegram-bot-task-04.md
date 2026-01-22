# Task: Create SubscribeHandler with Subscription Commands

**Task ID**: telegram-bot-task-04
**Phase**: 6 (SubscribeHandler)
**Estimated Time**: 60-90 minutes
**Dependencies**: None (SubscriptionsService.cancel() already exists)
**Verifiability Level**: L1 (Functional operation verification)

## Overview

Create SubscribeHandler class that implements `/subscribe` and `/unsubscribe` command handlers. This handler manages subscription lifecycle, creating subscriptions with 365-day expiry and canceling active subscriptions when users opt out.

## Target Files

- `libs/telegram/src/handlers/subscribe.handler.ts` (create)
- `libs/telegram/src/handlers/subscribe.handler.spec.ts` (create)

## Context

The StartHandler provides buttons for subscription management, but no handler currently processes `/subscribe` and `/unsubscribe` commands or their corresponding button callbacks. This task creates the handler that bridges user actions with database operations.

The handler must ensure users are created before subscribing, check for existing subscriptions to avoid duplicates, and provide clear feedback messages using i18n.

## Implementation Steps

### Step 1: Create SubscribeHandler class skeleton

**File**: `libs/telegram/src/handlers/subscribe.handler.ts`

```typescript
import { SubscriptionsService, UsersService } from '@app/db';
import { Injectable, Logger } from '@nestjs/common';
import type { BotContext } from '../types/telegram.types';

/**
 * SubscribeHandler manages user subscriptions.
 *
 * Handles /subscribe and /unsubscribe commands, creating or canceling
 * subscriptions as requested. Ensures users exist before subscription
 * operations and provides localized feedback messages.
 */
@Injectable()
export class SubscribeHandler {
  private readonly logger = new Logger(SubscribeHandler.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly subscriptionsService: SubscriptionsService,
  ) {}

  /**
   * Handle /subscribe command.
   * Creates a new subscription with 365-day expiry if user is not already subscribed.
   */
  async handleSubscribe(ctx: BotContext): Promise<void> {
    // Implementation in Step 2
  }

  /**
   * Handle /unsubscribe command.
   * Cancels active subscription if one exists.
   */
  async handleUnsubscribe(ctx: BotContext): Promise<void> {
    // Implementation in Step 3
  }
}
```

### Step 2: Implement handleSubscribe() method

**File**: `libs/telegram/src/handlers/subscribe.handler.ts`

```typescript
async handleSubscribe(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    this.logger.warn('Received /subscribe without user ID');
    return;
  }

  try {
    // Ensure user exists
    let user = await this.usersService.findByTelegramId(telegramId);
    if (!user) {
      user = await this.usersService.create({
        telegramId,
        username: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        languageCode: ctx.from.language_code,
      });
      this.logger.log(`Created new user for subscription: ${telegramId}`);
    }

    // Check for existing active subscription
    const existingSubscription = await this.subscriptionsService.getActive(user.id);
    if (existingSubscription) {
      await ctx.reply(ctx.t('subscribe-already'));
      this.logger.log(`User ${telegramId} already subscribed`);
      return;
    }

    // Create new subscription with 365-day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    await this.subscriptionsService.create(user.id, expiresAt);

    await ctx.reply(ctx.t('subscribe-success'));
    this.logger.log(`User ${telegramId} subscribed successfully`, {
      userId: user.id,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    this.logger.error('Error handling /subscribe command', {
      telegramId,
      error,
    });
    await ctx.reply(ctx.t('error-generic'));
  }
}
```

**Implementation Notes:**
- Create user if doesn't exist (same as StartHandler pattern)
- Check for existing subscription before creating new one
- Use 365-day expiry (1 year subscription)
- Log structured context: telegramId, userId, expiresAt
- Use i18n keys: `subscribe-already`, `subscribe-success`, `error-generic`

### Step 3: Implement handleUnsubscribe() method

**File**: `libs/telegram/src/handlers/subscribe.handler.ts`

```typescript
async handleUnsubscribe(ctx: BotContext): Promise<void> {
  const telegramId = ctx.from?.id;
  if (!telegramId) {
    this.logger.warn('Received /unsubscribe without user ID');
    return;
  }

  try {
    // Find user
    const user = await this.usersService.findByTelegramId(telegramId);
    if (!user) {
      await ctx.reply(ctx.t('unsubscribe-not-subscribed'));
      this.logger.log(`User ${telegramId} not found for unsubscribe`);
      return;
    }

    // Cancel active subscription
    const cancelled = await this.subscriptionsService.cancel(user.id);
    if (!cancelled) {
      await ctx.reply(ctx.t('unsubscribe-not-subscribed'));
      this.logger.log(`User ${telegramId} has no active subscription`);
      return;
    }

    await ctx.reply(ctx.t('unsubscribe-success'));
    this.logger.log(`User ${telegramId} unsubscribed successfully`, {
      userId: user.id,
    });
  } catch (error) {
    this.logger.error('Error handling /unsubscribe command', {
      telegramId,
      error,
    });
    await ctx.reply(ctx.t('error-generic'));
  }
}
```

**Implementation Notes:**
- Find user first (don't create if doesn't exist)
- Use `SubscriptionsService.cancel()` which returns boolean
- Show appropriate message if no active subscription
- Log structured context: telegramId, userId
- Use i18n keys: `unsubscribe-not-subscribed`, `unsubscribe-success`, `error-generic`

### Step 4: Create comprehensive unit tests

**File**: `libs/telegram/src/handlers/subscribe.handler.spec.ts`

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { SubscriptionsService, UsersService } from '@app/db';
import { SubscribeHandler } from './subscribe.handler';
import type { BotContext } from '../types/telegram.types';

describe('SubscribeHandler', () => {
  let handler: SubscribeHandler;
  let usersService: jest.Mocked<UsersService>;
  let subscriptionsService: jest.Mocked<SubscriptionsService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscribeHandler,
        {
          provide: UsersService,
          useValue: {
            findByTelegramId: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: SubscriptionsService,
          useValue: {
            getActive: jest.fn(),
            create: jest.fn(),
            cancel: jest.fn(),
          },
        },
      ],
    }).compile();

    handler = module.get<SubscribeHandler>(SubscribeHandler);
    usersService = module.get(UsersService);
    subscriptionsService = module.get(SubscriptionsService);
  });

  describe('handleSubscribe', () => {
    it('should create subscription for new user', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(null);
      usersService.create.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      await handler.handleSubscribe(ctx);

      expect(usersService.create).toHaveBeenCalledWith({
        telegramId: 123456,
        username: 'testuser',
        firstName: 'Test',
        lastName: undefined,
        languageCode: 'en',
      });
      expect(subscriptionsService.create).toHaveBeenCalledWith(
        mockUser.id,
        expect.any(Date), // expiresAt
      );
      expect(ctx.reply).toHaveBeenCalledWith('subscribe-success');
    });

    it('should create subscription for existing user without subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      await handler.handleSubscribe(ctx);

      expect(usersService.create).not.toHaveBeenCalled();
      expect(subscriptionsService.create).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('subscribe-success');
    });

    it('should show "already subscribed" message for existing subscriber', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(mockSubscription);

      await handler.handleSubscribe(ctx);

      expect(subscriptionsService.create).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('subscribe-already');
    });

    it('should handle database errors gracefully', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockRejectedValue(new Error('DB error'));

      await handler.handleSubscribe(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('error-generic');
    });

    it('should create subscription with 365-day expiry', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.getActive.mockResolvedValue(null);
      subscriptionsService.create.mockResolvedValue(mockSubscription);

      const now = new Date();
      await handler.handleSubscribe(ctx);

      const createCall = subscriptionsService.create.mock.calls[0];
      const expiresAt = createCall[1] as Date;

      // Verify expiry is approximately 365 days from now (allow 1 second tolerance)
      const expected = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
      expect(Math.abs(expiresAt.getTime() - expected.getTime())).toBeLessThan(1000);
    });
  });

  describe('handleUnsubscribe', () => {
    it('should cancel active subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.cancel.mockResolvedValue(true);

      await handler.handleUnsubscribe(ctx);

      expect(subscriptionsService.cancel).toHaveBeenCalledWith(mockUser.id);
      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-success');
    });

    it('should show "not subscribed" message when user not found', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(null);

      await handler.handleUnsubscribe(ctx);

      expect(subscriptionsService.cancel).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-not-subscribed');
    });

    it('should show "not subscribed" message when no active subscription', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockResolvedValue(mockUser);
      subscriptionsService.cancel.mockResolvedValue(false);

      await handler.handleUnsubscribe(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('unsubscribe-not-subscribed');
    });

    it('should handle database errors gracefully', async () => {
      const ctx = createMockContext(123456);

      usersService.findByTelegramId.mockRejectedValue(new Error('DB error'));

      await handler.handleUnsubscribe(ctx);

      expect(ctx.reply).toHaveBeenCalledWith('error-generic');
    });
  });
});

// Helper functions and mocks
function createMockContext(telegramId: number): jest.Mocked<BotContext> {
  return {
    from: {
      id: telegramId,
      username: 'testuser',
      first_name: 'Test',
      language_code: 'en',
    },
    reply: jest.fn(),
    t: jest.fn((key) => key),
  } as any;
}

const mockUser = {
  id: 1,
  telegramId: 123456,
  username: 'testuser',
  firstName: 'Test',
  lastName: null,
  languageCode: 'en',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockSubscription = {
  id: 1,
  userId: 1,
  status: 'active' as const,
  startsAt: new Date(),
  expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
  createdAt: new Date(),
  updatedAt: new Date(),
};
```

### Step 5: Verify implementation

```bash
# Run unit tests
pnpm run test -- subscribe.handler.spec.ts

# Verify lint and type checks
pnpm run lint
pnpm run check
```

## Completion Criteria

- [x] SubscribeHandler class created with proper dependency injection
- [x] `handleSubscribe()` creates user if doesn't exist (AC-2.1)
- [x] `handleSubscribe()` creates subscription with 'active' status (AC-2.2)
- [x] `handleSubscribe()` handles already subscribed case (AC-2.3)
- [x] `handleSubscribe()` responds with confirmation message (AC-2.4)
- [x] `handleUnsubscribe()` sets status to 'cancelled' via cancel() (AC-3.1)
- [x] `handleUnsubscribe()` handles not subscribed case (AC-3.2)
- [x] `handleUnsubscribe()` responds with confirmation message (AC-3.3)
- [x] Records preserved (no deletion) - enforced by cancel() method (AC-3.4)
- [x] All unit tests pass (9+ test cases)
- [x] Test coverage >= 80%
- [x] Error handling follows fail-fast pattern
- [x] Structured logging present

## Acceptance Criteria Traceability

- **AC-2.1**: /subscribe creates user if not exists → ✅ Implemented
- **AC-2.2**: /subscribe creates subscription with 'active' status → ✅ Implemented
- **AC-2.3**: /subscribe shows "already subscribed" if active → ✅ Implemented
- **AC-2.4**: /subscribe responds with confirmation → ✅ Implemented
- **AC-3.1**: /unsubscribe sets status to 'cancelled' → ✅ Uses cancel() method
- **AC-3.2**: /unsubscribe shows "not subscribed" message → ✅ Implemented
- **AC-3.3**: /unsubscribe responds with confirmation → ✅ Implemented
- **AC-3.4**: Records preserved (no deletion) → ✅ Enforced by SubscriptionsService.cancel()

## Testing Strategy

**Unit Tests** (L2 Verification):
- Subscribe: new user, existing user, already subscribed, DB error
- Unsubscribe: active subscription, no subscription, user not found, DB error
- Expiry calculation: 365 days from now
- Mock all dependencies correctly

**Manual Tests** (L1 Verification - Task 05):
- Commands work when bot is wired (Task 05 adds command registration)
- This task focuses on handler logic only

## Notes

**Command Registration**: This task creates the handler methods but does NOT register them with the bot. Task 05 will wire the handlers to bot commands and button callbacks.

**Subscription Expiry**: Currently hardcoded to 365 days. Future enhancement could support variable durations or payment-based expiry (Telegram Stars integration).

**User Creation Pattern**: Same pattern as StartHandler - ensures consistency across handlers.

**i18n Keys**: All required keys already exist in `en.ftl` (Phase 1 complete):
- `subscribe-success`
- `subscribe-already`
- `unsubscribe-success`
- `unsubscribe-not-subscribed`
- `error-generic`

## Rollback Procedure

If issues are found:
1. Revert the commit
2. Delete created files
3. No database changes to rollback
4. Existing handlers remain functional

## Verification Commands

```bash
# Run unit tests
pnpm run test -- subscribe.handler.spec.ts

# Check test coverage
pnpm run test:cov -- subscribe.handler.spec.ts

# Verify lint and type checks
pnpm run lint
pnpm run check
```

## Success Indicators

- ✅ All unit tests pass
- ✅ Test coverage >= 80%
- ✅ Zero lint errors
- ✅ Zero type errors
- ✅ Handler methods follow established patterns
- ✅ Error handling consistent with other handlers
- ✅ Structured logging includes relevant context
- ✅ Ready for command registration in Task 05
