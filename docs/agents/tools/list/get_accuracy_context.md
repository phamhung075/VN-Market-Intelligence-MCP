# get_accuracy_context

**Purpose:** Get historical accuracy data for similar past predictions

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `signal_type` | `string` | E.g., price_anomaly |
| `stock_code` | `string` | Ticker |

**Returns:** Historical accuracy metrics and confidence intervals

**Example:**
```javascript
call_tool(server="vn-market", tool="get_accuracy_context", arguments={
  "signal_type": ..., "stock_code": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
