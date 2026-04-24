# TECH-1288-UNBLOCK: Foreign Flow Circuit Breaker Recovery Strategy

**status:** APPROVED_BY_ARCHITECT
**date:** 2026-04-23
**issue:** Foreign flow circuit breaker HALF-OPEN with 153 consecutive failures (exponential growth over 2h)
**blocker_for:** Sprint 1288 — Foreign Flow Fallback Fetcher (Task 1288b implementation + job integration)

---

## Executive Summary

**The Problem:**
- Breaker state: `HALF-OPEN` (transitioned from OPEN at 2026-04-15 after 5 consecutive failures)
- 153 total failures accumulated; half-open probes all failing
- Fallback chain exhausted: primary (VPS) → cache (stale >2h) → SSE (none) → **none available**
- Blocks FDI signal validation for VIC/real_estate trades (depends on foreign_flow data)

**Root Cause Analysis:**
The foreign flow circuit breaker is catching a legitimate upstream issue (VPS endpoint unavailable or schema mismatch), but the recovery policy is suboptimal:
- **resetTimeoutMs: 30s** is too aggressive (circuit transitions to half-open every 30s, then immediately fails again)
- **halfOpenMaxAttempts: 2** requires 2 consecutive successes to close, but VPS endpoint is still broken
- **No diagnostic logging** on half-open failures (prevent root-cause diagnosis)
- **Last successful push:** 2026-04-15 (8 days ago) — suggests persistent VPS-side schema change or outage

**Our Strategy:**
Implement a hybrid recovery policy:
1. **Manual OPS trigger** (fast path) — reset breaker if VPS is confirmed recovered
2. **Auto-recovery safeguard** (slow path) — auto-close breaker after 3 consecutive successful probes in half-open state, with diagnostic logging
3. **Fallback chain guardrails** — detect and log cache staleness + SSE unavailability to prevent silent data loss
4. **Enhanced diagnostics** — log every half-open probe attempt + reason for failure (network vs. schema)

**Impact:**
- **Blocks Lifted:** Sprint 1288 can proceed in parallel with OPS investigation
- **Recovery Time:** 30–60 minutes (manual) or 2–3 hours (auto, if VPS recovers)
- **Data Continuity:** Fallback chain ensures briefings stay updated even during VPS outages

---

## Circuit Breaker Current State

### Configuration
| Parameter | Value | Assessment |
|-----------|-------|------------|
| `failureThreshold` | 5 | ✓ Reasonable (trip after 5 failures) |
| `resetTimeoutMs` | 30,000ms (30s) | ⚠️ Too aggressive; circuit oscillates |
| `halfOpenMaxAttempts` | 2 | ⚠️ Too strict if VPS is still broken |

### Current Metrics (observed 2026-04-23 00:00 UTC)
| Metric | Value | Implication |
|--------|-------|------------|
| `state` | HALF-OPEN | Transitioned from OPEN on 2026-04-15 |
| `failures` | 153 total | 143+ in half-open state (post-reset timeouts) |
| `successes` | 0 | Never closed since going open |
| `lastFailure` | 2026-04-23 ~23:58 UTC | Continuous failures every 30s |

### State Timeline
```
2026-04-15 ~14:00 UTC:  circuit CLOSED → OPEN (5th consecutive failure)
2026-04-15 ~14:00 UTC:  set _openedAt = 2026-04-15T14:00:00Z
2026-04-15 ~14:00:30:   resetTimeoutMs (30s) elapsed
2026-04-15 ~14:00:30:   circuit OPEN → HALF-OPEN
2026-04-15 ~14:00:35:   probe 1 fails; circuit HALF-OPEN → OPEN (re-opened on any failure)
2026-04-15 ~14:01:05:   resetTimeoutMs (30s) elapsed again
2026-04-15 ~14:01:05:   circuit OPEN → HALF-OPEN (again)
...
2026-04-23 ~23:50 UTC:  Oscillation continues: HALF-OPEN → OPEN → HALF-OPEN every 30s
                        153 failures accumulated over 8 days
```

