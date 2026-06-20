# get_company_profile

**Purpose:** Fetch company profile and sector classification

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker, e.g. 'FPT' or 'VNM' |

**Returns:** Company metadata, sector, market cap

**Example:**
```javascript
call_tool(server="vn-market", tool="get_company_profile", arguments={
  "code": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
