Create claude-manager-helper cron with CronCreate:

- **cron**: `30 17 * * 1,4` (Mon + Thu 17:30 UTC = 00:30 VN)
- **recurring**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=claude-manager-helper). Read and execute .claude/flows/claude-manager-helper/main.md
  ```

## Manage
`CronList` | `CronDelete <id>`
