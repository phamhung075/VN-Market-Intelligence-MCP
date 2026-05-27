Create agent-father cron with CronCreate:

- **cron**: `23 14 * * *` (daily 14:23 UTC = 21:23 VN)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=agent-father). Read and execute docs/agents/agent-father/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
