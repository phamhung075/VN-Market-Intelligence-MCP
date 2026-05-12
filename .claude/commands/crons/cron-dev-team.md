Create dev-team cron with CronCreate:

- **cron**: `7 * * * *` (every hour at :07)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Read and execute .claude/flows/dev-team/main.md
  MCP: https://zenmidi.com/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
