# get_vn_bop

**Purpose:** Returns Vietnam Balance of Payments (BOP) data from the State Bank of Vietnam (SBV).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `quarter_end` | `string` | — |
| `quarter_start` | `string` | — |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_vn_bop", arguments={
  "quarter_end": ..., "quarter_start": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
