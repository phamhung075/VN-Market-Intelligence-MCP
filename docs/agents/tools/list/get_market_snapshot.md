# get_market_snapshot

**Purpose:** Get real-time market snapshot

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `codes` | `string[]` | Ticker codes optional |

**Returns:** Prices, volumes, technical status

**Example:**
```javascript
call_tool(server="vn-market", tool="get_market_snapshot", arguments={
  "codes": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
