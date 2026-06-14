# get_patterns

**Purpose:** Get technical price patterns

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| `stockCode` | `string` | Yes | Stock ticker code (e.g. 'VCB') |
| `eventKeyword` | `string` | Yes | Keyword to filter pattern events |

**Returns:** Pattern detection with confidence

**Example:**
```javascript
call_tool(server="vn-market", tool="get_patterns", arguments={
  "stockCode": "VCB", "eventKeyword": "breakout"
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
