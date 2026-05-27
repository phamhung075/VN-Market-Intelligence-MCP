---
tool: remove_from_watchlist
category: system
agents: [market-watcher]
---

# `remove_from_watchlist`

**Category:** system | **Used by:** Market Watcher
**Description:** Remove a stock from the watchlist by its ticker code.

## Parameters

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| actionCode | string (2-10 chars, uppercase) | ✅ | — | Stock ticker code to remove |

## Returns

```
VCB removed from watchlist.
```

Or if not found:

```
VCB was not found in the watchlist.
```

## Usage

```json
{
  "tool_name": "remove_from_watchlist",
  "input": {
    "actionCode": "VCB"
  }
}
```

## Notes

- Returns number of rows deleted (0 = not found, 1 = removed)
- Cannot undo deletion through MCP (use add_to_watchlist to re-add)
