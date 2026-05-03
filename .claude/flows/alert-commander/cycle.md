# Alert Commander — Cycle Flow

## Input
Bootstrap signals, price alerts, legal/crisis data, `docs/data/project-stats.json`

## Output
MARKET alerts (user-facing) | WORK cycle status | BUG on error

**0. Bootstrap** → skill: `.claude/skills/cycle-bootstrap/SKILL.md` (replace `<agent-id>` with `alert-commander`)

**0b. Macro calendar + regime extraction**
`get_macro_calendar()` → extract `pivot_window_active = (pivotWindowWarning != null)`
Parse `get_macro_snapshot` text block already in bootstrap:
```
REGIME       = "Global Liquidity: X"    → TIGHTENING | EASING | NEUTRAL
CARRY_REGIME = "VND Carry Spread" line  → HOT_MONEY_INFLOW | NEUTRAL | FII_OUTFLOW_RISK
CARRY_SPREAD = numeric value parsed from "VND Carry Spread: +X.XX%"
```
If `get_macro_snapshot` not in bootstrap context → call it once now.

**1. Context**
`get_market_context(hours_back=6)` | `get_alerts(type="price")`

**2. Legal + Crisis**
`get_legal_risk_signals()` hit → mark CRITICAL
`get_crisis_early_warning()` threshold exceeded → mark CRITICAL

**3. Signal Matrix**

> Note: `chain_catalyst` signals are NOT evaluated at this table — they are routed unconditionally to Step 3c. Step 3c applies the threshold. Do not suppress chain_catalyst here.

Base thresholds (NEUTRAL): `verified_chain` conviction ≥ 0.80 | `urgent_news` conviction ≥ 0.60 | `chain_catalyst` conviction ≥ 0.75
Regime-conditioned adjustments:
- `TIGHTENING`: verified_chain ≥ 0.85 | bullish urgent_news ≥ 0.75 | chain_catalyst ≥ 0.85
- `EASING`: verified_chain ≥ 0.75 | urgent_news ≥ 0.55 | chain_catalyst ≥ 0.70
- `NEUTRAL`: base thresholds (0.80 / 0.60 / 0.75)

| Signal | Condition | Action |
|--------|-----------|--------|
| `verified_chain` | conviction ≥ regime threshold | CRITICAL |
| `urgent_news` | conviction ≥ regime threshold | MARKET |
| `chain_catalyst` | — | → route to Step 3c (do NOT evaluate threshold here) |
| `price_anomaly` | confirmed via `get_alerts` | CRITICAL |
| `legal_risk` | any | CRITICAL now |
| `crisis_velocity` | any | CRITICAL now |

**3b. Price-validation override** (runs only when signal.confidence < regime_threshold)

For each signal where conviction < regime_threshold:
  1. Call `get_agent_signals` filtered for `signal_type="price_anomaly"` AND `stock_code=signal.stockCode` AND not expired (within 120 min)
  2. Parse `finding_data.move_sigma` from each hit
  3. If any hit has `move_sigma >= 4.0` AND `payload.impact_score >= 6`:
     → set `effective_confidence = 0.75`, add annotation `"price-validated override"`
     → escalate as if threshold met
  4. Log: `"[Override] [TICKER] confidence boosted {original}→0.75 (price_anomaly move_sigma={N}, impact={M})"`
  5. Call `record_signal_outcome(original_signal_id, "confirmed", "price-validation override")`

> WARNING: chain_catalyst signals MUST reach Step 3c. If a chain_catalyst signal appears in the bootstrap, do NOT suppress it at the Step 3 matrix table — pass it directly to Step 3c regardless of confidence score. Step 3c applies the threshold.

**3c. chain_catalyst processing**
For each `chain_catalyst` signal from signal bus:
  1. Read `finding_data.confidence`, `finding_data.direction`, `finding_data.event_type`, `finding_data.affected_stocks`
  2. Apply regime threshold (see Step 3 matrix): confidence ≥ threshold → proceed
  3. Direction routing:
     - `bearish` → CRITICAL alert (position-danger)
     - `bullish` + earnings event_type → MARKET alert (watchlist-opportunity)
     - `bullish` + macro/trade_war event_type → MARKET alert with regime caveat
     - `neutral` → WORK channel only, do not fire MARKET
  4. Conflict check: call `get_agent_signals(signal_type="chain_catalyst", stock_code=affected_stock)` — if two signals for same ticker have conflicting `direction` → append conflict warning from `payload.detail` (earningsConflictDetector sets this)
  5. Log: `"[ChainCatalyst] [TICKER] event={event_type} dir={direction} conf={confidence:.2f} → {CRITICAL|MARKET|suppressed}"`
  6. Call `record_signal_outcome(signal_id, "fired"|"suppressed", reason)`

