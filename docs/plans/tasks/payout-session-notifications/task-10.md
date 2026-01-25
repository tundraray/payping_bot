# Task: Add Localization Strings

**Task ID**: task-10
**Phase**: Phase 3 - Notifications
**Estimated Effort**: 1 hour
**Verification Level**: L3 (Build Success)

## Overview

Add payout notification message keys to all three locale files (en, ru, uk). Each file gets 3 new keys: payout-started, payout-transaction, payout-completed.

## Target Files

- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\locales\en.ftl`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\locales\ru.ftl`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\locales\uk.ftl`

## Dependencies

**Depends On**: None (can start after Phase 2)

**Blocks**: Task 11 (PayoutListener needs localization keys)

## Implementation

Copy the localization strings from work plan Task 3.1:
- English: payout-started, payout-transaction, payout-completed
- Russian: Same keys with Cyrillic text
- Ukrainian: Same keys with Ukrainian text

All variables: $time, $txNumber, $amount, $recipient, $sessionTotal, $txHash, $txCount, $totalAmount, $duration, $endBalance

## Acceptance Criteria

- [x] **AC-7.1**: All 3 keys in ru.ftl with Russian text
- [x] **AC-7.2**: All 3 keys in uk.ftl with Ukrainian text
- [x] **AC-7.3**: All 3 keys in en.ftl (fallback)
- [x] Variable placeholders match across locales
- [x] Build succeeds

## References

- Work Plan: Task 3.1 (includes full localization strings)
- Design Doc: Localization Strings section

## Completion Checklist

- [x] en.ftl updated with 3 keys
- [x] ru.ftl updated with 3 keys
- [x] uk.ftl updated with 3 keys
- [x] Variables consistent across locales
- [x] Build succeeds
