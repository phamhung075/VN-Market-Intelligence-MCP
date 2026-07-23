# list_scheduled_tasks

**Purpose:** List and audit scheduled tasks.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `due_before` | `integer` | Filter: fire_at <= due_before (epoch-seconds UTC) |
| `limit` | `integer` | Max rows to return (default 50, max 500) (default: 50) |
| `status` | `enum: pending / firing / fired / done / failed / expired / cancelled` | Filter by status |
| `team` | `enum: COWORK / DEV` | Filter by team |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="list_scheduled_tasks", arguments={
  "due_before": ..., "limit": ..., "status": ..., "team": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
