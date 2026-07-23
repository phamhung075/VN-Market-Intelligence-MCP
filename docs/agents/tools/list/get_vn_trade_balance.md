# get_vn_trade_balance

**Purpose:** Returns Vietnam monthly trade balance data from the NSO (General Statistics Office).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `period` | `string` | — |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_vn_trade_balance", arguments={
  "period": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
