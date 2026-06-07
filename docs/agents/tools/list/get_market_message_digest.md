# get_market_message_digest

**Purpose:** Get digest of market messages from other agents

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `limit` | `number` | Max messages |

**Returns:** Message summaries with sources

**Example:**
```javascript
call_tool(server="vn-market", tool="get_market_message_digest", arguments={
  "limit": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
