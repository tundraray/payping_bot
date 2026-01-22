# Task 02: Create Database Configuration Files

Metadata:
- Phase: Phase 1 - Foundation Setup
- Dependencies: Task 01 (packages must be installed)
- Provides: drizzle.config.ts, libs/db/src/config/db.config.ts, .env.example updates
- Size: Small (3 files)

## Implementation Content

Create configuration files for Drizzle ORM and database connection management. This establishes the configuration foundation that DatabaseProvider will use.

**Files to create**:
1. `drizzle.config.ts` - drizzle-kit CLI configuration at project root
2. `libs/db/src/config/db.config.ts` - Database connection configuration with registerAs factory
3. `.env.example` - Document required environment variables

## Target Files
- [x] drizzle.config.ts (project root)
- [x] libs/db/src/config/db.config.ts
- [x] .env.example (update)

## Implementation Steps

### 1. Create drizzle.config.ts
- [x] Create file at project root with Config type import
- [x] Set schema path to './libs/db/src/schema/index.ts'
- [x] Set out directory to './drizzle'
- [x] Set dialect to 'postgresql'
- [x] Configure dbCredentials.url from process.env.DATABASE_URL
- [x] Enable verbose and strict mode
- [x] Reference Design Doc drizzle-kit configuration section

### 2. Create libs/db/src/config/db.config.ts
- [x] Create config directory: `libs/db/src/config/`
- [x] Define DbConfig interface with structure:
  - url: string
  - pool: { max, idleTimeoutMs, connectionTimeoutMs }
  - migrations: { runOnStartup, migrationsFolder }
- [x] Implement registerAs('database', ...) factory function
- [x] Read environment variables with defaults:
  - DATABASE_URL (required, no default)
  - DB_POOL_MAX (default: 10)
  - DB_POOL_IDLE_TIMEOUT_MS (default: 30000)
  - DB_POOL_CONNECTION_TIMEOUT_MS (default: 10000)
  - DB_RUN_MIGRATIONS (default: true unless 'false')
- [x] Set migrationsFolder to './drizzle'
- [x] Reference Design Doc configuration schema section

### 3. Update .env.example
- [x] Add DATABASE_URL with example PostgreSQL connection string
- [x] Add DB_POOL_MAX with default value 10
- [x] Add DB_POOL_IDLE_TIMEOUT_MS with default value 30000
- [x] Add DB_POOL_CONNECTION_TIMEOUT_MS with default value 10000
- [x] Add DB_RUN_MIGRATIONS with default value true
- [x] Add MONITORED_WALLET_ADDRESS placeholder
- [x] Include comments explaining each variable

## Completion Criteria
- [x] All three files created
- [x] drizzle.config.ts compiles without TypeScript errors
- [x] db.config.ts exports DbConfig interface and default registerAs function
- [x] .env.example contains all required database variables
- [x] `pnpm run build` succeeds
- [x] Operation verified: L3 (Build Success) - configuration files compile

## Notes
- Impact scope: Configuration files only, no runtime code changes
- Constraints: Do not modify existing services or modules
- drizzle.config.ts will be used by `npx drizzle-kit` commands in later tasks
- db.config.ts will be imported by ConfigModule in DbModule (Task 11)
- Follow NestJS ConfigModule registerAs pattern used in @app/blockchain
