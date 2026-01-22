# Task: Wire TelegramModule and AppModule Integration

**Task ID**: telegram-bot-task-07
**Phase**: 8 (Module Integration)
**Estimated Time**: 30-45 minutes
**Dependencies**: Tasks 03, 05, 06 (all handlers and listeners implemented)
**Verifiability Level**: L1 (Functional operation verification)

## Overview

Complete the TelegramModule by registering all providers (handlers, listeners) and wire it into AppModule. This enables full end-to-end functionality, allowing the bot to respond to commands and emit notifications.

## Target Files

- `libs/telegram/src/telegram.module.ts` (modify)
- `libs/telegram/src/index.ts` (modify)
- `src/app.module.ts` (modify)

## Context

TelegramModule currently has minimal configuration with only TelegramService. The handlers (StartHandler, SubscribeHandler) and listener (TransactionListener) are implemented but not yet registered as providers.

This task:
1. Adds all handlers and listeners to TelegramModule providers
2. Ensures DbModule is imported for database access
3. Exports TelegramService and types from the module
4. Registers TelegramModule in AppModule's imports

## Implementation Steps

### Step 1: Update TelegramModule with all providers

**File**: `libs/telegram/src/telegram.module.ts`

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DbModule } from '@app/db';
import { TelegramService } from './telegram.service';
import { StartHandler } from './handlers/start.handler';
import { SubscribeHandler } from './handlers/subscribe.handler';
import { TransactionListener } from './listeners/transaction.listener';
import { telegramConfig } from './config/telegram.config';

/**
 * TelegramModule provides Telegram bot functionality.
 *
 * Imports:
 * - ConfigModule: For TELEGRAM_BOT_TOKEN configuration
 * - DbModule: For database access (users, subscriptions, transactions)
 *
 * Providers:
 * - TelegramService: Bot lifecycle management and i18n
 * - StartHandler: /start command with analytics
 * - SubscribeHandler: /subscribe and /unsubscribe commands
 * - TransactionListener: Event listener for transaction notifications
 *
 * Exports:
 * - TelegramService: For potential use in other modules
 */
@Module({
  imports: [
    ConfigModule.forFeature(telegramConfig),
    DbModule,
  ],
  providers: [
    TelegramService,
    StartHandler,
    SubscribeHandler,
    TransactionListener,
  ],
  exports: [TelegramService],
})
export class TelegramModule {}
```

**Key Points:**
- Import `DbModule` for service access (UsersService, SubscriptionsService, TransactionsService)
- Register all handlers as providers (they implement `OnModuleInit`)
- Register TransactionListener as provider (it uses `@OnEvent` decorator)
- Export TelegramService for potential external use
- ConfigModule.forFeature loads telegram configuration

### Step 2: Update index.ts exports

**File**: `libs/telegram/src/index.ts`

```typescript
export { TelegramModule } from './telegram.module';
export { TelegramService } from './telegram.service';
export type { BotContext, AnalyticsData } from './types/telegram.types';
export { CALLBACK_ACTIONS } from './types/telegram.types';
```

**Key Points:**
- Export TelegramModule for use in AppModule
- Export TelegramService for potential external use
- Export types for type safety in other modules
- Export CALLBACK_ACTIONS constants if needed elsewhere

### Step 3: Register TelegramModule in AppModule

**File**: `src/app.module.ts`

Update the imports array to include TelegramModule:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BlockchainModule } from '@app/blockchain';
import { DbModule } from '@app/db';
import { TelegramModule } from '@app/telegram';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    EventEmitterModule.forRoot(),
    DbModule,
    BlockchainModule,
    TelegramModule,
  ],
})
export class AppModule {}
```

**Key Points:**
- Add TelegramModule to imports array
- Order matters: TelegramModule should come after DbModule (dependency)
- EventEmitterModule must be present (for TransactionListener `@OnEvent`)

### Step 4: Verify EventEmitterModule is configured

**File**: `src/app.module.ts`

Ensure EventEmitterModule is imported (required for event-driven architecture):

```typescript
import { EventEmitterModule } from '@nestjs/event-emitter';

@Module({
  imports: [
    // ...
    EventEmitterModule.forRoot(),
    // ...
  ],
})
```

If not present, add it. This is required for `@OnEvent` decorators to work.

### Step 5: Verify configuration loading

**File**: `.env`

Ensure all required environment variables are set:

```env
# Database
DATABASE_URL=postgresql://...

# Telegram
TELEGRAM_BOT_TOKEN=your_bot_token_here

# Blockchain
MONITORED_WALLET_ADDRESS=your_wallet_address_here
TRONGRID_API_URL=https://api.trongrid.io
TRANSACTION_POLLING_INTERVAL_MS=5000
```

### Step 6: Test application startup

```bash
# Build the application
pnpm run build

# Start in development mode
pnpm run start:dev
```

Expected console output:
```
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [NestFactory] Starting Nest application...
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [InstanceLoader] DbModule dependencies initialized
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [InstanceLoader] BlockchainModule dependencies initialized
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [InstanceLoader] TelegramModule dependencies initialized
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [TelegramService] Starting Telegram bot...
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [TelegramService] Bot @YourBotName started successfully
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [StartHandler] StartHandler commands registered
[Nest] 12345  - MM/DD/YYYY, HH:MM:SS AM     LOG [SubscribeHandler] SubscribeHandler commands registered
```

