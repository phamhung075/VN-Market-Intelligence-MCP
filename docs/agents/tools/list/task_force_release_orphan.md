# task_force_release_orphan

**Purpose:** Force release a stuck coordination lock (orphan-only; heartbeat_age check enforced)

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | `string` | yes | Task ID |
| `owner_client_session` | `string` | **YES** | `$CLAUDE_CODE_SESSION_ID` — sole ownership key (TASK_1980 P1-FINAL) |

**Returns:** Release confirmation

**Example:**
```javascript
call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
  "task_id": ...,
  "owner_client_session": $CLAUDE_CODE_SESSION_ID
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
