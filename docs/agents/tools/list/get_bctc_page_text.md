# get_bctc_page_text

**Purpose:** Extract text from specific BCTC PDF page

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `report_id` | `string` | Financial report ID from financial_reports.id |
| `page_number` | `number` | 1-indexed page number |

**Returns:** Extracted text with OCR confidence

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_page_text", arguments={
  "report_id": ..., "page_number": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