### Step 7: Verify end-to-end functionality

**Manual E2E Test:**

1. **Test /start command:**
   - Open Telegram, find your bot
   - Send `/start`
   - Verify: Welcome message with analytics and Subscribe button appears

2. **Test /subscribe command:**
   - Send `/subscribe`
   - Verify: Confirmation message appears
   - Check database: `SELECT * FROM subscriptions WHERE status = 'active';`

3. **Test inline button:**
   - Send `/start` again
   - Click "Unsubscribe" button
   - Verify: Confirmation message appears
   - Check database: `SELECT * FROM subscriptions WHERE status = 'cancelled';`

4. **Test transaction notifications:**
   - Subscribe again using `/subscribe`
   - Emit a test transaction event:
     ```typescript
     // In a temporary test file or via REPL:
     const event = {
       hash: 'test123',
       type: 'USDT_TRC20',
       fromAddress: 'TSenderAddress',
       toAddress: 'TMonitoredWallet',
       amount: '100.50',
       timestamp: Date.now(),
       blockNumber: 12345,
       contractAddress: 'TContractAddress',
       raw: {},
     };
     eventEmitter.emit('transaction.new', event);
     ```
   - Verify: Notification received in Telegram

5. **Test full flow:**
   - Complete user journey: /start → Subscribe → Receive notification → Unsubscribe

## Completion Criteria

- [x] TelegramModule includes all providers (TelegramService, StartHandler, SubscribeHandler, TransactionListener)
- [x] DbModule imported in TelegramModule
- [x] TelegramModule properly exports TelegramService and types
- [x] TelegramModule registered in AppModule imports
- [x] EventEmitterModule configured in AppModule (via BlockchainModule.forRoot())
- [ ] Application starts without errors (`pnpm run start:dev`) - requires env vars
- [ ] All environment variables loaded correctly - requires env vars
- [ ] /start command works (displays analytics) - requires E2E verification
- [ ] /subscribe and /unsubscribe commands work - requires E2E verification
- [ ] Inline buttons work (Subscribe/Unsubscribe) - requires E2E verification
- [ ] Transaction notifications delivered to subscribers - requires E2E verification
- [ ] Database changes reflected correctly - requires E2E verification
- [x] No errors in console logs (build and tests pass)

## Acceptance Criteria Traceability

All acceptance criteria depend on successful module wiring:
- **AC-1.x** (/start analytics) → Verified in E2E test
- **AC-2.x** (/subscribe) → Verified in E2E test
- **AC-3.x** (/unsubscribe) → Verified in E2E test
- **AC-4.x** (Inline buttons) → Verified in E2E test
- **AC-5.x** (Notifications) → Verified in E2E test

## Testing Strategy

**Unit Tests** (L2 Verification):
- Module providers are correctly registered (can be tested with NestJS testing utilities)

**Integration Tests** (L1 Verification):
- Application starts successfully
- All handlers register commands
- Event listeners are active

**E2E Tests** (L1 Verification):
- Full user journey works end-to-end
- Commands respond correctly
- Notifications delivered
- Database state changes correctly

## Known Issues and Considerations

**Issue**: Module initialization order
- TelegramModule depends on DbModule
- Ensure DbModule is imported before TelegramModule in AppModule
- **Current**: Correct order in imports array

**Issue**: Event emitter configuration
- EventEmitterModule.forRoot() must be called for `@OnEvent` to work
- **Verify**: Present in AppModule imports

**Issue**: Environment variables
- Bot won't start without TELEGRAM_BOT_TOKEN
- Transactions won't be monitored without MONITORED_WALLET_ADDRESS
- **Verify**: All vars set in .env file

**Issue**: Database connection
- Bot startup fails if database is unreachable
- **Mitigation**: Ensure PostgreSQL is running and DATABASE_URL is correct

## Rollback Procedure

If issues are found:
1. Revert the commit
2. Remove TelegramModule from AppModule imports
3. Bot won't start, but blockchain monitoring remains functional
4. No database schema changes to rollback

## Verification Commands

```bash
# Run all tests
pnpm run test

# Check build
pnpm run build

# Start application
pnpm run start:dev

# Verify lint and type checks
pnpm run lint
pnpm run check

# Database verification (if needed)
psql $DATABASE_URL -c "SELECT * FROM subscriptions;"
```

## Success Indicators

- ✅ Application builds successfully
- ✅ Application starts without errors
- ✅ All handlers log "commands registered"
- ✅ Bot responds to commands in Telegram
- ✅ Buttons trigger correct actions
- ✅ Notifications delivered to subscribers
- ✅ Database reflects subscription changes
- ✅ No console errors or warnings
- ✅ All environment variables loaded correctly
- ✅ Full E2E user flow works

## Post-Integration Checklist

After successful integration, verify:
- [ ] Bot username is correct (shown in startup logs)
- [ ] Commands appear in Telegram bot menu (optional, requires BotFather setup)
- [ ] Multiple users can subscribe/unsubscribe independently
- [ ] Analytics show real transaction data (if any exists)
- [ ] Notifications include correct transaction details
- [ ] Error messages display correctly (test by triggering errors)
- [ ] Bot gracefully handles edge cases (no subscribers, invalid data, etc.)
