import { registerAs } from '@nestjs/config';

/**
 * Database configuration interface.
 * Defines all settings required for PostgreSQL connection via postgres.js,
 * connection pooling, and programmatic migration execution.
 */
export interface DbConfig {
  /** PostgreSQL connection URL */
  url: string;
  /** Connection pool settings */
  pool: {
    /** Maximum number of connections in the pool */
    max: number;
    /** Idle connection timeout in milliseconds */
    idleTimeoutMs: number;
    /** Connection acquisition timeout in milliseconds */
    connectionTimeoutMs: number;
  };
  /** Migration settings */
  migrations: {
    /** Whether to run migrations on application startup */
    runOnStartup: boolean;
    /** Path to migrations folder */
    migrationsFolder: string;
  };
}

/**
 * Database configuration factory registered with NestJS ConfigModule.
 * Access via: configService.get<DbConfig>('database')
 *
 * Environment Variables:
 * - DATABASE_URL: PostgreSQL connection string (required)
 * - DB_POOL_MAX: Maximum pool connections (default: 10)
 * - DB_POOL_IDLE_TIMEOUT_MS: Idle connection timeout (default: 30000)
 * - DB_POOL_CONNECTION_TIMEOUT_MS: Connection acquisition timeout (default: 10000)
 * - DB_RUN_MIGRATIONS: Run migrations on startup (default: true)
 */
export default registerAs(
  'database',
  (): DbConfig => ({
    url: process.env.DATABASE_URL || '',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      idleTimeoutMs: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
      connectionTimeoutMs: parseInt(process.env.DB_POOL_CONNECTION_TIMEOUT_MS || '10000', 10),
    },
    migrations: {
      runOnStartup: process.env.DB_RUN_MIGRATIONS !== 'false',
      migrationsFolder: './drizzle',
    },
  }),
);
