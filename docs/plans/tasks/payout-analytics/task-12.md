# Task 3.3: Add Type Definitions

**Status**: Completed
**Phase**: 3 - Telegram Integration
**Depends On**: Task 3.2
**Blocks**: Phase 4

## Overview

Add TypeScript types for analytics feature including AnalyticsResult, GroupedAnalytics, Classification, SalaryChangeResult, and callback action constants.

## Target Files

- `libs/telegram/src/types/telegram.types.ts` (update)

## Types to Add

```typescript
export interface AnalyticsResult {
  position: number;
  walletAddress: string;
  classification: Classification;
  amount: string;
  previousPosition: number | null;
  positionChange: 'up' | 'down' | 'same' | 'new';
}

export interface GroupedAnalyticsResult {
  employees: AnalyticsResult[];
  freelancers: AnalyticsResult[];
  oneTime: AnalyticsResult[];
  unknown: AnalyticsResult[];
  fired: FiredWallet[];
  month: string;
  previousMonth: string;
}

export interface FiredWallet {
  walletAddress: string;
  lastPaymentMonth: string;
  monthsWithoutPayment: number;
}

export type Classification = 'UNKNOWN' | 'ONE_TIME' | 'EMPLOYEE' | 'FREELANCER' | 'FIRED';

export interface SalaryChangeResult {
  previousAmount: string;
  newAmount: string;
  changePercent: number;
  confirmed: boolean;
}

export const CALLBACK_ACTIONS = {
  // ... existing
  ANALYTICS_PREV: 'analytics:prev',
  ANALYTICS_NEXT: 'analytics:next',
} as const;
```

## Acceptance Criteria

- [x] All types defined
- [x] Callback actions added
- [x] Build succeeds

**Verification**: L3 (build succeeds)

## References

- Work Plan: Task 3.3
- Design Doc: Contract Definitions
