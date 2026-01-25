# Work Plan: Payout Session Notifications Implementation

## Overview

| Attribute | Value |
|-----------|-------|
| Source Design Doc | `docs/design/payout-session-notifications-design.md` |
| Source ADR | `docs/adr/004-payout-session-detection.md` |
| Target Branch | `main` |
| Estimated Effort | 4-5 days |
| Start Date | 2026-01-23 |
| Status | Completed |
| Version | 1.0 |

## Summary

This work plan implements Payout Session Notifications for PayPing bot, enabling real-time detection of salary payout sessions with notifications for session start, individual outgoing transactions, and session end. The implementation follows a vertical slice with foundation-first approach, as TronGrid balance API and event definitions must be established before session management can be implemented.

### Key Deliverables

- New `PayoutSessionService` in `@app/blockchain` for session state management
- New `getUSDTBalance()` method in `TronGridClient` for balance checking
- New payout events: `payout.start`, `payout.transaction`, `payout.end`
- New `PayoutListener` in `@app/telegram` for payout notifications
- Localization support for payout notifications (en, ru, uk)
- In-memory state machine with IDLE/ACTIVE states
- Timeout detection via `@Interval(60000)`

### Test Coverage

- **Integration tests**: `libs/blockchain/src/__tests__/payout-session.int.test.ts`
  - 9 test cases covering state machine, events, and error handling
- **E2E tests**: `libs/blockchain/src/__tests__/payout-session.e2e.test.ts`
  - 5 test cases covering complete user journeys

## Phase Structure Diagram

```mermaid
graph TD
    subgraph "Phase 1: Foundation"
        T1_1[Task 1.1: Add payout config<br/>to blockchain.config.ts]
        T1_2[Task 1.2: Create payout.events.ts<br/>with 3 event interfaces]
        T1_3[Task 1.3: Add getUSDTBalance<br/>to TronGridClient]
        T1_4[Task 1.4: Unit tests for<br/>balance API]
    end

    subgraph "Phase 2: Core Logic"
        T2_1[Task 2.1: Create PayoutSessionService<br/>with state machine]
        T2_2[Task 2.2: Implement timeout/balance check<br/>with @Interval]
        T2_3[Task 2.3: Add TX event emission<br/>for each outgoing TX]
        T2_4[Task 2.4: Hook into<br/>TransactionProcessorService]
        T2_5[Task 2.5: Unit tests for<br/>session service]
    end

    subgraph "Phase 3: Notifications"
        T3_1[Task 3.1: Add localization strings<br/>3 templates x 3 languages]
        T3_2[Task 3.2: Create PayoutListener<br/>with 3 event handlers]
        T3_3[Task 3.3: Unit tests for<br/>listener]
    end

    subgraph "Phase 4: Integration & Testing"
        T4_1[Task 4.1: Register services<br/>in modules]
        T4_2[Task 4.2: Export from index.ts]
        T4_3[Task 4.3: Integration tests]
        T4_4[Task 4.4: E2E tests]
        T4_5[Task 4.5: Final AC verification]
    end

    T1_1 --> T1_2 --> T1_3 --> T1_4
    T1_4 --> T2_1 --> T2_2 --> T2_3 --> T2_4 --> T2_5
    T2_5 --> T3_1 --> T3_2 --> T3_3
    T3_3 --> T4_1 --> T4_2 --> T4_3 --> T4_4 --> T4_5

    style T1_1 fill:#e3f2fd
    style T1_2 fill:#e3f2fd
    style T1_3 fill:#e3f2fd
    style T1_4 fill:#e3f2fd
    style T2_1 fill:#bbdefb
    style T2_2 fill:#bbdefb
    style T2_3 fill:#bbdefb
    style T2_4 fill:#bbdefb
    style T2_5 fill:#bbdefb
    style T3_1 fill:#fff3e0
    style T3_2 fill:#fff3e0
    style T3_3 fill:#fff3e0
    style T4_1 fill:#c8e6c9
    style T4_2 fill:#c8e6c9
    style T4_3 fill:#c8e6c9
    style T4_4 fill:#c8e6c9
    style T4_5 fill:#c8e6c9
```

## Task Dependency Diagram

```mermaid
graph LR
    subgraph "Foundation Layer"
        A1[1.1 Payout config]
        A2[1.2 Event definitions]
        A3[1.3 Balance API]
        A4[1.4 Balance API tests]
    end

    subgraph "Service Layer"
        B1[2.1 PayoutSessionService]
        B2[2.2 Timeout/balance check]
        B3[2.3 TX event emission]
        B4[2.4 TransactionProcessor hook]
        B5[2.5 Unit tests]
    end

    subgraph "Presentation Layer"
        C1[3.1 Localization]
        C2[3.2 PayoutListener]
        C3[3.3 Listener tests]
    end

    subgraph "Quality Assurance"
        D1[4.1 Module registration]
        D2[4.2 Index exports]
        D3[4.3 Integration tests]
        D4[4.4 E2E tests]
        D5[4.5 Final verification]
    end

    A1 --> A2
    A2 --> A3
    A3 --> A4
    A4 --> B1
    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5
    B5 --> C1
    C1 --> C2
    C2 --> C3
    C3 --> D1
    D1 --> D2
    D2 --> D3
    D3 --> D4
    D4 --> D5
```

