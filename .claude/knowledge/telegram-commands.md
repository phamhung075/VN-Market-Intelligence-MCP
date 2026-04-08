# Telegram Bot Commands

**When to read this file:** When writing code or agent logic that handles Telegram bot commands from the user, or when documenting what commands exist and what they trigger. Load only when your task touches command routing or user-facing Telegram interactions.

---

## Command List (11 commands)

| Command | What it does |
|---------|-------------|
| `/watchlist` | Show current watchlist stocks |
| `/price [TICKER]` | Show current price for one or all watchlist stocks |
| `/alerts` | Show recent unread alerts |
| `/briefing` | Trigger a manual market briefing |
| `/health` | Show system health status |
| `/pnl` | Show P&L for current positions |
| `/ask <question>` | Queue a user question for async AI answer (QA Responder processes FIFO every 12 min) |
| `/why <TICKER>` | Ask why a stock moved — queued and answered by QA Responder |
| `/report <description>` | File a bug report to BUG channel with agent="user-telegram" |
| `/fix <description>` | Request a fix — creates HIGH priority BUG report |
| `/help` | Show command list |

---

## /ask and /why Queue Behavior (Sprint 054)

- User sends `/ask <question>` or `/why <TICKER>` in the MARKET channel (Vn-market-user)
- Server inserts row into `user_requests` DB table (status="pending")
- `askQueueCheck` cron (every 12 min) calls `get_user_requests(status="pending")`
- QA Responder agent (07) processes FIFO, one question at a time
- Answer posted back to MARKET channel as reply
- Agent calls `mark_user_request_answered(id)` when done
- Questions requiring >10 min reasoning → emit paste-ready prompt for user to run in separate session
- All answered questions stored for audit

---

## Command Routing (server-side)

Commands are handled in `src/infrastructure/notifiers/telegramCommands.ts`.
- `/report` and `/fix` → insert into `telegram_reports` table → Dev Team reads via `read_telegram_reports`
- `/ask` and `/why` → insert into `user_requests` table → QA Responder reads via `get_user_requests`
- All other commands → respond inline (immediate)

---

## Channel Context

All commands are received in the **MARKET channel** (Vn-market-user, `TELEGRAM_INFO_MARKET_GROUP_ID`).
Answers to `/ask` and `/why` are posted back to MARKET channel.
`/report` and `/fix` bugs appear in BUG channel (visible to Dev Team).
