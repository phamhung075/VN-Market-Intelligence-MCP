# delete_price_alert

**Purpose:** Remove a price-based alert rule

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `alert_id` | `string` | Alert rule ID |

**Returns:** Confirmation of deletion

**Example:**
```javascript
call_tool(server="vn-market", tool="delete_price_alert", arguments={
  "alert_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
