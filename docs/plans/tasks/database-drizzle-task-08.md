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
- [x] libs/db/src/services/users.service.ts
- [x] libs/db/src/services/__tests__/users.service.int.test.ts

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase - Write Failing Tests
- [x] Create integration test file: users.service.int.test.ts
- [x] Set up test database connection (reuse pattern from Task 07)
- [x] Implement test setup/teardown:
  - beforeAll: Create test app context with DbModule
  - beforeEach: Clean users table
  - afterAll: Close database connection
- [x] Write 2 core failing integration tests:
  - **AC-8.1**: create creates or returns existing user (test both insert and upsert)
  - **AC-8.2**: findByTelegramId returns user or null
- [x] Write additional tests for completeness:
  - update modifies user fields and returns updated user
  - update returns null if user not found
  - findById returns user or null
- [x] Run tests: `pnpm run test users.service.int.test` - confirm all fail
- [x] Reference Design Doc UsersService interface and data contract

### 2. Green Phase - Minimal Implementation
- [x] Create users.service.ts
- [x] Import Injectable, Inject from @nestjs/common
- [x] Import DRIZZLE, DrizzleDB from '../database.provider'
- [x] Import users schema from '../schema'
- [x] Import CreateUserDto, UpdateUserDto from '../types/dto'
- [x] Import eq from drizzle-orm
- [x] Add @Injectable() decorator
- [x] Implement constructor with @Inject(DRIZZLE)

#### Implement findByTelegramId (AC-8.2)
- [x] Query: db.select().from(users).where(eq(users.telegramId, telegramId)).limit(1)
- [x] Return first result or null
- [x] Wrap in try-catch, log error with context, throw error (fail-fast)

#### Implement create (AC-8.1)
- [x] Check if user exists: call findByTelegramId(data.telegramId)
- [x] If exists: return existing user
- [x] If not exists: insert with db.insert(users).values(data).returning()
- [x] Return created user
- [x] Wrap in try-catch, log error, throw error
- [x] Note: createdAt and updatedAt set automatically by schema

#### Implement update
- [x] Find user by telegram_id: call findByTelegramId(telegramId)
- [x] If not found: return null
- [x] Update: db.update(users).set(data).where(eq(users.telegramId, telegramId)).returning()
- [x] Return updated user
- [x] Wrap in try-catch, log error, throw error
- [x] Note: updatedAt automatically updated by $onUpdateFn

#### Implement findById
- [x] Query: db.select().from(users).where(eq(users.id, id)).limit(1)
- [x] Return first result or null
- [x] Wrap in try-catch, log error, throw error

- [x] Run only new tests: `pnpm run test users.service.int.test` - confirm all pass

### 3. Refactor Phase
- [x] Extract common query patterns if duplication exists
- [x] Improve error messages for clarity
- [x] Add JSDoc comments to public methods
- [x] Ensure consistent error handling pattern
- [x] Run tests again: `pnpm run test users.service.int.test` - confirm all pass

## Completion Criteria
- [x] All 2 core integration tests pass (AC-8.1, AC-8.2)
- [x] Additional tests for update and findById pass
- [x] Service injects DRIZZLE token correctly
- [x] Error handling follows fail-fast pattern
- [x] create method handles upsert logic (idempotent)
- [x] updatedAt automatically updated on update operations
- [x] Operation verified: L2 (Test Operation) - new tests added and passing

## Notes
- Impact scope: UsersService and its tests only
- Constraints: Do not modify DbModule yet (Task 11)
- Test database must have users table from migrations (Task 06)
- create method is idempotent: multiple calls with same telegram_id return same user
- $onUpdateFn on updatedAt is runtime-only, requires using Drizzle update methods
- Reference Design Doc UsersService section for method signatures
- Follow TDD strictly: Red → Green → Refactor
