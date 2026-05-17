> Parent: [./bug-reporting-via-mcp.md](./bug-reporting-via-mcp.md)

# Bug Reporting — Routing & Deduplication

MCP server-side handling of bug reports and automatic deduplication.

## MCP Server Handles Deduplication

The `send_telegram(channel="bug")` MCP tool AUTOMATICALLY:

1. **Checks for duplicates** within last 4 hours
   - Matches by issue category (not exact text)
   - If found: returns `msgId = -1` with message: "BUG report suppressed — duplicate category already open within 4h"

2. **Sends to BUG channel** if NOT duplicate
   - Posts message to the BUG channel (env var → `jq '.project.channels[] | select(.id=="bug") | .env_var' docs/data/system-map.json`)
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

## Channels Separated

Channel → env var mapping → `jq '.project.channels[] | {id, env_var, purpose}' docs/data/system-map.json`

```
send_telegram channels:
  - "market"  → user-facing alerts
  - "work"    → dev status
  - "bug"     → dev reports, stored in DB
```

Only "bug" channel messages are stored in `telegram_reports` table.

---

## Centralized Storage

All reports in `telegram_reports` table:
- Single source of truth
- Dev team tracks via `read_telegram_reports()` and `process_telegram_report()`
- Automatic cleanup: reported at `created_at` timestamp

---

## Dedup Mechanics

**Q: How does MCP know if it's a "duplicate"?**
A: Uses error category matching (internal to `sendTelegramBug` in `telegram.ts`). Checks error message against patterns, not exact string match. So "SQLite database locked" on 16:00 UTC matches "SQLite database locked" on 16:05 UTC.

**Q: What happens after 4 hours?**
A: Dedup window expires. Next occurrence of same error type generates new report (new message to BUG channel, new row in DB).
