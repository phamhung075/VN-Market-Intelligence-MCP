# fail_scheduled_task

**Purpose:** [PRIVILEGED — cowork-team sweeper only] Mark a scheduled task as failed after routing error.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `error` | `string` | Error message from routing failure (required) |
| `id` | `string` | scheduled_tasks.id (UUID) (required) |
| `sweep_tick` | `string` | Tick label for audit |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="fail_scheduled_task", arguments={
  "error": ..., "id": ..., "sweep_tick": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
