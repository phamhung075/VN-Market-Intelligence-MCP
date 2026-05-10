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

## Signal Verdict Lifecycle

Managed by `verdictResolutionJob` (hourly `0 * * * *`). Source: `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts`

```
agent_signal created → outcome = NULL / 'fired'
   │
   ├─ < 24h old → SKIP (window guard — 4h resolution window not complete)
   │
   └─ ≥ 24h old → evaluate 4h price delta (baseline ±15min vs +240..+270 min)
         │
         ├─ |Δ%| < 1% (flat)              → confirmed
         ├─ bullish + Δ% ≥ +1%            → confirmed
         ├─ bullish + Δ% ≤ -1%            → false_positive
         ├─ bearish + Δ% ≤ -1%            → confirmed
         └─ bearish + Δ% ≥ +1%            → false_positive
```

**States:** `NULL` (pending) → `confirmed` | `false_positive`
**Flat threshold:** ±1% (signals with <1% move are always `confirmed`)
**TTL pruning:** signals with `outcome IS NULL` older than 30 days are deleted each run
**Fail-loud:** price fetch error → one BUG Telegram alert per job run (signal skipped, not failed)
**Missing price data** (weekend gap, no history): signal skipped, retried next hour

Verdict outcomes stored in `agent_signals.outcome` column. Aggregate data → `docs/data/alert-verdicts.json`

## Legacy Alert Types (pre-Sprint 054 — in DB, not auto-fired)

Still queryable via `get_alerts(type="all")`: MEDIUM price moves (2-5%), single-source signals, routine heartbeats.
