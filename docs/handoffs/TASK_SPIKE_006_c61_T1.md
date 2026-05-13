---
task_id: SPIKE_006-c61-T1
title: Raise hitThresholdPct 0.1→1.0 + update tests
ship_order: 1
status: todo
zone: apps/mcp-server/src/domain/
files:
  - apps/mcp-server/src/domain/services/alertOutcomeScorer.ts
  - apps/mcp-server/src/__tests__/1847d-alert-outcome-scorer.test.ts
acceptance_criteria:
  - AC-3 verified: 0.5% move → UNKNOWN (below new threshold)
  - AC-3 verified: 1.1% move → HIT (above new threshold)
  - All 1847d tests pass
  - No interface layer touched (domain-only change)
---

## Summary

Raise the noise-floor threshold for `price-signal` alerts from 0.1% to 1.0%.

## Details

**File:** `apps/mcp-server/src/domain/services/alertOutcomeScorer.ts`
- Find: `hitThresholdPct = 0.1` for `price-signal` class
- Change to: `hitThresholdPct = 1.0`
- Composite class threshold stays at 0.1 (OOS-2)

**Test File:** `apps/mcp-server/src/__tests__/1847d-alert-outcome-scorer.test.ts`
- Add case: 0.5% move on price_drop → scores UNKNOWN
- Add case: 1.1% move on price_surge → scores HIT

**Context:**
- Source brief: `docs/REQ_SPIKE_006_c61.md` § AC-3
- Architect design: `docs/architecture-briefs/2026-05-13-spike-006-c61-fix-design.md` § 3
- This is a pure domain change; no infra, no interface wiring yet (happens in T-2)

## Next Task

After this task ships with green tests, developer picks up T-3 (intraday gate computation).
