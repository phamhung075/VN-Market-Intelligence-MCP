# compare_backtest_runs

**Purpose:** Compare performance metrics across multiple backtest runs

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_ids` | `string[]` | Run IDs to compare |

**Returns:** Comparison table with win rates and Sharpe ratios

**Example:**
```javascript
call_tool(server="vn-market", tool="compare_backtest_runs", arguments={
  "run_ids": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
