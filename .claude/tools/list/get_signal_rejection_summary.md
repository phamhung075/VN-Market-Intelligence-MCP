---
tool: get_signal_rejection_summary
category: system
agents: [architect, ba]
---

# `get_signal_rejection_summary`

**Category:** system | **Used by:** Architect, BA
**Description:** Query signal rejection audit log to detect agent validation failures. Shows rejection counts by agent or detailed records for a specific agent.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| hours | number (positive integer) | ❌ | 24 | Look back N hours (default 24) |
| from_agent | string | ❌ | — | Filter by agent name (optional; if omitted, returns summary for all agents) |

## Returns

When `from_agent` is omitted:
```
Signal rejection summary (last 24h):

  news-scout: 3 rejections
  market-watcher: 1 rejection
```

When `from_agent` is specified:
```
Signal rejection details for 'news-scout' (last 24h, 3 rejections):

[id] timestamp
  Type: signal_type
  Stock: code
  Reason: validation_error
  Payload: JSON preview
```

## Usage

```json
{
  "tool_name": "get_signal_rejection_summary",
  "input": {
    "hours": 24,
    "from_agent": "news-scout"
  }
}
```

## Notes

- Use to identify prompt bugs (e.g., "News Scout always omits event_type")
- Shows validation failures and schema mismatches
- Detailed records include signal type, stock code, and validation reason
- Payload preview truncated for readability
