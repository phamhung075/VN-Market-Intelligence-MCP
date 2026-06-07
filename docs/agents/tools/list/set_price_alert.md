# set_price_alert

**Purpose:** Create a price-based alert rule

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `price_level` | `number` | Alert price |
| `direction` | `string` | above|below |

**Returns:** Alert rule ID and confirmation

**Example:**
```javascript
call_tool(server="vn-market", tool="set_price_alert", arguments={
  "ticker": ..., "price_level": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
