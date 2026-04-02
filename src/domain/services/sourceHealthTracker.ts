/**
 * Source Health Tracker — Task 210 (Domain Service)
 *
 * Tracks the health of each news/data source by recording successes and
 * failures. Provides status classification and a queryable health registry.
 *
 * Status rules:
 *   - 0 consecutive failures  → 'ok'
 *   - 1–4 consecutive failures → 'degraded'
 *   - 5+ consecutive failures  → 'down'
 *
 * This is a pure domain service with zero I/O: state is held in memory.
 * The application layer is responsible for calling recordSuccess /
 * recordFailure after each fetcher invocation.
 *
 * @module domain/services/sourceHealthTracker
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Classification of a source's current operational state. */
export type SourceStatus = "ok" | "degraded" | "down";

/**
 * Health snapshot for a single data source.
 *
 * All timestamps are ISO-8601 strings (UTC).
 */
export interface SourceHealth {
  /** Unique source identifier, e.g. "CafeF RSS". */
  source: string;
  /** Current operational status based on consecutive failure count. */
  status: SourceStatus;
  /** ISO timestamp of the last successful fetch, or null if never succeeded. */
  lastSuccessAt: string | null;
  /** Number of failures since the last success (resets to 0 on success). */
  consecutiveFailures: number;
  /** Error message from the most recent failure, or null if no failures. */
  lastErrorMessage: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Number of consecutive failures before a source is classified as 'down'. */
const DOWN_THRESHOLD = 5;

// ─────────────────────────────────────────────────────────────────────────────
// SourceHealthTracker
// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory registry that tracks the health of named data sources.
 *
 * Usage pattern (application layer):
 * ```typescript
 * const tracker = new SourceHealthTracker();
 *
 * try {
 *   const items = await fetchCafeF();
 *   tracker.recordSuccess("CafeF RSS");
 *   return items;
 * } catch (err) {
 *   tracker.recordFailure("CafeF RSS", err.message);
 *   return [];
 * }
 * ```
 */
export class SourceHealthTracker {
  /** Internal registry: source name → mutable health record. */
  private readonly registry = new Map<string, SourceHealth>();

  // ── Private helpers ────────────────────────────────────────────────────────

  /**
   * Compute SourceStatus from a consecutive failure count.
   *
   * @param failures - Current consecutive failure count.
   */
  private classifyStatus(failures: number): SourceStatus {
    if (failures === 0) return "ok";
    if (failures < DOWN_THRESHOLD) return "degraded";
    return "down";
  }

  /**
   * Retrieve an existing health record, or create a default one for new sources.
   *
   * NOTE: This does NOT insert the record into the registry — it only creates
   * the default struct for read-path callers. Use upsert() for writes.
   *
   * @param source - Source identifier.
   */
  private defaultRecord(source: string): SourceHealth {
    return {
      source,
      status: "ok",
      lastSuccessAt: null,
      consecutiveFailures: 0,
      lastErrorMessage: null,
    };
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Record a successful fetch for a source.
   *
   * Resets `consecutiveFailures` to 0, updates `lastSuccessAt` to now,
   * clears `lastErrorMessage`, and sets `status` to 'ok'.
   *
   * @param source - Source identifier (e.g. "CafeF RSS").
   */
  recordSuccess(source: string): void {
    const existing = this.registry.get(source) ?? this.defaultRecord(source);
    const updated: SourceHealth = {
      source,
      status: "ok",
      lastSuccessAt: new Date().toISOString(),
      consecutiveFailures: 0,
      lastErrorMessage: null,
    };
    // Preserve lastSuccessAt as the new value; ignore old
    void existing;
    this.registry.set(source, updated);
  }

  /**
   * Record a fetch failure for a source.
   *
   * Increments `consecutiveFailures`, updates `lastErrorMessage`,
   * and recomputes `status`. `lastSuccessAt` is preserved.
   *
   * @param source - Source identifier.
   * @param error  - Human-readable error description.
   */
  recordFailure(source: string, error: string): void {
    const existing = this.registry.get(source) ?? this.defaultRecord(source);
    const consecutiveFailures = existing.consecutiveFailures + 1;
    const updated: SourceHealth = {
      source,
      status: this.classifyStatus(consecutiveFailures),
      lastSuccessAt: existing.lastSuccessAt,
      consecutiveFailures,
      lastErrorMessage: error,
    };
    this.registry.set(source, updated);
  }

  /**
   * Get the current health for a named source.
   *
   * Returns a default ok record for sources that have never been tracked,
   * without inserting a record into the registry.
   *
   * @param source - Source identifier.
   */
  getHealth(source: string): SourceHealth {
    return this.registry.get(source) ?? this.defaultRecord(source);
  }

  /**
   * Get health snapshots for all tracked sources.
   *
   * Only sources that have had at least one recordSuccess or recordFailure
   * call are returned.
   *
   * @returns Array of SourceHealth sorted by source name.
   */
  getAllHealth(): SourceHealth[] {
    return Array.from(this.registry.values()).sort((a, b) =>
      a.source.localeCompare(b.source),
    );
  }

  /**
   * Returns true if a source has 5 or more consecutive failures.
   *
   * @param source - Source identifier.
   */
  isDown(source: string): boolean {
    return this.getHealth(source).consecutiveFailures >= DOWN_THRESHOLD;
  }
}
