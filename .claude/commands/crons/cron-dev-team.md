Create dev-team cron with CronCreate:

- **cron**: `7 * * * *` (every hour at :07)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Read and execute docs/agents/dev-team/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Weekly Zone-Scan Cadence

Each dev-* specialist runs `docs/agents/developer/flow/zone-scan.md` once per week (Sunday UTC, staggered by 15 min per service to avoid concurrent signal flood). Triggers are declared in each agent's flow catalog. PO batches findings from `zone_health_report` signals into one sprint review per week via `triage-signals.md`.

| Agent | Sunday UTC |
|---|---|
| dev-mcp-server | 03:00 |
| dev-api-gateway | 03:15 |
| dev-stock-price | 03:30 |
| dev-technical-analysis | 03:45 |
| dev-macro-indicators | 04:00 |
| dev-kinh-dich | 04:15 |
| dev-alert-engine | 04:30 |
| dev-pdf-extractor | 04:45 |
| dev-rag-service | 05:00 |

## Manage
`CronList` | `CronDelete <id>`
