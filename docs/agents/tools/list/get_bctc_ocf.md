# get_bctc_ocf

**Purpose:** Get operating cash flow from BCTC

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | VN stock ticker (e.g. VCB, FPT). Case-insensitive |
| `period_year` | `number` | Fiscal year (e.g. 2025) |
| `period_quarter` | `number` | Quarter (1–4) |

**Returns:** Operating cash flow and trend

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_ocf", arguments={
  "code": ..., "period_year": ..., "period_quarter": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
