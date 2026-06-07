# is_trading_day

**Purpose:** Check if date is a trading day

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `date` | `string` | YYYY-MM-DD |

**Returns:** Boolean true/false and reason if not

**Example:**
```javascript
call_tool(server="vn-market", tool="is_trading_day", arguments={
  "date": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
