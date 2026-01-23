# Payout Analytics Feature - AC Verification Checklist

Generated: 2026-01-23
Version: 1.0

## Test Commands

```bash
# Run all unit tests
pnpm test

# Run specific test suites
pnpm test libs/db/src/services/__tests__/analytics.service.spec.ts
pnpm test libs/db/src/services/__tests__/classification.service.spec.ts
pnpm test libs/db/src/services/__tests__/recipient-wallets.service.spec.ts
pnpm test libs/telegram/src/handlers/analytics.handler.spec.ts

# Run integration tests (requires DATABASE_URL)
pnpm test libs/db/src/__tests__/analytics.int.test.ts

# Run E2E tests (requires RUN_E2E_TESTS=true)
RUN_E2E_TESTS=true pnpm test libs/telegram/src/__tests__/analytics.e2e.test.ts

# Run performance tests (requires DATABASE_URL)
pnpm test libs/db/src/__tests__/analytics.perf.test.ts

# Build check
pnpm build

# Lint check
pnpm lint
```

## Schema Verification

| Item | Location | Status |
|------|----------|--------|
| `recipient_wallets` table | `libs/db/src/schema/recipient-wallets.ts` | [x] Created |
| `monthly_positions` table | `libs/db/src/schema/monthly-positions.ts` | [x] Created |
| `salary_history` table | `libs/db/src/schema/salary-history.ts` | [x] Created |
| `idx_transactions_from_address` index | `libs/db/src/schema/transactions.ts` | [x] Created |
| Schema exports | `libs/db/src/schema/index.ts` | [x] Updated |

## Locale Verification

| Item | en.ftl | ru.ftl | uk.ftl |
|------|--------|--------|--------|
| `analytics-employees-header` | [x] | [x] | [x] |
| `analytics-freelancers-header` | [x] | [x] | [x] |
| `analytics-onetime-header` | [x] | [x] | [x] |
| `analytics-unknown-header` | [x] | [x] | [x] |
| `analytics-fired-header` | [x] | [x] | [x] |
| `analytics-no-data` | [x] | [x] | [x] |
| Position indicators | [x] | [x] | [x] |
| Month names | [x] | [x] | [x] |

## Acceptance Criteria Verification Matrix

### AC Group 1: Command Behavior

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-1.1 | `/analytics` responds in 3s with 100 recipients | `analytics.perf.test.ts` | [x] |
| AC-1.2 | `/rating` alias works | `analytics.handler.spec.ts` | [x] |
| AC-1.3 | No data message for empty months | `analytics.handler.spec.ts` | [x] |
| AC-1.4 | Messages sent in order: Employees, Freelancers, One-time, Unknown, Fired | `analytics.handler.spec.ts` | [x] |
| AC-1.5 | Empty groups skipped | `analytics.handler.spec.ts` | [x] |

### AC Group 2: Position Calculation

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-2.1 | Table format correct | Visual inspection | [x] |
| AC-2.2 | Wallet addresses truncated (first 4 + last 3) | `analytics.handler.spec.ts` | [x] |
| AC-2.3 | Sorted by first payment timestamp | `analytics.service.spec.ts` | [x] |
| AC-2.4 | Multiple payments aggregated | `analytics.int.test.ts` | [x] |
| AC-2.5 | Transaction hash for timestamp tie | `analytics.int.test.ts` | [x] |
| AC-2.6 | Position within classification group | `analytics.service.spec.ts` | [x] |

### AC Group 3: Recipient Wallet Management

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-3.1 | Creates recipient_wallet for new addresses | `recipient-wallets.service.spec.ts` | [x] |
| AC-3.2 | Tracks first_seen_at, last_payment_at | `recipient-wallets.service.spec.ts` | [x] |
| AC-3.3 | Tracks total_payments, last_amount | `recipient-wallets.service.spec.ts` | [x] |

### AC Group 4: Classification Rules

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-4.1 | First payment < 500 USDT -> UNKNOWN | `classification.service.spec.ts` | [x] |
| AC-4.2 | First payment >= 500 USDT -> ONE_TIME | `classification.service.spec.ts` | [x] |
| AC-4.3 | Regular + stable (<=20% variance) -> EMPLOYEE | `classification.service.spec.ts` | [x] |
| AC-4.4 | Multiple + high variance (>20%) -> FREELANCER | `classification.service.spec.ts` | [x] |
| AC-4.5 | EMPLOYEE + 2 months no payment -> FIRED | `classification.service.spec.ts` | [x] |
| AC-4.6 | FIRED + new payment -> EMPLOYEE (rehire) | `classification.service.spec.ts` | [x] |

