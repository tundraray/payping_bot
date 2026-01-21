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
pnpm run test           # Run unit tests (*.spec.ts files)
pnpm run test:watch     # Watch mode for tests
pnpm run test:cov       # Generate coverage report

# Code quality (Biome - linting + formatting)
pnpm run lint           # Biome check with auto-fix
pnpm run format         # Biome format only
pnpm run check          # Biome check without auto-fix
```

## Architecture

This is a NestJS **standalone application** (no HTTP server) for a Telegram bot:

- `src/main.ts` - Application bootstrap using `NestFactory.createApplicationContext()`
- `src/app.module.ts` - Root module that imports all feature modules
- Feature modules follow NestJS conventions: `*.module.ts`, `*.service.ts`
- Unit tests are co-located with source files as `*.spec.ts`

**Planned architecture (not yet implemented):**
- Bot module: grammY-based Telegram bot handlers (long polling)
- Subscription module: Telegram Stars payment processing, expiration tracking
- Wallet module: TronGrid polling service (3-5 second intervals), transaction deduplication by tx hash
- Notification module: Alert delivery to active subscribers

## Code Style

- **Biome** for linting and formatting (replaces ESLint + Prettier)
- Single quotes, trailing commas
- TypeScript target: ES2023 with NodeNext modules
- `strictNullChecks` enabled, but `noImplicitAny` is off

## Git Hooks (Lefthook)

- **pre-commit**: Biome check + tests (parallel)
- **commit-msg**: commitlint (conventional commits)
- **pre-push**: Build

Commit message format: `type(scope): description`
Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
