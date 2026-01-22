# Task 10: Implement PaymentsService with Integration Tests

Metadata:
- Phase: Phase 4 - Domain Services Implementation
- Dependencies: Task 06 (migrations must be generated), Task 08 (UsersService for test data setup)
- Provides: libs/db/src/services/payments.service.ts and integration tests
- Size: Small (2 files: service + test)
- Test Resolution Target: 1 test (AC-10.1)

## Implementation Content

Implement PaymentsService for payment recording and queries. This service will be used by future TelegramModule to record Telegram Stars payment transactions.

**Methods to implement**:
1. `record(data: CreatePaymentDto): Promise<Payment>` - Record new payment
2. `findByUser(userId: number): Promise<Payment[]>` - Get user's payment history
3. `findByChargeId(chargeId: string): Promise<Payment | null>` - Find payment by Telegram charge ID

## Target Files
- [ ] libs/db/src/services/payments.service.ts
- [ ] libs/db/src/services/__tests__/payments.service.int.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests
- [ ] Create integration test file: payments.service.int.test.ts
- [ ] Set up test database connection (reuse pattern from Task 07)
- [ ] Implement test setup/teardown:
  - beforeAll: Create test app context with DbModule
  - beforeEach: Clean payments and users tables
  - afterAll: Close database connection
- [ ] Create test helper: createTestUser() using UsersService
- [ ] Write 1 core failing integration test:
  - **AC-10.1**: record inserts payment record
- [ ] Write additional tests for completeness:
  - findByUser returns all payments for user ordered by created_at desc
  - findByUser returns empty array when no payments
  - findByChargeId returns payment or null
  - record throws on duplicate telegram_payment_charge_id (unique constraint)
- [ ] Run tests: `pnpm run test payments.service.int.test` - confirm all fail
- [ ] Reference Design Doc PaymentsService interface and data contract

### 2. Green Phase - Minimal Implementation
- [ ] Create payments.service.ts
- [ ] Import Injectable, Inject from @nestjs/common
- [ ] Import DRIZZLE, DrizzleDB from '../database.provider'
- [ ] Import payments schema from '../schema'
- [ ] Import CreatePaymentDto from '../types/dto'
- [ ] Import eq, desc from drizzle-orm
- [ ] Add @Injectable() decorator
- [ ] Implement constructor with @Inject(DRIZZLE)

#### Implement record (AC-10.1)
- [ ] Insert: db.insert(payments).values({
  userId: data.userId,
  telegramPaymentChargeId: data.telegramPaymentChargeId,
  amount: data.amount,
  currency: data.currency || 'XTR',
  status: data.status
}).returning()
- [ ] Return created payment
- [ ] Wrap in try-catch, log error with context, throw error (fail-fast)
- [ ] Let database enforce unique constraint on telegram_payment_charge_id
- [ ] Note: createdAt set automatically by schema

#### Implement findByUser
- [ ] Query: db.select().from(payments)
  .where(eq(payments.userId, userId))
  .orderBy(desc(payments.createdAt))
- [ ] Return array of payments (empty array if none)
- [ ] Wrap in try-catch, log error, throw error

#### Implement findByChargeId
- [ ] Query: db.select().from(payments)
  .where(eq(payments.telegramPaymentChargeId, chargeId))
  .limit(1)
- [ ] Return first result or null
- [ ] Wrap in try-catch, log error, throw error

- [ ] Run only new tests: `pnpm run test payments.service.int.test` - confirm all pass

### 3. Refactor Phase
- [ ] Extract common query patterns if duplication exists
- [ ] Improve error messages for clarity
- [ ] Add JSDoc comments to public methods
- [ ] Ensure consistent error handling pattern
- [ ] Run tests again: `pnpm run test payments.service.int.test` - confirm all pass

## Completion Criteria
- [ ] All 1 core integration test passes (AC-10.1)
- [ ] Additional tests for query methods and constraints pass
- [ ] Service injects DRIZZLE token correctly
- [ ] Error handling follows fail-fast pattern
- [ ] Currency defaults to 'XTR' if not provided
- [ ] findByUser returns payments in descending order by createdAt
- [ ] Unique constraint enforced on telegram_payment_charge_id
- [ ] Foreign key constraint enforced (requires valid userId)
- [ ] Operation verified: L2 (Test Operation) - new tests added and passing

## Notes
- Impact scope: PaymentsService and its tests only
- Constraints: Do not modify DbModule yet (Task 11)
- Test database must have payments and users tables from migrations
- Tests require creating test users first (use UsersService from Task 08)
- Currency field defaults to 'XTR' for Telegram Stars
- Amount is integer (Telegram Stars are whole numbers)
- Reference Design Doc PaymentsService section for method signatures
- Follow TDD strictly: Red → Green → Refactor
- This completes Phase 4 - all domain services implemented with tests
