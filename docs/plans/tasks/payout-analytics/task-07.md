# Task 2.2: Create ClassificationService

**Status**: Not Started
**Assignee**: TBD
**Estimated Effort**: 2 hours
**Phase**: 2 - Core Analytics Logic
**Depends On**: Task 2.1 (RecipientWalletsService)
**Blocks**: Task 2.3

## Overview

Implement automatic classification logic service with salary change detection and employment status tracking. This service evaluates payment patterns to automatically classify recipients as EMPLOYEE, FREELANCER, ONE_TIME, or UNKNOWN, and detects salary changes for employees.

## Context

ClassificationService implements the core business logic defined in ADR-0003 v2.0:
- **Automatic classification** based on payment history and variance
- **Salary change detection** for EMPLOYEE recipients (>5% threshold)
- **Fired detection** batch job (2+ months without payment)
- **Rehired detection** when fired recipients receive new payments

**Classification Rules** (from ADR-0003):
1. First payment < 500 USDT → UNKNOWN
2. First payment >= 500 USDT → ONE_TIME
3. Regular payments + stable amounts (≤20% variance) → EMPLOYEE
4. Multiple payments + high variance (>20%) → FREELANCER
5. EMPLOYEE + 2 months no payment → FIRED
6. FIRED + new payment → EMPLOYEE (rehired)

## Target Files

### Files to Create
- `libs/db/src/services/classification.service.ts`

### Files to Modify
- `libs/db/src/db.module.ts` (register provider)
- `libs/db/src/index.ts` (export service)

## Implementation Details

### Step 1: Create ClassificationService

Create `libs/db/src/services/classification.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { RecipientWalletsService, Classification } from './recipient-wallets.service';
import { DrizzleDB } from '../drizzle';
import { salaryHistory } from '../schema';

export interface SalaryChangeResult {
  walletAddress: string;
  previousAmount: string;
  newAmount: string;
  changePercent: number;
  isIncrease: boolean;
}

export interface FiredWallet {
  walletAddress: string;
  lastPaymentMonth: string;
  monthsWithoutPayment: number;
}

interface PaymentInfo {
  amount: string;
  timestamp: Date;
}

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  constructor(
    private readonly recipientWalletsService: RecipientWalletsService,
    private readonly db: DrizzleDB,
  ) {}

  /**
   * Evaluate and determine classification based on payment patterns
   * @param walletAddress - Wallet address to classify
   * @param payments - Recent payment history (last 3 months)
   * @param newPayment - Current payment being processed
   * @returns Classification result
   */
  async evaluateClassification(
    walletAddress: string,
    payments: PaymentInfo[],
    newPayment: PaymentInfo,
  ): Promise<Classification> {
    const wallet = await this.recipientWalletsService.findByAddress(walletAddress);

    if (!wallet) {
      // New wallet - initial classification
      const amount = parseFloat(newPayment.amount);
      return amount < 500 ? 'UNKNOWN' : 'ONE_TIME';
    }

    // Handle rehire case
    if (wallet.classification === 'FIRED') {
      this.logger.log(`Rehire detected: ${walletAddress}`);
      return 'EMPLOYEE';
    }

    // Need at least 2 payments for pattern analysis
    if (payments.length < 2) {
      return wallet.classification;
    }

    // Calculate amount variance over recent payments
    const amounts = payments.map(p => parseFloat(p.amount));
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;

    // Calculate coefficient of variation (std dev / mean)
    const variance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / avgAmount;

    // Check if payments span multiple months
    const uniqueMonths = new Set(
      payments.map(p => `${p.timestamp.getFullYear()}-${String(p.timestamp.getMonth() + 1).padStart(2, '0')}`)
    );

    // Classification logic
    if (uniqueMonths.size >= 2 && coefficientOfVariation <= 0.20) {
      // Regular payments across months with stable amounts (≤20% variance) → EMPLOYEE
      return 'EMPLOYEE';
    } else if (uniqueMonths.size >= 2 && coefficientOfVariation > 0.20) {
      // Multiple months with high variance → FREELANCER
      return 'FREELANCER';
    } else if (uniqueMonths.size === 1 && payments.length >= 2) {
      // Multiple payments same month → ONE_TIME
      return 'ONE_TIME';
    }

    // Default to current classification
    return wallet.classification;
  }

  /**
   * Detect salary changes for EMPLOYEE recipients
   * @param walletAddress - Wallet address
   * @param newAmount - New payment amount
   * @returns Salary change details if detected, null otherwise
   */
  async detectSalaryChange(
    walletAddress: string,
    newAmount: string,
    transactionHash: string,
  ): Promise<SalaryChangeResult | null> {
    const wallet = await this.recipientWalletsService.findByAddress(walletAddress);

    // Only track salary changes for employees
    if (!wallet || wallet.classification !== 'EMPLOYEE' || !wallet.lastAmount) {
      return null;
    }

    const previousAmount = parseFloat(wallet.lastAmount);
    const currentAmount = parseFloat(newAmount);

    // Calculate percentage change
    const changePercent = Math.abs(currentAmount - previousAmount) / previousAmount * 100;

    // Only report changes > 5%
    if (changePercent <= 5) {
      return null;
    }

    // Record in salary_history
    await this.db.insert(salaryHistory).values({
      recipientWalletId: wallet.id,
      previousAmount: wallet.lastAmount,
      newAmount,
      changePercent: changePercent.toFixed(2),
      detectedAt: new Date(),
      transactionHash,
    });

    this.logger.log(
      `Salary change detected: ${walletAddress} ${currentAmount > previousAmount ? '+' : '-'}${changePercent.toFixed(1)}%`
    );

    return {
      walletAddress,
      previousAmount: wallet.lastAmount,
      newAmount,
      changePercent: Number(changePercent.toFixed(2)),
      isIncrease: currentAmount > previousAmount,
    };
  }

  /**
   * Batch job to check for employees without recent payments
   * Run this periodically (e.g., monthly) to detect terminated employees
   * @returns List of wallets marked as fired
   */
  async checkEmploymentStatus(): Promise<FiredWallet[]> {
    const employees = await this.recipientWalletsService.getByClassification('EMPLOYEE');
    const firedWallets: FiredWallet[] = [];

    const currentDate = new Date();

    for (const wallet of employees) {
      // Calculate months since last payment
      const lastPayment = new Date(wallet.lastPaymentAt);
      const monthsDiff =
        (currentDate.getFullYear() - lastPayment.getFullYear()) * 12 +
        (currentDate.getMonth() - lastPayment.getMonth());

      if (monthsDiff >= 2) {
        // Mark as fired
        await this.recipientWalletsService.markAsFired(wallet.address, currentDate);

        firedWallets.push({
          walletAddress: wallet.address,
          lastPaymentMonth: `${lastPayment.getFullYear()}-${String(lastPayment.getMonth() + 1).padStart(2, '0')}`,
          monthsWithoutPayment: monthsDiff,
        });

        this.logger.log(`Marked as fired: ${wallet.address} (${monthsDiff} months without payment)`);
      }
    }

    return firedWallets;
  }
}
```

