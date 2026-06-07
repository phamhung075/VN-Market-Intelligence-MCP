# mark_alert_outcome

**Purpose:** Mark alert outcome after firing/suppression (ops/alert-commander)

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `alert_id` | `string` | Alert ID |
| `outcome` | `string` | fired|suppressed |

**Returns:** Confirmation and status

**Example:**
```javascript
call_tool(server="vn-market", tool="mark_alert_outcome", arguments={
  "alert_id": ..., "outcome": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
