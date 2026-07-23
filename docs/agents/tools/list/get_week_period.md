# get_week_period

**Purpose:** Return the ISO-8601 week period for a given UTC instant (defaults to now).

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `iso_timestamp` | `string` | UTC timestamp in ISO-8601 format (e.g. '2026-06-14T13:47:00Z'). Defaults to the current server time. Inject a fixed timestamp in tests for deterministic results. |

**Returns:** Not itemized separately in the live tool description — call the tool to see the returned shape.

**Example:**
```javascript
call_tool(server="vn-market", tool="get_week_period", arguments={
  "iso_timestamp": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
