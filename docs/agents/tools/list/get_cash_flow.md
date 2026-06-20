# get_cash_flow

**Purpose:** Get cash flow statement analysis

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | VN stock ticker (e.g. VCB, FPT). Case-insensitive |
| `period` | `string` | Quarter: Q1–Q4. Omit for latest |
| `year` | `number` | Fiscal year (e.g. 2025). Omit for latest |
| `quarters` | `number` | Return latest N quarters as a series (1–20). Ignored when period/year are supplied |

**Returns:** Operating, investing, financing cash flows

**Example:**
```javascript
call_tool(server="vn-market", tool="get_cash_flow", arguments={
  "ticker": ..., "year": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
