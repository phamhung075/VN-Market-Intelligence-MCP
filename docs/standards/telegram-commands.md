# Telegram Bot Commands

**Load when:** command routing, user-facing Telegram interactions.

## Commands

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

## /ask and /why Behavior

- User sends in MARKET channel → server inserts into `ask_queue` (status="pending")
- `askQueueCheck` cron (*/12 min) → `get_pending_ask_questions()`
- QA Responder (07): FIFO, one at a time → answer to MARKET, `answer_ask_question(id)` when done
- >10 min questions → emit paste-ready prompt, status="escalated"

## Command Routing (server-side: `src/infrastructure/notifiers/telegramCommands.ts`)

| Commands | Destination |
|----------|-------------|
| `/report`, `/fix` | `telegram_reports` table → Dev Team via `read_telegram_reports` |
| `/ask`, `/why` | `ask_queue` table → QA Responder via `get_pending_ask_questions` |
| All others | Respond inline (immediate) |

All commands received in **MARKET channel** (env var → `jq '.project.channels[] | select(.id=="market") | .env_var' docs/data/system-map.json`).
Answers to `/ask`/`/why` → MARKET. `/report`/`/fix` bugs visible in BUG channel.