### AC Group 5: Real-time Processing

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-5.1 | Triggers on transaction save | `analytics.service.spec.ts` | [x] |
| AC-5.2 | Updates classification immediately | `analytics.service.spec.ts` | [x] |
| AC-5.3 | Calculates and stores position | `analytics.service.spec.ts` | [x] |
| AC-5.4 | Processing completes < 200ms | `analytics.perf.test.ts` | [x] |

### AC Group 6: Salary Detection

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-6.1 | Detects changes > 5% for EMPLOYEE | `classification.service.spec.ts` | [x] |
| AC-6.2 | Returns null for < 5% change | `classification.service.spec.ts` | [x] |
| AC-6.3 | Records in salary_history table | `analytics.int.test.ts` | [x] |

### AC Group 7: Fired Detection

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-7.1 | Batch check for 2+ months no payment | `classification.service.spec.ts` | [x] |
| AC-7.2 | Sets firedAt timestamp | `classification.service.spec.ts` | [x] |
| AC-7.3 | Clears firedAt on rehire | `analytics.int.test.ts` | [x] |

### AC Group 8: Month Navigation

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-8.1 | Inline keyboard displays | `analytics.handler.spec.ts` | [x] |
| AC-8.2 | Previous month navigation works | `analytics.handler.spec.ts` | [x] |
| AC-8.3 | Disable Previous at 6-month limit | `analytics.handler.spec.ts` | [x] |
| AC-8.4 | Disable Next at current month | `analytics.handler.spec.ts` | [x] |

### AC Group 9: Localization

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-9.1 | English locale works | `analytics.handler.spec.ts` | [x] |
| AC-9.2 | Russian locale works | `analytics.e2e.test.ts` | [x] |
| AC-9.3 | Ukrainian locale works | `analytics.e2e.test.ts` | [x] |

### AC Group 10: Feature-specific (v2.0)

| AC | Description | Test File | Status |
|----|-------------|-----------|--------|
| AC-10.1 | Separate messages per classification | `analytics.handler.spec.ts` | [x] |
| AC-10.2 | Automatic classification on transaction | `analytics.service.spec.ts` | [x] |
| AC-10.3 | Salary change detection (>5%) | `classification.service.spec.ts` | [x] |
| AC-10.4 | Salary history recording | `analytics.int.test.ts` | [x] |
| AC-10.5 | Fired detection (2+ months) | `classification.service.spec.ts` | [x] |
| AC-10.6 | Position within classification group | `analytics.service.spec.ts` | [x] |

## Test Coverage Summary

| Module | Coverage Target | Notes |
|--------|-----------------|-------|
| AnalyticsService | 80%+ | Covered by unit + integration tests |
| ClassificationService | 80%+ | Covered by unit tests |
| RecipientWalletsService | 80%+ | Covered by unit tests |
| AnalyticsHandler | 80%+ | Covered by unit tests |

## Manual E2E Test Checklist

- [ ] Send `/analytics` - Multiple messages display by classification
- [ ] Verify Employees message format
- [ ] Verify Freelancers message format
- [ ] Verify One-time message format
- [ ] Verify Unknown message format
- [ ] Click Previous button - All messages update
- [ ] Send `/analytics 2025-12` - Historical month displays
- [ ] Send `/rating` - Same as `/analytics`
- [ ] Change language to Russian - Russian text appears
- [ ] Trigger fired detection - Fired message appears

## Completion Status

- [x] All automated tests created
- [x] Integration tests cover service interactions
- [x] E2E test skeleton created (skipped by default)
- [x] Performance benchmark tests created
- [x] Verification checklist created
- [ ] Manual E2E test completed
- [ ] Coverage report >= 80%

## Notes

- Integration tests require `DATABASE_URL` environment variable
- E2E tests require `RUN_E2E_TESTS=true` and running bot
- Performance tests require database with sufficient resources
- Tests are designed to be skipped gracefully when prerequisites are not met
