# get_price_history

**Purpose:** Get historical price data

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `days` | `number` | Days back |

**Returns:** OHLCV data with technical indicators

**Example:**
```javascript
call_tool(server="vn-market", tool="get_price_history", arguments={
  "ticker": ..., "days": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
