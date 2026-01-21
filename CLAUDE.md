# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PayPing is a Telegram bot that monitors a specific TRON crypto wallet and notifies subscribed users when funds arrive. Subscriptions are sold via Telegram Stars (XTR) with 30-day billing periods.

**Core functionality:**
- Wallet monitoring: Track inbound USDT (TRC20) and TRX transactions on a single predefined wallet
- Subscription management: Handle Telegram Stars payments, track expiration dates
- User notifications: Send instant Telegram alerts when funds arrive

**Tech stack:** TypeScript, NestJS, grammY (Telegram bot framework), PostgreSQL, TronGrid API

## Commands

```bash
# Install dependencies
pnpm install

# Development
pnpm run start:dev      # Watch mode with hot reload
pnpm run start:debug    # Debug mode with --inspect-brk

# Build & Production
pnpm run build          # Compile TypeScript to dist/
pnpm run start:prod     # Run compiled code from dist/

# Testing
pnpm run test           # Run unit tests (*.spec.ts files in src/)
pnpm run test:watch     # Watch mode for tests
pnpm run test -- --testPathPattern="app.controller" # Run specific test file
pnpm run test:e2e       # Run e2e tests (test/*.e2e-spec.ts)
pnpm run test:cov       # Generate coverage report

# Code quality
pnpm run lint           # ESLint with auto-fix
pnpm run format         # Prettier formatting
```

## Architecture

This is a NestJS application structured with standard module/controller/service patterns:

- `src/main.ts` - Application bootstrap, creates NestJS app on port 3000 (or PORT env)
- `src/app.module.ts` - Root module that imports all feature modules
- Feature modules follow NestJS conventions: `*.module.ts`, `*.controller.ts`, `*.service.ts`
- Unit tests are co-located with source files as `*.spec.ts`
- E2E tests live in `test/` directory as `*.e2e-spec.ts`

**Planned architecture (not yet implemented):**
- Bot module: grammY-based Telegram bot handlers, webhook endpoint
- Subscription module: Telegram Stars payment processing, expiration tracking
- Wallet module: TronGrid polling service (3-5 second intervals), transaction deduplication by tx hash
- Notification module: Alert delivery to active subscribers

## Code Style

- ESLint with TypeScript support and Prettier integration
- Single quotes, trailing commas (`'singleQuote': true, 'trailingComma': 'all'`)
- TypeScript target: ES2023 with NodeNext modules
- `@typescript-eslint/no-explicit-any` is disabled
- `strictNullChecks` enabled, but `noImplicitAny` is off
