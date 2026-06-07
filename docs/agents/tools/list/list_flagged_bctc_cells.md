# list_flagged_bctc_cells

**Purpose:** List BCTC cells flagged for human review (bctc-analyst)

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `limit` | `number` | Max results |

**Returns:** Flagged cell list with flags and original values

**Example:**
```javascript
call_tool(server="vn-market", tool="list_flagged_bctc_cells", arguments={
  "ticker": ..., "limit": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
