# get_prediction_markets

**Purpose:** Get prediction market quotes and odds

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `event` | `string` | Event name optional |

**Returns:** Market quotes with implied probabilities

**Example:**
```javascript
call_tool(server="vn-market", tool="get_prediction_markets", arguments={
  "event": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
