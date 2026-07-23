# expire_scheduled_task

**Purpose:** [PRIVILEGED — cowork-team sweeper only] Mark a scheduled task as expired (deadline_at past).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `id` | `string` | scheduled_tasks.id (UUID) (required) |
| `sweep_tick` | `string` | Tick label for audit |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="expire_scheduled_task", arguments={
  "id": ..., "sweep_tick": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
