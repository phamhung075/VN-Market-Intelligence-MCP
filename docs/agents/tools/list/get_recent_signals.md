# get_recent_signals

**Purpose:** Query ALL producers' signals committed in the last window_seconds seconds.

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `window_seconds` | `integer` | Look-back window in seconds (default 900 = 15 minutes). Use 900 for the standard sibling dedup / corroboration window. (default: 900) |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_recent_signals", arguments={
  "window_seconds": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
