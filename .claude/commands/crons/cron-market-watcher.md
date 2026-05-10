Create market-watcher cron with CronCreate:

- **cron**: `7 2-8 * * 1-5` (Mon–Fri every hour :07 during market window 02:00–08:00 UTC, plus aligned 15-min runs via second entry below)
- **recurring**: true
- **prompt**:
  ```
  Check current UTC time (Asia/Ho_Chi_Minh = UTC+7).
  Market hours: Mon–Fri 02:00–08:30 UTC (09:00–15:30 ICT).

  If current time is Mon–Fri 02:00–08:30 UTC → Read and execute .claude/flows/market-watcher/cycle.md
  If current time is Mon–Fri 16:00 UTC (±5 min) → Read and execute .claude/flows/market-watcher/eod.md
  Otherwise → EXIT immediately. No work outside market hours or EOD window.

  MCP: https://zenmidi.com/mcp
  ```

---

**Second entry — 15-min intraday scan:**

- **cron**: `12,27,42,57 2-8 * * 1-5` (every 15 min at :12/:27/:42/:57 during market window)
- **recurring**: true
- **prompt**:
  ```
  Read and execute .claude/flows/market-watcher/cycle.md
  MCP: https://zenmidi.com/mcp
  ```

---

**EOD entry:**

- **cron**: `3 16 * * 1-5` (Mon–Fri 16:03 UTC — EOD summary)
- **recurring**: true
- **prompt**:
  ```
  Read and execute .claude/flows/market-watcher/eod.md
  MCP: https://zenmidi.com/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
