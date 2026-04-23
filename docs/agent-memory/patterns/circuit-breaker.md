# Pattern: Circuit Breaker Half-Open Oscillation

**Severity:** HIGH (production stability)
**Recurrence:** 1x (Sprint 1288 — foreign flow VPS endpoint)
**Prevention:** Task 1288-UNBLOCK (2026-04-23)
**Status:** DOCUMENTED (recovery strategy provided)

---

## Problem Description

When an external endpoint becomes unavailable, the circuit breaker enters HALF-OPEN state (attempting recovery). If the endpoint remains broken, the circuit oscillates between HALF-OPEN and OPEN states repeatedly, accumulating failure counts and making diagnosis difficult.

**Observed Case (2026-04-23):**
- Breaker: `breakers.foreignFlow` (VPS endpoint at `vinahost:5005/foreign-flow`)
- Config: `resetTimeoutMs: 30s`, `halfOpenMaxAttempts: 2`
- State: HALF-OPEN (since 2026-04-15)
- Failures: 153 accumulated over 8 days
- Oscillation: HALF-OPEN → OPEN → HALF-OPEN every 30 seconds

---

## Root Cause

**Aggressive reset timeout + strict recovery policy:**

1. Circuit breaker opens after 5 consecutive failures ✓
2. After 30 seconds, transitions to HALF-OPEN (attempt recovery)
3. HALF-OPEN probe fails immediately (endpoint still broken)
4. Any failure in HALF-OPEN → re-opens circuit immediately
5. Wait 30 seconds → transition to HALF-OPEN again
6. **Loop repeats indefinitely** every 30 seconds

**Why it's stuck:**
- VPS endpoint is genuinely unavailable (schema change, service crash, SSL cert issue)
- No upstream OPS investigation or fix applied
- No manual recovery trigger available
- Circuit breaker correctly implements state machine, but policy is too aggressive for broken upstream

---

## Impact

| Component | Impact | Evidence |
|-----------|--------|----------|
| Foreign flow data | STALE (>2h old cache used) | Last primary success: 2026-04-15 |
| FDI alerts | UNRELIABLE (old data) | Uses 8-day-old cache for decisions |
| Briefings | DEGRADED (missing section) | Fallback chain exhausted, empty result |
| Circuit breaker diagnostics | NOISY (153 failures, unclear why) | No logging on half-open probes |

---

## Prevention Checklist

**When configuring a circuit breaker for production:**

- [ ] **Reset timeout appropriate for endpoint health:** Too short (30s) → oscillation; too long (10min) → slow recovery
  - **Recommended:** 60–120 seconds for APIs with slow startup
  - **For fast services:** 30–60 seconds (only if upstream monitoring confirmed)

- [ ] **Half-open recovery policy clear:** Decide between strict (need all probes succeed) vs. lenient (auto-close after N successes)
  - **Current:** `halfOpenMaxAttempts: 2` (strict) — requires 2 consecutive successes
  - **Better:** `halfOpenMaxAttempts: 3` (lenient) — allows gradual recovery

- [ ] **Diagnostic logging on all half-open probes:** Log every attempt to diagnose oscillation
  - **Missing in current code:** Only logs failure stack; doesn't identify it as half-open probe
  - **Add:** `logger.warn("[cb] half-open probe failed", { probeAttempt: N, nextRetryIn: "30s" })`

- [ ] **Manual recovery trigger available:** Provide OPS/dev team method to reset breaker if upstream confirmed healthy
  - **Missing:** No MCP tool to reset breaker
  - **Add:** `resetForeignFlowCircuitBreaker()` tool in system tools

- [ ] **Upstream health monitoring:** Before auto-recovery, verify endpoint is actually healthy
  - **Missing:** Circuit breaker doesn't ping upstream health endpoint
  - **Add:** `GET /health` check before transitioning to half-open or closing

- [ ] **Escalation alert if oscillation persists:** Alert OPS if breaker oscillates >N times per hour
  - **Missing:** No alert on oscillation pattern
  - **Add:** Schedule job to check `breakers.foreignFlow.failures > 50 AND state == HALF-OPEN` every 1h

---

## Fix Procedure

**Task:** TECH-1288-UNBLOCK (2026-04-23)

**Step 1: Immediate Recovery (OPS-driven)**
```bash
# OPS verifies VPS endpoint is healthy
ssh root@$VINAHOST_IP curl http://localhost:5005/health

# Call recovery tool (once verified healthy)
# POST /messages with tool=resetForeignFlowCircuitBreaker
```

