# diagnose_foreign_flow_circuit_breaker

**Purpose:** Diagnose circuit breaker trip reason

**Parameters:**
| Name | Type | Description |
|------|------|-------------|
| `breaker_id` | `string` | Breaker identifier |

**Returns:** Diagnostic report with error logs

**Example:**
```javascript
call_tool(server="vn-market", tool="diagnose_foreign_flow_circuit_breaker", arguments={
  "breaker_id": ...
})
```

**See also:** `docs/standards/mcp-tools.md` — MCP Gateway pattern
