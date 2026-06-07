# get_cash_flow

**Purpose:** Get cash flow statement analysis

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |
| `year` | `number` | Fiscal year |

**Returns:** Operating, investing, financing cash flows

**Example:**
```javascript
call_tool(server="vn-market", tool="get_cash_flow", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
