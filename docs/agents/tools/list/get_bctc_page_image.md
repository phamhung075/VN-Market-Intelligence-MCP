# get_bctc_page_image

**Purpose:** Fetch PNG image of specific BCTC page

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `report_id` | `string` | Financial report ID from financial_reports.id |
| `pages` | `number[]` | Page numbers to retrieve (1-indexed array) |

**Returns:** Image data (base64 or URL)

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_page_image", arguments={
  "report_id": ..., "pages": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
