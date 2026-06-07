# get_bond_maturity_calendar

**Purpose:** Get bond maturity schedule for sector

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `sector` | `string` | Sector name |

**Returns:** Bond maturity calendar with amounts

**Example:**
```javascript
call_tool(server="vn-market", tool="get_bond_maturity_calendar", arguments={
  "sector": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
