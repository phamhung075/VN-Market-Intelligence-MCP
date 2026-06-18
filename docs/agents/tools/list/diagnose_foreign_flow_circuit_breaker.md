# diagnose_foreign_flow_circuit_breaker

**Purpose:** Ops/debug tool — query the foreign flow circuit breaker state. Returns current status (closed/open/half-open), failure count, success count, last failure timestamp, and reset timeout configuration. Use when foreign flow data stops ingesting (pipeline incident diagnosis).

**Parameters:** None — no parameters required.

**Returns:** Diagnostic text report with breaker state, consecutive failure count (threshold: 5), total successes, last failure timestamp, and estimated auto-reset time remaining (only when open).

**Example:**
```javascript
call_tool(server="vn-market", tool="diagnose_foreign_flow_circuit_breaker", arguments={})
```

**See also:** `reset_foreign_flow_circuit_breaker` (sibling tool) | `docs/standards/mcp-tools.md` — MCP Gateway pattern
