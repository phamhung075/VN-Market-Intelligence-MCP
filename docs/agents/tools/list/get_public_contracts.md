# get_public_contracts

**Purpose:** Get public government contract data (tran-ngoc-bau)

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sector` | `string` | Sector filter optional |

**Returns:** Contract list with amounts and agencies

**Example:**
```javascript
call_tool(server="vn-market", tool="get_public_contracts", arguments={
  "sector": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
