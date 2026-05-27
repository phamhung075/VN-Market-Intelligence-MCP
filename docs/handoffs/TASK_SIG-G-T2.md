# TASK_SIG-G-T2 — Domain Detection Service (degradationRules.ts)

Sprint SELF-IMPROVE-GATE · Phase 2 lane-B proven-gate CODE · Task 2 of 6 dev tasks

**Owner:** dev-mcp-server | **Handoff from:** PM (SIG-IMPL-GATE decomposition) | **Date:** 2026-05-27

---

## Task Summary

Implement the pure domain-layer detection service: the `DEGRADATION_CAUSE_MAP` rule-table constant and the `detectDegradedSignalTypes()` function that applies the two-window delta policy (SPIKE_1947 §4 + §5 verbatim).

**Files to create:**
1. `apps/mcp-server/src/domain/services/degradationRules.ts` — NEW file

**Test file:** `apps/mcp-server/src/__tests__/1948b-degradation-rules.test.ts` — 8 acceptance criteria tests

**Dependencies:** TASK-1 (this task uses types from improveCheckStore, but not the store itself)

**Blocked by:** TASK-1 must be complete first (schema/types foundation)

**Blocks:** TASK-3 (orchestrator calls this detection function)

---

## DDD Layer

**Pure domain service:** This file contains ONLY:
- The `DEGRADATION_CAUSE_MAP` constant (pure data, zero side effects)
- The `detectDegradedSignalTypes()` pure function (pure computation, zero side effects)
- Type definitions (DegradationFinding, DetectionClass)

**Constraint:** ZERO imports from `infrastructure/` or `application/` layers. Only TypeScript stdlib + local type definitions. This is verified by AC-T2-7 (import-linter gate).

---

## DEGRADATION_CAUSE_MAP Constant (SPIKE §5 — verbatim)

```typescript
export interface DegradationHypothesis {
  likely_cause: string;
  suggested_fix: string;
  fix_area: string;
}

export const DEGRADATION_CAUSE_MAP: Record<string, DegradationHypothesis> = {
  price_confirmation: {
    likely_cause: 'price signal accuracy declined — source data stale or market condition shifted',
    suggested_fix: 'verify price source freshness; review signal correlation with price tiers',
    fix_area: 'apps/mcp-server/src/scheduler/alerts/',
  },
  chain_catalyst: {
    likely_cause: 'catalyst chain breaks — order execution or event sequencing failure',
    suggested_fix: 'audit event sequencing logic; re-verify order dependency graph',
    fix_area: 'apps/mcp-server/src/scheduler/alerts/',
  },
  volume_spike: {
    likely_cause: 'volume spike detection threshold mismatch — market volatility spike or signal tuning drift',
    suggested_fix: 'verify volume percentile threshold; re-baseline against current market',
    fix_area: 'apps/mcp-server/src/scheduler/alerts/',
  },
  _default: {
    likely_cause: 'signal-type-unknown weakness — requires manual triage',
    suggested_fix: 'investigate signal type; classify into known category or create new rule',
    fix_area: 'manual',
  },
};
```

**Modification rule:** ADD-only. Do NOT modify existing entries (that is lane-C per the handoff scope). New signal types from sprint 1948e-fix (e.g., `'legal_risk'`) may be added if they exist in `signal_outcomes` table; the `_default` fallback handles unknown types gracefully.

---

## Detection Function Interface

```typescript
// Local re-declaration to avoid infra import (DDD golden rule)
interface SignalAccuracyStatsByType {
  signal_type: string;
  stock_code: string;
  sample_count: number;
  accuracy_rate: number | null;
}

export type DetectionClass = 'DEGRADED' | 'PERSISTENTLY_LOW' | 'COVERAGE_GAP';

export interface DegradationFinding {
  signal_type: string;
  detection_class: DetectionClass;
  current_rate: number | null;    // 7d aggregated
  baseline_rate: number | null;   // 30d aggregated
  sample_count_7d: number;
  sample_count_30d: number;
  hypothesis: string;             // from DEGRADATION_CAUSE_MAP
  fix_area: string;               // from DEGRADATION_CAUSE_MAP
}

/**
 * Pure function: aggregates stats by signal_type, applies detection policy,
 * returns degradation findings.
 * 
 * ZERO imports from infrastructure or application layers.
 */
export function detectDegradedSignalTypes(
  stats7d: SignalAccuracyStatsByType[],
  stats30d: SignalAccuracyStatsByType[],
): DegradationFinding[];
```

