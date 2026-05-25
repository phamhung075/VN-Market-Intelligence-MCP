---
title: "TASK_P1-FE-WAVE-A — frontend Phase 1 MVR implementation handoff"
date: "2026-05-25T10:20:00Z"
author: "dev-frontend"
task: "P1-A + P1-B1 + P1-B2 + P1-B3 + P1-B4 + P1-C + P1-E"
pilot: "frontend"
phase: "1"
status: "DONE"
---

# Frontend Phase 1 MVR — Implementation Handoff

**Date:** 2026-05-25T10:20Z
**Agent:** dev-frontend
**Tasks:** P1-A, P1-B1, P1-B2, P1-B3, P1-B4, P1-C, P1-E (all Phase 1 MVR tasks except P1-QA)

---

## G12 Gate Evidence (MANDATORY — both must exit 0)

### Vitest (unit tests)
```
Test Files  18 passed (18)
     Tests  179 passed (179)
  Start at  10:20:15
  Duration  5.57s
```
**Result: 179/179 PASS — 0 failures**

### Playwright (render-gate)
```
Running 4 tests using 2 workers

  ✓  1 [chromium] › tests/e2e/smoke.spec.ts:7:1 › homepage renders with a meaningful title (333ms)
  ✓  2 [chromium] › tests/e2e/render-check.spec.ts:12:1 › dashboard nav renders (462ms)
  ✓  3 [chromium] › tests/e2e/render-check.spec.ts:25:1 › analysis stock selector renders (354ms)
  ✓  4 [chromium] › tests/e2e/render-check.spec.ts:35:1 › graceful degrade on API error (327ms)

  4 passed (2.3s)
```
**Result: 4/4 PASS (3 render-check + 1 smoke)**

---

## G7 Proof (edit-fixture-rerun, AC-1 of P1-E)

Edited `direction-arrow.test.ts` to expect `"▲"` instead of `"↑"`.

RED output:
```
× app/domain/formatters/direction-arrow.test.ts > formatDirectionArrow > up direction returns upward arrow with green class
  → expected '↑' to be '▲' // Object.is equality

 Test Files  1 failed | 17 passed (18)
      Tests  1 failed | 178 passed (179)
```

Reverted. GREEN output: `Tests  179 passed (179)`.

---

## G8 Proof (Playwright deliberate-fail, AC-2 of P1-E)

Edited `render-check.spec.ts` to assert `"XXXX-NONEXISTENT"` in nav.

RED output:
```
  ✘  1 [chromium] › tests/e2e/render-check.spec.ts:12:1 › dashboard nav renders (5.4s)
  Error: expect(locator).toContainText(expected) failed
  Expected substring: "XXXX-NONEXISTENT"
  Received string:    "VN Market IntelligenceHomeAnalysisServicesFetch OpsVPS ProxyDatabase"
  1 failed
  2 passed (8.3s)
```

Reverted. GREEN output: `4 passed (2.3s)`.

---

## Zero-Creds Audit (AC-3, AC-4 of P1-E)

```bash
grep -rE "API_KEY|TOKEN|SECRET|PASSWORD|DB_PATH" apps/frontend/app/__tests__/ apps/frontend/tests/
# Exit: 1 (0 matches)

grep -rE "process\.env\." apps/frontend/app/domain/formatters/
# Exit: 1 (0 matches)

grep -r "from.*lib/api/client" apps/frontend/app/domain/formatters/ apps/frontend/app/lib/view-models/
# Exit: 1 (0 matches)

grep -r "never returns bare number" apps/frontend/app/domain/formatters/change-pct.test.ts
# Exit: 0 (1 match — policy test present)
```

---

## Per-Task Summary

### P1-A — Playwright Render-Gate (DONE)
- `tests/e2e/render-check.spec.ts` created with 3 named tests
- `playwright.config.ts` updated: PORT env var support
- `vite.config.ts` updated: PORT env var support (defaults to 3001)
- `package.json` dev script: removed hardcoded port (PORT env var drives Vite)
- G8: deliberate-fail → RED confirmed, reverted → GREEN
- AC-6: zero creds in e2e specs confirmed

### P1-B1 — formatDirectionArrow (DONE — G12 streak #1)
- `app/domain/formatters/direction-arrow.ts` created
- `app/domain/formatters/direction-arrow.test.ts` created (5 tests)
- `dashboard.analysis.tsx`: local `directionArrow` removed, import from formatter
- Vitest GREEN + Playwright GREEN evidence: see G12 gate above

