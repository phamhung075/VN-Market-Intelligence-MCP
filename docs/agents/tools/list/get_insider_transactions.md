# get_insider_transactions

**Purpose:** Get insider buy/sell transactions

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `limit` | `number` | Max results |

**Returns:** Transaction list with prices and dates

**Example:**
```javascript
call_tool(server="vn-market", tool="get_insider_transactions", arguments={
  "ticker": ..., "limit": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
