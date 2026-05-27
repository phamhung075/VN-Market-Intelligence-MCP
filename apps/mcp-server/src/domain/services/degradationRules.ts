/**
 * degradationRules.ts — Pure domain detection service for signal accuracy degradation
 *
 * Sprint SELF-IMPROVE-GATE Phase 2 lane-B substrate (SPIKE_1947 §4/§5 verbatim).
 *
 * DDD layer: Domain / Services
 *
 * CRITICAL BOUNDARY: This file has ZERO imports from infrastructure/ or
 * application/ layers. Only TypeScript stdlib + local type definitions.
 * This is enforced by AC-T2-7 (import-linter gate: grep confirms 0 infra imports).
 *
 * ADD-ONLY rule (lane-C STOP):
 *   You may add new DEGRADATION_CAUSE_MAP entries for new signal types.
 *   You must NOT modify or remove existing entries, thresholds (0.10, 0.40),
 *   or detection policy. Editing existing gate logic = lane-C = stops here.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Local type re-declaration
// (structurally compatible with infrastructure's SignalAccuracyStats via
//  TypeScript duck-typing — domain defines its OWN input shape, not infra's)
// ─────────────────────────────────────────────────────────────────────────────

interface SignalAccuracyStatsByType {
  signal_type: string;
  stock_code: string;
  sample_count: number;
  accuracy_rate: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// DegradationHypothesis + DEGRADATION_CAUSE_MAP (SPIKE §5 — verbatim)
// ─────────────────────────────────────────────────────────────────────────────

export interface DegradationHypothesis {
  likely_cause: string;
  suggested_fix: string;
  fix_area: string;
}

/**
 * Rule table mapping signal_type → degradation hypothesis + fix area.
 *
 * ADD entries as new signal types are proven to degrade; do NOT modify
 * existing entries (lane-C constraint — gate self-edit STOP).
 * The `_default` entry handles unknown/unmapped signal types.
 */
