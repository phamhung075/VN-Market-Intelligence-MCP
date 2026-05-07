Create tran-ngoc-bau cron with CronCreate:

- **cron**: `17 */4 * * *` (every 4h at :17 — 00:17, 04:17, 08:17, 12:17, 16:17, 20:17 UTC)
- **recurring**: true
- **prompt**:
  ```
  run .claude/flows/tran-ngoc-bau/main.md
  ```

## Manage
`CronList` | `CronDelete <id>`
