# Alert Policy — Firing Rules

**Load when:** implementing alert logic, tuning thresholds, verifying MARKET channel trigger conditions.

## Two Active Alert Types (Sprint 054+)

### position-danger — ALL THREE required
| Condition | Threshold |
|-----------|-----------|
| `stopLossHit` | current price <= computed stop-loss |
| `singleDayDrop` | > 5% in single session |
| `newsSentiment` | < -0.5 |

### watchlist-opportunity — ALL FOUR required
| Condition | Threshold |
|-----------|-----------|
| `kinhDichConfidence` | >= 70 |
| `kinhDichSignal` | BUY |
| `newsSentiment` | >= 0.3 |
| `agentSignalsMajority` | BUY |

## Config (`mcp.config.json` → `alertPolicy`)

```json
{
  "alertPolicy": {
    "positionDanger":      { "singleDayDropPct": 5.0, "newsSentimentThreshold": -0.5 },
    "watchlistOpportunity":{ "kinhDichConfidenceMin": 70, "newsSentimentMin": 0.3 },
    "alertCooldownMinutes": 0
  }
}
```

`alertCooldownMinutes: 0` — every trigger fires exactly 1 alert, no suppression.

## Stop-Loss Computation (server-side, never stored)

```
stop_loss = max(entry_price - 2*ATR14,  nearest_support,  avg_cost * 0.93)
```

## Alert Commander Exclusivity

Only `05-alert-commander.md` calls `send_telegram(channel="market")` for alerts.
Exceptions: Digest Writer (06) for digests, QA Responder (07) for /ask answers.

## Internal Cooldown Rules (Alert Commander judgment — never suppress)

- CRITICAL severity
- Legal risk signals
- Price alerts (stop-loss/TP set by user)
- position-danger and watchlist-opportunity (config = 0)

## Legacy Alert Types (pre-Sprint 054 — in DB, not auto-fired)

Still queryable via `get_alerts(type="all")`: MEDIUM price moves (2-5%), single-source signals, routine heartbeats.