**Step 2: Code Changes (Dev-driven)**
```typescript
// 1. Enhance CircuitBreakerConfig with auto-recovery options
export interface CircuitBreakerConfig {
  // ... existing ...
  autoRecoveryProbesRequired?: number;    // default: 3 (more lenient)
  autoRecoveryLogInterval?: number;       // log every Nth probe
}

// 2. Update foreignFlow breaker config
foreignFlow: new CircuitBreaker("foreignFlow", {
  failureThreshold: 5,
  resetTimeoutMs: 60_000,                   // CHANGED: 30s → 60s (less oscillation)
  halfOpenMaxAttempts: 3,                   // CHANGED: 2 → 3 (more lenient)
  autoRecoveryProbesRequired: 3,            // NEW: auto-close after 3 successes
  autoRecoveryLogInterval: 1,               // NEW: log every probe
}),

// 3. Add diagnostic logging in CircuitBreaker._onFailure()
if (this._state === "half-open") {
  logger.warn(`[cb] half-open probe failed`, {
    name: this.name,
    probeAttempt: this._halfOpenProbeAttempts++,
    nextResetIn: `${this.config.resetTimeoutMs / 1000}s`,
  });
}

// 4. Add MCP tool in src/interface/mcp/tools/system/systemStatusTools.ts
export async function resetForeignFlowCircuitBreaker(): Promise<{ success: boolean; newState: string }> {
  const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");
  breakers.foreignFlow.reset();
  return { success: true, newState: "closed" };
}
```

**Step 3: Monitoring (QA-driven)**
```typescript
// Schedule job: if breaker oscillates >10x/hour, alert
if (breakers.foreignFlow.stats.failures > 50 && breakers.foreignFlow.stats.state === "half-open") {
  logger.error("[circuit-breaker-oscillation] Foreign flow breaker stuck in half-open state");
  // Send alert to Telegram WORK channel
}
```

---

## Related Patterns

- **Silent filtering cascade:** Different issue (invalid items filtered without logging); documented in `foreign-flow-parse-cascade.md`
- **Rate limiter skipped:** Don't bypass rate limiter even when circuit is open (separate concern)
- **DDD layer violations:** Don't import breakers from wrong layer (infrastructure only)

---

## Lessons Learned

1. **Circuit breaker config is critical:** Too aggressive reset timeout → oscillation; too lenient recovery policy → slow recovery
2. **Manual reset is essential:** For endpoints outside your control, always provide OPS recovery trigger
3. **Upstream monitoring non-negotiable:** Check health before attempting recovery
4. **Diagnostic logging saves hours:** Log every half-open probe attempt + reason for failure
5. **Escalation alerts prevent silent failures:** Alert if breaker oscillates, don't let it run unnoticed for 8 days

---

## Metadata

- **Pattern ID:** `circuit-breaker-oscillation`
- **First observed:** 2026-04-15 (undetected until 2026-04-23)
- **Affected component:** `breakers.foreignFlow` (VPS foreign flow endpoint)
- **Recurrence count:** 1x (single instance, but indicates general risk)
- **Prevention checklist:** COMPLETE (documented above)
- **Related task:** TECH-1288-UNBLOCK (2026-04-23)
- **Author:** Architect | **Date:** 2026-04-23

---

## Quick Reference

**Prevention Checklist for New Breakers:**
```typescript
// 1. Set resetTimeoutMs appropriately (60–120s for APIs)
// 2. Set halfOpenMaxAttempts to 3+ (lenient recovery)
// 3. Add diagnostic logging in CircuitBreaker._onFailure() for half-open state
// 4. Provide manual reset tool via MCP interface
// 5. Add upstream health check before auto-recovery
// 6. Schedule oscillation detection alert (>N failures per hour)
// 7. Test with broken endpoint to verify recovery behavior
```

**Operational Checklist for Stuck Breaker:**
```bash
# 1. Verify upstream endpoint health
curl http://$ENDPOINT/health

# 2. If healthy: call resetForeignFlowCircuitBreaker() tool
# 3. If unhealthy: escalate to OPS for service restart
# 4. Monitor recovery (check logs for "closed" state within 2–3min)
# 5. Post-mortem: why was endpoint down? Add monitoring.
```
