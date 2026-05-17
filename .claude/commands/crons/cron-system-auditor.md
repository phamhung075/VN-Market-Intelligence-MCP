Create system-auditor cron with CronCreate:

- **cron**: `0 16 * * *` (daily 16:00 UTC = 23:00 VN)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute .claude/flows/system-auditor/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
