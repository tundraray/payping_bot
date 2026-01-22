# Task 11: Wire DatabaseProvider and Services in DbModule

Metadata:
- Phase: Phase 5 - DbModule Integration
- Dependencies: Tasks 05, 07, 08, 09, 10 (all providers and services must exist)
- Provides: Updated libs/db/src/db.module.ts and libs/db/src/index.ts
- Size: Small (2 files)

## Implementation Content

Update DbModule to register DatabaseProvider and all domain services, export services for use by other modules, and implement graceful shutdown. Update index.ts to export all public APIs.

**DbModule updates**:
1. Import ConfigModule with dbConfig
2. Register SqlClientProvider and DatabaseProvider
3. Register all 4 domain services
4. Export all 4 domain services
5. Implement OnApplicationShutdown for graceful connection close

**Index.ts updates**:
1. Export schema types
2. Export all services
3. Export DRIZZLE and SQL_CLIENT tokens
4. Export DrizzleDB type

## Target Files
- [ ] libs/db/src/db.module.ts
- [ ] libs/db/src/index.ts

## Implementation Steps

### 1. Update DbModule Imports Section
- [ ] Import Module, OnApplicationShutdown, Inject from @nestjs/common
- [ ] Import ConfigModule from @nestjs/config
- [ ] Import postgres from 'postgres'
- [ ] Import dbConfig from './config/db.config'
- [ ] Import SQL_CLIENT, SqlClientProvider, DatabaseProvider from './database.provider'
- [ ] Import all 4 services:
  - TransactionsService from './services/transactions.service'
  - UsersService from './services/users.service'
  - SubscriptionsService from './services/subscriptions.service'
  - PaymentsService from './services/payments.service'

### 2. Update @Module Decorator
- [ ] In imports array:
  - Add ConfigModule.forFeature(dbConfig)
- [ ] In providers array (order matters):
  - SqlClientProvider (must be first - DatabaseProvider depends on it)
  - DatabaseProvider
  - TransactionsService
  - UsersService
  - SubscriptionsService
  - PaymentsService
- [ ] In exports array:
  - TransactionsService
  - UsersService
  - SubscriptionsService
  - PaymentsService
- [ ] Reference Design Doc DbModule structure section

### 3. Implement Graceful Shutdown (AC-12.1, AC-12.2)
- [ ] Add `implements OnApplicationShutdown` to class declaration
- [ ] Implement constructor:
  - @Inject(SQL_CLIENT) private readonly sql: postgres.Sql
- [ ] Implement onApplicationShutdown method:
  - async onApplicationShutdown(): Promise<void>
  - await this.sql.end()
- [ ] Reference Design Doc DbModule structure section

### 4. Update libs/db/src/index.ts
- [ ] Export all schema tables:
  - export * from './schema'
- [ ] Export all services:
  - export { TransactionsService } from './services/transactions.service'
  - export { UsersService } from './services/users.service'
  - export { SubscriptionsService } from './services/subscriptions.service'
  - export { PaymentsService } from './services/payments.service'
- [ ] Export tokens and types:
  - export { DRIZZLE, SQL_CLIENT, DrizzleDB } from './database.provider'
- [ ] Export DTO types:
  - export * from './types/dto'
- [ ] Export DbModule:
  - export { DbModule } from './db.module'

### 5. Verify Module Structure
- [ ] Check imports are in correct order
- [ ] Verify SqlClientProvider is before DatabaseProvider in providers array
- [ ] Verify all services are exported
- [ ] Verify graceful shutdown implemented

## Completion Criteria
- [ ] DbModule imports ConfigModule with dbConfig
- [ ] SqlClientProvider registered before DatabaseProvider (order matters)
- [ ] All 4 domain services registered and exported
- [ ] Graceful shutdown implemented (AC-12.1, AC-12.2)
- [ ] Index.ts exports all public API
- [ ] Files compile without TypeScript errors
- [ ] `pnpm run build` succeeds
- [ ] Operation verified: L3 (Build Success) - module can be imported

## Notes
- Impact scope: DbModule and index.ts only
- Constraints: Do not modify services or providers
- Provider order is critical: SqlClientProvider must be registered before DatabaseProvider
- DbModule exports services, not providers (DRIZZLE token is internal)
- Graceful shutdown uses SQL_CLIENT to close postgres.js connection pool
- This completes integration - blockchain module can now use TransactionsService
- Reference Design Doc DbModule structure section for exact implementation