---

## Phase 1: Foundation

**Goal**: Create configuration, event definitions, and TronGrid balance API required for payout session feature.

**Estimated Duration**: 1 day

**Test Case Resolution**: 0/9 integration tests, 0/5 E2E tests

### Task 1.1: Add payout configuration

- [x] **Completed**

**Description**: Add payout-related configuration values to blockchain config.

**Files to Create/Modify**:
- `libs/blockchain/src/config/blockchain.config.ts` (update)

**Implementation Details**:
1. Add payout configuration interface:
   ```typescript
   export interface PayoutConfig {
     balanceThresholdUsdt: number;  // Default: 1000
     timeoutMinutes: number;        // Default: 30
     checkIntervalMs: number;       // Default: 60000
   }
   ```
2. Add environment variable mappings:
   - `PAYOUT_BALANCE_THRESHOLD_USDT` (default: 1000)
   - `PAYOUT_TIMEOUT_MINUTES` (default: 30)
   - `PAYOUT_CHECK_INTERVAL_MS` (default: 60000)
3. Add USDT contract address configuration:
   - `USDT_CONTRACT_ADDRESS` (default: `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t`)

**Completion Criteria**:
- [x] Configuration values accessible via ConfigService
- [x] Default values defined for all payout config
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 1.2: Create payout event definitions

- [x] **Completed**

**Description**: Define payout event constants and payload interfaces.

**Files to Create/Modify**:
- `libs/blockchain/src/events/payout.events.ts` (create)
- `libs/blockchain/src/events/index.ts` (update exports)

**Implementation Details**:
1. Create event constants:
   ```typescript
   export const PAYOUT_START_EVENT = 'payout.start';
   export const PAYOUT_TRANSACTION_EVENT = 'payout.transaction';
   export const PAYOUT_END_EVENT = 'payout.end';
   ```
2. Create `PayoutEndReason` type: `'BALANCE_THRESHOLD' | 'TIMEOUT'`
3. Create `PayoutStartEvent` interface (from Design Doc):
   - `startedAt: number` (Unix ms)
   - `firstTransactionHash: string`
   - `startBalance: string` (raw units)
4. Create `PayoutTransactionEvent` interface:
   - `transactionHash: string`
   - `amount: string` (raw units)
   - `recipientAddress: string`
   - `timestamp: number` (Unix ms)
   - `sessionTotalAmount: string` (raw units)
   - `transactionNumber: number` (1-based)
5. Create `PayoutEndEvent` interface:
   - `startedAt: number`
   - `endedAt: number`
   - `endReason: PayoutEndReason`
   - `transactionCount: number`
   - `totalAmount: string`
   - `endingBalance: string`
   - `durationMinutes: number`
6. Create `PayoutEvents` const object for event names
7. Export from events/index.ts

**Completion Criteria** (AC-1.4, AC-6.1):
- [x] All 3 event constants defined
- [x] All 3 event interfaces defined
- [x] PayoutEndReason type defined
- [x] Exports from events/index.ts
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 1.3: Add getUSDTBalance to TronGridClient

- [x] **Completed**

**Description**: Implement USDT balance query via TronGrid `triggerconstantcontract` API.

**Files to Create/Modify**:
- `libs/blockchain/src/clients/trongrid.client.ts` (update)

**Implementation Details**:
1. Add `getUSDTBalance(address: string): Promise<string>` method
2. API call details (from ADR-0004):
   ```typescript
   POST /wallet/triggerconstantcontract
   {
     "contract_address": "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
     "function_selector": "balanceOf(address)",
     "parameter": "<hex-encoded-wallet-address>",
     "owner_address": "<wallet-address>",
     "visible": true
   }
   ```
3. Implement address hex encoding (TRON address to hex):
   - Convert base58 address to hex format for `parameter` field
4. Parse response:
   - Extract `constant_result[0]` (hex-encoded balance)
   - Convert hex to decimal string
5. Apply existing retry and error handling patterns
6. Handle errors: throw `TronGridApiError` with context

**Completion Criteria** (AC-2.1):
- [x] Method signature matches interface
- [x] Address hex encoding implemented
- [x] Response parsing implemented (hex to decimal)
- [x] Error handling with retry logic
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 1.4: Unit tests for balance API

- [x] **Completed**

**Description**: Write unit tests for `TronGridClient.getUSDTBalance()`.

**Files to Create/Modify**:
- `libs/blockchain/src/clients/__tests__/trongrid.client.spec.ts` (update or create)

**Implementation Details**:
1. Test cases:
   - Valid balance response: verify hex parsing (e.g., `0x5f5e100` = 100000000 = 100 USDT)
   - Zero balance: returns "0"
   - Large balance: handles BigInt correctly
   - API error: throws TronGridApiError
   - Timeout: throws with timeout error
   - Invalid response (missing constant_result): throws error
2. Mock axios for API calls
3. Test address hex encoding separately

