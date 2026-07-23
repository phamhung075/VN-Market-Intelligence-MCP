# claim_due_scheduled_tasks

**Purpose:** [PRIVILEGED — cowork-team sweeper only] Atomic pending→firing claim for all due rows.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sweep_tick` | `string` | Tick label for audit (e.g. '2026-07-30T18:15Z') |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="claim_due_scheduled_tasks", arguments={
  "sweep_tick": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
