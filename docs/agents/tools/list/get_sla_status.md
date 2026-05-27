---
tool: get_sla_status
category: system
agents: [system-auditor, ops]
---

# `get_sla_status`

**Category:** system | **Used by:** System Auditor, Ops
**Description:** Data freshness SLA status for all 5 signal sources (price, bctc, news, sbv_fx, foreign_flow).

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| signal_type | enum (all, price, bctc, news, sbv_fx, foreign_flow) | ❌ | all | Filter to a specific signal type, or 'all' to show all 5 types |

## Returns

Formatted ASCII table showing:
- Signal type (price, bctc, news, sbv_fx, foreign_flow)
- Current data age in minutes
- SLA threshold in minutes (varies by market hours)
- Status (ok or breached)
- Severity (-, HIGH, CRITICAL)

Severity: CRITICAL = age > 1.5x threshold; HIGH = age > threshold.

## Usage

```json
{
  "tool_name": "get_sla_status",
  "input": {
    "signal_type": "price"
  }
}
```

## Notes

- Thresholds adjust based on market hours (market-hours thresholds stricter than off-hours)
- VN market hours: 09:00-15:00 VN time = 02:00-08:59 UTC, Monday-Friday
- Severity determined by ratio of age to threshold
