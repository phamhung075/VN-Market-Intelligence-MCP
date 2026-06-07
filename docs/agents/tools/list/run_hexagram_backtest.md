# run_hexagram_backtest

**Purpose:** Backtest hexagram reading accuracy

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `start_date` | `string` | YYYY-MM-DD |

**Returns:** Hit rate and confidence breakdown

**Example:**
```javascript
call_tool(server="vn-market", tool="run_hexagram_backtest", arguments={
  "start_date": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
