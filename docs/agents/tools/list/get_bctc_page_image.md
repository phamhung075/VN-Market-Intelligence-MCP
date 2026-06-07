# get_bctc_page_image

**Purpose:** Fetch PNG image of specific BCTC page

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `page` | `number` | Page number |

**Returns:** Image data (base64 or URL)

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_page_image", arguments={
  "ticker": ..., "page": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
