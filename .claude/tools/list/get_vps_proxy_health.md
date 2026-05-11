---
tool: get_vps_proxy_health
category: system
agents: [ops, system-auditor, dev-team-cron]
---

# `get_vps_proxy_health`

**Category:** system | **Used by:** Ops, System Auditor, Dev Team Cron
**Description:** Shows health status of all 4 VPS proxy services (prices, news, sbv, bctc). Displays last push timestamp, item counts, error rates, and staleness warnings.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| service | enum (all, prices, news, sbv, bctc) | ❌ | all | Filter to a specific service, or 'all' (default) |

## Returns

Formatted ASCII table showing:
- Service name (prices, news, sbv, bctc)
- Last push timestamp (ISO 8601)
- Item count in last push
- Status (success, error, etc.)
- 24h push count and error count
- Stale flag (YES/no)

Plus recent push log (last 10 entries) with duration and error messages.

## Usage

```json
{
  "tool_name": "get_vps_proxy_health",
  "input": {
    "service": "prices"
  }
}
```

## Notes

- Expected intervals: prices (5min), news (10min), sbv (60min), bctc (720min)
- Stale alert triggers when age > expected interval
- Shows 24h push counts and error rates
- Recent log appended at bottom with response times