### P1-B2 — formatChangePct (DONE — G12 streak #2)
- `app/domain/formatters/change-pct.ts` created
- `app/domain/formatters/change-pct.test.ts` created (6 tests)
- "never returns bare number — market-data policy" test: PRESENT
- `dashboard.analysis.tsx`: WatchlistTile + SectorPeersBar use formatChangePct
- Vitest GREEN + Playwright GREEN evidence: see G12 gate above

### P1-B3 — formatSignalTypeLabel (DONE)
- `app/domain/formatters/signal-type-label.ts` created (8 mappings + passthrough)
- `app/domain/formatters/signal-type-label.test.ts` created (10 tests)
- `dashboard.analysis.tsx`: local `signalTypeLabel` removed, import from formatter
- Vitest GREEN evidence: 179/179

### P1-B4 — classifyStaleBadge (DONE)
- `app/domain/formatters/stale-badge.ts` created
- `app/domain/formatters/stale-badge.test.ts` created (8 tests)
- `now: Date` parameter injection — never calls `Date.now()` internally
- Vitest GREEN evidence: 179/179

### P1-C — View-Model Stub (DONE — G12 streak #3)
- `app/lib/view-models/analysis-vm.ts` created (buildWatchlistTileVM)
- `app/lib/view-models/analysis-vm.test.ts` created (6 tests)
- Composes formatChangePct + formatDirectionArrow (G2 multi-formatter proof)
- "market-data-policy" test: PRESENT
- Vitest GREEN + Playwright GREEN evidence: see G12 gate above

### P1-E — Honest Red/Green Proof (DONE)
- G7: direction-arrow.test.ts fixture edited → RED confirmed → reverted → GREEN
- G8: render-check.spec.ts broken assertion → RED confirmed → reverted → GREEN
- Zero-creds audit: all pass (evidence above)
- Final gate: 179/179 Vitest + 4/4 Playwright

---

## [Developer] Implementation Record

- **Service:** frontend
- **Zone:** apps/frontend/
- **Build tier:** 4 (Tier 1-3 already green from prior sprints)
- **Files modified:**
  - `apps/frontend/app/routes/dashboard.analysis.tsx`: removed 2 local pure fns (directionArrow, signalTypeLabel), added 3 imports, updated callers
  - `apps/frontend/playwright.config.ts`: PORT env var support, webServer command fix
  - `apps/frontend/vite.config.ts`: PORT env var support, test include patterns expanded
  - `apps/frontend/package.json`: dev script port hardcode removed
- **Files created:**
  - `apps/frontend/tests/e2e/render-check.spec.ts` — 3 render-gate tests
  - `apps/frontend/app/domain/formatters/direction-arrow.ts` + `.test.ts` — 5 tests
  - `apps/frontend/app/domain/formatters/change-pct.ts` + `.test.ts` — 6 tests
  - `apps/frontend/app/domain/formatters/signal-type-label.ts` + `.test.ts` — 10 tests
  - `apps/frontend/app/domain/formatters/stale-badge.ts` + `.test.ts` — 8 tests
  - `apps/frontend/app/lib/view-models/analysis-vm.ts` + `.test.ts` — 6 tests
- **Tests written:** 35 new Vitest tests + 3 new Playwright tests = 38 total new tests
- **Git commits:**
  - `3ef797d0` — P1-A render-gate + config
  - `eeb4d2f8` — P1-B1..B4 formatters
  - `9b55a086` — P1-C view-model
- **Type check:** clean (0 errors)
- **Service tests:** 179 pass / 0 fail (Vitest) + 4 pass / 0 fail (Playwright)
- **Docs updated:** notebook updated (dev-frontend.md)
- **Graphify:** skipped (no architecture docs impacted)

---

## G12 Streak Confirmation

| Streak task | Vitest GREEN | Playwright GREEN | Evidence |
|---|---|---|---|
| P1-B1 (formatDirectionArrow) | 149 pass | 4/4 pass | This handoff §G12 Gate |
| P1-B2 (formatChangePct) | 155 pass | 4/4 pass | This handoff §G12 Gate |
| P1-C (analysis-vm.ts) | 179 pass | 4/4 pass | This handoff §G12 Gate |

**Streak: 3/3 COMPLETE**

---

## §4.5 Compliance

`goalsEarned` field NOT updated. No pilot-status-frontend.json touched. PO-only gate.

---

NEXT: qa | run P1-QA close-gate on branch main (all changes committed to main per NO-BRANCHES policy)
HANDOFF: docs/handoffs/TASK_P1-FE-WAVE-A-20260525T1020Z.md