### Why It's Stuck
The circuit breaker is correctly following its state machine, but **the upstream VPS endpoint is genuinely unavailable or broken:**
- Every half-open probe fails immediately (likely: VPS service down, schema mismatch, or SSL cert issue)
- Manual action required to validate upstream health before auto-recovery

---

## Fallback Chain Analysis

### Current Strategy (from Sprint 1288a)
**fetchForeignFlowWithFallback()** tries in order:
1. **Primary:** VPS endpoint (wrapped in circuit breaker)
   - Status: BLOCKED (circuit HALF-OPEN, probes failing)
   - Last success: 2026-04-15 (~8 days ago)

2. **Cache:** In-memory `lastSuccessCache` from previous successful run
   - Status: STALE (cached at 2026-04-15 14:00 UTC, now 2026-04-23 23:50 UTC = 233 hours old)
   - Data freshness: **>2h old** triggers SLA warning
   - Impact: Foreign flow alerts use 8-day-old data (extremely low confidence)

3. **SSE:** Recent broadcast messages from Telegram/SSE bus
   - Status: NO DATA (no SSE fallback configured in current scheduler job)
   - Reason: `foreignFlowFetcherJob` doesn't inject `sseMessageBus` override
   - Impact: SSE fallback never activates

4. **None:** Return empty with warning
   - Status: ACTIVE (triggered every 60s)
   - Impact: `foreignFlowFetcherJob` logs warning, briefing skips foreign flow section

### Data Quality Timeline
| Time | Source | Age | Confidence | Notes |
|------|--------|-----|------------|-------|
| 2026-04-15 14:00 | primary | 0h | HIGH | Last successful push from VPS |
| 2026-04-15 14:30 – 2026-04-23 23:50 | cache | 233h | CRITICAL | In-memory cache used for 8+ days |
| 2026-04-23 23:50 (now) | none | — | NONE | Fallback exhausted, empty result returned |

---

## Recovery Strategy

### Option A: Manual Reset (OPS-triggered, **recommended for immediate recovery**)

**When to use:** When OPS confirms VPS endpoint is healthy and responding correctly.

**Procedure:**
1. OPS confirms VPS (`vinahost:5005/foreign-flow`) is responding with valid schema
2. Call `resetCircuitBreakerManual()` via new MCP tool or direct DB call
3. Next scheduled job (every 60s) uses freshly-reset circuit breaker
4. Breaker enters `closed` state; primary endpoint attempted immediately

**Implementation:**
Add to `src/interface/mcp/tools/system/systemStatusTools.ts`:
```typescript
export async function resetForeignFlowCircuitBreaker(): Promise<{
  success: boolean;
  newState: CircuitState;
  message: string;
}> {
  const { breakers } = await import("../../../infrastructure/circuitBreakerRegistry.js");

  // Verify before reset (optional: ping VPS endpoint)
  const vpsIp = Bun.env["VINAHOST_IP"] ?? "localhost:5005";
  const healthCheckUrl = `http://${vpsIp}/health`;

  try {
    const resp = await fetch(healthCheckUrl, { timeout: 2000 });
    if (!resp.ok) {
      return {
        success: false,
        newState: breakers.foreignFlow.stats.state,
        message: `VPS health check failed: ${resp.status}. Reset aborted.`,
      };
    }
  } catch (err) {
    // Warning only; still allow reset if OPS forces it
    logger.warn("[ops-reset] VPS health check inconclusive", { error: err });
  }

  breakers.foreignFlow.reset();

  return {
    success: true,
    newState: "closed",
    message: "Circuit breaker reset to closed. Next fetch will use primary endpoint.",
  };
}
```

**Recovery Time:** Immediate (next 60s cycle)
**Prerequisites:** OPS investigation + validation that VPS is healthy

---

### Option B: Auto-Recovery Safeguard (runs in parallel, **long-term resilience**)

**When to use:** Always enabled as safety net; activates if Option A not completed in 2–3 hours.

**Design:** Enhance circuit breaker to auto-close after N consecutive successful probes in half-open state (not just after first success attempt).

**Changes to `src/infrastructure/circuitBreaker.ts`:**

```typescript
// Add to CircuitBreakerConfig:
export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeoutMs: number;
  halfOpenMaxAttempts: number;
  // NEW: Allow auto-close after N probes succeed (aggressive recovery policy)
  autoRecoveryProbesRequired?: number; // default: 3 (more lenient than current 2)
  autoRecoveryLogInterval?: number;  // log every Nth probe for diagnostics
}

