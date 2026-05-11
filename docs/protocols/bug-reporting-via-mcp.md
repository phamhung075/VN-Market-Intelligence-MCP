---
name: Bug Reporting via MCP (Automatic Deduplication)
description: Agents use send_telegram(channel="bug") MCP tool for reporting; MCP server auto-deduplicates within 4 hours
type: reference
---

# Bug Reporting Via MCP — Automatic System

**Status:** Production — built-in MCP infrastructure, no agent-side deduplication needed

---

## How It Works

### 1. Agent Detects Error

During cowork agent cycle, agent encounters error:

```
ERROR: SQLite database locked (market_price.db.shm)
Impact: Cannot write EOD summaries
Status: Blocking, retrying every 10s
```

### 2. Agent Calls MCP Tool

Agent calls built-in MCP tool to report:

```
send_telegram(
  channel="bug",
  message="[Market Watcher] ⚠️ HIGH\n  Issue: SQLite database locked\n  Impact: EOD writes blocked\n  Status: Retrying every 10s"
)
```

### 3. MCP Server Handles Deduplication

The `send_telegram(channel="bug")` MCP tool AUTOMATICALLY:

1. **Checks for duplicates** within last 4 hours
   - Matches by issue category (not exact text)
   - If found: returns `msgId = -1` with message: "BUG report suppressed — duplicate category already open within 4h"

2. **Sends to BUG channel** if NOT duplicate
   - Posts message to `TELEGRAM_REPORT_BUG_CHANNEL_ID` Telegram group
   - Returns `msgId > 0` (Telegram message ID)

3. **Stores in SQLite**
   - Inserts row into `telegram_reports` table
   - Columns: `id, message_id, text, from_agent, priority, status, created_at, claimed_by`
   - `status: 'new'` initially, Dev Team marks `'processed'` after fix

4. **Returns status to agent**
   ```
   Success: msgId > 0 → "Message sent to BUG channel. message_id: {id}"
   Duplicate: msgId = -1 → "BUG report suppressed — duplicate category already open within 4h"
   Failed: msgId = 0 → "Failed — check TELEGRAM_BOT_TOKEN / env vars"
   ```

---

## Dev Team Workflow

### Dev Team Reads Reports

```
Dev Team calls: read_telegram_reports(status="new")
  → Lists all unprocessed bug reports from telegram_reports table
  → Each report shows: id, message_id, text, from_agent, priority, created_at
```

### Dev Team Processes Report

```
Dev Team investigates and fixes issue

Then calls: process_telegram_report(id=123)
  → Marks row as status='processed'
  → Optionally deletes Telegram message from BUG channel
  → Frees up the dedup window for future reports on same issue
```

---

## Key Points

### ✅ Automatic Deduplication

**No agent-side logic needed.** MCP server handles:
- Checking for duplicates within 4 hours
- Suppressing redundant messages (msgId = -1)
- Storing all reports in SQLite for dev team

### ✅ Three Report Priorities

`telegramReportStore.ts` supports:
```
type ReportPriority = "critical" | "high" | "normal" | "monitor"
```

Agents can specify priority when reporting if MCP tool is extended (currently default is implicit).

### ✅ Centralized Storage

All reports in `telegram_reports` table:
- Single source of truth
- Dev team tracks via `read_telegram_reports()` and `process_telegram_report()`
- Automatic cleanup: reported at `created_at` timestamp

### ✅ Channels Separated

```
send_telegram channels:
  - "market"  → TELEGRAM_INFO_MARKET_GROUP_ID (user-facing alerts)
  - "work"    → TELEGRAM_INFO_WORK_CHANNEL_ID (dev status)
  - "bug"     → TELEGRAM_REPORT_BUG_CHANNEL_ID (dev reports, stored in DB)
```

Only "bug" channel messages are stored in `telegram_reports` table.

---

## For Cowork Agents: Simple Pattern

```markdown
### ERROR HANDLING

If error occurs during cycle:

1. Report to dev team:
   send_telegram(channel="bug", message="[Agent] ⚠️ SEVERITY\n  Issue: {...}\n  Impact: {...}\n  Status: {...}")

2. That's it — MCP server handles dedup, storage, and dev team access

## Example: Market Watcher Error

If Batch 4 fails to write to ledger:

send_telegram(
  channel="bug",
  message="[Market Watcher] ⚠️ HIGH\n  Issue: SQLite database locked\n  Impact: EOD summaries not written\n  Status: Blocking, will retry Batch 4 at 17:00 UTC"
)
```

---

## Implementation Files

| File | Purpose |
|------|---------|
| `apps/mcp-server/src/interface/mcp/tools/briefings/telegramTools.ts` | MCP tool registration, dedup logic (line 110) |
| `apps/mcp-server/src/infrastructure/db/telegramReportStore.ts` | SQLite CRUD for `telegram_reports` table |
| `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` | MCP tools for dev team (read/process reports) |
| `apps/mcp-server/src/infrastructure/notifiers/telegram.ts` | Actual Telegram API calls, dedup window (4h) |

---

## FAQ

**Q: What if 5 agents report the same SQLite lock error simultaneously?**
A: All 5 call `send_telegram(channel="bug")` within seconds. First message goes through (msgId > 0), rest get suppressed (msgId = -1) for 4 hours. Dev team sees 1 message, not 5 spam.

**Q: How does MCP know if it's a "duplicate"?**
A: Uses error category matching (internal to `sendTelegramBug` in `telegram.ts`). Checks error message against patterns, not exact string match. So "SQLite database locked" on 16:00 UTC matches "SQLite database locked" on 16:05 UTC.

**Q: What happens after 4 hours?**
A: Dedup window expires. Next occurrence of same error type generates new report (new message to BUG channel, new row in DB).

**Q: Does the agent need to track dedup state?**
A: No. Agent just calls `send_telegram(channel="bug")` and checks return value. MCP handles everything.

**Q: Can agents see recent-bug-reports.json?**
A: No — that was a manual dedup attempt that's not needed. MCP server's SQLite `telegram_reports` table IS the source of truth.

---

**Last Updated:** 2026-04-26
**Status:** MCP infrastructure verified and operational
**Agent Integration:** Simple — just call `send_telegram(channel="bug")` on error, let MCP handle dedup
