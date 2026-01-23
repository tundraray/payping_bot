// Module export

// Database provider exports
export { DRIZZLE, type DrizzleDB, SQL_CLIENT } from './database.provider';
export { DbModule } from './db.module';

// Schema exports
export * from './schema';
// Analytics service exports
export {
  type AnalyticsResult,
  AnalyticsService,
  type FiredEmployeeResult,
  type GroupedAnalyticsResult,
  type ProcessingResult,
} from './services/analytics.service';
export {
  type ClassificationResult,
  ClassificationService,
  type FiredWallet,
  type PaymentInfo,
  type SalaryChangeResult,
} from './services/classification.service';
export { type Payment, PaymentsService } from './services/payments.service';
export {
  type Classification,
  type RecipientWalletInput,
  RecipientWalletsService,
} from './services/recipient-wallets.service';
export { type Subscription, SubscriptionsService } from './services/subscriptions.service';
// Service exports
export { TransactionsService } from './services/transactions.service';
export { type User, UsersService } from './services/users.service';

// DTO exports
export * from './types/dto';

// Utils exports (data conversion only, display formatting is in @app/telegram)
export { formatUsdt, toRawUsdt } from './utils/usdt.utils';
