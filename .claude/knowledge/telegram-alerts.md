# Telegram Alerts — Bot Commands & Alert Policy

**Load when:** command routing, user-facing Telegram interactions, implementing alert logic, tuning thresholds, verifying MARKET channel trigger conditions.

---

## Bot Commands (11)

| Command | What |
|---------|------|
| `/watchlist` | Show current watchlist |
| `/price [TICKER]` | Current price for one or all watchlist stocks |
| `/alerts` | Recent unread alerts |
| `/briefing` | Trigger manual market briefing |
| `/health` | System health status |
| `/pnl` | P&L for current positions |
| `/ask <question>` | Queue question for async AI answer (FIFO, 12-min cron) |
| `/why <TICKER>` | Why did stock move — queued, answered by QA Responder |
| `/report <description>` | File bug to BUG channel (agent="user-telegram") |
| `/fix <description>` | HIGH priority bug report |
| `/help` | Show command list |

### /ask and /why Behavior (Sprint 054)

- User sends in MARKET channel → server inserts into `ask_queue` (status="pending")
- `askQueueCheck` cron (*/12 min) → `get_pending_ask_questions()`
- QA Responder (07): FIFO, one at a time → answer to MARKET, `answer_ask_question(id)` when done
- >10 min questions → emit paste-ready prompt, status="escalated"

### Command Routing (server-side: `src/infrastructure/notifiers/telegramCommands.ts`)

| Commands | Destination |
|----------|-------------|
| `/report`, `/fix` | `telegram_reports` table → Dev Team via `read_telegram_reports` |
| `/ask`, `/why` | `ask_queue` table → QA Responder via `get_pending_ask_questions` |
| All others | Respond inline (immediate) |

All commands received in **MARKET channel** (`TELEGRAM_INFO_MARKET_GROUP_ID`).
Answers to `/ask`/`/why` → MARKET. `/report`/`/fix` bugs visible in BUG channel.

---

## Alert Policy — Firing Rules

### Two Active Alert Types (Sprint 054+)

#### position-danger — ALL THREE required
| Condition | Threshold |
|-----------|-----------|
| `stopLossHit` | current price <= computed stop-loss |
| `singleDayDrop` | > 5% in single session |
| `newsSentiment` | < -0.5 |

#### watchlist-opportunity — ALL FOUR required
| Condition | Threshold |
|-----------|-----------|
| `kinhDichConfidence` | >= 70 |
| `kinhDichSignal` | BUY |
| `newsSentiment` | >= 0.3 |
| `agentSignalsMajority` | BUY |

### Config (`mcp.config.json` → `alertPolicy`)

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

### Stop-Loss Computation (server-side, never stored)

```
stop_loss = max(entry_price - 2*ATR14,  nearest_support,  avg_cost * 0.93)
```

### Alert Commander Exclusivity

Only `05-alert-commander.md` calls `send_telegram(channel="market")` for alerts.
Exceptions: Digest Writer (06) for digests, QA Responder (07) for /ask answers.

### Internal Cooldown Rules (Alert Commander judgment — never suppress)

- CRITICAL severity
- Legal risk signals
- Price alerts (stop-loss/TP set by user)
- position-danger and watchlist-opportunity (config = 0)

### Legacy Alert Types (pre-Sprint 054 — in DB, not auto-fired)

Still queryable via `get_alerts(type="all")`: MEDIUM price moves (2-5%), single-source signals, routine heartbeats.
