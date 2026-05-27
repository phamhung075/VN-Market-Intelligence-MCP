# Tool Group: briefings (mcp-server)

**Module path:** `src/interface/mcp/tools/briefings/`
**Scheduler:** `src/scheduler/briefings/` (3 jobs)
**Domain services:** decisionNoteSynthesizer, sparkline, assembleEveningSummary, assembleBriefing, assembleAlertDigest

Individual tool signatures: `docs/agents/tools/list/<tool>.md`

---

## Tools

| Tool | Purpose | Key inputs | Downstream |
|------|---------|-----------|-----------|
| `get_market_summary` | Latest stored market summary | — | market.db (market_summaries) |
| `generate_market_summary` | Generate + store new market summary | — | All domain services |
| `read_telegram_reports` | Read pending Telegram reports for dev-team review | — | market.db (briefing_log) |
| `claim_telegram_report` | Claim a Telegram report for processing | report_id | market.db |
| `process_telegram_report` | Mark Telegram report as processed | report_id, action | market.db |
| `review_market_message` | Review/approve an unreviewed market message | message_id | market.db |
| `get_unreviewed_market_messages` | List messages pending human review | — | market.db |
| `send_telegram` | Send message to Telegram channel | channel, message | Telegram notifier |
| `get_recent_fixes` | Last N dev-team fix log entries | n | market.db (agent_work_log) |
| `append_session_record` | Append to session memory file | file, content | filesystem |
| `update_memory_file` | Overwrite a memory file | file, content | filesystem |
| `get_memory_files` | List agent memory files | — | filesystem |
| `search_memory_by_trigger` | Search memory files by keyword | query | filesystem |

---

## Scheduler Jobs

| Job | Cadence | Purpose |
|-----|---------|---------|
| `morningBriefingJob` | Daily 08:00 VN | Morning market briefing: macro + commodities + P&L |
| `eveningSummaryJob` | Daily 22:00 VN | Evening market summary |
| `franceSummaryJob` | Daily 07:00 France (14:00 VN) | France-timezone summary for user |

---

## Telegram Channels

| Channel | Purpose | Language |
|---------|---------|---------|
| `market` | HIGH/CRITICAL alerts, briefings, signals | Vietnamese |
| `work` | Dev-team diagnostics, operator notices | English/mixed |
| `bug` | Error reports, agent failures | English |

---

## Invariants

1. `send_telegram` is the only tool for Telegram output. Never call Telegram API directly from agents.
2. Morning briefing includes: macro dashboard, commodities (gold, oil, USD/VND), watchlist P&L snapshot.
3. Telegram report review flow: read → claim → process (dev-team CLI cron loop).
4. Memory tools (`append_session_record`, `update_memory_file`, `get_memory_files`): used by Cowork agents to persist working memory between sessions.
