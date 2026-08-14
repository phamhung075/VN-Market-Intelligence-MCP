# task_list_held

**Purpose:** List all held coordination locks

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `kind` | `string` | Filter by kind optional |
| `owner_agent` | `string` | Filter by agent optional |
| `expired` | `boolean` | Filter by expiry state, optional. `true` = only stale locks (`expires_at < now`); `false` = only active locks; omit = return all. |

**Returns:** Array of held locks with metadata

**Example:**
```javascript
call_tool(server="vn-market", tool="task_list_held", arguments={
  "kind": ..., "owner_agent": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
