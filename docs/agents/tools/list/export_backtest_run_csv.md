# export_backtest_run_csv

**Purpose:** Export backtest run results to CSV

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | `string` | Run ID |
| `format` | `string` | csv|json |

**Returns:** File path or data stream

**Example:**
```javascript
call_tool(server="vn-market", tool="export_backtest_run_csv", arguments={
  "run_id": ..., "format": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
