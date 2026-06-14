# Digest & Predict — Daily Digest Flow (15:30 UTC)

**Tools:** `docs/agents/tools/package/digest-predict.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap | market summary | chain findings | Kinh Dich readings

## Output
Daily digest to MARKET | WORK status | dev team feedback

---

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `digest-predict`)

**0b. Regime** → skill: `.claude/skills/regime-extraction/SKILL.md`
Variables: REGIME, CARRY_REGIME, CARRY_SPREAD, US10Y_SIGNAL, US10Y_VALUE, DXY_SIGNAL, MAX_DEPOSIT_RATE

Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME          = "Global Liquidity: X"    → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME    = "VND Carry Spread" line  → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
CARRY_SPREAD    = numeric value from "VND Carry Spread: +X.XX%"
US10Y_SIGNAL    = "US 10Y Yield" line      → RISK-OFF | RISK-ON | NEUTRAL
US10Y_VALUE     = numeric yield value
DXY_SIGNAL      = "DXY" line              → USD STRENGTHENING | USD WEAKENING | USD STABLE
MAX_DEPOSIT_RATE = "[SBV Central Bank Rates]" block → "Max Deposit Rate: X.XX%"
```

**1. Nhân Hòa score** (no tool call — computed from extracted values above)
```
□ REGIME=EASING                           → +1
□ CARRY_REGIME=HOT_MONEY_INFLOW           → +1
□ US10Y_SIGNAL=RISK-ON                    → +1
□ EY_SPREAD > 2%: use VN-Index PE from `get_market_summary()` output (already fetched in step 2),
  EARNING_YIELD=1/market_PE, EY_SPREAD=EY-MAX_DEPOSIT_RATE → +1
  (evaluate this criterion after step 2 completes)
□ currentMonthIsPivotWindow=false         → +1
```
Verdict: 5/5=VÀNG | 3-4/5=THUẬN | 2/5=THẬN TRỌNG | 0-1/5=TRÁNH

**2. Compile digest**
`get_market_summary(period="daily")` | `get_performance_attribution()` | `get_sector_rotation()` | `get_earnings_calendar()` | `generate_market_summary(period="daily")`

Pre-send: `get_market_snapshot()` divergence > 5% → re-fetch max 2x → skip + `submit_feedback(category="alert_quality")`

Format:
```
Daily Digest — {date}
[Thiên Thời] {REGIME} | DXY {DXY_SIGNAL} | US10Y {US10Y_VALUE}% | Carry {CARRY_SPREAD}%
[Nhân Hòa] {verdict} ({score}/5)
VN-Index: {value} ({change}%) | Brent: ${brent} | Gold: ${gold} | USD/VND: {rate}
{stock} {price} {change}% {reason}

[Monday only]
Du bao tuan moi:
- {TICKER}: {claim_text} (xac suat {pct}%, {horizon} phien)
```

Monday prediction: if `nhân_hòa_score ≤ 1` → replace prediction section with:
`"Dự báo tuần mới: Thiên Thời bất lợi — không đưa ra dự báo hướng (Nhân Hòa: {score}/5). Chờ ≥3/5 điều kiện thuận."`

`send_telegram(channel="market", message=<digest_text>)`

**2b. Chain analysis** `get_open_chain_findings()`
- 3 confirms → "Chuỗi xác nhận hoàn tất: {stock} — {action} ({conviction}% xác tín)"
- 1 validation → "Đang chờ xác nhận thêm: {stock} — {catalyst_title}"
- Failed → "Tín hiệu bị bác bỏ: {stock} — {reason}"

**3. Domain** `get_legal_risk_signals()` | `get_crisis_early_warning()` | `get_supply_chain_exposure()` | `get_climate_risk_signals()` | `get_energy_grid_signals()`

**3b. Hot money note** (no tool call — from extracted CARRY values)
If `CARRY_REGIME=HOT_MONEY_INFLOW` AND `CARRY_SPREAD > 3%`:
- Identify sectors with FII concentration from `get_sector_rotation()` output (already fetched in step 2)
- Append to digest: `"⚠️ Dòng tiền nóng: carry +{CARRY_SPREAD}% — {sectors} có FII cao. Rủi ro đảo chiều nếu carry thu hẹp."`

**4. Kinh Dich** `get_kinhdich_reading(code)` per stock | `get_market_hexagram()`
Format: "Kinh Dịch: {stock} — Quẻ {name} ({number}). {summary}. Biến quẻ: {name} ({prediction})."
Append regime context: BUY signal + `REGIME=TIGHTENING` → add "Thiên thời bất lợi — chờ xác nhận"

**5. Dev team**
`BASE_CONTEXT_FRESH` + `recent_fixes` age < 20min → use payload, skip `get_recent_fixes()`. Else `get_recent_fixes(days=3, limit=10)`.
New issues → `submit_feedback(agent="digest-predict")`. Zero → exit silently.

**6. WORK** — `send_telegram(channel="work", message=...)`:
```
[Digest & Predict] HH:MM UTC — DAILY digest sent
  Stocks: N | Chains: X complete, Y partial, Z failed | Predictions: N (Mon) | Nhân Hòa: {score}/5 | Next: TIME
```

**End of cycle** → skill: `.claude/skills/cowork-end-cycle/SKILL.md`
