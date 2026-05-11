Create news-scout cron with CronCreate:

- **cron**: `12,27,42,57 2-8 * * 1-5` (Mon–Fri every 15 min at :12/:27/:42/:57 during market window 02:00–08:00 UTC)
- **recurring**: true
- **prompt**:
  ```
  Read and execute .claude/flows/news-scout/cycle.md
  MCP: https://zenmidi.com/mcp
  ```

---

**Off-hours entry:**

- **cron**: `17 */4 * * *` (every 4h at :17 — 00:17, 04:17, 08:17, 12:17, 16:17, 20:17 UTC)
- **recurring**: true
- **prompt**:
  ```
  Read and execute .claude/flows/news-scout/cycle.md
  MCP: https://zenmidi.com/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
