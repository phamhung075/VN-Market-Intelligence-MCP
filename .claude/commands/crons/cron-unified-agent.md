Create unified-agent cron with CronCreate:

- **cron**: `29 * * * *` (every hour at :29)
- **recurring**: true
- **prompt**:
  ```
  Check current UTC time. Read and execute the matching flow:
  - Mon–Fri 01:00/02:00/03:30/04:30/06:00/07:30/08:30 UTC → .claude/flows/unified-agent/market.md
  - Daily 01:00 UTC → .claude/flows/unified-agent/prediction.md
  - Daily 20:00 UTC → .claude/flows/unified-agent/daily-review.md
  - Sun 13:00 UTC → .claude/flows/unified-agent/weekly.md
  MCP: https://zenmidi.com/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
