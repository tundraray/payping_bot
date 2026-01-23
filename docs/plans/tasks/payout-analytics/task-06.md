# Task 2.1: Create RecipientWalletsService

**Status**: Not Started
**Assignee**: TBD
**Estimated Effort**: 1.5 hours
**Phase**: 2 - Core Analytics Logic
**Depends On**: Task 1.4 (migration applied)
**Blocks**: Task 2.2

## Overview

Implement NestJS service for recipient wallet CRUD operations with extended field support for salary tracking and employment status. This service provides the data access layer for managing recipient wallet entities.

## Context

RecipientWalletsService is the foundational data access service for the analytics feature. It provides methods to create, read, update, and query recipient wallet records, including specialized methods for salary tracking and employment status updates.

**Service Responsibilities**:
- Find wallet by address
- Upsert wallet records
- Update payment information (lastAmount, lastPaymentAt)
- Update classification
- Mark wallets as fired/rehired
- Manage monthsWithoutPayment counter

## Target Files

### Files to Create
- `libs/db/src/services/recipient-wallets.service.ts`

### Files to Modify
- `libs/db/src/db.module.ts` (register provider)
- `libs/db/src/index.ts` (export service)

## Implementation Details

### Step 1: Create RecipientWalletsService

Create `libs/db/src/services/recipient-wallets.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DrizzleDB } from '../drizzle';
import { recipientWallets, type RecipientWallet, type NewRecipientWallet } from '../schema';

export type Classification = 'UNKNOWN' | 'ONE_TIME' | 'EMPLOYEE' | 'FREELANCER' | 'FIRED';

export interface RecipientWalletInput {
  address: string;
  firstSeenAt: Date;
  lastPaymentAt: Date;
  totalPayments?: number;
  lastAmount?: string;
  hiredAt?: Date;
  classification?: Classification;
}

@Injectable()
export class RecipientWalletsService {
  constructor(private readonly db: DrizzleDB) {}

  /**
   * Find wallet by address
   * @param address - Wallet address
   * @returns Wallet record or null if not found
   */
  async findByAddress(address: string): Promise<RecipientWallet | null> {
    const [wallet] = await this.db
      .select()
      .from(recipientWallets)
      .where(eq(recipientWallets.address, address))
      .limit(1);

    return wallet ?? null;
  }

  /**
   * Upsert multiple wallets (batch operation)
   * @param wallets - Array of wallet inputs
   * @returns Created/updated wallet records
   */
  async upsertMany(wallets: RecipientWalletInput[]): Promise<RecipientWallet[]> {
    const results: RecipientWallet[] = [];

    for (const input of wallets) {
      const existing = await this.findByAddress(input.address);

      if (existing) {
        // Update existing wallet
        const [updated] = await this.db
          .update(recipientWallets)
          .set({
            lastPaymentAt: input.lastPaymentAt,
            totalPayments: input.totalPayments ?? existing.totalPayments,
            lastAmount: input.lastAmount ?? existing.lastAmount,
            updatedAt: new Date(),
          })
          .where(eq(recipientWallets.id, existing.id))
          .returning();

        results.push(updated);
      } else {
        // Insert new wallet
        const [created] = await this.db
          .insert(recipientWallets)
          .values({
            address: input.address,
            firstSeenAt: input.firstSeenAt,
            lastPaymentAt: input.lastPaymentAt,
            totalPayments: input.totalPayments ?? 1,
            lastAmount: input.lastAmount,
            classification: input.classification ?? 'UNKNOWN',
            hiredAt: input.hiredAt,
          })
          .returning();

        results.push(created);
      }
    }

    return results;
  }

  /**
   * Update last payment information
   * @param address - Wallet address
   * @param amount - Payment amount
   * @param paymentAt - Payment timestamp
   */
  async updateLastPayment(
    address: string,
    amount: string,
    paymentAt: Date,
  ): Promise<void> {
    await this.db
      .update(recipientWallets)
      .set({
        lastAmount: amount,
        lastPaymentAt: paymentAt,
        updatedAt: new Date(),
      })
      .where(eq(recipientWallets.address, address));
  }

  /**
   * Update wallet classification
   * @param address - Wallet address
   * @param classification - New classification
   */
  async updateClassification(
    address: string,
    classification: Classification,
  ): Promise<void> {
    await this.db
      .update(recipientWallets)
      .set({
        classification,
        updatedAt: new Date(),
      })
      .where(eq(recipientWallets.address, address));
  }

  /**
   * Mark wallet as fired (set firedAt timestamp)
   * @param address - Wallet address
   * @param firedAt - Termination date
   */
  async markAsFired(address: string, firedAt: Date): Promise<void> {
    await this.db
      .update(recipientWallets)
      .set({
        classification: 'FIRED',
        firedAt,
        updatedAt: new Date(),
      })
      .where(eq(recipientWallets.address, address));
  }

  /**
   * Increment months without payment counter (batch operation)
   * Used by fired detection algorithm
   * @param addresses - Array of wallet addresses
   */
  async incrementMonthsWithoutPayment(addresses: string[]): Promise<void> {
    if (addresses.length === 0) return;

    await this.db
      .update(recipientWallets)
      .set({
        monthsWithoutPayment: recipientWallets.monthsWithoutPayment + 1,
        updatedAt: new Date(),
      })
      .where(inArray(recipientWallets.address, addresses));
  }

  /**
   * Reset months without payment counter (wallet received payment)
   * @param address - Wallet address
   */
  async resetMonthsWithoutPayment(address: string): Promise<void> {
    await this.db
      .update(recipientWallets)
      .set({
        monthsWithoutPayment: 0,
        updatedAt: new Date(),
      })
      .where(eq(recipientWallets.address, address));
  }

  /**
   * Get all wallets
   * @returns All recipient wallet records
   */
  async getAll(): Promise<RecipientWallet[]> {
    return this.db.select().from(recipientWallets);
  }

  /**
   * Get wallets by classification
   * @param classification - Classification type
   * @returns Wallets with specified classification
   */
  async getByClassification(classification: Classification): Promise<RecipientWallet[]> {
    return this.db
      .select()
      .from(recipientWallets)
      .where(eq(recipientWallets.classification, classification));
  }
}
```

