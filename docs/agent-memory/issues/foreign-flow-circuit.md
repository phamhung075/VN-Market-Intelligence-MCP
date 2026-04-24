---
agents: ops, developer
trigger: foreign-flow, circuit-breaker, vps-push-errors
---

# Foreign-flow circuit breaker HALF-OPEN — VPS endpoint errors

**Status**: DEGRADED (secondary issue, does not block price intelligence)  
**Severity**: Medium  
**First Detected**: 2026-04-24 12:05 (VN time, reported by news-scout)  
**Updated**: 2026-04-24 05:25 UTC (ops investigation)  

---

## Symptom

Foreign-flow job continuously failing since 2026-04-24:
- Circuit breaker stuck in HALF-OPEN state (every 60s retry)
- MCP server error log: `[foreign-flow-job] fallback activated ... cbState: half-open`
- Failure count: 365+
- Last successful foreign-flow data: Unknown

## Root Cause Analysis (Ops Investigation 2026-04-24 05:10–05:25)

VPS `vn-foreign-flow.service` is RUNNING but RETURNING ERRORS:

```
Fri Apr 24 04:56:45 AM UTC 2026 FOREIGN_FLOW: 96 items => {"error":"Database write failed"}
Fri Apr 24 05:01:05 AM UTC 2026 FOREIGN_FLOW: 96 items => {"error":"Service temporarily unavailable"}
Fri Apr 24 05:02:13 AM UTC 2026 FOREIGN_FLOW: 96 items => {"error":"Service temporarily unavailable"}
Fri Apr 24 05:03:19 AM UTC 2026 FOREIGN_FLOW: 96 items => {"error":"Service temporarily unavailable"}
```

**Likely causes:**
1. VPS `/api/push-foreign-flow` endpoint returning error responses → MCP circuit breaker trips
2. MCP database constraint rejecting foreign_flow inserts (schema mismatch?)
3. VPS service cannot reach foreign-flow data source (market data API down?)

## Impact

- Foreign buy/sell flow data NOT ingesting
- Alerts dependent on foreign flow signals are degraded
- Price data, BCTC, news, SBV rates: ALL HEALTHY (unaffected)
- Core portfolio/market intelligence: NOT BLOCKED

## Verification Checklist (Ops)

- [x] VPS `vn-foreign-flow.service` running: YES (active since 01:27 UTC)
- [x] VPS service pushing data: YES (96 items every 60s)
- [x] MCP server receiving: NO (endpoint returns errors)
- [x] VPS network online: YES (tested via other services)
- [x] MCP server healthy: YES (other 4 VPS services flowing fine)

## Action Required

**Immediate (Ops)**: No action needed — secondary issue, does not block intelligence

**Developer Task (ESCALATE)**: Investigate foreign-flow endpoint errors
1. Check MCP `/api/push-foreign-flow` handler for bugs
2. Verify foreign_flow table schema (constraints, triggers)
3. Check VPS service logs: why is it returning "Database write failed" / "Service temporarily unavailable"?
4. Review circuit breaker: should it reset faster after initial failures?
5. Test foreign-flow push with manual curl from VPS to MCP

**Circuit Breaker Recovery**:
- Current state: HALF-OPEN (will auto-recover after 5 min of successful requests)
- Once developer fixes push errors → circuit breaker will reset automatically
- If manual reset needed: call `reset_foreign_flow_circuit_breaker()` (not yet implemented)

---

## Related Files
- `.claude/knowledge/vps-setup.md` — VPS service architecture
- `src/scheduler/foreignFlowJob.ts` — local foreign-flow job
- `src/interface/mcp/server.ts` — `/api/push-foreign-flow` endpoint
- `docs/agent-memory/sessions/2026-04-24-ops.md` — full investigation notes
