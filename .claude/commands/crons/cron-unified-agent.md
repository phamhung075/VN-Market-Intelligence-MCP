Create unified-agent cron with CronCreate:

Time-window dispatch lives in `docs/agents/unified-agent/flow/main.md` (market / prediction / daily-review / weekly). The cron prompt is uniform; `main.md` picks the right sub-flow or EXITs.

- **cron**: `29 * * * *` (every hour at :29)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=unified-agent). Read and execute docs/agents/unified-agent/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