export const DEGRADATION_CAUSE_MAP: Record<string, DegradationHypothesis> = {
  price_confirmation: {
    likely_cause:
      "price signal accuracy declined — source data stale or market condition shifted",
    suggested_fix:
      "verify price source freshness; review signal correlation with price tiers",
    fix_area: "apps/mcp-server/src/scheduler/alerts/",
  },
  chain_catalyst: {
    likely_cause:
      "catalyst chain breaks — order execution or event sequencing failure",
    suggested_fix:
      "audit event sequencing logic; re-verify order dependency graph",
    fix_area: "apps/mcp-server/src/scheduler/alerts/",
  },
  volume_spike: {
    likely_cause:
      "volume spike detection threshold mismatch — market volatility spike or signal tuning drift",
    suggested_fix:
      "verify volume percentile threshold; re-baseline against current market",
    fix_area: "apps/mcp-server/src/scheduler/alerts/",
  },
  _default: {
    likely_cause:
      "signal-type-unknown weakness — requires manual triage",
    suggested_fix:
      "investigate signal type; classify into known category or create new rule",
    fix_area: "manual",
  },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Detection types
// ─────────────────────────────────────────────────────────────────────────────

export type DetectionClass = "DEGRADED" | "PERSISTENTLY_LOW" | "COVERAGE_GAP";

export interface DegradationFinding {
  signal_type: string;
  detection_class: DetectionClass;
  /** Aggregated 7-day accuracy rate, or null if insufficient sample. */
  current_rate: number | null;
  /** Aggregated 30-day accuracy rate (baseline). */
  baseline_rate: number | null;
  /** Total samples in the 7d window across all stocks for this signal_type. */
  sample_count_7d: number;
  /** Total samples in the 30d window across all stocks for this signal_type. */
  sample_count_30d: number;
  /** Hypothesis text from DEGRADATION_CAUSE_MAP lookup. Never undefined. */
  hypothesis: string;
  /** Fix-area path hint from DEGRADATION_CAUSE_MAP. */
  fix_area: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helper
// ─────────────────────────────────────────────────────────────────────────────

interface AggregatedStats {
  sample_count: number;
  /** Weighted average of accuracy_rate by sample_count; null if no rated rows. */
  accuracy_rate: number | null;
}

function aggregateBySignalType(
  rows: SignalAccuracyStatsByType[],
): Map<string, AggregatedStats> {
  const result = new Map<string, AggregatedStats>();

  for (const row of rows) {
    const existing = result.get(row.signal_type);

    if (!existing) {
      result.set(row.signal_type, {
        sample_count: row.sample_count,
        accuracy_rate: null, // will be computed after all rows processed
      });
    } else {
      existing.sample_count += row.sample_count;
    }
  }

  // Compute weighted averages
  const weightedSums = new Map<string, { weightedSum: number; totalWeight: number }>();

  for (const row of rows) {
    if (row.accuracy_rate === null) continue;

    const entry = weightedSums.get(row.signal_type);
    if (!entry) {
      weightedSums.set(row.signal_type, {
        weightedSum: row.accuracy_rate * row.sample_count,
        totalWeight: row.sample_count,
      });
    } else {
      entry.weightedSum += row.accuracy_rate * row.sample_count;
      entry.totalWeight += row.sample_count;
    }
  }

  for (const [signalType, agg] of result) {
    const ws = weightedSums.get(signalType);
    if (ws && ws.totalWeight > 0) {
      agg.accuracy_rate = ws.weightedSum / ws.totalWeight;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hypothesis lookup (fail-safe _default fallback)
// ─────────────────────────────────────────────────────────────────────────────

function getHypothesis(signal_type: string): DegradationHypothesis {
  return DEGRADATION_CAUSE_MAP[signal_type] ?? DEGRADATION_CAUSE_MAP["_default"]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// detectDegradedSignalTypes (SPIKE §4 — settled, do NOT re-litigate)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure function: aggregates stats by signal_type, applies detection policy,
 * returns degradation findings.
 *
 * ZERO imports from infrastructure or application layers.
 *
 * Detection policy (SPIKE §4 — verbatim, ADD-ONLY):
 *
 * DEGRADED: (baseline_rate - current_rate) >= 0.10
 *   Both windows must have sample_count >= 3
 *   Both windows must have accuracy_rate (not null)
 *
 * PERSISTENTLY_LOW: baseline_rate < 0.40
 *   Must have sample_count_30d >= 10
 *
 * A signal_type MAY appear as both DEGRADED and PERSISTENTLY_LOW —
 * the orchestrator's anti-runaway gate selects top-2 by severity.
 */
export function detectDegradedSignalTypes(
  stats7d: SignalAccuracyStatsByType[],
  stats30d: SignalAccuracyStatsByType[],
): DegradationFinding[] {
  // Guard: defensive — return empty on invalid input
  if (!Array.isArray(stats7d) || !Array.isArray(stats30d)) {
    return [];
  }

  const agg7d = aggregateBySignalType(stats7d);
  const agg30d = aggregateBySignalType(stats30d);

  const findings: DegradationFinding[] = [];

  // Collect all unique signal types across both windows
  const allTypes = new Set([...agg7d.keys(), ...agg30d.keys()]);

  for (const signal_type of allTypes) {
    const w7 = agg7d.get(signal_type);
    const w30 = agg30d.get(signal_type);

    const currentRate = w7?.accuracy_rate ?? null;
    const baselineRate = w30?.accuracy_rate ?? null;
    const sampleCount7d = w7?.sample_count ?? 0;
    const sampleCount30d = w30?.sample_count ?? 0;

    const hypothesis = getHypothesis(signal_type);

    // ── DEGRADED check ───────────────────────────────────────────────────────
    // Formula: (baseline_rate - current_rate) >= 0.10
    // Both windows must have sample_count >= 3 and non-null accuracy_rate
    if (
      currentRate !== null &&
      baselineRate !== null &&
      sampleCount7d >= 3 &&
      sampleCount30d >= 3 &&
      baselineRate - currentRate >= 0.10
    ) {
      findings.push({
        signal_type,
        detection_class: "DEGRADED",
        current_rate: currentRate,
        baseline_rate: baselineRate,
        sample_count_7d: sampleCount7d,
        sample_count_30d: sampleCount30d,
        hypothesis: hypothesis.likely_cause,
        fix_area: hypothesis.fix_area,
      });
    }

    // ── PERSISTENTLY_LOW check ───────────────────────────────────────────────
    // Formula: baseline_rate < 0.40 AND sample_count_30d >= 10
    if (
      baselineRate !== null &&
      sampleCount30d >= 10 &&
      baselineRate < 0.40
    ) {
      findings.push({
        signal_type,
        detection_class: "PERSISTENTLY_LOW",
        current_rate: currentRate,
        baseline_rate: baselineRate,
        sample_count_7d: sampleCount7d,
        sample_count_30d: sampleCount30d,
        hypothesis: hypothesis.likely_cause,
        fix_area: hypothesis.fix_area,
      });
    }
  }

  return findings;
}
