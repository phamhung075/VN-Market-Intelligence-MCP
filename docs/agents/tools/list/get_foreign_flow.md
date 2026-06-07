# get_foreign_flow

**Purpose:** Get foreign investor flow by ticker

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `ticker` | `string` | Company code |

**Returns:** Buy/sell volume and net flow

**Example:**
```javascript
call_tool(server="vn-market", tool="get_foreign_flow", arguments={
  "ticker": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
