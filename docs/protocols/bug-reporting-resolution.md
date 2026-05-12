> Parent: [./bug-reporting-via-mcp.md](./bug-reporting-via-mcp.md)

# Bug Reporting — Resolution Phase

Dev team workflow for processing bug reports.

## Dev Team Reads Reports

```
Dev Team calls: read_telegram_reports(status="new")
  → Lists all unprocessed bug reports from telegram_reports table
  → Each report shows: id, message_id, text, from_agent, priority, created_at
```

## Dev Team Processes Report

```
Dev Team investigates and fixes issue

Then calls: process_telegram_report(id=123)
  → Marks row as status='processed'
  → Optionally deletes Telegram message from BUG channel
  → Frees up the dedup window for future reports on same issue
```

---

## FAQ

**Q: What if 5 agents report the same SQLite lock error simultaneously?**
A: All 5 call `send_telegram(channel="bug")` within seconds. First message goes through (msgId > 0), rest get suppressed (msgId = -1) for 4 hours. Dev team sees 1 message, not 5 spam.

**Q: Does the agent need to track dedup state?**
A: No. Agent just calls `send_telegram(channel="bug")` and checks return value. MCP handles everything.

**Q: Can agents see recent-bug-reports.json?**
A: No — that was a manual dedup attempt that's not needed. MCP server's SQLite `telegram_reports` table IS the source of truth.

---

## Key Points

### ✅ Automatic Deduplication

**No agent-side logic needed.** MCP server handles:
- Checking for duplicates within 4 hours
- Suppressing redundant messages (msgId = -1)
- Storing all reports in SQLite for dev team

### ✅ Centralized Storage

All reports in `telegram_reports` table:
- Single source of truth
- Dev team tracks via `read_telegram_reports()` and `process_telegram_report()`
- Automatic cleanup: reported at `created_at` timestamp
