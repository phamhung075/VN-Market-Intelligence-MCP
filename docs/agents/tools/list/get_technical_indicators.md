# get_technical_indicators

**Purpose:** Get technical indicators for stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Stock ticker (e.g. VCB, HPG, FPT) |
| `days` | `number` | Look-back days (default 60, min 35 for MACD) |

**Returns:** Indicator values with signals (RSI, MACD, MA, Bollinger Bands)

**Example:**
```javascript
call_tool(server="vn-market", tool="get_technical_indicators", arguments={
  "code": ..., "days": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
