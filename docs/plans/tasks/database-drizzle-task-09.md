# Task 09: Implement SubscriptionsService with Integration Tests

Metadata:
- Phase: Phase 4 - Domain Services Implementation
- Dependencies: Task 06 (migrations must be generated), Task 08 (UsersService for test data setup)
- Provides: libs/db/src/services/subscriptions.service.ts and integration tests
- Size: Small (2 files: service + test)
- Test Resolution Target: 2 tests (AC-9.1, AC-9.2)

## Implementation Content

Implement SubscriptionsService for subscription management. This service will be used by future TelegramModule to track user subscription status and expiration.

**Methods to implement**:
1. `create(userId: number, expiresAt: Date): Promise<Subscription>` - Create new subscription
2. `getActive(userId: number): Promise<Subscription | null>` - Get active subscription
3. `getActiveSubscribers(): Promise<User[]>` - Get all users with active subscriptions
4. `expire(subscriptionId: number): Promise<void>` - Mark subscription as expired

## Target Files
- [ ] libs/db/src/services/subscriptions.service.ts
- [ ] libs/db/src/services/__tests__/subscriptions.service.int.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests
- [ ] Create integration test file: subscriptions.service.int.test.ts
- [ ] Set up test database connection (reuse pattern from Task 07)
- [ ] Implement test setup/teardown:
  - beforeAll: Create test app context with DbModule
  - beforeEach: Clean subscriptions and users tables
  - afterAll: Close database connection
- [ ] Create test helper: createTestUser() using UsersService
- [ ] Write 2 core failing integration tests:
  - **AC-9.1**: create creates subscription with status 'active'
  - **AC-9.2**: getActive returns subscription where status='active' AND expires_at > now
- [ ] Write additional tests for completeness:
  - getActive returns null when subscription expired (edge case)
  - getActive returns null when no subscription exists
  - getActiveSubscribers returns users with active subscriptions
  - expire marks subscription as expired
- [ ] Run tests: `pnpm run test subscriptions.service.int.test` - confirm all fail
- [ ] Reference Design Doc SubscriptionsService interface and data contract

### 2. Green Phase - Minimal Implementation
- [ ] Create subscriptions.service.ts
- [ ] Import Injectable, Inject from @nestjs/common
- [ ] Import DRIZZLE, DrizzleDB from '../database.provider'
- [ ] Import subscriptions, users schemas from '../schema'
- [ ] Import eq, and, gt from drizzle-orm
- [ ] Add @Injectable() decorator
- [ ] Implement constructor with @Inject(DRIZZLE)

#### Implement create (AC-9.1)
- [ ] Insert: db.insert(subscriptions).values({
  userId,
  status: 'active',
  startsAt: new Date(),
  expiresAt
}).returning()
- [ ] Return created subscription
- [ ] Wrap in try-catch, log error with context, throw error (fail-fast)
- [ ] Note: createdAt and updatedAt set automatically by schema

#### Implement getActive (AC-9.2)
- [ ] Query: db.select().from(subscriptions).where(
  and(
    eq(subscriptions.userId, userId),
    eq(subscriptions.status, 'active'),
    gt(subscriptions.expiresAt, new Date())
  )
).limit(1)
- [ ] Return first result or null
- [ ] Wrap in try-catch, log error, throw error

#### Implement getActiveSubscribers
- [ ] Query with join:
  db.select({ user: users })
    .from(subscriptions)
    .innerJoin(users, eq(subscriptions.userId, users.id))
    .where(
      and(
        eq(subscriptions.status, 'active'),
        gt(subscriptions.expiresAt, new Date())
      )
    )
- [ ] Return array of users
- [ ] Wrap in try-catch, log error, throw error

#### Implement expire
- [ ] Update: db.update(subscriptions)
  .set({ status: 'expired' })
  .where(eq(subscriptions.id, subscriptionId))
- [ ] Wrap in try-catch, log error, throw error
- [ ] Note: updatedAt automatically updated by $onUpdateFn

- [ ] Run only new tests: `pnpm run test subscriptions.service.int.test` - confirm all pass

### 3. Refactor Phase
- [ ] Extract date comparison logic if duplicated
- [ ] Improve query readability with proper formatting
- [ ] Add JSDoc comments to public methods
- [ ] Ensure consistent error handling pattern
- [ ] Run tests again: `pnpm run test subscriptions.service.int.test` - confirm all pass

## Completion Criteria
- [ ] All 2 core integration tests pass (AC-9.1, AC-9.2)
- [ ] Additional tests for edge cases and completeness pass
- [ ] Service injects DRIZZLE token correctly
- [ ] Error handling follows fail-fast pattern
- [ ] Active subscription query checks both status and expiration (AC-9.2)
- [ ] startsAt set to current time on creation
- [ ] Foreign key constraint enforced (requires valid userId)
- [ ] Operation verified: L2 (Test Operation) - new tests added and passing

## Notes
- Impact scope: SubscriptionsService and its tests only
- Constraints: Do not modify DbModule yet (Task 11)
- Test database must have subscriptions and users tables from migrations
- Tests require creating test users first (use UsersService from Task 08)
- getActive must check both status='active' AND expires_at > now (AC-9.2)
- Use Date() for current time comparison in queries
- Reference Design Doc SubscriptionsService section for method signatures
- Follow TDD strictly: Red → Green → Refactor
