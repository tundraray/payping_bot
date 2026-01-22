# Task: Update Locale Files (en/ru/uk)

**Task ID**: i18n-task-03
**Phase**: Phase 1 - Foundation
**Estimated Effort**: 2-3 hours
**Verification Level**: L3 (Build Success Verification)

## Overview

Update English and Russian locale files with user-friendly, celebratory messages for salary payment monitoring context. Create Ukrainian locale file with complete translations. Use consolidated message keys from Design Doc.

## Context

Current messages are generic ("New Transaction", "You have subscribed"). For a salary monitoring bot, messages should be celebratory and context-appropriate ("Payment Received!", "You'll get instant notifications when funds arrive"). This task implements the new message structure with full context in each message key.

## Target Files

### Files to Update
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\locales\en.ftl`
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\locales\ru.ftl`

### Files to Create
- `D:\git\github\tg-bots\payping_bot\libs\telegram\src\locales\uk.ftl`

## Dependencies

**Depends On**: None (can run in parallel with other Phase 1 tasks)

**Blocks**:
- Task 02 (i18n utils) - uses these locale files for testing
- Task 09 (Update StartHandler) - references new keys
- Task 10 (Update TransactionListener) - references new keys

## Implementation Steps

### Step 1: Update en.ftl

Replace contents of `libs/telegram/src/locales/en.ftl`:

```fluent
# Welcome message
welcome = 👋 Welcome to PayPing!

    I help you track salary payments to your company wallet.
    You'll get instant notifications when funds arrive.

# Analytics - with historical data
analytics-with-history = 📊 <b>Monthly Stats</b>
    ━━━━━━━━━━━━━━━
    • This month: { $currentAmount } USDT
    • Expected: { $expectedAmount } USDT
      (based on { $months }-month average)

# Analytics - no historical data yet
analytics-no-history = 📊 <b>Monthly Stats</b>
    ━━━━━━━━━━━━━━━
    • This month: { $currentAmount } USDT
    • Expected: N/A (not enough data yet)

# Transaction notification - full message with all details
notification = 🎉 <b>Payment Received!</b>

    💵 { $amount } USDT

    📍 From: <code>{ $address }</code>
    🕐 Time: { $time }
    🔗 Tx: <code>{ $hash }</code>

# Subscription actions
subscribe-success = ✅ Subscribed! You'll now receive payment notifications.
subscribe-already = ℹ️ You're already subscribed.
unsubscribe-success = Unsubscribed. You won't receive notifications anymore.
unsubscribe-not-subscribed = You're not currently subscribed.

# Status indicators
status-subscribed = ✅ Subscribed
status-not-subscribed = 🔔 Not subscribed

# Buttons
btn-subscribe = Subscribe
btn-unsubscribe = Unsubscribe

# Errors
error-generic = ⚠️ Something went wrong. Please try again.
error-rate-limit = ⏳ Too many requests. Please wait a moment.
```

### Step 2: Update ru.ftl

Replace contents of `libs/telegram/src/locales/ru.ftl`:

```fluent
# Приветствие
welcome = 👋 Добро пожаловать в PayPing!

    Я помогаю отслеживать поступления зарплаты на корпоративный кошелёк.
    Вы получите мгновенные уведомления о поступлении средств.

# Аналитика - с историей
analytics-with-history = 📊 <b>Статистика за месяц</b>
    ━━━━━━━━━━━━━━━
    • В этом месяце: { $currentAmount } USDT
    • Ожидается: { $expectedAmount } USDT
      (на основе среднего за { $months } мес.)

# Аналитика - без истории
analytics-no-history = 📊 <b>Статистика за месяц</b>
    ━━━━━━━━━━━━━━━
    • В этом месяце: { $currentAmount } USDT
    • Ожидается: Н/Д (пока недостаточно данных)

# Уведомление о транзакции
notification = 🎉 <b>Платёж получен!</b>

    💵 { $amount } USDT

    📍 От: <code>{ $address }</code>
    🕐 Время: { $time }
    🔗 Tx: <code>{ $hash }</code>

# Действия подписки
subscribe-success = ✅ Вы подписались! Теперь вы будете получать уведомления о платежах.
subscribe-already = ℹ️ Вы уже подписаны.
unsubscribe-success = Подписка отменена. Вы больше не будете получать уведомления.
unsubscribe-not-subscribed = Вы сейчас не подписаны.

# Статусы
status-subscribed = ✅ Подписка активна
status-not-subscribed = 🔔 Не подписаны

# Кнопки
btn-subscribe = Подписаться
btn-unsubscribe = Отписаться

# Ошибки
error-generic = ⚠️ Что-то пошло не так. Попробуйте ещё раз.
error-rate-limit = ⏳ Слишком много запросов. Подождите немного.
```

