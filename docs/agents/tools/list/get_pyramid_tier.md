# get_pyramid_tier

**Purpose:** Get pyramid investment tier classification

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `asset_class` | `string` | Asset class to classify (e.g. 'VN equity', 'crypto', 'gold', 'government bond') |

**Returns:** Tier level with conviction score

**Example:**
```javascript
call_tool(server="vn-market", tool="get_pyramid_tier", arguments={
  "asset_class": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
