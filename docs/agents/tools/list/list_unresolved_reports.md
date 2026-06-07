# list_unresolved_reports

**Purpose:** List unresolved Telegram bug reports

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `limit` | `number` | Max results |

**Returns:** Report list with timestamps and severity

**Example:**
```javascript
call_tool(server="vn-market", tool="list_unresolved_reports", arguments={
  "limit": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