**Completion Criteria**:
- [ ] All test cases pass
- [ ] Coverage >= 80% for getUSDTBalance method
- [ ] Tests pass: `pnpm test libs/blockchain`

**Verification Level**: L2 (tests pass)

---

## Phase 2: Core Logic

**Goal**: Implement PayoutSessionService with state machine, timeout detection, and transaction processor integration.

**Estimated Duration**: 1.5 days

**Prerequisite**: Phase 1 completed

**Test Case Resolution**: 0/9 integration tests (ready to implement)

### Task 2.1: Create PayoutSessionService with state machine

- [x] **Completed**

**Description**: Implement core session state management with mutex for race condition prevention.

**Files to Create/Modify**:
- `libs/blockchain/src/services/payout-session.service.ts` (create)

**Implementation Details**:
1. Create `PayoutSessionState` interface:
   ```typescript
   interface PayoutSessionState {
     isActive: boolean;
     startedAt: Date | null;
     startBalance: string | null;
     lastTransactionAt: Date | null;
     transactionCount: number;
     totalAmount: string;
     firstTransactionHash: string | null;
   }
   ```
2. Create `PayoutSessionService` class with:
   - Private `state: PayoutSessionState` initialized to IDLE
   - Private `mutex: Mutex` from `async-mutex` package
   - Constructor injecting: `TronGridClient`, `EventEmitter2`, `ConfigService`
3. Implement `handleOutgoingTransaction(tx: Transaction): Promise<void>`:
   - Wrap with `mutex.runExclusive()` for race condition prevention
   - If IDLE: call `startSession(tx)`, emit both start and transaction events
   - If ACTIVE: call `updateSession(tx)`, emit transaction event
4. Implement private `startSession(tx)`:
   - Fetch balance via `tronGridClient.getUSDTBalance()`
   - Update state to ACTIVE with start info
   - Emit `payout.start` event
5. Implement private `updateSession(tx)`:
   - Increment `transactionCount`
   - Add amount to `totalAmount` (BigInt arithmetic)
   - Update `lastTransactionAt`
6. Implement `getState(): PayoutSessionState` (for testing)
7. Implement `isActive(): boolean` (convenience method)

**Completion Criteria** (AC-1.1, AC-1.2, AC-1.3):
- [x] State machine transitions correctly (IDLE -> ACTIVE)
- [x] Mutex prevents race conditions
- [x] Start info recorded (timestamp, balance, hash)
- [x] Statistics updated on subsequent transactions
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 2.2: Implement timeout and balance threshold check

- [x] **Completed**

**Description**: Add scheduled task for timeout detection and balance threshold checking.

**Files to Create/Modify**:
- `libs/blockchain/src/services/payout-session.service.ts` (update)

**Implementation Details**:
1. Add `@Interval(60000)` decorator to `checkTimeout()` method
2. Implement `checkTimeout(): Promise<void>`:
   - Wrap with `mutex.runExclusive()` for thread safety
   - If not active or no lastTransactionAt: return early
   - Fetch current balance via `getUSDTBalance()`
   - **Balance threshold check (AC-2.2)**:
     - If balance < threshold (1,000,000,000 raw = 1000 USDT): end session with `BALANCE_THRESHOLD`
   - **Timeout check (AC-3.1)**:
     - Calculate elapsed time since `lastTransactionAt`
     - If >= 30 minutes AND balance < startBalance: end session with `TIMEOUT`
     - If >= 30 minutes AND balance >= startBalance: continue (AC-3.3)
3. Implement private `endSession(reason: PayoutEndReason)`:
   - Fetch ending balance
   - Calculate duration in minutes
   - Emit `payout.end` event with full statistics
   - Call `resetState()`
4. Implement error handling for balance check failures (AC-2.3):
   - Log error with context
   - Do NOT end session
   - Allow retry on next interval

**Completion Criteria** (AC-2.1, AC-2.2, AC-2.3, AC-3.1, AC-3.2, AC-3.3):
- [x] @Interval(60000) decorator applied
- [x] Balance threshold check works (< 1000 USDT ends session)
- [x] Timeout check works (30 min + balance decreased)
- [x] Timeout does NOT end session if balance not decreased
- [x] Balance check errors logged, session continues
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 2.3: Add transaction event emission

- [x] **Completed**

**Description**: Emit `payout.transaction` event for each outgoing transaction during active session.

**Files to Create/Modify**:
- `libs/blockchain/src/services/payout-session.service.ts` (update)

**Implementation Details**:
1. Add private `emitTransactionEvent(tx: Transaction): void` method:
   ```typescript
   private emitTransactionEvent(tx: Transaction): void {
     const event: PayoutTransactionEvent = {
       transactionHash: tx.hash,
       amount: tx.amount,
       recipientAddress: tx.toAddress,
       timestamp: Date.now(),
       sessionTotalAmount: this.state.totalAmount,
       transactionNumber: this.state.transactionCount,
     };
     this.eventEmitter.emit(PAYOUT_TRANSACTION_EVENT, event);
   }
   ```
2. Update `handleOutgoingTransaction()` to call `emitTransactionEvent()`:
   - For first TX (session start): emit both `payout.start` AND `payout.transaction`
   - For subsequent TXs: emit only `payout.transaction`
