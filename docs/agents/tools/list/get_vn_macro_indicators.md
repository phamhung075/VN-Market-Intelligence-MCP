# get_vn_macro_indicators

**Purpose:** Returns Vietnam GSO Index of Industrial Production (IIP) for 4 key sectors: iip_all_industry, iip_manufacturing, iip_mining, iip_electricity.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `period` | `string` | — |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_vn_macro_indicators", arguments={
  "period": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
