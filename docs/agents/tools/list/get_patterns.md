# get_patterns

**Purpose:** Get technical price patterns

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `pattern_type` | `string` | head_shoulders|triangle|wedge |

**Returns:** Pattern detection with confidence

**Example:**
```javascript
call_tool(server="vn-market", tool="get_patterns", arguments={
  "ticker": ..., "pattern_type": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
