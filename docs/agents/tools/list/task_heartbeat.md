# task_heartbeat

**Purpose:** Renew a held coordination lock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | `string` | Task ID |

**Returns:** Renewal confirmation and new expiry

**Example:**
```javascript
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  "task_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
