# get_insider_transactions

**Purpose:** Get insider buy/sell transactions

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker, e.g. 'VNM'. Optional — omit to return all watchlist stocks |
| `days` | `number` | Lookback window in days (1–180). Default 30 |
| `type` | `string` | Transaction type filter: 'buy', 'sell', or 'all' (default 'all') |

**Returns:** Transaction list with prices and dates

**Example:**
```javascript
call_tool(server="vn-market", tool="get_insider_transactions", arguments={
  "code": ..., "days": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