### Step 3: Create uk.ftl

Create new file `libs/telegram/src/locales/uk.ftl`:

```fluent
# Привітання
welcome = 👋 Ласкаво просимо до PayPing!

    Я допомагаю відстежувати надходження зарплати на корпоративний гаманець.
    Ви отримаєте миттєві сповіщення про надходження коштів.

# Аналітика - з історією
analytics-with-history = 📊 <b>Статистика за місяць</b>
    ━━━━━━━━━━━━━━━
    • Цього місяця: { $currentAmount } USDT
    • Очікується: { $expectedAmount } USDT
      (на основі середнього за { $months } міс.)

# Аналітика - без історії
analytics-no-history = 📊 <b>Статистика за місяць</b>
    ━━━━━━━━━━━━━━━
    • Цього місяця: { $currentAmount } USDT
    • Очікується: Н/Д (поки недостатньо даних)

# Сповіщення про транзакцію
notification = 🎉 <b>Платіж отримано!</b>

    💵 { $amount } USDT

    📍 Від: <code>{ $address }</code>
    🕐 Час: { $time }
    🔗 Tx: <code>{ $hash }</code>

# Дії підписки
subscribe-success = ✅ Ви підписались! Тепер ви отримуватимете сповіщення про платежі.
subscribe-already = ℹ️ Ви вже підписані.
unsubscribe-success = Підписку скасовано. Ви більше не отримуватимете сповіщень.
unsubscribe-not-subscribed = Ви зараз не підписані.

# Статуси
status-subscribed = ✅ Підписка активна
status-not-subscribed = 🔔 Не підписані

# Кнопки
btn-subscribe = Підписатись
btn-unsubscribe = Відписатись

# Помилки
error-generic = ⚠️ Щось пішло не так. Спробуйте ще раз.
error-rate-limit = ⏳ Забагато запитів. Зачекайте трохи.
```

### Step 4: Verify key count matches

Count message keys in each file:

```bash
# Should all return same count (16 keys)
grep -c "^[a-z]" libs/telegram/src/locales/en.ftl
grep -c "^[a-z]" libs/telegram/src/locales/ru.ftl
grep -c "^[a-z]" libs/telegram/src/locales/uk.ftl
```

### Step 5: Build verification

```bash
pnpm build
```

Bot should start without Fluent parsing errors in logs.

## Acceptance Criteria

- [x] All message keys present in all 3 locale files (AC-3.2)
  - `welcome`
  - `analytics-with-history`
  - `analytics-no-history`
  - `notification`
  - `subscribe-success`
  - `subscribe-already`
  - `unsubscribe-success`
  - `unsubscribe-not-subscribed`
  - `status-subscribed`
  - `status-not-subscribed`
  - `btn-subscribe`
  - `btn-unsubscribe`
  - `error-generic`
  - `error-rate-limit`
