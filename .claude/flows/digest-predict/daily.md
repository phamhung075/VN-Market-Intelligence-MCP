# Digest & Predict — Daily Digest Flow (15:30 UTC)

## Input
Bootstrap | market summary | chain findings | Kinh Dich readings

## Output
Daily digest to MARKET | WORK status | dev team feedback

---

**0. Bootstrap** `get_cycle_bootstrap(agent_name="digest-predict")`
- `urgent_news`/`price_anomaly` → include prominently | `suppress` → note false positive | `chain_catalyst` → `BASE_CONTEXT_FRESH=true`
- `error.market_context` → `send_telegram(channel="bug")` + `submit_feedback(category="bootstrap_failure")` → STOP
- `error.agent_signals` only → log warning, continue | ≥2 errors → STOP
- Per stock: `get_user_positions_for_analysis({ticker})`

**1. Market context** — already in `bootstrap.market_context`, no separate call

**2. Compile digest**
`get_market_summary(period="daily")` | `get_performance_attribution()` | `get_sector_rotation()` | `get_earnings_calendar()` | `generate_market_summary(period="daily")`

Pre-send: `get_market_snapshot()` divergence > 5% → re-fetch max 2x → skip + `submit_feedback(category="alert_quality")`

Format:
```
Daily Digest — {date}
VN-Index: {value} ({change}%) | Brent: ${brent} | Gold: ${gold} | USD/VND: {rate}
{stock} {price} {change}% {reason}

[Monday only]
Du bao tuan moi:
- {TICKER}: {claim_text} (xac suat {pct}%, {horizon} phien)
```
`send_telegram(channel="market")`

**2b. Chain analysis** `get_open_chain_findings()`
- 3 confirms → "Chuỗi xác nhận hoàn tất: {stock} — {action} ({conviction}% xác tín)"
- 1 validation → "Đang chờ xác nhận thêm: {stock} — {catalyst_title}"
- Failed → "Tín hiệu bị bác bỏ: {stock} — {reason}"

**3. Domain** `get_legal_risk_signals()` | `get_crisis_early_warning()` | `get_supply_chain_exposure()` | `get_climate_risk_signals()` | `get_energy_grid_signals()`

**4. Kinh Dich** `get_kinhdich_reading(code)` per stock | `get_market_hexagram()`
Format: "Kinh Dịch: {stock} — Quẻ {name} ({number}). {summary}. Biến quẻ: {name} ({prediction})."

**5. Dev team**
`BASE_CONTEXT_FRESH` + `recent_fixes` age < 20min → use payload, skip `get_recent_fixes()`. Else `get_recent_fixes(days=3, limit=10)`.
New issues → `submit_feedback(agent="digest-predict")`. Zero → exit silently.

**6. WORK**:
```
[Digest & Predict] HH:MM UTC — DAILY digest sent
  Stocks: N | Chains: X complete, Y partial, Z failed | Predictions: N (Mon) | Next: TIME
```
