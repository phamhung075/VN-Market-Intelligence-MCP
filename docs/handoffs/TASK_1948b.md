# TASK_1948b — `degradationRules.ts` Domain Service

**Sprint:** 1948 Phase 1 (Shadow-Mode Orchestrator)  
**Branch:** `task/1948b-degradation-rules-domain`  
**Size:** S (~2h)  
**Zone:** `apps/mcp-server/`  
**Owner:** dev-mcp-server  
**Dependency:** 1948a (schema + store must be merged first)  
**Blocked by:** post-1945-verdict-resolution-scored-pct gate (2026-05-20T07:22Z) + 1948a merge

---

## Context

Phase 1 of the orchestrator detects signal accuracy degradation and generates a hypothesis using a rule-lookup table. This task implements the pure domain layer: the degradation detection logic and the rule map that maps signal_type to {likely_cause, suggested_fix, fix_area}.

This is a pure domain/services module with **zero imports** from infrastructure, scheduler, or application layers. It's pure data + pure functions — testable in isolation.

**Architecture references:**
- `docs/spikes/SPIKE_1947-auto-improve-loop.md` § 5 — rule-lookup table + Phase 1-2-3 strategy
- `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` — DDD layer assignment, risk flag R-4 (rule table coarseness)
- DDD layer: `domain/services` (pure, zero external imports)

---

## Acceptance Criteria

| AC | Criterion |
|---|---|
| AC-1 | `apps/mcp-server/src/domain/services/degradationRules.ts` created. File must have ZERO imports (not even from infrastructure or models). Pure data + pure functions only. |
| AC-2 | `DegradedSignalType` interface defined with: signal_type (string), window_7d_rate (number \| null), window_30d_rate (number \| null), sample_count_7d (number), sample_count_30d (number), degradation_reason ("regression" \| "persistently_low"), delta_pp (number). |
| AC-3 | `DegradationHypothesis` interface defined with: likely_cause (string), suggested_fix (string), fix_area (string). |
| AC-4 | `DEGRADATION_CAUSE_MAP: Record<string, DegradationHypothesis>` constant defined. Map must include entries for: "price_confirmation", "chain_catalyst", "volume_spike", "_default". Each entry has all 3 hypothesis fields populated with concrete investigation guidance. `_default` used as fallback for unknown signal types. |
| AC-5 | `classifyDegradation(signalType, rate7d, rate30d, count7d, count30d): DegradedSignalType \| null` function. Logic: Returns null if rate7d/rate30d both null. Returns degraded-reason="regression" if (rate30d - rate7d) >= 0.10 and both rates ≥ 3 samples. Returns degraded-reason="persistently_low" if rate30d < 0.40 and count30d >= 10. Otherwise returns null. All inputs are pure — no DB calls, no side effects. |
| AC-6 | `lookupHypothesis(signalType: string): DegradationHypothesis` function. Returns DEGRADATION_CAUSE_MAP[signalType] ?? DEGRADATION_CAUSE_MAP["_default"]. Always succeeds (never returns null/undefined). |
| AC-7 | Unit tests in `apps/mcp-server/__tests__/1948-self-improve-detection.test.ts` (6+ test suites, ≥15 assertions). Tests: (1) classifyDegradation with regression (rates=[0.45, 0.30], delta=0.15 → degraded), (2) classifyDegradation no regression (rates=[0.45, 0.42], delta=0.03 → null), (3) classifyDegradation insufficient sample (<3 in 7d → null), (4) classifyDegradation null rates → null, (5) classifyDegradation persistently_low (rate=0.30, count=15 → degraded), (6) lookupHypothesis known type → found, (7) lookupHypothesis unknown type → _default. No DB calls in tests. |
| AC-8 | All tests GREEN. Zero tsc errors. No linting errors. Zero imports from infrastructure/scheduler. |

---

## Files to Read First

1. `docs/spikes/SPIKE_1947-auto-improve-loop.md` § 4-5 — detection policy + hypothesis generation, rule map examples
2. `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md` § DDD layer assignment — domain/services is PURE
3. `apps/mcp-server/src/domain/services/` — review existing domain services (e.g., if any exist) to match code style
4. `docs/references/tree-map.md` — knowledge tree structure (optional, for understanding domain layer positioning)

---

## Files to Create

- `apps/mcp-server/src/domain/services/degradationRules.ts` (~60L)
- `apps/mcp-server/__tests__/1948-self-improve-detection.test.ts` (~100L)