---

## Detection Policy (SPIKE §4 — settled, do NOT re-litigate)

### DEGRADED: Two-window delta >= 10 percentage points

- Formula: `(baseline_rate - current_rate) >= 0.10`
- Both windows must have `sample_count >= 3`
- Both windows must have `accuracy_rate` (not null)

### PERSISTENTLY_LOW: 30d baseline < 40%

- Formula: `baseline_rate < 0.40`
- Must have `sample_count_30d >= 10`
- At least 10 samples over 30 days

### COVERAGE_GAP: Watchlist stock with signal offerings but no outcomes

- Queried separately via `queryCoverageGaps()` (TASK-3 concern)
- Not part of this function's return

### Aggregation Logic

Per-stock rows must be aggregated by `signal_type`:
- `sample_count_7d` = SUM of `sample_count` for all stocks in 7d array
- `sample_count_30d` = SUM of `sample_count` for all stocks in 30d array
- `current_rate` = WEIGHTED AVERAGE of `accuracy_rate` by `sample_count` in 7d (exclude null-rate rows)
- `baseline_rate` = WEIGHTED AVERAGE of `accuracy_rate` by `sample_count` in 30d (exclude null-rate rows)

### Dedup Behavior

A signal_type MAY appear as both DEGRADED and PERSISTENTLY_LOW (two separate findings). Return both. The orchestrator's anti-runaway gate (max 2 findings per run) will select top-2 by severity: `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`.

---

## Acceptance Criteria

### AC-T2-1: DEGRADED detection on 15pp delta with ≥3 samples

**Test:** Inject stats with signal_type='price_confirmation', 7d rate=0.40, 30d rate=0.55, both with sample_count ≥ 3. Call `detectDegradedSignalTypes()`. Assert returns 1 finding with `detection_class='DEGRADED'`.

**Evidence to paste:**
```
Test result: PASS
Input: 7d_rate=0.40, 30d_rate=0.55, delta=0.15 (>= 0.10), samples_7d=5, samples_30d=10
detectDegradedSignalTypes returns 1 finding
finding.detection_class: 'DEGRADED'
finding.signal_type: 'price_confirmation'
```

---

### AC-T2-2: No detection at 1pp delta

**Test:** Inject stats with delta=0.01 (below 10pp threshold). Call function. Assert returns empty array.

**Evidence to paste:**
```
Test result: PASS
Input: 7d_rate=0.50, 30d_rate=0.51, delta=0.01 (< 0.10)
detectDegradedSignalTypes returns: []
```

---

### AC-T2-3: PERSISTENTLY_LOW detection

**Test:** Inject stats with signal_type='chain_catalyst', 30d rate=0.35, sample_count_30d=15 (>= 10). Call function. Assert returns 1 finding with `detection_class='PERSISTENTLY_LOW'`.

**Evidence to paste:**
```
Test result: PASS
Input: 30d_rate=0.35 (< 0.40), sample_count_30d=15
detectDegradedSignalTypes returns 1 finding
finding.detection_class: 'PERSISTENTLY_LOW'
```

---

### AC-T2-4: Sample count gate blocks detection

**Test:** Inject stats with `sample_count_30d=2` (below DEGRADED threshold of 3). Call function. Assert returns empty array.

**Evidence to paste:**
```
Test result: PASS
Input: sample_count_30d=2 (< 3)
detectDegradedSignalTypes returns: []
No finding returned despite other conditions met
```

---

### AC-T2-5: Known type hypothesis lookup

**Test:** Inject finding with signal_type='volume_spike'. Call function. Assert hypothesis is the SPIKE §5 entry for `volume_spike`, not the `_default`.

**Evidence to paste:**
```
Test result: PASS
Input: signal_type='volume_spike'
finding.hypothesis contains: 'volume spike detection threshold mismatch'
Correct DEGRADATION_CAUSE_MAP entry used (not _default)
```

---

### AC-T2-6: Unknown type _default fallback

**Test:** Inject finding with signal_type='unknown_type_xyz' (not in map). Call function. Assert hypothesis is the `_default` entry, NOT undefined, NOT a throw.

**Evidence to paste:**
```
Test result: PASS
Input: signal_type='unknown_type_xyz'
finding.hypothesis: '[default hypothesis text]'
No exception thrown
Hypothesis is _default entry: YES
```

