# run_bctc_batch_sweep

**Purpose:** Run batch processing on BCTC queue

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `batch_size` | `number` | Items to process |

**Returns:** Count processed and errors

**Example:**
```javascript
call_tool(server="vn-market", tool="run_bctc_batch_sweep", arguments={
  "batch_size": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