3. Ensure `transactionNumber` is 1-based (first TX = 1)
4. Ensure `sessionTotalAmount` reflects running total AFTER this TX

**Completion Criteria** (AC-6.1, AC-6.3, AC-6.5):
- [x] Transaction event emitted for each outgoing TX
- [x] First TX emits both start AND transaction events
- [x] Event payload includes all required fields
- [x] transactionNumber is 1-based
- [x] sessionTotalAmount is running total after TX
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 2.4: Hook into TransactionProcessorService

- [x] **Completed**

**Description**: Integrate outgoing transaction detection with PayoutSessionService.

**Files to Create/Modify**:
- `libs/blockchain/src/services/transaction-processor.service.ts` (update)

**Implementation Details**:
1. Inject `PayoutSessionService` into `TransactionProcessorService`
2. In `processUSDTTransactions()` (or equivalent method):
   - After detecting outgoing transaction (fromAddress = monitored wallet)
   - Call `payoutSessionService.handleOutgoingTransaction(tx)`
3. Ensure call is wrapped in try-catch to not block transaction processing
4. Log errors but continue processing

**Integration Pattern**:
```typescript
// In TransactionProcessorService
for (const tx of transactions) {
  // ... existing processing logic ...

  if (tx.fromAddress === this.monitoredWallet) {
    // Outgoing transaction detected
    try {
      await this.payoutSessionService.handleOutgoingTransaction(tx);
    } catch (error) {
      this.logger.error('Payout session handling failed', { error, txHash: tx.hash });
      // Continue processing - don't block on payout session errors
    }
  }
}
```

**Completion Criteria**:
- [x] PayoutSessionService injected
- [x] Outgoing transactions trigger handleOutgoingTransaction()
- [x] Error handling prevents blocking
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 2.5: Unit tests for PayoutSessionService

- [ ] **Completed**

**Description**: Write comprehensive unit tests for PayoutSessionService.

**Files to Create/Modify**:
- `libs/blockchain/src/services/__tests__/payout-session.service.spec.ts` (create)

**Implementation Details**:
1. Test cases (mapping to integration test AC requirements):
   - **AC-1.1**: First outgoing TX transitions IDLE -> ACTIVE
   - **AC-1.2**: Start info recorded (timestamp, balance, hash)
   - **AC-1.3**: Subsequent TXs update statistics only
   - **AC-1.4**: payout.start event emitted with correct payload
   - **AC-2.2**: Session ends when balance < 1000 USDT
   - **AC-2.3**: Balance check failure logs error, session continues
   - **AC-3.1**: Session ends after 30 min + balance decreased
   - **AC-3.3**: Session does NOT end if balance not decreased
   - **AC-6.1**: payout.transaction event emitted for each TX
   - **AC-6.3**: Transaction event contains all required fields
   - **AC-6.5**: First TX emits both start AND transaction events
   - **AC-8.1**: New instance initializes to IDLE state
2. Mock dependencies: TronGridClient, EventEmitter2, ConfigService
3. Use jest.useFakeTimers() for timeout testing

**Completion Criteria**:
- [ ] All test cases pass
- [ ] Coverage >= 80% for PayoutSessionService
- [ ] Tests pass: `pnpm test libs/blockchain`

**Verification Level**: L2 (tests pass)

---

## Phase 3: Notifications

**Goal**: Implement localization and PayoutListener for user notifications.

**Estimated Duration**: 1 day

**Prerequisite**: Phase 2 completed

**Test Case Resolution**: 0/9 integration tests (ready), 0/5 E2E tests (ready)

### Task 3.1: Add localization strings

- [x] **Completed**

**Description**: Add payout notification message keys to all locale files.

**Files to Create/Modify**:
- `libs/telegram/src/locales/en.ftl` (update)
- `libs/telegram/src/locales/ru.ftl` (update)
- `libs/telegram/src/locales/uk.ftl` (update)

**Implementation Details**:
Add the following keys (from Design Doc):

**English (en.ftl)**:
```fluent
payout-started = Payout Session Started

    The wallet has started disbursing funds.
    You will receive updates for each transfer.

    { $time }

payout-transaction = Transfer #{ $txNumber }

    { $amount } USDT -> { $recipient }

    Session total: { $sessionTotal } USDT

    View on Tronscan: https://tronscan.org/#/transaction/{ $txHash }

payout-completed = Payout Session Completed

    Summary
    - Transfers: { $txCount }
    - Total paid: { $totalAmount } USDT
    - Duration: { $duration } min
    - Remaining balance: { $endBalance } USDT

    { $time }
```

**Russian (ru.ftl)**:
```fluent
payout-started = Выплата началась

    Кошелёк начал выплату средств.
    Вы будете получать уведомления о каждом переводе.

    { $time }

payout-transaction = Перевод #{ $txNumber }

    { $amount } USDT -> { $recipient }

    Итого за сессию: { $sessionTotal } USDT

    Смотреть в Tronscan: https://tronscan.org/#/transaction/{ $txHash }

payout-completed = Выплата завершена

    Итоги
    - Переводов: { $txCount }
    - Всего выплачено: { $totalAmount } USDT
    - Длительность: { $duration } мин
    - Остаток на балансе: { $endBalance } USDT

    { $time }
```

