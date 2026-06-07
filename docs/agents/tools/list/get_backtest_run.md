# get_backtest_run

**Purpose:** Fetch detailed results from a specific backtest run

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | `string` | Run ID |

**Returns:** Run details with trade list and performance metrics

**Example:**
```javascript
call_tool(server="vn-market", tool="get_backtest_run", arguments={
  "run_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
