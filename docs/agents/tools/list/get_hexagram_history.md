# get_hexagram_history

**Purpose:** Get past hexagram readings for a stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker code (e.g. "VCB") |
| `days` | `number` | Number of past days to retrieve (default 30, max 365) |

**Returns:** Historical readings with dates and prices

**Example:**
```javascript
call_tool(server="vn-market", tool="get_hexagram_history", arguments={
  "code": ..., "days": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