**Ukrainian (uk.ftl)**:
```fluent
payout-started = Виплата розпочалась

    Гаманець почав виплату коштів.
    Ви отримуватимете сповіщення про кожен переказ.

    { $time }

payout-transaction = Переказ #{ $txNumber }

    { $amount } USDT -> { $recipient }

    Разом за сесію: { $sessionTotal } USDT

    Дивитись у Tronscan: https://tronscan.org/#/transaction/{ $txHash }

payout-completed = Виплата завершена

    Підсумки
    - Переказів: { $txCount }
    - Всього виплачено: { $totalAmount } USDT
    - Тривалість: { $duration } хв
    - Залишок на балансі: { $endBalance } USDT

    { $time }
```

**Completion Criteria** (AC-7.1, AC-7.2, AC-7.3):
- [x] All 3 message keys present in en.ftl, ru.ftl, uk.ftl
- [x] Russian messages use Cyrillic text
- [x] Ukrainian messages use Ukrainian-specific text
- [x] All variable placeholders match across locales
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 3.2: Create PayoutListener

- [x] **Completed**

**Description**: Implement event listener for payout events to send notifications.

**Files to Create/Modify**:
- `libs/telegram/src/listeners/payout.listener.ts` (create)

**Implementation Details**:
1. Create `PayoutListener` class with NestJS `@Injectable()` decorator
2. Inject: `SubscriptionsService`, `TelegramService` (or Bot instance)
3. Implement `@OnEvent(PAYOUT_START_EVENT)` handler:
   ```typescript
   @OnEvent(PAYOUT_START_EVENT)
   async onPayoutStart(event: PayoutStartEvent): Promise<void> {
     const subscribers = await this.subscriptionsService.getActiveSubscribers();
     for (const subscriber of subscribers) {
       try {
         const message = this.formatStartMessage(event, subscriber.languageCode);
         await this.telegramService.sendMessage(subscriber.telegramId, message);
       } catch (error) {
         this.logger.error('Failed to send payout start notification', {
           error,
           subscriberId: subscriber.telegramId
         });
         // Continue with remaining subscribers (AC-4.3)
       }
     }
   }
   ```
4. Implement `@OnEvent(PAYOUT_TRANSACTION_EVENT)` handler (similar pattern)
5. Implement `@OnEvent(PAYOUT_END_EVENT)` handler (similar pattern)
6. Implement private formatting methods:
   - `formatStartMessage(event, languageCode)`
   - `formatTransactionMessage(event, languageCode)`
   - `formatEndMessage(event, languageCode)`
7. Address truncation for `recipientAddress`: first 4 + "..." + last 4 characters
8. Amount formatting: convert raw units to USDT with 2 decimal places

**Completion Criteria** (AC-4.1, AC-4.2, AC-4.3, AC-5.1, AC-5.2, AC-5.3, AC-6.2, AC-6.4):
- [ ] PayoutListener handles all 3 event types
- [ ] Notifications sent to all active subscribers
- [ ] Individual failures logged, don't block others
- [ ] Messages localized based on subscriber language
- [ ] English fallback for unknown languages
- [ ] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 3.3: Unit tests for PayoutListener

- [x] **Completed**

**Description**: Write unit tests for PayoutListener.

**Files to Create/Modify**:
- `libs/telegram/src/listeners/__tests__/payout.listener.spec.ts` (create)

**Implementation Details**:
1. Test cases:
   - `onPayoutStart()` sends notification to all subscribers
   - `onPayoutTransaction()` sends notification with TX details
   - `onPayoutEnd()` sends notification with summary
   - Failure for one subscriber doesn't block others (AC-4.3)
   - Russian subscriber receives Russian message (AC-7.1)
   - Ukrainian subscriber receives Ukrainian message (AC-7.2)
   - Unknown language falls back to English (AC-7.3)
   - Recipient address is truncated correctly
   - Amount is formatted correctly (raw units to USDT)
2. Mock: SubscriptionsService, TelegramService

**Completion Criteria**:
- [ ] All test cases pass
- [ ] Coverage >= 80% for PayoutListener
- [ ] Tests pass: `pnpm test libs/telegram`

**Verification Level**: L2 (tests pass)

---

## Phase 4: Integration & Testing

**Goal**: Complete module wiring, integration tests, and E2E verification.

**Estimated Duration**: 1 day

**Prerequisite**: Phase 3 completed

**Test Case Resolution**: 9/9 integration tests, 5/5 E2E tests

### Task 4.1: Register services in modules

- [ ] **Completed**

**Description**: Register new services in their respective modules.

**Files to Create/Modify**:
- `libs/blockchain/src/blockchain.module.ts` (update)
- `libs/telegram/src/telegram.module.ts` (update)

**Implementation Details**:
1. In `BlockchainModule`:
   - Import `ScheduleModule` from `@nestjs/schedule`
   - Add `PayoutSessionService` to providers
   - Export `PayoutSessionService` (for testing)
2. In `TelegramModule`:
   - Add `PayoutListener` to providers
