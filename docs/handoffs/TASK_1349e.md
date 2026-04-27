# Task 1349e: Job Cycle Timings + Ops Dashboard Metrics

**Sprint:** 1349
**Type:** Observability/Infrastructure
**Size:** M (1.5h)
**Priority:** MEDIUM

---

## Problem Statement

Three critical jobs have no observable cycle-time metrics:
1. **taAlertScan** (technical analysis alerts) — runs every 10 min market hours
2. **bbAlertScan** (breadth-balance alerts) — runs every 10 min market hours
3. **macroRefresh** (macro signal synthesis) — runs every 2h

Without cycle timings, ops cannot detect:
- Job slowdowns (e.g., 5-10s → 30s indicates data backlog or external API lag)
- Increasing error rates per cycle
- Outlier cycles that might indicate data corruption or network issues

**Impact:** Ops monitoring gap. Silent degradation until cascading failures occur.

---

## Solution

### Part 1: Create Metrics Collector (0.5h)

Create `src/infrastructure/observability/jobMetrics.ts`:

```typescript
interface JobMetrics {
  timestamp: string; // ISO
  job: string;
  cycle_duration_ms: number;
  error_count: number;
  success_count: number;
  queue_depth?: number; // items pending
  last_execution_ms?: number; // last cycle duration
}

const metricsBuffer: JobMetrics[] = [];

export function recordJobMetrics(job: string, durationMs: number, errorCount: number, successCount: number): void {
  const metric: JobMetrics = {
    timestamp: new Date().toISOString(),
    job,
    cycle_duration_ms: durationMs,
    error_count: errorCount,
    success_count: successCount
  };

  metricsBuffer.push(metric);

  // Log to structured output (ops can parse)
  console.log(JSON.stringify({
    level: 'INFO',
    type: 'JOB_METRICS',
    ...metric
  }));

  // Alert on thresholds
  if (durationMs > 10000) { // 10+ seconds
    console.log(JSON.stringify({
      level: 'WARN',
      type: 'JOB_SLOW',
      job,
      cycle_duration_ms: durationMs,
      threshold_ms: 10000
    }));
  }

  if (errorCount > 0) {
    console.log(JSON.stringify({
      level: 'WARN',
      type: 'JOB_ERRORS',
      job,
      error_count: errorCount
    }));
  }
}

export function getJobMetrics(job?: string): JobMetrics[] {
  if (!job) return metricsBuffer;
  return metricsBuffer.filter(m => m.job === job);
}
```

### Part 2: Wire Metrics into 3 Jobs (1h)

**1. TA Alert Scan** (`src/scheduler/alerts/taAlertScan.ts`):

```typescript
const start = Date.now();
let errorCount = 0;
let successCount = 0;

try {
  const result = await runTAAlertScan();
  successCount = result.alerts.length;
} catch (err) {
  errorCount = 1;
  console.error('[taAlertScan]', err);
} finally {
  const duration = Date.now() - start;
  recordJobMetrics('taAlertScan', duration, errorCount, successCount);
}
```

**2. BB Alert Scan** (`src/scheduler/alerts/bbAlertScan.ts`):

Same pattern, job='bbAlertScan'

**3. Macro Refresh** (`src/scheduler/analysis/macroRefresh.ts`):

Same pattern, job='macroRefresh'

### Part 3: Test Coverage (8 test cases)

Create `src/__tests__/1349e-job-metrics.test.ts`:
- Test metric collection (metrics recorded on each job cycle)
- Test threshold alerting (WARN when cycle_duration_ms > 10s)
- Test error tracking (error_count > 0 logged as WARN)
- Test JSON structure (all required fields present)
- Test query by job name (getJobMetrics('taAlertScan') returns TA metrics only)
- Test baseline (no regression when metrics added)

---

## Acceptance Criteria

- [ ] `src/infrastructure/observability/jobMetrics.ts` created and exported
- [ ] All 3 jobs (taAlertScan, bbAlertScan, macroRefresh) instrumented with timing
- [ ] Every job cycle records: timestamp, cycle_duration_ms, error_count, success_count
- [ ] Alerts logged when cycle_duration_ms > 10s
- [ ] Test file `1349e-job-metrics.test.ts` has ≥8 passing tests
- [ ] Metrics queryable by job name
- [ ] Baseline tests still pass (≥7371)
- [ ] No performance regression from metrics collection (<1ms overhead per cycle)

---

## Files Changed

- `src/infrastructure/observability/jobMetrics.ts` (new)
- `src/scheduler/alerts/taAlertScan.ts`
- `src/scheduler/alerts/bbAlertScan.ts`
- `src/scheduler/analysis/macroRefresh.ts`
- `src/__tests__/1349e-job-metrics.test.ts` (new)

---

## Notes

- Metrics stored in-memory (buffer) for real-time ops visibility
- Structured JSON output enables parsing by monitoring tools
- Threshold alerting (10s) based on typical cycle times (3–5s expected)
- No database writes required (logs are primary output)
