# get_bctc_full

**Purpose:** Fetch complete BCTC (financial statements) for a stock

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `code` | `string` | Yes | Stock ticker code (e.g. 'VCB') |
| `year` | `number` | No | Fiscal year filter |

**Returns:** BCTC data with balance sheet, income, cash flow

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_full", arguments={
  "code": "VCB", "year": 2025
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
