# get_cpi_components

**Purpose:** Returns Vietnam CPI component breakdown from the NSO (General Statistics Office).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `period` | `string` | — |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_cpi_components", arguments={
  "period": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
