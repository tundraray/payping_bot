import { Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type postgres from 'postgres';
import dbConfig from './config/db.config';
import { DatabaseProvider, SQL_CLIENT, SqlClientProvider } from './database.provider';
import { PaymentsService } from './services/payments.service';
import { SubscriptionsService } from './services/subscriptions.service';
import { TransactionsService } from './services/transactions.service';
import { UsersService } from './services/users.service';

/**
 * DbModule provides database access for the PayPing application.
 *
 * This module registers:
 * - SqlClientProvider: Creates postgres.js connection pool
 * - DatabaseProvider: Creates Drizzle instance and runs migrations
 * - Domain services: TransactionsService, UsersService, SubscriptionsService, PaymentsService
 *
 * Graceful shutdown is implemented via OnApplicationShutdown to properly close
 * the postgres.js connection pool when the application terminates.
 *
 * @see AC-12.1, AC-12.2
 */
@Module({
  imports: [ConfigModule.forFeature(dbConfig)],
  providers: [
    // Order matters: SqlClientProvider must be before DatabaseProvider
    SqlClientProvider,
    DatabaseProvider,
    // Domain services
    TransactionsService,
    UsersService,
    SubscriptionsService,
    PaymentsService,
  ],
  exports: [
    // Export domain services for use by other modules
    TransactionsService,
    UsersService,
    SubscriptionsService,
    PaymentsService,
  ],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(SQL_CLIENT) private readonly sql: postgres.Sql) {}

  /**
   * Gracefully closes the postgres.js connection pool on application shutdown.
   *
   * This ensures all pending queries complete and connections are properly released
   * before the application terminates.
   *
   * @see AC-12.1: Graceful shutdown closes database connection
   * @see AC-12.2: Connection pool properly terminated
   */
  async onApplicationShutdown(): Promise<void> {
    await this.sql.end();
  }
}