---

### AC-T2-7: Zero infrastructure imports

**Requirement:** Static/import-linter gate: `degradationRules.ts` must have zero imports from `infrastructure/` or `application/` layers.

**Test:** Grep the file for `import.*infrastructure` and `import.*application`. Assert both return 0 matches.

**Evidence to paste:**
```
Test result: PASS
grep 'import.*infrastructure' degradationRules.ts: 0 matches
grep 'import.*application' degradationRules.ts: 0 matches
File only imports TypeScript stdlib + local types
```

---

### AC-T2-8: DEGRADATION_CAUSE_MAP is const (immutable)

**Requirement:** `DEGRADATION_CAUSE_MAP` must be exported as `const` (not `let` or `function`). Runtime immutability is encouraged (e.g., `as const`, `Readonly<>`).

**Test:** Assert `typeof DEGRADATION_CAUSE_MAP === 'object'`. Attempt to mutate (runtime test): try `DEGRADATION_CAUSE_MAP.price_confirmation.likely_cause = 'modified'` and assert the mutation either (a) fails silently (frozen object) or (b) is detected by TypeScript's `as const` type checking.

**Evidence to paste:**
```
Test result: PASS
typeof DEGRADATION_CAUSE_MAP: 'object'
DEGRADATION_CAUSE_MAP is const (not let/function): YES
Immutability: [frozen object] or [as const type guard]
```

---

## Hardening Notes

**HN-2 (Anti-runaway order — applies to TASK-3, not here):** The architect's canonical order is `DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP`. When the orchestrator in TASK-3 needs to select top-2 findings, it will use this order. This function just returns all findings; the orchestrator handles severity sorting.

---

## Implementation Notes

1. **Aggregation:** The function receives two arrays of `SignalAccuracyStatsByType[]` — one for 7d, one for 30d. Group each array by `signal_type` (a map). For each signal_type, compute weighted averages and apply thresholds independently.

2. **Weighted average formula:**
   ```
   total_weight = sum of sample_count where accuracy_rate is not null
   weighted_avg = sum of (accuracy_rate * sample_count) / total_weight
   ```

3. **Local type re-declaration:** The function's input signature uses `SignalAccuracyStatsByType[]`, which is a LOCAL interface defined in this file (structurally compatible with infrastructure's `SignalAccuracyStats` via TypeScript duck-typing). This satisfies the DDD golden rule: domain defines its own input type, does not import from infra.

4. **Null handling:** If `accuracy_rate` is null for a stock, exclude it from the weighted average but count its `sample_count` in the total. A completely null rate means no data; a partially null rate means some stocks had data.

5. **Error handling:** This is a pure function. Do not throw (let invalid inputs fail the gate via test assertions). Return empty array if input is malformed (defensive).

6. **Module header:** Add a comment block explaining the DDD boundary and the zero-infra-import constraint.

7. **No git adds/commits:** Leave all files UNSTAGED for the main terminal to serialize the commit.

---

## Files Touched

| File | Change | Lines |
|---|---|---|
| `apps/mcp-server/src/domain/services/degradationRules.ts` | NEW | ~150 lines |
| `apps/mcp-server/src/__tests__/1948b-degradation-rules.test.ts` | NEW | ~250 lines (8 test suites) |

---

## Submission Checklist

- [ ] `degradationRules.ts` created with DEGRADATION_CAUSE_MAP + `detectDegradedSignalTypes()`
- [ ] Local `SignalAccuracyStatsByType` interface defined (no infra import)
- [ ] Weighted aggregation logic implemented correctly
- [ ] Test file created with 8 ACs passing
- [ ] AC-T2-1 through AC-T2-8 all PASS in `bun test`
- [ ] AC-T2-7 (import-linter) PASS: grep confirms zero infra imports
- [ ] AC-T2-8 (const) PASS: map is immutable
- [ ] No null dereferences, no bare `except` swallows
- [ ] All files UNSTAGED (NOT staged with `git add`)
- [ ] No new branches created (all on `main`)

---

## Next Task

After this task is complete and verified PASS, the next task is **TASK-3 (SIG-G-T3)**: `selfImproveOrchestratorJob.ts` + cron wiring. TASK-3 depends on TASK-2 (calls `detectDegradedSignalTypes()`).
