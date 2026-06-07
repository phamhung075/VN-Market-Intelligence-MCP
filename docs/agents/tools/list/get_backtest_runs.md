# get_backtest_runs

**Purpose:** List all backtest runs with filter options

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `limit` | `number` | Max results |
| `status` | `string` | completed|running|failed |

**Returns:** Array of backtest run summaries

**Example:**
```javascript
call_tool(server="vn-market", tool="get_backtest_runs", arguments={
  "limit": ..., "status": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
