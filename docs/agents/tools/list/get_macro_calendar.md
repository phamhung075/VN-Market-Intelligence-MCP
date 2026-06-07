# get_macro_calendar

**Purpose:** Get economic calendar with scheduled releases

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `days_ahead` | `number` | Next N days |

**Returns:** Calendar events with forecast and actual

**Example:**
```javascript
call_tool(server="vn-market", tool="get_macro_calendar", arguments={
  "days_ahead": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