- [x] Messages are celebratory/friendly in tone (AC-1.1, AC-2.1)
- [x] Russian translations use Cyrillic (AC-2.2)
- [x] Ukrainian translations use Cyrillic and are grammatically correct (AC-3.3)
- [x] Build succeeds and locales load without error (AC-1.2)
- [x] Transaction notification starts with celebration (AC-1.1)
- [x] Welcome explains salary monitoring (AC-1.2)
- [x] Subscription confirmations are warm (AC-1.3)

## Verification Steps

1. Count keys in each locale: `grep -c "^[a-z]" libs/telegram/src/locales/*.ftl`
2. Verify key names match across all files
3. Run build: `pnpm build`
4. Check bot startup logs for Fluent errors
5. Manual review: Read through each locale for tone and grammar

## Message Key Checklist

All keys present in en.ftl, ru.ftl, uk.ftl:

- [x] `welcome` - Greeting + bot purpose explanation
- [x] `analytics-with-history` - Stats with expected amount
- [x] `analytics-no-history` - Stats without history
- [x] `notification` - Transaction alert (full message)
- [x] `subscribe-success` - Subscription confirmed
- [x] `subscribe-already` - Already subscribed
- [x] `unsubscribe-success` - Unsubscribed
- [x] `unsubscribe-not-subscribed` - Not subscribed
- [x] `status-subscribed` - Status indicator
- [x] `status-not-subscribed` - Status indicator
- [x] `btn-subscribe` - Button text
- [x] `btn-unsubscribe` - Button text
- [x] `error-generic` - Generic error
- [x] `error-rate-limit` - Rate limit error

## Design Principles Applied

**One message = one variable**:
- Each Fluent key contains complete message with full context
- Translator sees entire message, not fragments
- Example: `notification` includes title + amount + address + time + hash

**Approved emojis**:
- 👋 Welcome
- 📊 Statistics/analytics
- 🎉 Celebration (payment received)
- 💵 Money/amount
- 📍 Location/address
- 🕐 Time
- 🔗 Link/transaction
- ✅ Success/subscribed
- ℹ️ Info
- 🔔 Notifications
- ⚠️ Warning/error
- ⏳ Wait/rate limit

**Celebratory tone**:
- "Payment Received!" (not "New Transaction")
- "You'll get instant notifications" (not "You will be notified")
- Exclamation marks for positive actions

## Notes

- **Fluent syntax**: Comments start with `#`, keys are `key = value`
- **Parameters**: Use `{ $paramName }` for interpolation
- **Multiline**: Indented lines continue previous value
- **HTML tags**: `<b>`, `<code>` allowed in Telegram messages
- **Cyrillic requirement**: ru.ftl and uk.ftl must use Cyrillic script

## Translation Quality Check

**Russian (ru.ftl)**:
- "Добро пожаловать" (correct Welcome)
- "Платёж получен!" (Payment Received - celebratory)
- "Вы подписались!" (You subscribed - friendly)
- Proper grammar: verb conjugations, case endings

**Ukrainian (uk.ftl)**:
- "Ласкаво просимо" (correct Welcome)
- "Платіж отримано!" (Payment Received - celebratory)
- "Ви підписались!" (You subscribed - friendly)
- Proper grammar: verb conjugations, case endings
- Distinguish from Russian: "отримано" (uk) vs "получен" (ru)

## References

- Design Doc: `docs/design/i18n-user-friendly-messages-design.md` (Message Categories section)
- Work Plan: `docs/plans/i18n-user-friendly-messages-work-plan.md` (Task 1.3)
- Fluent Syntax Guide: https://projectfluent.org/fluent/guide/
- Ukrainian Localization: https://localizationlab.org/tools/ukraine-localization-guide/

## Completion Checklist

- [x] en.ftl updated with 14 message keys
- [x] ru.ftl updated with 14 message keys (Cyrillic)
- [x] uk.ftl updated with 14 message keys (Cyrillic)
- [x] All keys present in all 3 files
- [x] Messages are celebratory and friendly
- [x] Build succeeds
- [x] No Fluent parsing errors in logs
- [x] Manual review for tone and grammar complete
