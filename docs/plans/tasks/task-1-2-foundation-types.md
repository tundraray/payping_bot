# Task: Foundation Types (Contracts and Interfaces)

Metadata:
- Phase: 1 (Foundation)
- Dependencies: None
- Provides: Type definitions for all subsequent tasks
- Size: Small (3 files)

## Implementation Content
Create the core type definitions and constants that all subsequent components depend on:
1. USDT contract address constant
2. Domain transaction interfaces
3. TronGrid API response interfaces

These types are defined in the Design Doc "Contract Definitions" section (v1.2).

## Target Files
- [x] `libs/blockchain/src/constants/contracts.ts` (new)
- [x] `libs/blockchain/src/interfaces/transaction.interface.ts` (new)
- [x] `libs/blockchain/src/interfaces/trongrid-response.interface.ts` (new)

## Implementation Steps (TDD: Red-Green-Refactor)

### 1. Red Phase
No tests for type definitions - TypeScript compiler serves as the verification.

### 2. Green Phase

#### 2.1 Create constants directory and contracts.ts
```typescript
// libs/blockchain/src/constants/contracts.ts

/**
 * USDT TRC20 contract address on TRON mainnet
 * Used for filtering TronGrid API responses
 */
export const USDT_CONTRACT_ADDRESS = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
```

#### 2.2 Create interfaces directory and transaction.interface.ts
```typescript
// libs/blockchain/src/interfaces/transaction.interface.ts

export enum TransactionType {
  USDT = 'USDT',
}

export interface Transaction {
  hash: string;
  type: TransactionType;
  fromAddress: string;
  toAddress: string;
  amount: string; // String to preserve precision (6 decimals for USDT)
  timestamp: number; // Unix timestamp in milliseconds
  blockNumber: number;
  contractAddress: string; // USDT TRC20 contract address
  raw?: unknown; // Original API response for debugging
}

export interface TransactionNewEvent {
  transaction: Transaction;
  detectedAt: number;
}
```

#### 2.3 Create trongrid-response.interface.ts
```typescript
// libs/blockchain/src/interfaces/trongrid-response.interface.ts

export interface TronGridPaginatedResponse<T> {
  data: T[];
  success: boolean;
  meta: {
    at: number;
    page_size: number;
    fingerprint?: string;
  };
}

export interface TRC20TransactionResponse {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  value: string;
  token_info: {
    symbol: string;
    address: string;
    decimals: number;
    name: string;
  };
  type: string; // 'Transfer' or 'Approval'
}
```

### 3. Refactor Phase
- Ensure consistent naming conventions
- Add JSDoc comments for public interfaces
- Verify exports are clean

## Completion Criteria
- [x] All three files created with correct content
- [x] TypeScript compiles without errors
- [x] Operation verified: L3 (Build Success) - `pnpm run check` passes
- [x] Types match Design Doc "Contract Definitions" section exactly

## Related Acceptance Criteria
- AC-2.2: USDT contract address (TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t)
- AC-5.2: Event payload fields (transactionHash, type, fromAddress, toAddress, amount, timestamp, blockNumber, contractAddress)

## Notes
- Impact scope: New files only, no modifications to existing code
- Constraints: Type definitions must match Design Doc exactly
- These interfaces are used by: TronGridClient, DeduplicationService, TransactionProcessorService, TransactionPollerService
