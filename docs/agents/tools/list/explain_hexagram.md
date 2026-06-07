# explain_hexagram

**Purpose:** Get narrative explanation of a hexagram reading

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `hexagram_number` | `number` | 1-64 |
| `context` | `string` | Stock context optional |

**Returns:** Explanation text and interpretation

**Example:**
```javascript
call_tool(server="vn-market", tool="explain_hexagram", arguments={
  "hexagram_number": ..., "context": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
