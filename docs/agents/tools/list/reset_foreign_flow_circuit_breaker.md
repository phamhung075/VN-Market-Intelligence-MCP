# reset_foreign_flow_circuit_breaker

**Purpose:** Reset foreign flow circuit breaker (ops)

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `breaker_id` | `string` | Breaker ID |

**Returns:** Reset confirmation and new state

**Example:**
```javascript
call_tool(server="vn-market", tool="reset_foreign_flow_circuit_breaker", arguments={
  "breaker_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
