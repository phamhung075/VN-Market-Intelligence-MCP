# Unified-Agent Hourly Cron

To restart the hourly unified-agent cycle (after closing terminal / new session):

## Paste this into Claude Code to create the cron:

```
CronCreate schedule "7 * * * *" recurring true run_now true prompt:
Read cowork-analysis-vnmarket-team/unified-agent.md for your complete instructions. Determine current Vietnam time (UTC+7) and execute the appropriate tasks for this hour. Use ALL MCP tools from vn-market-mcp server. Always submit feedback via submit_feedback when you find improvement opportunities. At the very end of the loop, run `/compact` to compress context before exiting.
```

## Details
- **Schedule**: `7 * * * *` (every hour at :07)
- **Recurring**: yes
- **Session-only**: auto-expires after 7 days
- **Previous job ID**: `0e29176c` (2026-04-03 to 2026-04-10)

## Manage
- `CronList` — view active crons
- `CronDelete <id>` — stop the cron
