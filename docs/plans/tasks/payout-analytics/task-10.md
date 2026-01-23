# Task 3.1: Add Localization Strings

**Status**: Completed
**Phase**: 3 - Telegram Integration
**Depends On**: Phase 2 completion
**Blocks**: Task 3.2

## Overview

Add analytics-related message keys to all locale files with support for separate classification messages, salary change notifications, and fired status notifications.

## Target Files

- `libs/telegram/src/locales/en.ftl` (update)
- `libs/telegram/src/locales/ru.ftl` (update)
- `libs/telegram/src/locales/uk.ftl` (update)

## Message Keys to Add

### Analytics Display
- `analytics-title`, `analytics-month`, `analytics-changes-from`
- `analytics-header-position`, `analytics-header-wallet`, `analytics-header-type`, `analytics-header-prev`, `analytics-header-change`
- `analytics-total`, `analytics-no-data`, `analytics-data-unavailable`
- `btn-prev-month`, `btn-next-month`

### Classification Groups
- `analytics-employees-header` = Employees ({$count})
- `analytics-freelancers-header` = Freelancers ({$count})
- `analytics-onetime-header` = One-time ({$count})
- `analytics-unknown-header` = Unknown ({$count})
- `analytics-fired-header` = Terminated this month ({$count})

### Classification Badges
- `classify-employee` [E]
- `classify-freelancer` [F]
- `classify-onetime` [O]
- `classify-unknown` [?]

### Position Change Indicators
- `position-up`, `position-down`, `position-same`, `position-new`

### Salary Change Notifications
- `salary-increase` = Salary increase detected: {$wallet} +{$percent}%
- `salary-decrease` = Salary decrease detected: {$wallet} -{$percent}%

### Fired Notifications
- `fired-notification` = Possible termination: {$wallet} (no payment for {$months} months)

## Acceptance Criteria

- [x] All message keys present in en.ftl, ru.ftl, uk.ftl
- [x] Separate classification group headers added
- [x] Salary/fired notification strings added
- [x] Month names localized (January/Yanvar'/Sichen')
- [x] Classification badges localized ([E]/[S]/[C] for ru)
- [x] Build succeeds

**Verification**: L3 (build succeeds)

## References

- Work Plan: Task 3.1
- AC: AC-6.1, AC-6.2, AC-6.3, AC-6.4
