# read_bctc_pdf

**Purpose:** Read raw PDF file data for BCTC

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `year` | `number` | Fiscal year |

**Returns:** PDF file content (binary)

**Example:**
```javascript
call_tool(server="vn-market", tool="read_bctc_pdf", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
