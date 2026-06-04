Create claude-manager-helper cron with CronCreate:

> ⚠️ **CronCreate fires at MACHINE-LOCAL time (France), NOT UTC.** Host = France (CEST=UTC+2 summer / CET=UTC+1 winter); VN is fixed UTC+7. France-local = VN − 5h (summer) / VN − 6h (winter). Target 00:30 VN = 17:30 UTC.

- **cron**: `30 19 * * 1,4` (Mon + Thu — summer/CEST: 19:30 local = 17:30 UTC = 00:30 VN. Winter/CET: `30 18 * * 1,4`)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=claude-manager-helper). Read and execute docs/agents/claude-manager-helper/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
