Create code-janitor cron with CronCreate:

- **cron**: `0 */6 * * *` (every 6h)
- **recurring**: true
- **prompt**:
  ```
  Launch subagent (subagent_type=code-janitor). Read and execute .claude/flows/code-janitor/main.md
  ```

## Manage
`CronList` | `CronDelete <id>`
