# get_foreign_room

**Purpose:** Foreign investor room utilization and saturation suite for VN watchlist tickers.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `code` | `string` | Optional stock ticker (e.g. 'VCB'). When omitted, returns data for all watchlist tickers. |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_foreign_room", arguments={
  "code": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
