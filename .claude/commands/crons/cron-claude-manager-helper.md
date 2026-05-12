Create claude-manager-helper cron with CronCreate:

- **cron**: `30 17 * * 1,4` (Mon + Thu 17:30 UTC = 00:30 VN)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=claude-manager-helper). Read and execute .claude/flows/claude-manager-helper/main.md
  MCP: https://zenmidi.com/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
