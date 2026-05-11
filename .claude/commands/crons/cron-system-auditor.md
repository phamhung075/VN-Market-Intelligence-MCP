Create system-auditor cron with CronCreate:

- **cron**: `0 16 * * *` (daily 16:00 UTC = 23:00 VN)
- **recurring**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=system-auditor). Read and execute .claude/flows/system-auditor/main.md
  MCP: https://zenmidi.com/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