### Step 2: Register Service in DbModule

Update `libs/db/src/db.module.ts`:

```typescript
import { ClassificationService } from './services/classification.service';

@Module({
  providers: [
    // ... existing providers
    RecipientWalletsService,
    ClassificationService,
  ],
  exports: [
    // ... existing exports
    RecipientWalletsService,
    ClassificationService,
  ],
})
export class DbModule {}
```

### Step 3: Export Service from @app/db

Update `libs/db/src/index.ts`:

```typescript
export * from './services/classification.service';
```

### Step 4: Verify Build

```bash
pnpm build
```

Expected: Build succeeds with no TypeScript errors.

## Acceptance Criteria

- [ ] ClassificationService class created with `@Injectable()` decorator
- [ ] `evaluateClassification()` correctly categorizes wallets:
  - [ ] First payment < 500 → UNKNOWN
  - [ ] First payment >= 500 → ONE_TIME
  - [ ] Regular payments + ≤20% variance → EMPLOYEE
  - [ ] Multiple payments + >20% variance → FREELANCER
  - [ ] FIRED + new payment → EMPLOYEE (rehire)
- [ ] `detectSalaryChange()` detects changes >5% for employees
- [ ] `detectSalaryChange()` records changes in salary_history table
- [ ] `checkEmploymentStatus()` identifies wallets with 2+ months without payment
- [ ] `checkEmploymentStatus()` marks wallets as FIRED
- [ ] Service registered in DbModule
- [ ] Service exported from @app/db
- [ ] Build succeeds: `pnpm build`

## Verification Level

**L3 (Build Success)**

Verification command:
```bash
pnpm build
```

Expected output: Build completes with no errors.

## Related References

- **Design Doc**: docs/design/payout-analytics-design.md (ClassificationService section, Classification Algorithm)
- **ADR**: docs/adr/003-payout-analytics-architecture.md (Classification Algorithm, Salary Tracking sections)
- **Work Plan**: Task 2.2 in Phase 2
- **Acceptance Criteria**: AC-4.1 through AC-4.6 (classification), AC-6.1 through AC-6.3 (salary tracking), AC-7.1 through AC-7.3 (fired/rehired)

## Notes

- Classification algorithm uses coefficient of variation (std dev / mean) for variance calculation
- 20% threshold matches ADR-0003 specification
- Salary change threshold is 5% to reduce false positives
- Fired detection is a batch operation (run monthly) - not real-time
- Rehire detection is real-time (happens when processing new transaction)
- Logger statements help monitor classification changes and salary adjustments
- The service depends on RecipientWalletsService for wallet CRUD operations
- Salary history records provide audit trail for compensation changes
