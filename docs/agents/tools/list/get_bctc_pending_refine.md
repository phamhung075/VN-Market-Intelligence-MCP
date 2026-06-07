# get_bctc_pending_refine

**Purpose:** List BCTC items pending human refinement

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `limit` | `number` | Max results |

**Returns:** Queue of pending refinements with flags

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bctc_pending_refine", arguments={
  "limit": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
