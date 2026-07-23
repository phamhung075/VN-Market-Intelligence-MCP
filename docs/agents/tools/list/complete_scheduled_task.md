# complete_scheduled_task

**Purpose:** [PRIVILEGED — cowork-team sweeper only] Mark a scheduled task as fired or done after successful routing.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | `string` | scheduled_tasks.id (UUID) (required) |
| `status` | `enum: fired / done` | Terminal status: 'fired' for MVP success (D1); 'done' reserved Phase-2 (required) |
| `sweep_tick` | `string` | Tick label for audit |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="complete_scheduled_task", arguments={
  "id": ..., "status": ..., "sweep_tick": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
