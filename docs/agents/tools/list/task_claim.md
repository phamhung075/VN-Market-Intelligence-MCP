# task_claim

**Purpose:** Claim a coordination lock for exclusive work

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `task_id` | `string` | Task ID |
| `task_kind` | `string` | Kind |
| `owner_agent` | `string` | Agent name |
| `ttl_seconds` | `number` | Timeout optional |

**Returns:** Claim result with claimed/stolen status

**Example:**
```javascript
call_tool(server="vn-market", tool="task_claim", arguments={
  "task_id": ..., "task_kind": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
