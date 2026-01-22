# Task: Remove formatUsdtDisplay from Database Module

**Task ID**: i18n-task-08
**Phase**: Phase 3 - Service Updates
**Estimated Effort**: 30 minutes
**Verification Level**: L3 (Build Success Verification)

## Overview

Remove `formatUsdtDisplay()` function from the database module (`@app/db`), as display formatting belongs in the presentation layer (`@app/telegram`). Keep `formatUsdt()` and `toRawUsdt()` which are data conversion functions (not display).

## Context

The database module currently exports `formatUsdtDisplay()`, which violates separation of concerns. Task 01 created the same utility in the telegram module. Now we remove the database version to enforce proper architecture boundaries.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\db\src\utils\usdt.utils.ts`
- `D:\git\github\tg-bots\payping_bot\libs\db\src\utils\usdt.utils.spec.ts`
- `D:\git\github\tg-bots\payping_bot\libs\db\src\index.ts`

## Dependencies

**Depends On**:
- Task 01 (telegram format utils) - replacement utility exists
- Task 07 (TransactionsService raw return) - service no longer needs formatUsdtDisplay

**Blocks**:
- Task 09 (Update StartHandler) - forces import from telegram module
- Task 10 (Update TransactionListener) - forces import from telegram module

## Implementation Steps

### Step 1: Remove formatUsdtDisplay from usdt.utils.ts

Edit `libs/db/src/utils/usdt.utils.ts`:

**Before**:
```typescript
/**
 * USDT TRC20 token has 6 decimal places.
 */
const USDT_DECIMALS = 6;

export function formatUsdt(rawAmount: number): string {
  // Convert from smallest unit to human-readable
  const humanAmount = rawAmount / Math.pow(10, USDT_DECIMALS);
  return humanAmount.toFixed(2);
}

export function formatUsdtDisplay(
  rawAmount: string | number,
  decimals = 2,
): string {
  const amountNum = typeof rawAmount === 'string'
    ? Number.parseFloat(rawAmount)
    : rawAmount;

  if (Number.isNaN(amountNum) || !Number.isFinite(amountNum)) {
    return '0.00';
  }

  const humanAmount = amountNum / Math.pow(10, USDT_DECIMALS);
  return formatWithSeparators(humanAmount.toFixed(decimals));
}

function formatWithSeparators(value: string): string {
  const [integer, decimal] = value.split('.');
  const formattedInteger = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decimal ? `${formattedInteger}.${decimal}` : formattedInteger;
}

export function toRawUsdt(humanAmount: number): string {
  const raw = humanAmount * Math.pow(10, USDT_DECIMALS);
  return Math.floor(raw).toString();
}
```

**After** (remove formatUsdtDisplay and formatWithSeparators):
```typescript
/**
 * USDT TRC20 token has 6 decimal places.
 */
const USDT_DECIMALS = 6;

/**
 * Convert raw USDT amount to human-readable format (2 decimal places).
 * For data conversion, not display formatting.
 *
 * @param rawAmount - Amount in smallest unit
 * @returns Formatted string "1234.56" (no thousand separators)
 */
export function formatUsdt(rawAmount: number): string {
  // Convert from smallest unit to human-readable
  const humanAmount = rawAmount / Math.pow(10, USDT_DECIMALS);
  return humanAmount.toFixed(2);
}

/**
 * Convert human-readable USDT amount to raw format.
 *
 * @param humanAmount - Amount in USDT (e.g., 1.5)
 * @returns Raw amount string (e.g., "1500000")
 */
export function toRawUsdt(humanAmount: number): string {
  const raw = humanAmount * Math.pow(10, USDT_DECIMALS);
  return Math.floor(raw).toString();
}
```

### Step 2: Remove formatUsdtDisplay tests

Edit `libs/db/src/utils/usdt.utils.spec.ts`:

Remove all test cases for `formatUsdtDisplay` and `formatWithSeparators`.

**Keep only tests for**:
- `formatUsdt()`
- `toRawUsdt()`

### Step 3: Update module exports

Edit `libs/db/src/index.ts`:

**Before** (if it has wildcard export):
```typescript
export * from './utils/usdt.utils';
```

**After** (use named exports to control what's exported):
```typescript
export { formatUsdt, toRawUsdt } from './utils/usdt.utils';
```

Or if there are other exports in the file, ensure `formatUsdtDisplay` is NOT exported.

### Step 4: Verify no imports of formatUsdtDisplay from @app/db

Search codebase for old imports (should find none at this point):

```bash
grep -r "formatUsdtDisplay.*@app/db" libs/ src/
```

Expected: No results (Task 07 updated TransactionsService, Tasks 09/10 will import from telegram module)

### Step 5: Build verification

```bash
pnpm build
```

Should succeed without errors (no broken imports yet, as handlers not updated until Tasks 09/10).

### Step 6: Run tests

```bash
pnpm test libs/db/src/utils/usdt.utils.spec.ts
```

## Acceptance Criteria

- [x] `formatUsdtDisplay` NOT exported from `@app/db` (AC-4.2)
- [x] `formatUsdt` still exported (data conversion function)
- [x] `toRawUsdt` still exported (data conversion function)
- [x] Tests for formatUsdt and toRawUsdt still pass
- [x] Build succeeds
- [x] No imports of `formatUsdtDisplay` from `@app/db` in codebase
- [x] No lint errors

## Verification Steps

1. Verify `formatUsdtDisplay` removed from usdt.utils.ts
2. Verify `formatUsdt` and `toRawUsdt` still present
3. Verify module exports updated in index.ts
4. Run grep: `grep -r "formatUsdtDisplay.*@app/db" libs/ src/`
5. Run tests: `pnpm test libs/db/src/utils/usdt.utils.spec.ts`
6. Run build: `pnpm build`
7. Run lint: `pnpm lint`

## Remaining Functions in usdt.utils.ts

| Function | Purpose | Belongs in @app/db? | Keep? |
|----------|---------|-------------------|-------|
| formatUsdt | Data conversion (raw → formatted, no separators) | Yes (data layer) | ✅ Yes |
| toRawUsdt | Data conversion (human → raw) | Yes (data layer) | ✅ Yes |
| formatUsdtDisplay | Display formatting (separators) | No (presentation layer) | ❌ Remove |

## Module Boundary Enforcement

**@app/db** (Database Module):
- ✅ Data persistence (CRUD operations)
- ✅ Data conversion (raw ↔ human-readable, no display formatting)
- ❌ Display formatting (thousand separators, emojis, localization)

**@app/telegram** (Presentation Module):
- ✅ Display formatting (formatUsdtDisplay with separators)
- ✅ Localization (i18n utils)
- ✅ User interaction (handlers, listeners)
- ❌ Database access (uses @app/db services)

## Notes

- **Separation of concerns**: Database module now only handles data, not presentation
- **No breaking changes for callers**: Tasks 09/10 will update imports to telegram module
- **Data conversion vs display formatting**: formatUsdt is data conversion (no separators), formatUsdtDisplay is display formatting (with separators)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (Architecture Overview, AC-4.2)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 3.2)
- Task 01: Created formatUsdtDisplay in telegram module

## Completion Checklist

- [x] `formatUsdtDisplay` removed from usdt.utils.ts
- [x] `formatWithSeparators` helper removed (was internal to formatUsdtDisplay)
- [x] `formatUsdt` and `toRawUsdt` preserved
- [x] Related tests removed from usdt.utils.spec.ts
- [x] Module exports updated in index.ts (named exports)
- [x] Grep check passes (no @app/db imports of formatUsdtDisplay)
- [x] Tests pass
- [x] Build succeeds
- [x] No lint errors
