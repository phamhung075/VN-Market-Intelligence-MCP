---
tool: get_vps_service_health
category: system
agents: [ops, system-auditor]
---

# `get_vps_service_health`

**Category:** system | **Used by:** Ops team
**Description:** Real-time health status of all 5 VPS services (vn-price-fetch, vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch, vn-foreign-flow).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| service_name | enum (all, vn-price-fetch, vn-bctc-fetch, vn-news-fetch, vn-sbv-fetch, vn-foreign-flow) | ❌ | all | Filter to a specific service, or 'all' to show all 5 services |

## Returns

Formatted ASCII table showing:
- Service name
- Last poll time (relative: "2 min ago")
- Health status (healthy, unhealthy, unreachable, idle)
- Response time in milliseconds
- VPS uptime (formatted as "Xd Yh Zm")

Summary: counts by status and alert flags for unreachable/unhealthy services.

## Usage

```json
{
  "tool_name": "get_vps_service_health",
  "input": {
    "service_name": "vn-price-fetch"
  }
}
```

## Notes

- Idle is NOT an alert condition (market closed)
- Only unreachable/unhealthy trigger alert notifications
- Shows most recent poll for each service
