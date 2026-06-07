# get_bctc_page_text

**Purpose:** Extract text from specific BCTC PDF page

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `page` | `number` | Page number |

**Returns:** Extracted text with OCR confidence

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_page_text", arguments={
  "ticker": ..., "page": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
