# task_force_release_orphan

**Purpose:** Force release a stuck coordination lock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | `string` | Task ID |

**Returns:** Release confirmation

**Example:**
```javascript
call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
  "task_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
