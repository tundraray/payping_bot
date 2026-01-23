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

NestJS application with **minimal HTTP server** (for health checks) and monorepo structure.

> **Why HTTP server?** The app is hosted on render.com which requires an open port for web services (free tier). The HTTP server only exposes a `/health` endpoint for health checks; the bot itself uses grammY long polling, not webhooks.

```
src/
├── main.ts              # Bootstrap with NestFactory.create(), listens on PORT
├── health.controller.ts # GET /health endpoint for render.com health checks
└── app.module.ts        # Root module importing all libs

libs/
├── blockchain/          # @app/blockchain - TronGrid API integration
│   └── src/
│       ├── blockchain.module.ts
│       ├── blockchain.service.ts
│       └── index.ts
├── db/                  # @app/db - PostgreSQL persistence
│   └── src/
│       ├── db.module.ts
│       ├── db.service.ts
│       └── index.ts
└── telegram/            # @app/telegram - grammY bot handlers
    └── src/
        ├── telegram.module.ts
        ├── telegram.service.ts
        └── index.ts
```

**Path aliases:** `@app/blockchain`, `@app/db`, `@app/telegram`

**Planned features (not yet implemented):**
- Telegram: grammY bot with long polling, Telegram Stars payments
- Blockchain: TronGrid polling (3-5s intervals), tx deduplication by hash
- DB: User subscriptions, payment history, tx tracking

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
