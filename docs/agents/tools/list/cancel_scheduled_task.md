# cancel_scheduled_task

**Purpose:** Cancel a pending or firing scheduled task by id or dedup_key.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `dedup_key` | `string` | Alternative lookup by dedup_key |
| `id` | `string` | scheduled_tasks.id (UUID) |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="cancel_scheduled_task", arguments={
  "dedup_key": ..., "id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
