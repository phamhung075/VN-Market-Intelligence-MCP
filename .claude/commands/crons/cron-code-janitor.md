Create code-janitor cron with CronCreate:

- **cron**: `0 */6 * * *` (every 6h)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=code-janitor). Read and execute docs/agents/code-janitor/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
