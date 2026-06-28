# task_claim

**Purpose:** Claim a coordination lock for exclusive work

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `task_id` | `string` | yes | Task ID |
| `task_kind` | `string` | yes | Kind |
| `owner_agent` | `string` | yes | Agent name |
| `owner_client_session` | `string` | **YES** | `$CLAUDE_CODE_SESSION_ID` — sole ownership key (TASK_1980 P1-FINAL) |
| `ttl_seconds` | `number` | no | Timeout |

**Returns:** Claim result with claimed/stolen status

**Example:**
```javascript
call_tool(server="vn-market", tool="task_claim", arguments={
  "task_id": ..., "task_kind": ..., "owner_agent": ...,
  "owner_client_session": $CLAUDE_CODE_SESSION_ID
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
