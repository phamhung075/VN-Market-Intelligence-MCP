# get_bctc_series

**Purpose:** Get time series of a financial metric from BCTC

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `metric` | `string` | E.g., revenue, net_income |

**Returns:** Historical values with dates

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_series", arguments={
  "ticker": ..., "metric": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