---

## Files to Modify

| File | Change | Lines |
|---|---|---|
| (none) | N/A | 0 |

---

## Key Implementation Notes

1. **Pure domain layer:** This file has ZERO imports. Not even types from infrastructure. All interfaces are defined inline in this file. This is a deliberate DDD boundary: domain services are framework-agnostic.

2. **Detection thresholds:**
   - Regression: `baseline_rate - current_rate >= 0.10` (10 percentage points). Ensures meaningful signal (avoid noise with ≥3 samples in 7d).
   - Persistently low: `baseline_rate < 0.40` AND `sample_count_30d >= 10`. Only triggers if there's enough evidence (≥10 samples).
   - Insufficient sample: If either rate is null (< 3 samples), return null.

3. **DEGRADATION_CAUSE_MAP entries:**
   - `"price_confirmation"`: PMI/regime threshold too aggressive → false positives in overheat regime. Suggested fix: "Audit alert-engine PMI threshold for price_confirmation signal type; compare against overheat regime hit_rate". Fix area: `apps/mcp-server/src/scheduler/alerts/`.
   - `"chain_catalyst"`: TTL window too short → signal expires before 24h verdict closes. Suggested fix: "Extend chain_catalyst TTL from 120min; check news-scout confidence threshold against false positive rate". Fix area: `apps/mcp-server/src/scheduler/news/`.
   - `"volume_spike"`: Volume baseline uses 5-day MA; VN market holidays distort baseline. Suggested fix: "Audit volume spike MA window; add holiday-aware baseline computation". Fix area: `apps/technical-analysis/`.
   - `"_default"`: Unknown degradation — needs manual investigation. Suggested fix: "Run get_alert_accuracy for signal type over last 30 days and compare vs 7-day window". Fix area: `manual`.

4. **No DB dependency:** Even though this is used by the orchestrator job (which reads from DB), `degradationRules.ts` itself is fully testable without a database. The orchestrator job queries the DB and passes the aggregated rates + counts to `classifyDegradation()`.

5. **Backwards compatibility:** DEGRADATION_CAUSE_MAP is a plain Record. New signal types will hit `_default` until entries are added. This is intentional for Phase 1 (keep rule table simple and auditable).

---

## Sequencing & Dependencies

**Predecessor:** 1948a (must be merged so tests can import from improveCheckStore if needed for integration tests later)  
**Successor:** 1948c (orchestrator job calls these functions)

---

## Test Checklist

- [ ] classifyDegradation(price_confirmation, 0.30, 0.45, 7, 30) → degradation_reason="regression", delta_pp=0.15
- [ ] classifyDegradation(chain_catalyst, 0.40, 0.38, 10, 30) → null (delta too small)
- [ ] classifyDegradation(volume_spike, null, 0.35, 2, 30) → null (insufficient 7d sample)
- [ ] classifyDegradation(volume_spike, 0.25, 0.50, 12, 30) → degradation_reason="persistently_low" (baseline <0.40, ≥10 samples)
- [ ] classifyDegradation(unknown_type, 0.35, 0.40, 5, 20) → null (low sample, even with degradation)
- [ ] lookupHypothesis("price_confirmation") → returns hypothesis with fix_area
- [ ] lookupHypothesis("novel_signal_xyz_future") → returns _default hypothesis
- [ ] All 6+ test suites GREEN
- [ ] 0 tsc errors
- [ ] File has 0 imports

---

## QA Handoff

When dev-mcp-server submits, QA will verify:

1. 6+ unit tests GREEN
2. tsc clean
3. Zero imports from infrastructure/scheduler/application
4. DEGRADATION_CAUSE_MAP is complete (all current signal types from the system covered or use _default)
5. No regression in existing domain tests (if any)

**Report:** `reports/TASK_REPORT_1948b.md`

---

## Notes

- **Risk R-4 (MEDIUM):** Rule table is coarse and may miss novel signal types or nuanced degradation patterns. Mitigated by: (1) Phase 1 is shadow-only (human review before any dispatch), (2) Phase 3 can optionally replace rule-table with LLM hypothesis via cowork agent.
- **No Phase 2+ code here:** This task is pure Phase 1 foundation. Phase 2 (manual-gate dispatch) and Phase 3 (auto-dispatch with WIP cap) will add signal-bus integration, but degradationRules.ts remains unchanged.
