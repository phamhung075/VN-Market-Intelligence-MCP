# finalize_bctc_refine

**Purpose:** Mark BCTC refinement as complete and publish

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `batch_id` | `string` | Refinement batch ID |

**Returns:** Published count and validation status

**Example:**
```javascript
call_tool(server="vn-market", tool="finalize_bctc_refine", arguments={
  "batch_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
