---
tool: mark_alert_read
category: alerts
agents: [alert-commander, unified-agent]
---

# `mark_alert_read`

**Category:** alerts | **Used by:** Alert Commander, Unified Coordinator
**Description:** Mark one specific alert (by ID) or all unread alerts as read. Optionally attach a personal note to a specific alert.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| alertId | string | ❌ | — | ID of the specific alert to mark as read. If omitted, ALL unread alerts are marked as read. |
| note | string (≤500 chars) | ❌ | — | Optional personal note / reaction to attach to this alert |

## Returns

```
Marked 5 alerts as read.
```

Or when marking a specific alert with note:

```
Marked 1 alert as read. Note saved.
```

## Usage

```json
{
  "tool_name": "mark_alert_read",
  "input": {
    "alertId": "abc123",
    "note": "False positive — VCB price dip was intra-day noise"
  }
}
```

Or mark all unread:

```json
{
  "tool_name": "mark_alert_read",
  "input": {}
}
```

## Notes

- Omit alertId to mark ALL unread alerts as read
- Notes can be analysis, rationale, or follow-up action
- Returns count of alerts marked
