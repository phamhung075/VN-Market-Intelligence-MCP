# delete_backtest_run

**Purpose:** Delete a completed backtest run

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `run_id` | `string` | Run ID |

**Returns:** Confirmation of deletion

**Example:**
```javascript
call_tool(server="vn-market", tool="delete_backtest_run", arguments={
  "run_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
