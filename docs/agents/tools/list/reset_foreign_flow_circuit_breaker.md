# reset_foreign_flow_circuit_breaker

**Purpose:** Ops/debug tool — manually reset the foreign flow circuit breaker to closed state. Only call AFTER OPS has confirmed the underlying issue is fixed (e.g., VPS endpoint responding and pipeline healthy). Idempotent — safe to call multiple times.

**Parameters:** None — no parameters required.

**Returns:** Confirmation text: either "Reset complete. State: closed." (was open/half-open) or "Circuit is already closed (healthy). No action needed." (was already closed).

**Example:**
```javascript
call_tool(server="vn-market", tool="reset_foreign_flow_circuit_breaker", arguments={})
```

**See also:** `diagnose_foreign_flow_circuit_breaker` (sibling tool) | `docs/standards/mcp-tools.md` — MCP Gateway pattern
