# get_earnings_calendar

**Purpose:** Get earnings release calendar

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `days_ahead` | `number` | Next N days |

**Returns:** Earnings schedule by date and company

**Example:**
```javascript
call_tool(server="vn-market", tool="get_earnings_calendar", arguments={
  "days_ahead": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
