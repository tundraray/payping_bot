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
- [ ] libs/db/src/database.provider.ts

## Implementation Steps

### 1. Import Dependencies
- [ ] Import postgres from 'postgres'
- [ ] Import drizzle, PostgresJsDatabase from 'drizzle-orm/postgres-js'
- [ ] Import migrate from 'drizzle-orm/postgres-js/migrator'
- [ ] Import Provider from '@nestjs/common'
- [ ] Import ConfigService from '@nestjs/config'
- [ ] Import * as schema from './schema'
- [ ] Import DbConfig interface from './config/db.config'

### 2. Define Tokens and Types
- [ ] Export SQL_CLIENT symbol
- [ ] Export DRIZZLE symbol
- [ ] Export DrizzleDB type alias: PostgresJsDatabase<typeof schema>

### 3. Implement SqlClientProvider (AC-2.1, AC-2.2)
- [ ] Create SqlClientProvider with:
  - provide: SQL_CLIENT
  - inject: [ConfigService]
  - useFactory: async (configService) => {...}
- [ ] In useFactory:
  - Get dbConfig from configService.get<DbConfig>('database')
  - Create postgres client with url and pool config (max, idle_timeout, connect_timeout)
  - Return postgres.Sql client
- [ ] Reference Design Doc DatabaseProvider interface section

### 4. Implement DatabaseProvider (AC-2.1, AC-3.1)
- [ ] Create DatabaseProvider with:
  - provide: DRIZZLE
  - inject: [SQL_CLIENT, ConfigService]
  - useFactory: async (sql, configService) => {...}
- [ ] In useFactory:
  - Get dbConfig from configService
  - Create Drizzle instance: drizzle(sql, { schema })
  - If dbConfig.migrations.runOnStartup is true:
    - Create separate migration client: postgres(dbConfig.url, { max: 1 })
    - Create migration db: drizzle(migrationClient, { schema })
    - Run migrate(migrationDb, { migrationsFolder: dbConfig.migrations.migrationsFolder })
    - Close migration client: await migrationClient.end()
  - Return Drizzle instance
- [ ] Reference Design Doc DatabaseProvider interface section

### 5. Error Handling (AC-2.3, AC-3.2)
- [ ] Wrap connection creation in try-catch
- [ ] On connection error: Log error with masked password, throw descriptive error
- [ ] Wrap migration in try-catch
- [ ] On migration error: Log error, throw (application will fail to start)
- [ ] Reference Design Doc error handling section

## Completion Criteria
- [ ] database.provider.ts exports SQL_CLIENT, DRIZZLE, DrizzleDB type
- [ ] SqlClientProvider creates postgres.js connection with pool config (AC-2.1, AC-11.1)
- [ ] DatabaseProvider runs migrations on startup (AC-3.1)
- [ ] Separate max:1 client used for migrations to prevent race conditions
- [ ] Error handling implemented for connection and migration failures (AC-2.3, AC-3.2)
- [ ] File compiles without TypeScript errors
- [ ] `pnpm run build` succeeds
- [ ] Operation verified: L3 (Build Success) - provider exports can be imported

## Notes
- Impact scope: Provider file only, no module registration yet
- Constraints: Do not modify DbModule yet (that's Task 11)
- Two-provider pattern required for graceful shutdown (DbModule needs SQL_CLIENT)
- Migration client uses max:1 to prevent race conditions (Drizzle requirement)
- Main pool managed by postgres.js, separate from migration client
- Follow fail-fast error handling: always throw with context
