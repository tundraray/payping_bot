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
