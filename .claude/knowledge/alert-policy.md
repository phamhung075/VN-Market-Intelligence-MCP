# Alert Policy — Firing Rules

**When to read this file:** When implementing alert logic, tuning thresholds, or verifying which conditions trigger a Telegram message to the MARKET channel. Load only when your task touches alert generation, cooldowns, or the `alertPolicy` config section.

---

## Two Alert Types (Sprint 054 Narrowed Policy)

Only two alert types are fired to the MARKET channel:

### 1. position-danger

Fires when ALL THREE conditions are met simultaneously:
1. `stopLossHit` — current price <= computed stop-loss
2. `singleDayDrop > 5%` — price fell more than 5% in a single session
3. `newsSentiment < -0.5` — recent news sentiment score is negative

**All three required** — any single condition alone does NOT fire.

### 2. watchlist-opportunity

Fires when ALL FOUR conditions are met:
1. `kinhDichConfidence >= 70` — Kinh Dich hexagram signal confidence >= 70%
2. `kinhDichSignal = BUY` — hexagram reading is bullish
3. `newsSentiment >= 0.3` — recent news has positive sentiment
4. `agentSignalsMajority = BUY` — majority of agent signals agree on BUY

---

## Configuration Location

All thresholds live in `mcp.config.json` under the `alertPolicy` section:

```json
{
  "alertPolicy": {
    "positionDanger": {
      "singleDayDropPct": 5.0,
      "newsSentimentThreshold": -0.5
    },
    "watchlistOpportunity": {
      "kinhDichConfidenceMin": 70,
      "newsSentimentMin": 0.3
    },
    "alertCooldownMinutes": 0
  }
}
```

`alertCooldownMinutes: 0` — every trigger produces exactly 1 alert (no cooldown suppression).

---

## Stop-Loss Computation (server-side, implicit)

```
stop_loss = max(
  entry_price - 2 * ATR14,
  nearest_support,
  avg_cost * 0.93
)
```

Never stored explicitly — recomputed each alert cycle from live price data.

---

## Alert Commander Exclusivity

**Alert Commander (`05-alert-commander.md`) is the ONLY agent that calls `send_telegram(channel="market")`.**

Exception: Digest Writer (06) also sends the daily/weekly digest to MARKET. QA Responder (07) sends /ask answers to MARKET. No other agent may write to MARKET.

---

## Legacy Alert Types (pre-Sprint 054 — still exist in DB)

These still exist as alert rows but are no longer auto-fired to Telegram via the narrowed policy:
- MEDIUM price moves (2-5%)
- Single-source signals without multi-agent confirmation
- Routine heartbeats

Dev Team may still query them via `get_alerts(type="all")` for analysis purposes.

---

## Cooldown Rules (Alert Commander internal)

Even with `alertCooldownMinutes: 0` in config, Alert Commander applies internal judgment:
- CRITICAL: never suppress
- Legal risk signals: never suppress
- Price alerts (stop-loss/take-profit set by user): never suppress
- position-danger and watchlist-opportunity: fire every trigger (config = 0)

These rules are enforced in `05-alert-commander.md`, not in server config.
