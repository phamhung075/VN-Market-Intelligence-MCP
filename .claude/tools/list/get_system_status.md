---
tool: get_system_status
category: system
agents: [unified-agent, dev-team-cron]
---

# `get_system_status`

**Category:** system | **Used by:** Unified Coordinator, Dev Team Cron
**Description:** Full system diagnostic merged from four separate tools — DB status, source health, data freshness, and recent errors in a single call.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| includeErrors | boolean | ❌ | true | Include recent WARN/ERROR log lines section (default: true) |
| errorLines | number (1-200) | ❌ | 10 | Number of WARN/ERROR log lines to include when includeErrors=true (default: 10) |

## Returns

Plain-text formatted report with labeled sections:
- **VN TRADING WINDOW** — Market hours indicator
- **DB STATUS** — Circuit breaker state, WAL size, alert stats, Telegram env, audit status, auto-tracked indicators, threshold readiness
- **SOURCE HEALTH** — Per-source ok/degraded/down status
- **DATA FRESHNESS** — Per-table staleness from SQLite
- **RECENT ERRORS** — Last N WARN/ERROR lines from global log (optional)

## Usage

```json
{
  "tool_name": "get_system_status",
  "input": {
    "includeErrors": true,
    "errorLines": 20
  }
}
```

## Notes

- Replaces merged tools: get_system_health, get_source_health, get_data_freshness, get_error_summary
- Includes VN trading window banner to distinguish "expected empty" from "broken feed"
- Circuit breaker status shows closed/open/half-open state
- Threshold readiness shows σ data point counts (need 30 for anomaly detection)
