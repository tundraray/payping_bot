# Task 05: Implement DatabaseProvider with Two-Provider Pattern

Metadata:
- Phase: Phase 3 - Database Providers
- Dependencies: Task 04 (schema and config must exist)
- Provides: libs/db/src/database.provider.ts
- Size: Small (1 file)

## Implementation Content

Create DatabaseProvider using two-provider pattern for connection management and migration execution. This establishes the DRIZZLE token that all domain services will inject.

**Two-Provider Pattern**:
1. SqlClientProvider - Creates postgres.js client (needed for graceful shutdown)
2. DatabaseProvider - Creates Drizzle instance, runs migrations on startup

Reference Design Doc "DatabaseProvider (Two-Provider Pattern)" section.

## Target Files
- [x] libs/db/src/database.provider.ts

## Implementation Steps

### 1. Import Dependencies
- [x] Import postgres from 'postgres'
- [x] Import drizzle, PostgresJsDatabase from 'drizzle-orm/postgres-js'
- [x] Import migrate from 'drizzle-orm/postgres-js/migrator'
- [x] Import Provider from '@nestjs/common'
- [x] Import ConfigService from '@nestjs/config'
- [x] Import * as schema from './schema'
- [x] Import DbConfig interface from './config/db.config'

### 2. Define Tokens and Types
- [x] Export SQL_CLIENT symbol
- [x] Export DRIZZLE symbol
- [x] Export DrizzleDB type alias: PostgresJsDatabase<typeof schema>

### 3. Implement SqlClientProvider (AC-2.1, AC-2.2)
- [x] Create SqlClientProvider with:
  - provide: SQL_CLIENT
  - inject: [ConfigService]
  - useFactory: async (configService) => {...}
- [x] In useFactory:
  - Get dbConfig from configService.get<DbConfig>('database')
  - Create postgres client with url and pool config (max, idle_timeout, connect_timeout)
  - Return postgres.Sql client
- [x] Reference Design Doc DatabaseProvider interface section

### 4. Implement DatabaseProvider (AC-2.1, AC-3.1)
- [x] Create DatabaseProvider with:
  - provide: DRIZZLE
  - inject: [SQL_CLIENT, ConfigService]
  - useFactory: async (sql, configService) => {...}
- [x] In useFactory:
  - Get dbConfig from configService
  - Create Drizzle instance: drizzle(sql, { schema })
  - If dbConfig.migrations.runOnStartup is true:
    - Create separate migration client: postgres(dbConfig.url, { max: 1 })
    - Create migration db: drizzle(migrationClient, { schema })
    - Run migrate(migrationDb, { migrationsFolder: dbConfig.migrations.migrationsFolder })
    - Close migration client: await migrationClient.end()
  - Return Drizzle instance
- [x] Reference Design Doc DatabaseProvider interface section

### 5. Error Handling (AC-2.3, AC-3.2)
- [x] Wrap connection creation in try-catch
- [x] On connection error: Log error with masked password, throw descriptive error
- [x] Wrap migration in try-catch
- [x] On migration error: Log error, throw (application will fail to start)
- [x] Reference Design Doc error handling section

## Completion Criteria
- [x] database.provider.ts exports SQL_CLIENT, DRIZZLE, DrizzleDB type
- [x] SqlClientProvider creates postgres.js connection with pool config (AC-2.1, AC-11.1)
- [x] DatabaseProvider runs migrations on startup (AC-3.1)
- [x] Separate max:1 client used for migrations to prevent race conditions
- [x] Error handling implemented for connection and migration failures (AC-2.3, AC-3.2)
- [x] File compiles without TypeScript errors
- [x] `pnpm run build` succeeds
- [x] Operation verified: L3 (Build Success) - provider exports can be imported

## Notes
- Impact scope: Provider file only, no module registration yet
- Constraints: Do not modify DbModule yet (that's Task 11)
- Two-provider pattern required for graceful shutdown (DbModule needs SQL_CLIENT)
- Migration client uses max:1 to prevent race conditions (Drizzle requirement)
- Main pool managed by postgres.js, separate from migration client
- Follow fail-fast error handling: always throw with context
