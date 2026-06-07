# get_kinhdich_reading

**Purpose:** Get Kinh Dich hexagram reading for a stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock code (not ticker) |
| `context` | `string` | Optional context |

**Returns:** Hexagram number and interpretation

**Example:**
```javascript
call_tool(server="vn-market", tool="get_kinhdich_reading", arguments={
  "code": ..., "context": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
