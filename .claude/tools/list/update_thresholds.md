---
tool: update_thresholds
category: system
agents: [market-watcher]
---

# `update_thresholds`

**Category:** system | **Used by:** Market Watcher
**Description:** Update the alert thresholds for a specific stock in the watchlist. Only the supplied threshold fields are changed; omitted fields keep their current values.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| actionCode | string (2-10 chars, uppercase) | ✅ | — | Stock ticker code to update |
| thresholds | object | ✅ | — | New threshold values to apply (dropPct, risePct, impactScore) |

Thresholds object (all optional):
- `dropPct` (number -100 to 0): alert when price drops
- `risePct` (number 0 to 100): alert when price rises
- `impactScore` (number 0 to 10): minimum AI impact score

## Returns

```
VCB thresholds updated: drop -5% | rise +8% | impact >= 8/10
```

Or if not found:

```
VCB not found in watchlist.
```

Or if no fields provided:

```
No threshold fields provided — nothing to update.
```

## Usage

```json
{
  "tool_name": "update_thresholds",
  "input": {
    "actionCode": "VCB",
    "thresholds": {
      "dropPct": -5,
      "impactScore": 8
    }
  }
}
```

## Notes

- Only changes the fields you specify
- Omitted fields retain their current values (partial update)
- Stock must exist in watchlist to update