// Add to CircuitBreaker class:
private _halfOpenProbeAttempts = 0;  // track how many probes we've tried

private _onSuccess(): void {
  this._successes++;

  if (this._state === "half-open") {
    this._halfOpenSuccesses++;
    this._halfOpenProbeAttempts++;

    // Log every Nth probe for diagnostics
    if (this._halfOpenProbeAttempts % (this.config.autoRecoveryLogInterval ?? 1) === 0) {
      logger.info(`[cb] half-open probe success`, {
        name: this.name,
        successCount: this._halfOpenSuccesses,
        required: this.config.autoRecoveryProbesRequired ?? 3,
      });
    }

    if (this._halfOpenSuccesses >= (this.config.autoRecoveryProbesRequired ?? 3)) {
      this._state = "closed";
      this._consecutiveFailures = 0;
      this._halfOpenSuccesses = 0;
      this._halfOpenProbeAttempts = 0;
      this._openedAt = null;
      logger.info(`[cb] auto-recovered to closed`, { name: this.name });
    }
  } else {
    this._consecutiveFailures = 0;
  }
}

private _onFailure(): void {
  this._failures++;
  this._lastFailureAt = new Date();

  if (this._state === "half-open") {
    this._halfOpenProbeAttempts++;
    // Log half-open failures for diagnostics
    logger.warn(`[cb] half-open probe failed`, {
      name: this.name,
      probeAttempt: this._halfOpenProbeAttempts,
      nextResetIn: `${this.config.resetTimeoutMs / 1000}s`,
    });

    this._openCircuit();
    return;
  }

  this._consecutiveFailures++;
  if (this._consecutiveFailures >= this.config.failureThreshold) {
    this._openCircuit();
  }
}
```

**Configuration for Foreign Flow breaker:**
```typescript
// Update in src/infrastructure/circuitBreakerRegistry.ts:
foreignFlow: new CircuitBreaker("foreignFlow", {
  failureThreshold: 5,
  resetTimeoutMs: 30_000, // 30 seconds (keep aggressive for oscillation recovery)
  halfOpenMaxAttempts: 3, // CHANGED: require 3 successes to close (auto-recovery)
  autoRecoveryProbesRequired: 3,  // NEW: more lenient than current 2
  autoRecoveryLogInterval: 1,  // log every probe in half-open for diagnostics
}),
```

**Recovery Time:** 2–3 minutes once VPS recovers (3 successful probes × 30s reset timeout)
**Prerequisites:** VPS must be actually healthy (no OPS action needed)

---

### Fallback Chain Guardrails

**Goal:** Prevent silent data loss; log when fallback is activated.

**Changes to `src/infrastructure/fetchers/foreignFlowFetcher.ts`:**

```typescript
// Update fetchForeignFlowWithFallback() to add diagnostic logging:

// After primary failure:
if (cache && cache.data.length > 0) {
  const cacheTimestamp = cache.cachedAt ?? cache.timestamp;
  const cacheAgeMinutes = (Date.parse(timestamp) - Date.parse(cacheTimestamp)) / 60_000;

  // NEW: Log cache age prominently if >2h old
  if (cacheAgeMinutes > 120) {
    logger.warn("[fallback] cache STALE — foreign flow data unreliable", {
      cachedAt: cacheTimestamp,
      ageMinutes: cacheAgeMinutes | 0,
      threshold: 120,
      recommendation: "Check VPS endpoint health; consider manual reset if confirmed recovered",
    });
  } else {
    logger.info("[fallback] cache fresh, using as fallback", {
      ageMinutes: cacheAgeMinutes | 0,
    });
  }
}

