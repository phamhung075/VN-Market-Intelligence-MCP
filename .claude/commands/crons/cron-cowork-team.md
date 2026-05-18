Create cowork-team master cron with CronCreate:

- **cron**: `*/15 * * * *` (every 15 min — master dispatcher fires then matches slot crons ±2min)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Read and execute .claude/flows/cowork-team/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`

## Notes
- Single CronCreate replaces 16 RemoteTrigger slots (Sprint 1951 pivot).
- Sub-hourly slots (news-scout-market, market-watcher-market, market-watcher-prepost, alert-commander-market) were previously blocked by API_MIN_INTERVAL — this CronCreate resolves that.
- 24h parallel-run: keep existing RemoteTriggers active until cowork-team AC-6 passes (zero double-publish in MARKET channel).
- After parallel-run: delete 12 RemoteTriggers with trigger_status=pending_delete per brief §8.
