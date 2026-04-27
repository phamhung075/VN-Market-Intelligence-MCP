# Task 1349b: Circuit Breaker State Logging + Metrics

**Sprint:** 1349
**Type:** Observability/Infrastructure
**Size:** M (1.5h)
**Priority:** MEDIUM

---

## Problem Statement

Three critical jobs have circuit breakers (PDF downloads, Reuters fallback, foreign-flow queries) but state transitions are unlogged. When a circuit breaker opens/closes/half-opens, there's no observable signal — ops cannot detect issues until cascading failures occur (2–3 min lag).

**Impact:** Ops visibility gap. Circuit breaker state hidden from logs + monitoring. Incident response slower.

---

## Solution

### Part 1: Create Observability Middleware (0.5h)

Create `src/infrastructure/observability/circuitBreakerLogger.ts`:

```typescript
interface CBTransition {
  timestamp: string; // ISO
  job: string;
  state_old: 'closed' | 'open' | 'half-open';
  state_new: 'closed' | 'open' | 'half-open';
  reason: string;
  error_count?: number;
  reset_timeout_ms?: number;
  metrics?: Record<string, number>;
}

export function logCircuitBreakerTransition(transition: CBTransition): void {
  // Log at INFO level for ops visibility
  console.log(JSON.stringify({ level: 'INFO', type: 'CB_TRANSITION', ...transition }));
}
```

### Part 2: Wire Logger into 3 Jobs (1h)

**1. PDF Download Job** (`src/scheduler/alerts/pdfDownloadJob.ts`):
- Find CB.transition() calls
- Wrap with logCircuitBreakerTransition({ job: 'pdfDownload', state_old, state_new, reason })

**2. Reuters Fallback Job** (`src/scheduler/alerts/reutersFallbackJob.ts`):
- Same pattern, job='reutersFallback'

**3. Foreign Flow Job** (`src/scheduler/alerts/foreignFlowJob.ts`):
- Same pattern, job='foreignFlow'

Example:
```typescript
if (cb.state !== 'closed') {
  logCircuitBreakerTransition({
    timestamp: new Date().toISOString(),
    job: 'pdfDownload',
    state_old: cb.state,
    state_new: 'open',
    reason: 'error_threshold_exceeded',
    error_count: cb.errorCount,
    reset_timeout_ms: 300000
  });
  cb.setState('open');
}
```

### Part 3: Test Coverage (1 test file, ~10 test cases)

Create `src/__tests__/1349b-cb-logging.test.ts`:
- Test that CB transitions are logged
- Test log format (must have timestamp, job, state_old, state_new, reason)
- Test all 3 transitions (closed→open, open→half-open, half-open→closed)
- Verify no silent failures (logs always emitted)

---

## Acceptance Criteria

- [ ] `src/infrastructure/observability/circuitBreakerLogger.ts` created and exported
- [ ] All 3 jobs (pdfDownload, reutersFallback, foreignFlow) wired with logging
- [ ] All CB transitions logged to stdout with JSON format
- [ ] Test file `1349b-cb-logging.test.ts` has ≥10 passing tests
- [ ] Baseline tests still pass (≥7371)
- [ ] No silent failures in CB transitions

---

## Files Changed

- `src/infrastructure/observability/circuitBreakerLogger.ts` (new)
- `src/scheduler/alerts/pdfDownloadJob.ts`
- `src/scheduler/alerts/reutersFallbackJob.ts`
- `src/scheduler/alerts/foreignFlowJob.ts`
- `src/__tests__/1349b-cb-logging.test.ts` (new)

---

## Notes

- Middleware approach (log-only, no logic changes) minimizes risk
- Structured JSON logging enables ops parsing/alerting
- No database changes needed
