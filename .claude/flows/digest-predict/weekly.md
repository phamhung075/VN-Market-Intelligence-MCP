# Digest & Predict — Weekly Digest Flow (Sunday 16:00 UTC)

## Input
Weekly market data | agent signals | prediction accuracy | system feedback

## Output
Weekly digest to MARKET | WORK status

---

`generate_market_summary(period="weekly")`

Include:
- Week performance + sector trends
- `get_sector_comparison(code)` per stock — PE/PB/ROE vs median, PREMIUM/DISCOUNT/NGANG BẰNG, foreign flow
- Position review (hold/accumulate/reduce + reasoning)
- `get_correlation_matrix()` diversification score
- `get_alert_accuracy()` accurate vs noisy
- `get_signal_effectiveness(days=7)` precision < 60% = flag
- `get_cascade_metrics(days=7)` high-activity or dead rules
- `run_hexagram_backtest(days=7)` prediction accuracy
- `get_transition_probabilities(hexagram_number)` key stocks
- `get_prediction_accuracy(days=7)` claim resolution rate
- `get_calibration_report()` status
- All domain tools: legal/policy/bond/contracts/credit/insider/supply chain/climate/energy/crisis/pharma

## System Improvement (every Sunday)
`read_telegram_reports(status="all")` | `get_recent_fixes(20)` → group by category/agent:
```
Cải thiện hệ thống tuần này:
1. {highest priority}
2. {second}
3. {third}
Tổng feedback: {N} từ {agents}
```

`send_telegram(channel="market")`
`send_telegram(channel="work", "[Digest & Predict] HH:MM UTC — WEEKLY sent. Next: TIME")`
