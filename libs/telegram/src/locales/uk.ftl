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

# Статистика виплат (приблизні значення)
payout-stats = 💸 <b>Виплати</b> (≈ приблизно)
    ━━━━━━━━━━━━━━━
    • Гаманців: ~{ $avgWallets } середнє / { $currentWallets } цього місяця
    • Виплачено: ~{ $payoutsAmount } USDT цього місяця

# Сповіщення про транзакцію - показує прогрес накопичення
notification = 💰 <b>Надходження коштів!</b>

    <b>+{ $amount } USDT</b> щойно надійшло

    📊 За місяць: { $monthTotal } / { $expectedAmount } USDT

    💸 <b>Виплати</b> (≈ приблизно)
    • Гаманців: ~{ $avgWallets } середнє / { $currentWallets } цього місяця
    • Виплачено: ~{ $payoutsAmount } USDT

    { $time }

# Кнопка для перегляду транзакції в Tronscan
btn-view-tronscan = 🔗 Дивитись у Tronscan

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

# Аналітика
analytics-title = 📊 <b>Аналітика виплат - { $month }</b>
analytics-month = { $month }
analytics-changes-from = Зміни позицій відносно { $previousMonth }

# Заголовки таблиці аналітики
analytics-header-position = #
analytics-header-wallet = Гаманець
analytics-header-type = Тип
analytics-header-prev = Поп.
analytics-header-change = Зм.

# Підсумки та статус аналітики
analytics-total = Всього: { $amount } USDT
analytics-no-data = Немає даних за цей період
analytics-data-unavailable = Дані аналітики недоступні

# Кнопки навігації по місяцях
btn-prev-month = ◀ { $month }
btn-next-month = { $month } ▶

# Заголовки груп класифікації
analytics-employees-header = 👔 <b>Співробітники ({ $count })</b>
analytics-freelancers-header = 💼 <b>Фрілансери ({ $count })</b>
analytics-onetime-header = 🎯 <b>Разові ({ $count })</b>
analytics-unknown-header = ❓ <b>Невідомі ({ $count })</b>
analytics-fired-header = 🚫 <b>Звільнені цього місяця ({ $count })</b>

# Значки класифікації
classify-employee = [С]
classify-freelancer = [Ф]
classify-onetime = [Р]
classify-unknown = [?]

# Індикатори зміни позиції
position-up = ↑
position-down = ↓
position-same = →
position-new = НОВИЙ
position-miss = ПРОПУСК

# Сповіщення про зміну зарплати
salary-increase = 📈 Виявлено підвищення зарплати: { $wallet } +{ $percent }%
salary-decrease = 📉 Виявлено зниження зарплати: { $wallet } -{ $percent }%

# Сповіщення про звільнення
fired-notification = ⚠️ Можливе звільнення: { $wallet } (немає виплат { $months } міс.)

# Назви місяців
month-january = Січень
month-february = Лютий
month-march = Березень
month-april = Квітень
month-may = Травень
month-june = Червень
month-july = Липень
month-august = Серпень
month-september = Вересень
month-october = Жовтень
month-november = Листопад
month-december = Грудень

# Сповіщення про початок сесії виплат
payout-started = 🚀 <b>Виплата розпочалась</b>

    Гаманець почав виплату коштів.
    Ви отримуватимете сповіщення про кожен переказ.

    { $time }

# Сповіщення про окрему вихідну транзакцію
payout-transaction = 💸 <b>Переказ #{ $txNumber }</b>

    <b>{ $amount } USDT</b> → { $recipient }

    Разом за сесію: { $sessionTotal } USDT

# Сповіщення про завершення сесії виплат
payout-completed = ✅ <b>Виплата завершена</b>

    📊 <b>Підсумки</b>
    • Переказів: { $txCount }
    • Всього виплачено: { $totalAmount } USDT
    • Тривалість: { $duration } хв
    • Залишок на балансі: { $endBalance } USDT

    { $time }
