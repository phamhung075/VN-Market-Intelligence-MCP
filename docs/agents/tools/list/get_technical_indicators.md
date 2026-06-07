# get_technical_indicators

**Purpose:** Get technical indicators for stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `indicators` | `string[]` | E.g., RSI, MACD |

**Returns:** Indicator values with signals

**Example:**
```javascript
call_tool(server="vn-market", tool="get_technical_indicators", arguments={
  "ticker": ..., "indicators": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