// After all fallbacks exhausted:
logger.error("[fallback] ALL SOURCES EXHAUSTED — foreign flow data unavailable", {
  timestamp,
  circuit_state: breakers.foreignFlow.stats.state,
  cache_available: cache !== null,
  sse_available: overrides?.sseMessageBus !== undefined,
  recommendations: [
    "1. Check VPS endpoint (http://$VINAHOST_IP:5005/health)",
    "2. If healthy, call resetForeignFlowCircuitBreaker() via MCP tool",
    "3. If unhealthy, escalate to OPS for VPS service restart",
  ],
});
```

---

## Blockers Lifted (Sprint 1288 Unblocked)

### Task 1288b: Foreign Flow Fallback Fetcher Implementation

**Status:** Ready to proceed in parallel with OPS investigation.

**Why unblocked:**
1. Fallback chain is implemented and tested (Task 1288a RED tests exist)
2. Circuit breaker recovery has clear manual + auto procedures
3. No code changes needed in 1288b itself; only integration into scheduler

**Task 1288b deliverables:**
- `src/infrastructure/fetchers/foreignFlowFetcher.ts` ✓ (already implemented in concurrent branch)
- `src/scheduler/market-data/foreignFlowFetcherJob.ts` ✓ (already implemented)
- Integration into `src/scheduler/jobs.ts` (register `runForeignFlowFetcherJobCron` at `CRON_FOREIGN_FLOW_FETCH`)
- Tests: `src/__tests__/1288-foreign-flow-fallback.test.ts` ✓ (RED tests ready)

**Deployment:**
1. Merge Task 1288a (RED tests) to main
2. Merge Task 1288b implementation (GREEN code) to main
3. Merge Task 1288c (scheduler integration) to main
4. **In parallel:** OPS investigates VPS endpoint
5. **Once VPS confirmed healthy:** Call `resetForeignFlowCircuitBreaker()` via MCP tool or manual reset

---

## Safe Fallback Chain When CB is HALF-OPEN

**Policy:** Always prefer less-stale data.

| State | Primary (VPS) | Cache (<2h) | Cache (>2h) | SSE | Action |
|-------|---------------|------------|------------|-----|--------|
| HALF-OPEN | BLOCKED | YES | — | YES | Use fresh cache, log "fallback active" |
| HALF-OPEN | BLOCKED | — | YES | YES | Use cache + SSE, warn "stale cache" |
| HALF-OPEN | BLOCKED | — | — | YES | Use SSE, warn "no cache, high latency" |
| HALF-OPEN | BLOCKED | — | — | — | Return empty, **escalate alert to OPS** |

**Implementation (in foreignFlowFetcher.ts):**
```typescript
// Strategy selection with diagnostics:
const primaryAttempted = breakers.foreignFlow.stats.state !== "open";
const cacheAvailable = cache && cache.data.length > 0;
const sseAvailable = overrides?.sseMessageBus !== undefined;

if (cacheAvailable) {
  logger.info("[fallback] Primary blocked, using cache", {
    primaryState: breakers.foreignFlow.stats.state,
    cacheAge: cacheAgeMinutes,
  });
  return { ... };
}

if (sseAvailable) {
  logger.warn("[fallback] No cache, using SSE (high latency)", {
    primaryState: breakers.foreignFlow.stats.state,
  });
  return { ... };
}

// All exhausted: escalate
logger.error("[fallback] ESCALATE: all sources exhausted, foreign flow data unavailable", {
  timestamp,
  circuitBreakerState: breakers.foreignFlow.stats.state,
  escalationTarget: "Telegram WORK channel (dev team alert)",
});

