# get_bctc_full

**Purpose:** Fetch complete BCTC (financial statements) for a stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `year` | `number` | Fiscal year |

**Returns:** BCTC data with balance sheet, income, cash flow

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_full", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
