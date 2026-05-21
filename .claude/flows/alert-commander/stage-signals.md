> Parent: [./cycle.md](./cycle.md)

# Alert Commander — Stage 3: Signal Matrix + Routing

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
  <!-- L-9 (1968c-P03): signal_type="price_anomaly" filter applied server-side — reduces payload ~50%.
       Only price_anomaly signals returned; no client-side type filtering needed. -->
  1. Call `get_agent_signals` with `signal_type="price_anomaly"` AND `status="all"` to get price validation signals for `stock_code=signal.stockCode` (filter by stockCode client-side from the filtered result):
```
call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "alert-commander",
  "status": "all",
  "signal_type": "price_anomaly",
  "hours_back": 2
})
```
  2. From returned signals, keep only those where `stock_code == signal.stockCode`. Parse `finding_data.move_sigma` from each hit.
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
  <!-- L-9 (1968c-P03): signal_type="chain_catalyst" filter applied server-side — returns only
       chain_catalyst signals for conflict detection. Reduces payload vs. full result set. -->
  4. Conflict check: call `get_agent_signals` with `signal_type="chain_catalyst"` for conflict detection — if two signals for same ticker have conflicting `direction` → append conflict warning from `payload.detail` (earningsConflictDetector sets this):
```
call_tool(server="vn-market", tool="get_agent_signals", arguments={
  "agent": "alert-commander",
  "status": "all",
  "signal_type": "chain_catalyst",
  "hours_back": 2
})
```
  5. Log: `"[ChainCatalyst] [TICKER] event={event_type} dir={direction} conf={confidence:.2f} → {CRITICAL|MARKET|suppressed}"`
  6. Call `record_signal_outcome(signal_id, "fired"|"suppressed", reason)`
