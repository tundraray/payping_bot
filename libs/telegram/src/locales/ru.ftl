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

# Статистика выплат (приблизительные значения)
payout-stats = 💸 <b>Выплаты</b> (≈ приблизительно)
    ━━━━━━━━━━━━━━━
    • Кошельков: ~{ $avgWallets } среднее / { $currentWallets } в этом месяце
    • Выплачено: ~{ $payoutsAmount } USDT в этом месяце

# Уведомление о транзакции - показывает прогресс накопления
notification = 💰 <b>Поступление средств!</b>

    <b>+{ $amount } USDT</b> только что пришло

    📊 За месяц: { $monthTotal } / { $expectedAmount } USDT

    💸 <b>Выплаты</b> (≈ приблизительно)
    • Кошельков: ~{ $avgWallets } среднее / { $currentWallets } в этом месяце
    • Выплачено: ~{ $payoutsAmount } USDT

    { $time }

# Кнопка для просмотра транзакции в Tronscan
btn-view-tronscan = 🔗 Смотреть в Tronscan

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

# Аналитика
analytics-title = 📊 <b>Аналитика выплат - { $month }</b>
analytics-month = { $month }
analytics-changes-from = Изменения позиций относительно { $previousMonth }

# Заголовки таблицы аналитики
analytics-header-position = #
analytics-header-wallet = Кошелёк
analytics-header-type = Тип
analytics-header-prev = Пред.
analytics-header-change = Изм.

# Итоги и статус аналитики
analytics-total = Итого: { $amount } USDT
analytics-no-data = Нет данных за этот период
analytics-data-unavailable = Данные аналитики недоступны

# Кнопки навигации по месяцам
btn-prev-month = ◀ { $month }
btn-next-month = { $month } ▶

# Заголовки групп классификации
analytics-employees-header = 👔 <b>Сотрудники ({ $count })</b>
analytics-freelancers-header = 💼 <b>Фрилансеры ({ $count })</b>
analytics-onetime-header = 🎯 <b>Разовые ({ $count })</b>
analytics-unknown-header = ❓ <b>Неизвестные ({ $count })</b>
analytics-fired-header = 🚫 <b>Уволенные в этом месяце ({ $count })</b>

# Значки классификации
classify-employee = [С]
classify-freelancer = [Ф]
classify-onetime = [Р]
classify-unknown = [?]

# Индикаторы изменения позиции
position-up = ↑
position-down = ↓
position-same = →
position-new = НОВЫЙ
position-miss = ПРОПУСК

# Уведомления об изменении зарплаты
salary-increase = 📈 Обнаружено повышение зарплаты: { $wallet } +{ $percent }%
salary-decrease = 📉 Обнаружено понижение зарплаты: { $wallet } -{ $percent }%

# Уведомления об увольнении
fired-notification = ⚠️ Возможное увольнение: { $wallet } (нет выплат { $months } мес.)

# Названия месяцев
month-january = Январь
month-february = Февраль
month-march = Март
month-april = Апрель
month-may = Май
month-june = Июнь
month-july = Июль
month-august = Август
month-september = Сентябрь
month-october = Октябрь
month-november = Ноябрь
month-december = Декабрь

# Уведомление о начале сессии выплат
payout-started = 🚀 <b>Выплата началась</b>

    Кошелёк начал выплату средств.
    Вы будете получать уведомления о каждом переводе.

    { $time }

# Уведомление об отдельной исходящей транзакции
payout-transaction = 💸 <b>Перевод #{ $txNumber }</b>

    <b>{ $amount } USDT</b> → { $recipient }

    Итого за сессию: { $sessionTotal } USDT

# Уведомление о завершении сессии выплат
payout-completed = ✅ <b>Выплата завершена</b>

    📊 <b>Итоги</b>
    • Переводов: { $txCount }
    • Всего выплачено: { $totalAmount } USDT
    • Длительность: { $duration } мин
    • Остаток на балансе: { $endBalance } USDT

    { $time }
