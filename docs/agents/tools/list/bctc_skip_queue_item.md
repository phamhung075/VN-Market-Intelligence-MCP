# bctc_skip_queue_item

**Purpose:** Skip a BCTC item in processing queue

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `item_id` | `string` | Queue item ID |
| `reason` | `string` | Skip reason |

**Returns:** Confirmation of skip

**Example:**
```javascript
call_tool(server="vn-market", tool="bctc_skip_queue_item", arguments={
  "item_id": ..., "reason": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