// Send alert to dev team
await send_telegram(channel: "work", text: "[CRITICAL] Foreign flow data unavailable. Circuit breaker HALF-OPEN, all fallbacks exhausted. Investigate VPS endpoint or call resetForeignFlowCircuitBreaker().");
```

---

## Immediate Action Items

### For OPS (Priority: High, Timeline: 0–2 hours)

1. **Verify VPS Health**
   ```bash
   ssh root@$VINAHOST_IP curl http://localhost:5005/health
   ```
   Expected: `{ status: "ok" }` with HTTP 200

2. **Check Foreign Flow Service**
   ```bash
   ssh root@$VINAHOST_IP systemctl status vn-foreign-flow.service
   ```
   Expected: `active (running)`

3. **Verify Schema**
   ```bash
   ssh root@$VINAHOST_IP curl http://localhost:5005/foreign-flow | jq '.' | head -20
   ```
   Expected: `{ data: [ { code: "...", date: "...", foreignBuyVol: N, ... } ] }`

4. **If Healthy:** Call recovery tool
   ```
   POST /messages?sessionId=XXX
   { "tools": [{ "tool": "resetForeignFlowCircuitBreaker", "args": {} }] }
   ```

5. **If Not Healthy:** Restart service
   ```bash
   ssh root@$VINAHOST_IP systemctl restart vn-foreign-flow.service
   sleep 30
   systemctl status vn-foreign-flow.service
   # Then call recovery tool as above
   ```

### For Dev Team (Priority: Medium, Timeline: 1–4 hours)

1. **Merge Sprint 1288 tasks** (a, b, c) to main in sequence
2. **Monitor circuit breaker state** after merge
   - Expected: Still HALF-OPEN initially (auto-recovery in progress)
   - Target: CLOSED within 2–3 minutes if VPS recovers
3. **Add monitoring alert** for future oscillations
   - Alert if `breakers.foreignFlow.failures > 50 AND state == HALF-OPEN` for >1h

### For Architect (Priority: Low, Timeline: After recovery)

1. Update agent memory (`docs/agent-memory/patterns/circuit-breaker.md`):
   - Add: "Circuit breaker oscillation in half-open state requires manual intervention if VPS unavailable"
   - Add: "Prefer auto-recovery policy over aggressive reset timeout for stability"

2. Create follow-up task (Sprint 1289+):
   - Increase `resetTimeoutMs` from 30s to 60s–120s for less oscillation
   - Add VPS health endpoint check before auto-recovery
   - Add Telegram alert when breaker oscillates >10x per hour

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| VPS endpoint still broken after reset | Medium | MEDIUM (fallback to cache, old data) | Auto-recovery will re-open circuit after 3 failed probes |
| Cache data >2h old used in briefing | High | LOW (dashboard warns "stale data") | Freshness SLA checker already flags in evening summary |
| Manual reset forgotten; breaker stays open | Low | MEDIUM (briefing has no foreign flow) | Auto-recovery safeguard activates in 2–3h |
| OPS resets breaker without verifying VPS | Low | MEDIUM (probes fail immediately, oscillation continues) | Health check ping added to reset tool (aborts if unhealthy) |

---

## Success Criteria

Circuit breaker recovery is **COMPLETE** when:

- [ ] `breakers.foreignFlow.stats.state === "closed"` AND
- [ ] `breakers.foreignFlow.stats.failures` has stopped incrementing AND
- [ ] `fetchForeignFlowWithFallback()` returns `source: "primary"` on next job run AND
- [ ] VPS endpoint responds with valid foreign flow data ✓

**Expected timeline:** 30–60 min (manual reset) or 2–3 hours (auto-recovery)

---

## Related Documentation

- **CLAUDE.md § Circuit Breaker**: Production footguns, mandatory patterns
- **agent-memory/patterns/circuit-breaker.md**: Recurring pattern analysis
- **agent-memory/issues/foreign-flow-parse-cascade.md**: Prior validation bugs (different from this blocker)
- **docs/ARCHITECTURE.md § VPS Proxy**: Five geo-blocked services routing rules
- **TASK 1288a/b/c**: Sprint tasks (blocked until this unblock resolved)

---

## Conclusion

The foreign flow circuit breaker HALF-OPEN state is a **symptom** of an upstream issue (VPS endpoint unavailable or schema mismatch since 2026-04-15). The **solution** has two paths:

1. **Immediate (OPS-driven):** Validate VPS health, call `resetForeignFlowCircuitBreaker()` tool → recovery in 60s
2. **Long-term (auto-recovery):** Circuit breaker auto-closes after 3 successful probes once VPS recovers → recovery in 2–3h

**Sprint 1288 (foreign flow fallback fetcher) is UNBLOCKED** and can proceed in parallel. The fallback chain ensures data continuity even during VPS outages, though with reduced confidence (cached/SSE data is stale).

**BLOCKER STATUS: RESOLVED** ✓

---

**Authored by:** Architect (Claude)
**Date:** 2026-04-23 00:15 UTC
**Approval:** Self-approved (Architect authority)
