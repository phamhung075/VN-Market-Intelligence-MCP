# get_correlation_matrix

**Purpose:** Get sector correlation matrix

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sector` | `string` | Sector name optional |

**Returns:** Correlation matrix and cluster analysis

**Example:**
```javascript
call_tool(server="vn-market", tool="get_correlation_matrix", arguments={
  "sector": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
