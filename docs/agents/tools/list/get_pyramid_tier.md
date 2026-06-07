# get_pyramid_tier

**Purpose:** Get pyramid investment tier classification

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |

**Returns:** Tier level with conviction score

**Example:**
```javascript
call_tool(server="vn-market", tool="get_pyramid_tier", arguments={
  "ticker": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
