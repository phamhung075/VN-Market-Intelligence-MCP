# task_release

**Purpose:** Release a coordination lock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | `string` | Task ID |

**Returns:** Release confirmation

**Example:**
```javascript
call_tool(server="vn-market", tool="task_release", arguments={
  "task_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