**4a. MARKET channel**
Pre-send: `get_market_snapshot()` — divergence > 5% → discard, max 2 attempts
- > 3 pending → `send_alert_digest(alerts=[], channel="market")`
- ≤ 3 → `send_telegram(channel="market")` per alert
Format: `.claude/knowledge/alert-message-format.md` (Vietnamese, full diacritics)

Append regime caveat to each MARKET alert (Vietnamese):
- `TIGHTENING` + bullish signal:
  `"Lưu ý: Tín hiệu mua trong môi trường thắt chặt (TIGHTENING). Thiên thời bất lợi — yêu cầu xác nhận chuỗi cao hơn."`
- `CARRY_REGIME=HOT_MONEY_INFLOW` + `CARRY_SPREAD > 3%`:
  `"⚠️ Dòng tiền nóng cao — carry spread hấp dẫn. Rủi ro đảo chiều FII nếu carry thu hẹp."`
- `pivot_window_active=true`:
  `"📅 Cửa sổ pivot chính sách — dữ liệu GSO/SBV sắp công bố."`
- `chain_catalyst` + `TIGHTENING` + `bullish`:
  `"Lưu ý: Xúc tác chuỗi trong môi trường thắt chặt — xác nhận thêm trước khi hành động."`
- `chain_catalyst` + `bearish` (any regime):
  `"Cảnh báo: Xúc tác tiêu cực được phát hiện — kiểm tra danh mục ngay."`

After: `mark_alert_read()` + `record_signal_outcome(..., "fired")`

**4b. WORK channel** (every cycle)
```
[Alert Commander] HH:MM UTC — N signals
Fired: X | Suppressed: Y | Next: TIME
```

**4c. BUG channel** (errors only)
Before sending: `get_recent_fixes(limit=20)` — if same module/issue in recent fixes → **skip, do not re-report**.
```
[Alert Commander] ⚠️ SEVERITY
Issue: ... | Impact: ... | Status: Retrying/Blocking
```

**5. Session log**
`log_agent_work(...)` + append `docs/agent-memory/sessions/YYYY-MM-DD-alert-commander.md`:
```
### Alert Cycle (HH:MM–HH:MM UTC)
- Signals: [count by type]
- Fired: N | Suppressed: M | MARKET: X
- ChainCatalyst: N fired | M suppressed | event_types: [list]
- Regime: REGIME | Carry: CARRY_REGIME (CARRY_SPREAD%) | Pivot window: pivot_window_active
```

---

## Firing Rules

**position-danger**:
- `NEUTRAL/EASING` (all 3): `stopLossHit=true` + `singleDayDrop>5%` + `newsSentiment<-0.5`
- `TIGHTENING` (2/3 sufficient): any two of the above — credit buffer thinner, earlier exit warranted
**watchlist-opportunity**:
- `TIGHTENING`: `kinhDichConfidence≥80` + `kinhDichSignal=BUY` + `newsSentiment≥0.5` + `agentsMajority=BUY`
- `EASING`: `kinhDichConfidence≥65` + `kinhDichSignal=BUY` + `newsSentiment≥0.3` + `agentsMajority=BUY`
- `NEUTRAL`: `kinhDichConfidence≥70` + `kinhDichSignal=BUY` + `newsSentiment≥0.3` + `agentsMajority=BUY`
**CRITICAL always**: `verified_chain` | `legal_risk` | `crisis_velocity`

## Value Investor Mode

`analysis_mode=value_investor` → skip trader alerts → route to WORK.
`REGIME=TIGHTENING` → additionally suppress growth-story plays (PE > 20 + no dividend yield) → route to WORK with note: `"TIGHTENING regime — ưu tiên Tốt Gỗ/cổ tức, tránh tăng trưởng PE cao"`
Always MARKET regardless: earnings release | gov policy change | large insider (>$5M or >5% stake) | supply chain disruption | sector rotation reversal (foreign flow >10%/week) | Kinh Dich shift
