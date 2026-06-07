# get_agm_plan

**Purpose:** Get Annual General Meeting schedule and voting agenda

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |

**Returns:** Meeting schedule with voting items and dates

**Example:**
```javascript
call_tool(server="vn-market", tool="get_agm_plan", arguments={
  "ticker": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
