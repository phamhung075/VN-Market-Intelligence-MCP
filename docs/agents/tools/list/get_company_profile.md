# get_company_profile

**Purpose:** Fetch company profile and sector classification

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |

**Returns:** Company metadata, sector, market cap

**Example:**
```javascript
call_tool(server="vn-market", tool="get_company_profile", arguments={
  "ticker": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
