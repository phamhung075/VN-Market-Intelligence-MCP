# Alert Policy — Firing Rules

**Load when:** implementing alert logic, tuning thresholds, verifying MARKET channel trigger conditions.

## Two Active Alert Types

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

## Config

Threshold values → `mcp.config.json` → `alertPolicy` (volatile, shared child)

`alertCooldownMinutes: 0` — every trigger fires exactly 1 alert, no suppression.

## Stop-Loss Computation

Formula → `.claude/knowledge/portfolio-schema.md` (SSOT for position logic)

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
