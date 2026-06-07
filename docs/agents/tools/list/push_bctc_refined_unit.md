# push_bctc_refined_unit

**Purpose:** Push a single refined BCTC unit to storage

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `batch_id` | `string` | Batch ID |
| `cell_data` | `object` | Refined cell |

**Returns:** Push confirmation and validation

**Example:**
```javascript
call_tool(server="vn-market", tool="push_bctc_refined_unit", arguments={
  "batch_id": ..., "cell_data": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
