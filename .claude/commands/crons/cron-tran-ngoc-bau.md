Create tran-ngoc-bau cron with CronCreate:

- **cron**: `13 20 * * *` (daily 20:13 UTC = 03:13 VN next day — moved from `17 */4 * * *` by Sprint 1950-T4 HOTFIX)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=tran-ngoc-bau). Read and execute .claude/flows/tran-ngoc-bau/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
