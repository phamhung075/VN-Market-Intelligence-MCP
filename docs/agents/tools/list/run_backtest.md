# run_backtest

**Purpose:** Run a backtest on a trading strategy

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `strategy_name` | `string` | Strategy ID |
| `start_date` | `string` | YYYY-MM-DD |
| `end_date` | `string` | YYYY-MM-DD |

**Returns:** Run ID and initial results

**Example:**
```javascript
call_tool(server="vn-market", tool="run_backtest", arguments={
  "strategy_name": ..., "start_date": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
