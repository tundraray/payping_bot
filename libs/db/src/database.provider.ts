import type { Provider } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import type { DbConfig } from './config/db.config';
import * as schema from './schema';

/**
 * Injection token for the Drizzle ORM database instance.
 * Used by domain services to inject the database connection.
 *
 * @example
 * constructor(@Inject(DRIZZLE) private readonly db: DrizzleDB) {}
 */
export const DRIZZLE = Symbol('DRIZZLE');

/**
 * Injection token for the raw postgres.js SQL client.
 * Used by DbModule for graceful shutdown of connections.
 *
 * @example
 * constructor(@Inject(SQL_CLIENT) private readonly sql: postgres.Sql) {}
 */
export const SQL_CLIENT = Symbol('SQL_CLIENT');

/**
 * Type alias for the Drizzle database instance with schema.
 * Use this type when injecting the DRIZZLE token.
 */
export type DrizzleDB = PostgresJsDatabase<typeof schema>;

const logger = new Logger('DatabaseProvider');

/**
 * Masks password in database URL for safe logging.
 * @param url Database connection URL
 * @returns URL with password replaced by asterisks
 */
function maskDatabaseUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ':***@');
}

/**
 * Provider 1: SqlClientProvider - creates postgres.js connection pool.
 *
 * This provider creates the raw postgres.js client that manages the connection
 * pool. It is injected into DatabaseProvider and DbModule (for graceful shutdown).
 *
 * Configuration from DbConfig:
 * - url: PostgreSQL connection URL
 * - pool.max: Maximum connections in pool
 * - pool.idleTimeoutMs: Idle connection timeout (converted to seconds for postgres.js)
 * - pool.connectionTimeoutMs: Connection acquisition timeout (converted to seconds)
 *
 * @see DbConfig for configuration options
 * @see AC-2.1, AC-2.2, AC-11.1
 */
export const SqlClientProvider: Provider = {
  provide: SQL_CLIENT,
  inject: [ConfigService],
  useFactory: async (configService: ConfigService): Promise<postgres.Sql> => {
    const dbConfig = configService.get<DbConfig>('database');

    if (!dbConfig) {
      throw new Error(
        'Database configuration not found. Ensure ConfigModule.forFeature(dbConfig) is imported.',
      );
    }

    if (!dbConfig.url) {
      throw new Error(
        'DATABASE_URL environment variable is not set. Please configure a valid PostgreSQL connection URL.',
      );
    }

    logger.log(`Initializing database connection pool (max: ${dbConfig.pool.max})`);

    try {
      const sql = postgres(dbConfig.url, {
        max: dbConfig.pool.max,
        idle_timeout: dbConfig.pool.idleTimeoutMs / 1000,
        connect_timeout: dbConfig.pool.connectionTimeoutMs / 1000,
      });

      // Verify connection by executing a simple query
      await sql`SELECT 1`;

      logger.log('Database connection pool initialized successfully');

      return sql;
    } catch (error) {
      const maskedUrl = maskDatabaseUrl(dbConfig.url);
      logger.error(
        `Failed to establish database connection: ${error instanceof Error ? error.message : String(error)}`,
        { url: maskedUrl },
      );
      throw new Error(
        `Failed to establish database connection to ${maskedUrl}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },
};

/**
 * Provider 2: DatabaseProvider - creates Drizzle ORM instance with migrations.
 *
 * This provider creates the Drizzle ORM instance that domain services use for
 * database operations. It depends on SqlClientProvider for the connection.
 *
 * On startup:
 * 1. Creates Drizzle instance using the injected SQL client
 * 2. If migrations.runOnStartup is true, runs pending migrations
 *    - Uses a separate max:1 client to prevent race conditions (Drizzle requirement)
 *    - Closes the migration client after migrations complete
 *
 * @see AC-2.1, AC-3.1, AC-3.2
 */
export const DatabaseProvider: Provider = {
  provide: DRIZZLE,
  inject: [SQL_CLIENT, ConfigService],
  useFactory: async (sql: postgres.Sql, configService: ConfigService): Promise<DrizzleDB> => {
    const dbConfig = configService.get<DbConfig>('database');

    if (!dbConfig) {
      throw new Error(
        'Database configuration not found. Ensure ConfigModule.forFeature(dbConfig) is imported.',
      );
    }

    logger.log('Creating Drizzle ORM instance');

    // Create Drizzle instance with schema for type-safe queries
    const db = drizzle(sql, { schema });

    // Run migrations on startup if configured (AC-3.1)
    if (dbConfig.migrations.runOnStartup) {
      logger.log('Running database migrations...');

      // Create separate max:1 client for migrations to prevent race conditions
      // This is required by Drizzle ORM for safe migration execution
      const migrationClient = postgres(dbConfig.url, { max: 1 });

      try {
        const migrationDb = drizzle(migrationClient, { schema });
        await migrate(migrationDb, {
          migrationsFolder: dbConfig.migrations.migrationsFolder,
        });

        logger.log('Database migrations completed successfully');
      } catch (error) {
        // AC-3.2: Log error and throw (application will fail to start)
        const maskedUrl = maskDatabaseUrl(dbConfig.url);
        logger.error(
          `Migration failed: ${error instanceof Error ? error.message : String(error)}`,
          { url: maskedUrl, migrationsFolder: dbConfig.migrations.migrationsFolder },
        );
        throw new Error(
          `Database migration failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        // Always close the migration client
        await migrationClient.end();
      }
    } else {
      logger.log('Skipping migrations (runOnStartup is false)');
    }

    logger.log('Drizzle ORM instance ready');

    return db;
  },
};
