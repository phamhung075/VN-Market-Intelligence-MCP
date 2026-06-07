# expire_monitoring_reports

**Purpose:** Archive old monitoring reports

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `days_old` | `number` | Delete older than N days |

**Returns:** Count of archived reports

**Example:**
```javascript
call_tool(server="vn-market", tool="expire_monitoring_reports", arguments={
  "days_old": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
