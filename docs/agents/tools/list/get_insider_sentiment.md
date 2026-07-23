# get_insider_sentiment

**Purpose:** Insider transaction net sentiment suite for VN watchlist tickers.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker (e.g. 'FPT'). When omitted, returns market-wide aggregate across all watchlist tickers. |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_insider_sentiment", arguments={
  "code": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