### Step 2: Register Service in DbModule

Update `libs/db/src/db.module.ts` to register the service:

```typescript
import { RecipientWalletsService } from './services/recipient-wallets.service';

@Module({
  providers: [
    // ... existing providers
    RecipientWalletsService,
  ],
  exports: [
    // ... existing exports
    RecipientWalletsService,
  ],
})
export class DbModule {}
```

### Step 3: Export Service from @app/db

Update `libs/db/src/index.ts` to export the service:

```typescript
export * from './services/recipient-wallets.service';
```

### Step 4: Verify Build

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [ ] RecipientWalletsService class created with `@Injectable()` decorator
- [ ] All methods implemented:
  - [ ] `findByAddress(address: string): Promise<RecipientWallet | null>`
  - [ ] `upsertMany(wallets: RecipientWalletInput[]): Promise<RecipientWallet[]>`
  - [ ] `updateLastPayment(address: string, amount: string, paymentAt: Date): Promise<void>`
  - [ ] `updateClassification(address: string, classification: Classification): Promise<void>`
  - [ ] `markAsFired(address: string, firedAt: Date): Promise<void>`
  - [ ] `incrementMonthsWithoutPayment(addresses: string[]): Promise<void>`
  - [ ] `resetMonthsWithoutPayment(address: string): Promise<void>`
  - [ ] `getAll(): Promise<RecipientWallet[]>`
  - [ ] `getByClassification(classification: Classification): Promise<RecipientWallet[]>`
- [ ] Service registered in DbModule providers array
- [ ] Service exported from DbModule exports array
- [ ] Service exported from `libs/db/src/index.ts`
- [ ] DrizzleDB injected via constructor
- [ ] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification command:
```bash
pnpm build
```

Expected output: Build completes with no errors.

## Related References

- **Design Doc**: docs/design/payout-analytics-design.md (RecipientWalletsService section)
- **Work Plan**: Task 2.1 in Phase 2
- **Acceptance Criteria**: AC-3.1, AC-9.1 (recipient wallet management)

## Notes

- Service follows NestJS injectable pattern used in existing services (TransactionsService, UsersService)
- DrizzleDB is the database connection injectable (already available in DbModule)
- The `upsertMany` method handles both insert and update logic based on wallet existence
- `incrementMonthsWithoutPayment` is a batch operation for efficiency (fired detection algorithm)
- All update operations include `updatedAt: new Date()` to maintain timestamp accuracy
- Type exports (Classification, RecipientWalletInput) enable type-safe usage by other services
