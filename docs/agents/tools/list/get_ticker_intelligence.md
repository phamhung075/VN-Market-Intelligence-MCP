# get_ticker_intelligence

**Purpose:** Get compiled intelligence on a ticker

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker symbol, e.g. VCB, FPT, HPG. Case-insensitive |

**Returns:** Multi-aspect summary: movers, sentiment, risk

**Example:**
```javascript
call_tool(server="vn-market", tool="get_ticker_intelligence", arguments={
  "code": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
