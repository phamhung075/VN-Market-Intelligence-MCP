# get_hexagram_history

**Purpose:** Get past hexagram readings for a stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `limit` | `number` | Max results |

**Returns:** Historical readings with dates and prices

**Example:**
```javascript
call_tool(server="vn-market", tool="get_hexagram_history", arguments={
  "ticker": ..., "limit": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