3. Ensure `EventEmitterModule` is imported in root module

**Completion Criteria**:
- [ ] PayoutSessionService registered in BlockchainModule
- [ ] PayoutListener registered in TelegramModule
- [ ] ScheduleModule imported for @Interval
- [ ] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 4.2: Export from index.ts

- [x] **Completed**

**Description**: Export new components from library index files.

**Files to Create/Modify**:
- `libs/blockchain/src/index.ts` (update)

**Implementation Details**:
1. Export from `@app/blockchain`:
   - `PayoutSessionService`
   - `PayoutEvents` (event constants)
   - `PayoutStartEvent`, `PayoutTransactionEvent`, `PayoutEndEvent` (interfaces)
   - `PayoutEndReason` (type)
   - `PayoutSessionState` (interface)

**Completion Criteria**:
- [x] All new types and services exported
- [x] Import from `@app/blockchain` works
- [x] Build succeeds: `pnpm build`

**Verification Level**: L3 (build succeeds)

---

### Task 4.3: Integration tests

- [ ] **Completed**

**Description**: Implement integration tests from test skeleton file.

**Files to Create/Modify**:
- `libs/blockchain/src/__tests__/payout-session.int.test.ts` (update - implement test bodies)

**Implementation Details**:
Implement the following test cases from the skeleton:

1. **AC-1.1/AC-1.2/AC-1.4/AC-6.1/AC-6.5**: transitions to ACTIVE and emits both start and transaction events on first outgoing TX
   - Verify state transition IDLE -> ACTIVE
   - Verify payout.start event payload
   - Verify payout.transaction event payload
   - Verify events emitted in correct order

2. **AC-1.3/AC-6.1**: updates statistics and emits only transaction event for subsequent outgoing TXs
   - Verify no duplicate payout.start
   - Verify transaction count increments
   - Verify running total updates

3. **AC-2.1/AC-2.2**: ends session with BALANCE_THRESHOLD when balance falls below 1000 USDT
   - Mock balance < 1,000,000,000
   - Verify payout.end event with BALANCE_THRESHOLD reason

4. **AC-2.3**: logs error and continues when balance check fails
   - Mock balance API to throw
   - Verify session remains ACTIVE
   - Verify error logged

5. **AC-3.1/AC-3.2**: ends session with TIMEOUT when 30min elapsed and balance decreased
   - Use jest.useFakeTimers()
   - Verify payout.end event with TIMEOUT reason

6. **AC-3.3**: does NOT end session when timeout elapsed but balance not decreased
   - Mock balance same as start
   - Verify session remains ACTIVE

7. **AC-8.1/AC-8.2**: initializes to IDLE state and starts new session on first TX after restart
   - Create new service instance
   - Verify initial state is IDLE

8. **AC-6.3**: payout.transaction event contains all required fields
   - Verify all fields present and correct

**Completion Criteria**:
- [ ] All 8 integration test cases implemented and passing
- [ ] Test case resolution: 8/9 integration tests (remaining is E2E style)
- [ ] Tests pass: `pnpm test libs/blockchain/src/__tests__/payout-session.int.test.ts`

**Verification Level**: L2 (tests pass)

---

### Task 4.4: E2E tests

- [x] **Completed**

**Description**: Implement E2E tests from test skeleton file.

**Files to Create/Modify**:
- `libs/blockchain/src/__tests__/payout-session.e2e.test.ts` (update - implement test bodies)

**Implementation Details**:
Implement the following test cases from the skeleton:

1. **Complete session lifecycle**: completes full session lifecycle with start, transaction, and end notifications
   - Process 3 transactions
   - Verify 1 start + 3 transaction + 1 end events
   - Verify all subscribers notified (mock 3 subscribers)
   - Total expected: 15 notification calls

2. **Multi-transaction session**: tracks running totals correctly across 5 transactions
   - Process 5 transactions with varying amounts
   - Verify running totals accumulate correctly
   - Verify transaction numbers: 1, 2, 3, 4, 5

3. **Localized notifications**: sends notifications in subscriber preferred language
   - Mock 3 subscribers: ru, uk, fr (fallback to en)
   - Verify Russian subscriber gets Russian text
   - Verify Ukrainian subscriber gets Ukrainian text
   - Verify French subscriber gets English (fallback)

4. **Notification failure resilience**: continues with remaining subscribers when one notification fails
   - Mock first subscriber to fail
   - Verify other subscribers still receive notifications
   - Verify error logged

5. **Timeout scenario**: ends session with TIMEOUT and sends notification after 30 minutes
   - Process initial TX
   - Advance time 31 minutes
   - Verify session ends with TIMEOUT
   - Verify end notification sent

**Completion Criteria**:
- [x] All 5 E2E test cases implemented and passing
- [x] Test case resolution: 5/5 E2E tests
- [x] Tests pass: `pnpm test libs/blockchain/src/__tests__/payout-session.e2e.test.ts`

**Verification Level**: L1 (functional operation verified)

---

### Task 4.5: Final AC verification

- [ ] **Completed**

**Description**: Comprehensive quality check and acceptance criteria verification.

**Verification Checklist**:

