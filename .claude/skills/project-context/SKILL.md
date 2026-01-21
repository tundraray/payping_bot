# Project Context

## Project Overview

- **Problem being solved**: Manual checking of crypto wallet for incoming payments is tedious; users miss funds arrival or check obsessively
- **Target users**: Individuals tracking salary/payment receipts to a TRON wallet
- **Usage scenarios**:
  - Employee waiting for salary notification
  - Freelancer tracking client payments
  - Monitoring payment queue position before payday

## Core Product Functions

1. **Notifications** — instant Telegram alerts when funds arrive to monitored wallet
2. **Analytics** (tiered by subscription) — insights on payment patterns:
   - Sum for period (day/week/month)
   - Expense trend (increasing/decreasing month-over-month)
   - Salary growth tracking
   - Position in payment queue

## Development Structure

- **Development phase**: Prototype / MVP

## Business Constraints

1. **Real-time notification latency**: Notify within 5 seconds of TRON transaction confirmation
2. **Zero duplicate notifications**: Each tx hash triggers exactly one notification per user
3. **Subscription tier accuracy**: Features gated by subscription level; access updated immediately on payment/expiration
4. **Analytics data retention**: Store transaction history for analytics calculations

## Scope Boundaries

**In scope (MVP):**
- Single wallet monitoring per user
- Inbound USDT (TRC20) and TRX transactions
- Telegram Stars subscription with multiple tiers
- Instant Telegram notifications
- Basic analytics (sum, trends)

**Out of scope (for now):**
- Outbound transaction tracking
- Multi-wallet per user
- Trading/swap features
