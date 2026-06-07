# compute_accruals

**Purpose:** Compute accruals-based quality metrics for a stock

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `fiscal_year` | `number` | Year |

**Returns:** Accruals ratio and quality score

**Example:**
```javascript
call_tool(server="vn-market", tool="compute_accruals", arguments={
  "ticker": ..., "fiscal_year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
