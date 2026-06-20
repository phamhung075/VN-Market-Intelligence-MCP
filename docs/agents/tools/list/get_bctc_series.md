# get_bctc_series

**Purpose:** Get time series of a financial metric from BCTC

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker code, e.g. VCB |
| `fields` | `string[]` | Metrics to include: pe, pb, roe, debt_to_equity, operating_cf, net_profit, eps, total_assets, net_revenue, equity_total |
| `periods` | `number` | Maximum number of periods to return (default 4, max 20) |

**Returns:** Historical values with dates

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_series", arguments={
  "code": ..., "fields": ..., "periods": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
