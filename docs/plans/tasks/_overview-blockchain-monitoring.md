# Overall Design Document: Blockchain Monitoring Implementation

Generation Date: 2026-01-22
Target Plan Document: blockchain-monitoring-work-plan.md

## Project Overview

### Purpose and Goals
Implement TRON blockchain monitoring for the PayPing Telegram bot to detect incoming USDT (TRC20) transactions on a monitored wallet and emit events for downstream notification services. This is a greenfield implementation with clear boundaries.

### Background and Context
- `BlockchainService` exists as an empty shell
- `BlockchainModule` has basic structure but no providers configured
- No existing blockchain monitoring, event emission, or configuration patterns in the codebase
- Core dependencies already installed: `@nestjs/config`, `@nestjs/event-emitter`, `axios`
- New dependency required: `lru-cache`

## Task Division Design

### Division Policy
**Horizontal Slice (Foundation-driven)** approach selected because:
- All components depend on configuration schema and type definitions (foundation first)
- Infrastructure layer (TronGridClient, DeduplicationService) can be developed in parallel after foundation
- Application layer depends on infrastructure
- Orchestration depends on application layer
- Clear layer-by-layer verification is effective

### Verifiability Level Distribution
| Phase | Verification Level | Rationale |
|-------|-------------------|-----------|
| Phase 1 (Foundation) | L3 - Build Success | Types and config have no runtime behavior to test functionally |
| Phase 2 (Infrastructure) | L2 - Test Operation | Unit/integration tests verify component behavior |
| Phase 3 (Application) | L2 - Test Operation | Event emission verified via test mocks |
| Phase 4 (Orchestration) | L2 - Test Operation | Polling behavior verified via integration tests |
| Phase 5 (Integration) | L1 - Functional Operation | Module wiring verified by application startup |
| Phase 6 (QA) | L1 - Functional Operation | E2E tests verify complete flow |

### Inter-task Relationship Map
```
Task 1-1: Install lru-cache dependency
  |
  v
Task 1-2: Foundation Types (contracts.ts, transaction.interface.ts, trongrid-response.interface.ts)
  |
  v
Task 1-3: Foundation Config (blockchain.config.ts)
  |
  +-----------------+-------------------+
  |                                     |
  v                                     v
Task 2-1: TronGrid Client          Task 2-2: Deduplication Service
  |                                     |
  +-----------------+-------------------+
                    |
                    v
            Task 3-1: Transaction Events
                    |
                    v
            Task 3-2: Transaction Processor
                    |
                    v
            Task 4-1: Transaction Poller
                    |
                    v
            Task 5-1: Integration Wiring
                    |
                    v
            Task 6-1: Quality Assurance (E2E)
```

### Interface Change Impact Analysis
| Existing Interface | New Interface | Conversion Required | Corresponding Task |
|-------------------|---------------|-------------------|-------------------|
| BlockchainService (empty) | BlockchainService (coordinator) | Complete rewrite | Task 5-1 |
| BlockchainModule (empty) | BlockchainModule (configured) | Complete rewrite | Task 5-1 |
| index.ts (minimal exports) | index.ts (all exports) | Additions only | Task 5-1 |

### Common Processing Points
- **Configuration Access**: All services use `ConfigService` with `blockchain` namespace
- **Error Handling**: Fail-fast for DB errors, retry with backoff for API errors
- **Logging**: Structured logging with context parameter
- **Transaction Interface**: Shared across TronGridClient, DeduplicationService, TransactionProcessorService

## Implementation Considerations

### Principles to Maintain Throughout
1. **TDD Approach**: Red-Green-Refactor cycle for all service implementations
2. **Fail-Fast for DB**: Database errors propagate immediately (no silent fallbacks)
3. **Retry for API**: TronGrid API errors trigger exponential backoff
4. **Single Responsibility**: Each service has one clear purpose
5. **Parameterized Dependencies**: All external services injected via constructor

### Risks and Countermeasures
- **Risk**: TronGrid API response format changes
  **Countermeasure**: Comprehensive response validation in TronGridClient, integration tests with mock server

- **Risk**: LRU cache memory pressure under high volume
  **Countermeasure**: Configurable max size (default 10000), bounded memory usage

- **Risk**: Database connection issues during deduplication
  **Countermeasure**: Fail-fast approach, connection pooling via DbService

### Impact Scope Management
- **Allowed change scope**: `libs/blockchain/src/` directory only
- **No-change areas**:
  - `libs/db/` (assumes DbService methods exist)
  - `libs/telegram/` (will consume events, but not modified in this work)
  - Build configuration
  - Existing test files

## Task Summary

| Task ID | Name | Files | Size | Verification |
|---------|------|-------|------|--------------|
| 1-1 | Install lru-cache | package.json | Small | L3 |
| 1-2 | Foundation Types | 3 files | Small | L3 |
| 1-3 | Foundation Config | 1 file | Small | L2 |
| 2-1 | TronGrid Client | 2 files | Medium | L2 |
| 2-2 | Deduplication Service | 2 files | Medium | L2 |
| 3-1 | Transaction Events | 1 file | Small | L3 |
| 3-2 | Transaction Processor | 2 files | Medium | L2 |
| 4-1 | Transaction Poller | 2 files | Medium | L2 |
| 5-1 | Integration Wiring | 3 files | Medium | L1 |
| 6-1 | Quality Assurance | 1 file | Medium | L1 |

## Acceptance Criteria Mapping

### AC Coverage by Task

| AC ID | Description | Task |
|-------|-------------|------|
| AC-2.2 | USDT contract filter | Task 1-2 |
| AC-5.2 | Event payload fields | Task 1-2 |
| AC-9.1, AC-9.2, AC-9.3 | Configuration | Task 1-3 |
| AC-2.1, AC-2.3, AC-2.4, AC-2.5 | TronGrid API | Task 2-1 |
| AC-7.1, AC-7.2 | Error handling/backoff | Task 2-1 |
| AC-4.1, AC-4.2, AC-4.3, AC-4.4 | Deduplication | Task 2-2 |
| AC-5.1 | Event constant | Task 3-1 |
| AC-3.1, AC-3.2, AC-5.1, AC-5.2, AC-5.3 | Processing/events | Task 3-2 |
| AC-1.1, AC-1.2, AC-1.3, AC-7.4 | Polling control | Task 4-1 |
| AC-8.1, AC-8.2, AC-8.3 | Graceful shutdown | Task 4-1 |
| AC-10.1, AC-10.2, AC-10.3, AC-10.4, AC-10.5 | Initial timestamp | Task 4-1 |
| AC-6.1, AC-6.2, AC-6.3 | Wallet configuration | Task 5-1 |
| All AC-x.x | Final verification | Task 6-1 |

## Test File Mapping

| Test File | Phase | Task | Test Count |
|-----------|-------|------|------------|
| blockchain.config.spec.ts | 1 | 1-3 | Unit tests |
| trongrid.client.int.test.ts | 2 | 2-1 | 3 integration |
| deduplication.int.test.ts | 2-3 | 2-2, 3-2 | 6 integration |
| transaction-poller.int.test.ts | 4 | 4-1 | 3 integration |
| blockchain-monitoring.e2e.test.ts | 6 | 6-1 | 2 E2E |
