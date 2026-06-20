# get_bctc_refined

**Purpose:** Fetch refined/validated BCTC data

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `report_id` | `string` | Financial report ID from financial_reports.id |

**Returns:** Validated financial data

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_refined", arguments={
  "report_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