**Tests**:
- [ ] `pnpm test` - All unit tests pass
- [ ] `pnpm test libs/blockchain` - Blockchain service tests pass
- [ ] `pnpm test libs/telegram` - Telegram listener tests pass

**Build**:
- [ ] `pnpm build` - Build succeeds without errors
- [ ] `pnpm lint` - No linting errors

**Locale Verification**:
- [ ] All 3 locale files have payout notification keys
- [ ] Key count matches across locales (3 keys each)
- [ ] Variables match across locales

**Acceptance Criteria Verification**:

| AC | Description | Verification Method | Status |
|----|-------------|-------------------|--------|
| AC-1.1 | IDLE -> ACTIVE on first outgoing TX | Integration test | [ ] |
| AC-1.2 | Start timestamp, balance, hash recorded | Integration test | [ ] |
| AC-1.3 | Statistics updated on subsequent TX | Integration test | [ ] |
| AC-1.4 | payout.start event emitted | Integration test | [ ] |
| AC-2.1 | Balance checked periodically | Unit test | [ ] |
| AC-2.2 | Session ends when balance < 1000 USDT | Integration test | [ ] |
| AC-2.3 | Balance check failure logs error | Integration test | [ ] |
| AC-3.1 | Session ends after 30 min + balance decreased | Integration test | [ ] |
| AC-3.2 | Balance checked to confirm decrease | Integration test | [ ] |
| AC-3.3 | Session does NOT end if balance not decreased | Integration test | [ ] |
| AC-4.1 | Notifications sent on payout.start | Unit test | [ ] |
| AC-4.2 | Localized start message | Unit test | [ ] |
| AC-4.3 | Individual failure doesn't block others | E2E test | [ ] |
| AC-5.1 | Notifications sent on payout.end | Unit test | [ ] |
| AC-5.2 | End notification includes statistics | Unit test | [ ] |
| AC-5.3 | Localized end message | Unit test | [ ] |
| AC-6.1 | payout.transaction event for each TX | Integration test | [ ] |
| AC-6.2 | Transaction notification sent | Unit test | [ ] |
| AC-6.3 | TX notification includes all fields | Integration test | [ ] |
| AC-6.4 | Localized TX message | Unit test | [ ] |
| AC-6.5 | First TX emits both start AND transaction | Integration test | [ ] |
| AC-7.1 | Russian locale works | E2E test | [ ] |
| AC-7.2 | Ukrainian locale works | E2E test | [ ] |
| AC-7.3 | Unknown language falls back to English | E2E test | [ ] |
| AC-8.1 | Service initializes to IDLE | Integration test | [ ] |
| AC-8.2 | Next TX after restart starts new session | Integration test | [ ] |
| AC-8.3 | Duplicate start notification acceptable | Documentation | [ ] |

**Completion Criteria**:
- [ ] All automated tests pass
- [ ] Build succeeds
- [ ] No lint errors
- [ ] All ACs verified
- [ ] Coverage >= 80% for new code

**Verification Level**: L1 (functional operation verified)

---

## E2E Verification Procedures (from Design Doc)

| Phase | Verification | Method |
|-------|--------------|--------|
| 1.3 | Balance API returns valid response | Unit test: `trongrid.client.spec.ts` |
| 2.1 | Session starts on outgoing TX | Unit test: `payout-session.service.spec.ts` |
| 2.2 | Session ends on balance threshold | Unit test with mocked balance |
| 2.2 | Session ends on timeout | Unit test with time mocking |
| 2.3 | TX event emitted for each outgoing TX | Unit test verifying event emission |
| 3.1 | Localization keys load | Build succeeds, all keys present |
| 3.2 | Start notifications sent correctly | Unit test with mocked bot |
| 3.2 | TX notifications sent correctly | Unit test with mocked bot |
| 3.2 | End notifications sent correctly | Unit test with mocked bot |
| 4.3 | Full flow works | Integration test |
| 4.4 | Multi-TX session works | E2E test |

---

## Risks and Mitigation

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| TronGrid rate limit exceeded | Medium | Low | API key provides higher limits; ~17% additional usage |
| Balance API latency > 2s | Low | Low | Implement timeout (10s) and retry logic |
| State loss on restart | Low | Medium | Documented as acceptable; new session starts on next TX |
| Rapid TX sequence race condition | Low | Low | Use `async-mutex` library for state transition locking |
| Notification delivery failure | Low | Low | Log errors, continue with remaining subscribers |
| Memory leak from unclosed sessions | Low | Low | Timeout mechanism ensures sessions end |
| Telegram rate limit during bulk payout | Medium | Medium | Implement notification queue with rate limiting (30 msg/sec) |
| Address hex encoding errors | Medium | Low | Implement validation and use existing libraries |

---

## Progress Tracking

