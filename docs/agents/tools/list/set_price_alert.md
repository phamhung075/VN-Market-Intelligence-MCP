# set_price_alert

**Purpose:** Create a price-based alert rule

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker code, e.g. 'VCB'. Must exist in the watchlist |
| `price_level` | `number` | Price level in VND that triggers the alert |
| `direction` | `string` | 'stop_loss' (fires when price drops to/below threshold) or 'take_profit' |

**Returns:** Alert rule ID and confirmation

**Example:**
```javascript
call_tool(server="vn-market", tool="set_price_alert", arguments={
  "code": ..., "price_level": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
