# create_prediction_claim

**Purpose:** File a new prediction claim for macro event

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `event` | `string` | Event description |
| `target_date` | `string` | YYYY-MM-DD |
| `confidence` | `number` | 0-1 |

**Returns:** Claim ID and tracking record

**Example:**
```javascript
call_tool(server="vn-market", tool="create_prediction_claim", arguments={
  "event": ..., "target_date": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
