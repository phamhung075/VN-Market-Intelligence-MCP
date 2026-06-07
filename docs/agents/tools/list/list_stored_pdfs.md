# list_stored_pdfs

**Purpose:** List stored BCTC PDF files

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code optional |

**Returns:** PDF list with sizes and parse status

**Example:**
```javascript
call_tool(server="vn-market", tool="list_stored_pdfs", arguments={
  "ticker": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
