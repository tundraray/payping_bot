# Task 08: Implement UsersService with Integration Tests

Metadata:
- Phase: Phase 4 - Domain Services Implementation
- Dependencies: Task 06 (migrations must be generated), Task 05 (DRIZZLE token must exist)
- Provides: libs/db/src/services/users.service.ts and integration tests
- Size: Small (2 files: service + test)
- Test Resolution Target: 2 tests (AC-8.1, AC-8.2)

## Implementation Content

Implement UsersService with CRUD operations for Telegram user management. This service will be used by future TelegramModule for user registration and profile updates.

**Methods to implement**:
1. `findByTelegramId(telegramId: number): Promise<User | null>` - Find user by Telegram ID
2. `create(data: CreateUserDto): Promise<User>` - Create or return existing user
3. `update(telegramId: number, data: UpdateUserDto): Promise<User | null>` - Update user
4. `findById(id: number): Promise<User | null>` - Find user by internal ID

## Target Files
- [ ] libs/db/src/services/users.service.ts
- [ ] libs/db/src/services/__tests__/users.service.int.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests
- [ ] Create integration test file: users.service.int.test.ts
- [ ] Set up test database connection (reuse pattern from Task 07)
- [ ] Implement test setup/teardown:
  - beforeAll: Create test app context with DbModule
  - beforeEach: Clean users table
  - afterAll: Close database connection
- [ ] Write 2 core failing integration tests:
  - **AC-8.1**: create creates or returns existing user (test both insert and upsert)
  - **AC-8.2**: findByTelegramId returns user or null
- [ ] Write additional tests for completeness:
  - update modifies user fields and returns updated user
  - update returns null if user not found
  - findById returns user or null
- [ ] Run tests: `pnpm run test users.service.int.test` - confirm all fail
- [ ] Reference Design Doc UsersService interface and data contract

### 2. Green Phase - Minimal Implementation
- [ ] Create users.service.ts
- [ ] Import Injectable, Inject from @nestjs/common
- [ ] Import DRIZZLE, DrizzleDB from '../database.provider'
- [ ] Import users schema from '../schema'
- [ ] Import CreateUserDto, UpdateUserDto from '../types/dto'
- [ ] Import eq from drizzle-orm
- [ ] Add @Injectable() decorator
- [ ] Implement constructor with @Inject(DRIZZLE)

#### Implement findByTelegramId (AC-8.2)
- [ ] Query: db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1)
- [ ] Return first result or null
- [ ] Wrap in try-catch, log error with context, throw error (fail-fast)

#### Implement create (AC-8.1)
- [ ] Check if user exists: call findByTelegramId(data.telegramId)
- [ ] If exists: return existing user
- [ ] If not exists: insert with db.insert(users).values(data).returning()
- [ ] Return created user
- [ ] Wrap in try-catch, log error, throw error
- [ ] Note: createdAt and updatedAt set automatically by schema

#### Implement update
- [ ] Find user by telegram_id: call findByTelegramId(telegramId)
- [ ] If not found: return null
- [ ] Update: db.update(users).set(data).where(eq(users.telegramId, telegramId)).returning()
- [ ] Return updated user
- [ ] Wrap in try-catch, log error, throw error
- [ ] Note: updatedAt automatically updated by $onUpdateFn

#### Implement findById
- [ ] Query: db.select().from(users).where(eq(users.id, id)).limit(1)
- [ ] Return first result or null
- [ ] Wrap in try-catch, log error, throw error

- [ ] Run only new tests: `pnpm run test users.service.int.test` - confirm all pass

### 3. Refactor Phase
- [ ] Extract common query patterns if duplication exists
- [ ] Improve error messages for clarity
- [ ] Add JSDoc comments to public methods
- [ ] Ensure consistent error handling pattern
- [ ] Run tests again: `pnpm run test users.service.int.test` - confirm all pass

## Completion Criteria
- [ ] All 2 core integration tests pass (AC-8.1, AC-8.2)
- [ ] Additional tests for update and findById pass
- [ ] Service injects DRIZZLE token correctly
- [ ] Error handling follows fail-fast pattern
- [ ] create method handles upsert logic (idempotent)
- [ ] updatedAt automatically updated on update operations
- [ ] Operation verified: L2 (Test Operation) - new tests added and passing

## Notes
- Impact scope: UsersService and its tests only
- Constraints: Do not modify DbModule yet (Task 11)
- Test database must have users table from migrations (Task 06)
- create method is idempotent: multiple calls with same telegram_id return same user
- $onUpdateFn on updatedAt is runtime-only, requires using Drizzle update methods
- Reference Design Doc UsersService section for method signatures
- Follow TDD strictly: Red → Green → Refactor
