Create digest-predict cron with CronCreate:

- **cron**: `47 13 * * 0` (Sunday 13:47 UTC = 20:47 VN — weekly calibration + portfolio thesis)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=digest-predict). Read and execute .claude/flows/digest-predict/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
