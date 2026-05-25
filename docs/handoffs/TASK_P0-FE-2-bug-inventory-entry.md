# TASK_P0-FE-2 — Frontend Bug-Inventory Baseline Entry

**Task ID:** P0-FE-2
**Zone:** `apps/frontend/` (baseline metric only — no code changes)
**Owner:** architect (this cycle)
**Status:** DONE (architect deliverable complete)
**Created:** 2026-05-25

---

## Brief

P0-FE-2 establishes the bug-inventory baseline for the frontend SCALE pilot. This is the G10 metric "before" snapshot — the baseline fix-cycle count that Phase 2 must beat.

---

## [Architect] Baseline Analysis

### B-class vs Primitive Boundary for a UI Service

The charter and pilot-charter §Baseline Metric Capture define the G10 metric in terms of `baselineCycleCount` from `docs/data/bug-inventory.json`. For computational microservices, this is the average cycles to fix a domain-logic bug. For a UI service:

**B-class (render/IO) — EXCLUDED from primitive baseline:**
- React component rendering bugs
- Playwright e2e failures caused by DOM structure changes
- API fetch failures (infrastructure layer)
- Remix loader failures

**A-class (pure formatter/logic) — INCLUDED in primitive baseline:**
- Formatter output wrong (e.g. `formatChangePct` returns wrong sign)
- Pure function edge case not handled (e.g. `classifyStaleBadge` returning wrong classification for boundary timestamp)
- View-model computation incorrect (e.g. `buildWatchlistTileVM` returning wrong direction)
- `computeDecision` scoring bug (this is the strongest existing primitive-class precedent)

This is the same caveat as news-fetch P0-NF-2: "render/IO is B-class, NOT primitive."

### Historical Primitive-Class Bug Evidence

Scanning `docs/data/bug-inventory.json` (60-day window 2026-03-23 to 2026-05-22) for frontend-specific bugs:

- `1945b-frontend` task handled — accuracy-badge logic + digest-state derivation. Fixed in 1 cycle (frontend-specific logic bug). Fix commit in `TASK_1945b-frontend.md`.
- `1937-decision-logic` — `computeDecision` scoring, resolved in 1 cycle (initial TDD pass).
- `1940-accuracy-badge` — `accuracyBadgeProps` threshold logic, resolved in 1 cycle.
- `1936-client-timestamp` — hydration timing, 1 cycle.
- No frontend bug with fixCycles > 2 in the 60-day window.

**Zero bugs with fixCycles ≥ 3 in the frontend zone.** All primitive-class bugs resolved in 1 cycle. This is consistent with the fleet-wide baseline.

### Baseline Entry

```json
{
  "id": "frontend_baseline",
  "module": "frontend",
  "description": "UI formatter / view-model bugs (A-class only — B-class render/IO excluded). 60-day window 2026-03-23 to 2026-05-22.",
  "bugs": [
    {
      "id": "1945b-accuracy-digest-state",
      "fixCycles": 1,
      "type": "A-class",
      "resolved": true,
      "evidence": "deriveAccuracyDigestState + digestRateColor logic — 1 cycle fix"
    },
    {
      "id": "1940-accuracy-badge-threshold",
      "fixCycles": 1,
      "type": "A-class",
      "resolved": true,
      "evidence": "accuracyBadgeProps threshold logic — 1 cycle fix"
    },
    {
      "id": "1937-compute-decision-rsi-scoring",
      "fixCycles": 1,
      "type": "A-class",
      "resolved": true,
      "evidence": "computeDecision RSI zone logic — 1 cycle TDD fix"
    }
  ],
  "baselineCycleCount": 1.0,
  "windowDays": 60,
  "windowStart": "2026-03-23",
  "windowEnd": "2026-05-22",
  "capturedAt": "2026-05-25T00:00:00Z",
  "g10Target": "≤2 cycles (fleet-consistent)",
  "note": "All 3 observed primitive-class bugs resolved in 1 cycle. baselineCycleCount=1.0 is the honest measured baseline. System-wide fallback of 1.5 would overstate difficulty. G10 target = ≤2 cycles, consistent with fleet standard."
}
```

### G10 Injection Target Recommendation (Phase 2)

For G10 bug injection, the recommended target primitive is **`formatChangePct`** — off-by-sign bug (returns `"-2.5%"` when `changePct` is positive). This is:
- Single-literal fix (change sign condition)
- Makes the market-data policy test fail explicitly (the test named "never returns bare number" also catches the signed output)
- Verifiably fixed in ≤2 cycles
- QA uses `frontend-pre-inject` tag for rollback

---

## Acceptance Criteria

**AC-1:** Baseline analysis documented: B-class vs A-class boundary defined for a UI service.

**AC-2:** Historical A-class frontend bugs identified: 3 bugs, all fixCycles=1. baselineCycleCount=1.0.

**AC-3:** `docs/data/bug-inventory.json` updated with `frontend_baseline` entry. Entry uses same schema as other baselines in the file.

**AC-4:** G10 injection target named with rationale.

All ACs: COMPLETE (architect cycle 2026-05-25).

**Note on bug-inventory.json update:** The `frontend_baseline` JSON entry above is the canonical content. The architect commits it in the same batch as the Phase 1 plan. Dev-frontend does NOT modify bug-inventory.json during Phase 1 or Phase 2.
