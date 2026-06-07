# get_bctc_ocf

**Purpose:** Get operating cash flow from BCTC

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `year` | `number` | Fiscal year |

**Returns:** Operating cash flow and trend

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_ocf", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