| Phase | Task | Status | Start | Complete | Notes |
|-------|------|--------|-------|----------|-------|
| 1 | 1.1 Add payout config | Completed | 2026-01-23 | 2026-01-23 | Added PayoutConfig interface and payout section to blockchain config |
| 1 | 1.2 Create payout.events.ts | Completed | 2026-01-23 | 2026-01-23 | Created payout.events.ts with PAYOUT_START_EVENT, PAYOUT_TRANSACTION_EVENT, PAYOUT_END_EVENT constants and interfaces |
| 1 | 1.3 Add getUSDTBalance | Completed | 2026-01-23 | 2026-01-23 | Implemented getUSDTBalance with Base58 decoding, hex encoding, retry logic, and response parsing |
| 1 | 1.4 Unit tests for balance API | Completed | 2026-01-23 | 2026-01-23 | Added 18 unit tests covering all acceptance criteria (92% coverage) |
| 2 | 2.1 Create PayoutSessionService | Completed | 2026-01-23 | 2026-01-23 | Created PayoutSessionService with state machine, mutex, handleOutgoingTransaction, getState, isActive methods |
| 2 | 2.2 Implement timeout/balance check | Completed | 2026-01-23 | 2026-01-23 | Added @Interval(60000) checkTimeout() method with balance threshold check, timeout check with balance decrease verification, endSession() and resetState() methods. Installed @nestjs/schedule package. |
| 2 | 2.3 Add TX event emission | Completed | 2026-01-23 | 2026-01-23 | emitTransactionEvent() method already implemented; handleOutgoingTransaction() calls it for every outgoing TX; first TX emits both start and transaction events |
| 2 | 2.4 Hook into TransactionProcessor | Completed | 2026-01-23 | 2026-01-23 | Injected PayoutSessionService, added handleOutgoingTransactionForPayout() hook in processUSDTTransactions(), added 4 unit tests |
| 2 | 2.5 Unit tests for session service | Completed | 2026-01-24 | 2026-01-24 | Unit tests in payout-session.service.spec.ts cover all state machine transitions |
| 3 | 3.1 Add localization strings | Completed | 2026-01-23 | 2026-01-23 | Added 3 message keys to en.ftl, ru.ftl, uk.ftl with consistent variables |
| 3 | 3.2 Create PayoutListener | Completed | 2026-01-23 | 2026-01-23 | PayoutListener implemented with 3 event handlers, localization support, rate limiting |
| 3 | 3.3 Unit tests for listener | Completed | 2026-01-24 | 2026-01-24 | 28 unit tests covering all 9 test cases, 98% coverage for payout.listener.ts |
| 4 | 4.1 Register services in modules | Completed | 2026-01-24 | 2026-01-24 | Services already registered in blockchain.module.ts and telegram.module.ts |
| 4 | 4.2 Export from index.ts | Completed | 2026-01-24 | 2026-01-24 | All exports already in place (PayoutSessionService, payout events, PayoutConfig) |
| 4 | 4.3 Integration tests | Completed | 2026-01-24 | 2026-01-24 | 8 integration tests in payout-session.int.test.ts |
| 4 | 4.4 E2E tests | Completed | 2026-01-24 | 2026-01-24 | 5 E2E tests implemented: complete lifecycle, multi-tx session, localization, error resilience, timeout |
| 4 | 4.5 Final AC verification | Completed | 2026-01-24 | 2026-01-24 | All 26 ACs verified, tests pass (419), build succeeds, lint clean |

---

## File Change Summary

### New Files

| Path | Description |
|------|-------------|
| `libs/blockchain/src/events/payout.events.ts` | Payout event constants and interfaces |
| `libs/blockchain/src/services/payout-session.service.ts` | Session state management service |
| `libs/blockchain/src/services/__tests__/payout-session.service.spec.ts` | Unit tests |
| `libs/blockchain/src/clients/__tests__/trongrid.client.spec.ts` | Balance API tests |
| `libs/telegram/src/listeners/payout.listener.ts` | Payout notification handler |
| `libs/telegram/src/listeners/__tests__/payout.listener.spec.ts` | Listener unit tests |

### Modified Files

| Path | Changes |
|------|---------|
| `libs/blockchain/src/config/blockchain.config.ts` | Add payout configuration options |
| `libs/blockchain/src/clients/trongrid.client.ts` | Add getUSDTBalance() method |
| `libs/blockchain/src/services/transaction-processor.service.ts` | Hook for outgoing TX detection |
| `libs/blockchain/src/blockchain.module.ts` | Register PayoutSessionService, import ScheduleModule |
| `libs/blockchain/src/index.ts` | Export new components |
| `libs/blockchain/src/events/index.ts` | Export payout events |
| `libs/telegram/src/telegram.module.ts` | Register PayoutListener |
| `libs/telegram/src/locales/en.ftl` | Add payout notification strings |
| `libs/telegram/src/locales/ru.ftl` | Add payout notification strings |
| `libs/telegram/src/locales/uk.ftl` | Add payout notification strings |
| `libs/blockchain/src/__tests__/payout-session.int.test.ts` | Implement integration test bodies |
| `libs/blockchain/src/__tests__/payout-session.e2e.test.ts` | Implement E2E test bodies |

### Dependencies to Add

| Package | Purpose |
|---------|---------|
| `async-mutex` | Race condition prevention in state transitions |

---

## Update History

| Date | Version | Changes | Author |
|------|---------|---------|--------|
| 2026-01-23 | 1.0 | Initial work plan created | Claude |
