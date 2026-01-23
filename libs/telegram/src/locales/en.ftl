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

# Transaction notification - shows progress toward expected salary amount
notification = 💰 <b>Funds received!</b>

    <b>+{ $amount } USDT</b> just arrived

    This month: { $monthTotal } / { $expectedAmount } USDT
    Expecting more transactions.

    { $time } · <a href="https://tronscan.org/#/transaction/{ $hash }">View on Tronscan</a>

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

# Analytics
analytics-title = 📊 <b>Payout Analytics - { $month }</b>
analytics-month = { $month }
analytics-changes-from = Position changes from { $previousMonth }

# Analytics table headers
analytics-header-position = #
analytics-header-wallet = Wallet
analytics-header-type = Type
analytics-header-prev = Prev
analytics-header-change = Change

# Analytics totals and status
analytics-total = Total: { $amount } USDT
analytics-no-data = No data for this period
analytics-data-unavailable = Analytics data unavailable

# Analytics navigation buttons
btn-prev-month = ◀ { $month }
btn-next-month = { $month } ▶

# Classification group headers
analytics-employees-header = 👔 <b>Employees ({ $count })</b>
analytics-freelancers-header = 💼 <b>Freelancers ({ $count })</b>
analytics-onetime-header = 🎯 <b>One-time ({ $count })</b>
analytics-unknown-header = ❓ <b>Unknown ({ $count })</b>
analytics-fired-header = 🚫 <b>Terminated this month ({ $count })</b>

# Classification badges
classify-employee = [E]
classify-freelancer = [F]
classify-onetime = [O]
classify-unknown = [?]

# Position change indicators
position-up = ↑
position-down = ↓
position-same = →
position-new = NEW

# Salary change notifications
salary-increase = 📈 Salary increase detected: { $wallet } +{ $percent }%
salary-decrease = 📉 Salary decrease detected: { $wallet } -{ $percent }%

# Fired notifications
fired-notification = ⚠️ Possible termination: { $wallet } (no payment for { $months } months)

# Month names
month-january = January
month-february = February
month-march = March
month-april = April
month-may = May
month-june = June
month-july = July
month-august = August
month-september = September
month-october = October
month-november = November
month-december = December
