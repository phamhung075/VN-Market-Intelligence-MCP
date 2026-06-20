# get_market_cap

**Purpose:** Get market capitalization for stock or sector

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker, e.g. 'VNM' or 'FPT' |

**Returns:** Market cap with ranking and percent of total

**Example:**
```javascript
call_tool(server="vn-market", tool="get_market_cap", arguments={
  "code": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
