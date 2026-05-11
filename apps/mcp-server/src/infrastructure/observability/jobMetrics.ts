/**
 * jobMetrics — Lightweight job cycle timing + ops metrics collector (Task 1349e)
 *
 * Records per-cycle duration, success count, and error count for scheduler jobs.
 * Emits structured JSON log lines so ops tooling can parse and alert.
 * Stores metrics in an in-memory buffer for real-time query via getJobMetrics().
 *
 * No database writes. No external deps. <1ms overhead per record call.
 *
 * Threshold: cycle_duration_ms > 10 000ms → emits WARN log (JOB_SLOW).
 * Errors:    error_count > 0            → emits WARN log (JOB_ERRORS).
 *
 * @module infrastructure/observability/jobMetrics
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface JobMetrics {
  /** ISO 8601 timestamp of the cycle end. */
  timestamp: string;
  /** Scheduler job name (e.g. 'taAlertScan'). */
  job: string;
  /** Wall-clock duration of one job cycle in milliseconds. */
  cycle_duration_ms: number;
  /** Number of errors encountered during the cycle. */
  error_count: number;
  /** Number of successful items processed during the cycle. */
  success_count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory buffer
// ─────────────────────────────────────────────────────────────────────────────

const metricsBuffer: JobMetrics[] = [];

const SLOW_THRESHOLD_MS = 10_000;

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record metrics for one job cycle.
 *
 * Appends to the in-memory buffer and emits structured JSON log lines.
 * Emits JOB_SLOW WARN when cycle_duration_ms > 10s.
 * Emits JOB_ERRORS WARN when error_count > 0.
 *
 * @param job         - Scheduler job name.
 * @param durationMs  - Cycle wall-clock duration in milliseconds.
 * @param errorCount  - Number of errors encountered this cycle.
 * @param successCount - Number of successful items processed this cycle.
 */
export function recordJobMetrics(
  job: string,
  durationMs: number,
  errorCount: number,
  successCount: number,
): void {
  const metric: JobMetrics = {
    timestamp: new Date().toISOString(),
    job,
    cycle_duration_ms: durationMs,
    error_count: errorCount,
    success_count: successCount,
  };

  metricsBuffer.push(metric);

  // Structured log — parseable by ops tooling
  console.log(
    JSON.stringify({
      level: "INFO",
      type: "JOB_METRICS",
      ...metric,
    }),
  );

  if (durationMs > SLOW_THRESHOLD_MS) {
    console.log(
      JSON.stringify({
        level: "WARN",
        type: "JOB_SLOW",
        job,
        cycle_duration_ms: durationMs,
        threshold_ms: SLOW_THRESHOLD_MS,
      }),
    );
  }

  if (errorCount > 0) {
    console.log(
      JSON.stringify({
        level: "WARN",
        type: "JOB_ERRORS",
        job,
        error_count: errorCount,
      }),
    );
  }
}

/**
 * Query the in-memory metrics buffer.
 *
 * @param job - Optional job name filter. If omitted, returns all metrics.
 * @returns Array of JobMetrics, newest entries at the end.
 */
export function getJobMetrics(job?: string): JobMetrics[] {
  if (!job) return metricsBuffer.slice();
  return metricsBuffer.filter((m) => m.job === job);
}

/**
 * Clear the in-memory buffer.
 *
 * Intended for test isolation. Not called in production.
 */
export function clearJobMetrics(): void {
  metricsBuffer.length = 0;
}
