---
task_id: "P1-G"
pilot: "kinh-dich"
phase: "1"
title: "P1-G Phase 1 Close-Gate Evidence (QA)"
produced_by: "qa"
produced_at: "2026-05-24T06:00:00Z"
gate_verdict: "CONDITIONAL-GO"
---

# P1-G Phase 1 Close-Gate Evidence

## QA-Independent Sandbox Run (AC-1 + AC-5)

**Command 1 — Primitive tier:**
```
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all

[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json
[PASS] hao-encoder-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json

[sandbox] PASS 12/12 scenarios (0 failed, 0 skipped)
```

**Command 2 — Module tier:**
```
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=module --module=kinh-dich --scenario=all

[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] PASS 2/2 scenarios (0 failed, 0 skipped)
```

**Command 3 — All tiers (G12 DoD):**
```
cd apps/kinh-dich-service && bun run src/sandbox/runner.ts --tier=all --module=kinh-dich --scenario=all

[PASS] hao-encoder-edge.json
[PASS] hao-encoder-failure.json
[PASS] hao-encoder-golden.json
[PASS] hexagram-resolver-edge.json
[PASS] hexagram-resolver-failure.json
[PASS] hexagram-resolver-golden.json
[PASS] ngu-hanh-classifier-edge.json
[PASS] ngu-hanh-classifier-failure.json
[PASS] ngu-hanh-classifier-golden.json
[PASS] reading-scorer-edge.json
[PASS] reading-scorer-failure.json
[PASS] reading-scorer-golden.json
[PASS] reading-composer-edge.json
[PASS] reading-composer-golden.json

[sandbox] PASS 14/14 scenarios (0 failed, 0 skipped)
```

**AC-1 verdict: PASS** — all three tiers green, exit 0, 14/14. QA-independent run.
**AC-5 verdict: PASS** — zero FAIL, zero SKIP, 14/14 PASS, exit 0.

---

## Full Test Suite (bun test + bun tsc)

```
bun test (apps/kinh-dich-service): 100 pass, 0 fail, 446 expect() calls — exit 0
bun tsc --noEmit: exit 0 (zero type errors)
```

---

## DDD Scan (Fence-A)

```
grep -rn "from.*application|from.*interface|from.*infrastructure|from.*module"
  apps/kinh-dich-service/src/primitive/
→ 0 actual import statements (comment-only lines excluded)
```

```
grep -rn "from.*infrastructure|from.*hono|SQLite|getDb|repositories"
  apps/kinh-dich-service/src/primitive/ src/module/ src/sandbox/
→ 0 actual import lines (JSDoc comment text only, not code imports)
```

**DDD verdict: PASS** — primitive and module layers are clean, no cross-layer imports.

---

## Security Scan

```
grep -rn "process.env|password|secret|api_key"
  src/primitive/ src/module/ src/sandbox/
→ 0 matches in primitive/module/sandbox layers
```

**Security verdict: PASS** — zero credentials, zero env var reads in sandbox-reachable code.

---

## AC-2: Dashboard Render Assessment

**File:** `apps/kinh-dich-service/dashboard/index.html` (1751 lines, static, self-contained)

**Structural verification (headless — no browser required):**
- DOCTYPE html: PRESENT (line 1)
- No `fetch()` calls: CONFIRMED (0 matches for active network calls)
- No XMLHttpRequest: CONFIRMED
- No CDN links: CONFIRMED
- `window.__PRIMITIVES_DATA__` embedded: CONFIRMED (line 1059)
- `window.__MODULE_DATA__` embedded: CONFIRMED (line 1205)
- All 11 embedded status values: `"status": "not-run"` (11 matches — honest cold-open)
- Port 5005 hardcoded from jq query (not live fetch): CONFIRMED (lines 12-13 comment + line 840)
- Three level-panels present: Primitives (line 850), Module (line 873), Microservice (line 895)
- Service card (kinh-dich-service): CONFIRMED (line 1444)

**HONEST-RED FINDING — reading-scorer 4th primitive card MISSING from dashboard:**
- `apps/kinh-dich-service/dashboard/index.html` contains 0 references to "reading-scorer"
- Dashboard was created P1-D (3 primitives) and updated P1-E (edit-rerun handler)
- P1-F added reading-scorer primitive (commit 43158e5c) but did NOT update dashboard
- P1-F handoff had zero dashboard requirements — the update was never tasked

**Card count:**
- Cards in DOM: 3 primitive groups (hao-encoder, hexagram-resolver, ngu-hanh-classifier) + 1 module (reading_composer) + 1 microservice = 5 groupings
- Cards expected by handoff: 4 primitive + 1 module + 1 microservice = 6
- Render %: 5/6 = 83%
- Threshold: ≥90%
- **AC-2 verdict: honest-RED — 83% < 90% threshold**

**Browser-only checks deferred to G9 PO Playwright:**
- Real "zero console errors" requires a browser — cannot verify headlessly
- Post-sandbox GREEN transition (AC-6 second half) requires live browser interaction
- Zero console errors: deferred to G9 PO Playwright

---

## AC-3: G12 Streak Verification (6/6)

Evidence from completion signals (QA-independently verified):

| Task | Signal file | Sandbox evidence | G12 verdict |
|------|------------|-----------------|-------------|
| P1-B1 | `dev-kinh-dich-p1-b1-done-20260524T000000Z.json` | AC-8 PASS in signal (G12 DoD Gate #1) + §R-FENCE Discovery in handoff | CONFIRMED |
| P1-B2 | `dev-kinh-dich-p1-b2-done-20260524T080000Z.json` | `[sandbox] PASS 6/6 scenarios (0 failed, 0 skipped)`, exit 0, `g12_streak.sandbox_all_green: true` | CONFIRMED |
| P1-B3 | `dev-kinh-dich-p1-b3-done-20260523T234143Z.json` | `[sandbox] PASS 9/9 scenarios (0 failed, 0 skipped)`, exit 0, `g12_streak.streak_complete: true` | CONFIRMED |
| P1-D | `pm-kd-P1-D-verified-P1-E-dispatch-20260524T020500Z.json` | PM verification: `g12_sandbox_gate: "PASS 11/11 scenarios (0 failed, 0 skipped)"`, `ac10_g12_dod_gate: "PASS"` | CONFIRMED |
| P1-E | `dev-kd-P1-E-done-20260524T001417Z.json` | `g12_sandbox: "[sandbox] PASS 11/11 scenarios (0 failed, 0 skipped)"`, AC-6 PASS | CONFIRMED |
| P1-F | `dev-kd-P1-F-done-20260524T051000Z.json` | `sandbox_verdict: "[sandbox] PASS 12/12"`, `sandbox_all_tiers: "[sandbox] PASS 14/14"`, AC-6 PASS | CONFIRMED |

**AC-3 verdict: PASS** — g12_streak: 6/6 CONFIRMED. All 6 sandbox-producing tasks held the DoD gate.

---

## AC-4: R-FENCE Discovery

**File verified:** `docs/handoffs/TASK_P1-KD-B1.md`

**§R-FENCE Discovery section present:** YES (lines 246-268)

**Content verified:**
- Import style confirmed: `.js`-suffixed ESM (e.g., `from '../../application/dtos.js'`)
- 5 representative grep matches documented (domain/services.ts, domain/repositories.ts, application/usecases.ts, interface/handlers.ts, interface/serializers.ts)
- Deliberate-violation pair: `import type { ReadingRequest } from '../../application/dtos.js'` in `src/primitive/hexagram-resolver/index.ts`
- Status: "RECORDED. Phase 2 G4 will use this recorded style for empirical AC-4b proof."
- R-FENCE verdict: "VIABLE — import style matched, deliberate-violation pair calibrated, no blockers."

**AC-4 verdict: PASS** — R-FENCE Discovery RECORDED in P1-B1 handoff.

---

## AC-6: Dashboard Honesty Contract

**Cold-open NOT-RUN state (structural):** CONFIRMED — all 11 embedded scenario objects have `"status": "not-run"`. JavaScript `renderPrimitives()` and `renderModules()` functions render NOT-RUN badge on initial load (line 1279: `return '<span class="not-run-badge">NOT-RUN</span>'`).

**Post-sandbox GREEN transition:** QA-verified sandbox 14/14 PASS at HEAD. Dashboard JS `parseNdjsonOutput()` + `applyResultsToState()` handlers are present (confirmed from P1-E signal AC-8 evidence). LIVE browser transition check deferred to G9 PO Playwright.

**G8 deliberate-break proof (from P1-E AC-5):** Corrupted hexagram-resolver-golden.json signals[5] 1→0 → `[FAIL] hexagram-resolver-golden.json | Expected hexagram 1 but got 43`. Reverted. Tree confirmed green at 11/11.

**AC-6 verdict: PASS (structural contract confirmed; browser interaction deferred to G9)**

---

## Exit Criteria Assessment

| # | Criterion | Measurement | Status |
|---|---|---|---|
| 1 | Time to first primitive | P1-A dispatch → P1-B1 DONE (commits show near-sequential same-day) | PASS (~4 agent-hours) |
| 2 | Sandbox all-green | `--tier=all --scenario=all`: 14/14 PASS, exit 0 (QA-independent run) | PASS |
| 3 | Dashboard ≥90% | 5/6 card groups rendered (reading-scorer missing) = 83% | FAIL (83% < 90%) |
| 4 | G12 earned (6/6 streak) | 6/6 CONFIRMED per signals (vs required 3/3) | PASS |

**3 of 4 criteria met → CONDITIONAL-GO** (per handoff §Exit Criteria: "3 of 4 met → CONDITIONAL-GO — cap Phase 2 at 1 task/sprint, re-evaluate")

---

## Blocking Issue (Criterion 3 / AC-2)

**File:** `apps/kinh-dich-service/dashboard/index.html`
**Issue:** reading-scorer 4th primitive (P1-F deliverable) is absent from the dashboard's `window.__PRIMITIVES_DATA__` array and from the primitives panel description (line 855 still lists "3 pure TypeScript functions"). Dashboard renders 5/6 expected card groups (83%) — below the 90% threshold.
**Root cause:** P1-F scope did not include a dashboard update task. The dashboard was frozen at P1-E (3 primitives) when P1-F added the 4th.
**Fix required:** Add reading-scorer 3 scenarios to `window.__PRIMITIVES_DATA__` in `apps/kinh-dich-service/dashboard/index.html` and update the panel description from "3" to "4 pure TypeScript functions". Estimated effort: 15 minutes.
**Severity:** CONDITIONAL — does not block Phase 2 completely; Phase 2 can proceed at 1 task/sprint pace per CONDITIONAL-GO rules.

---

## SI-2 Boundary Audit

`docs/dashboards/index.html` — NOT touched by any kinh-dich Phase 1 task (confirmed via git log). SI-2 boundary held.

---

## Scope Confirmation

**SSOT not modified:** `docs/data/pilot-status-kinh-dich.json` — read-only audit, not mutated.
**Goal states not modified:** No G-goal flips (Charter §4.5 — PO-only at 12/12 terminal close).
**Foreign pilot files not touched:** No commits to `apps/technical-analysis/`, `apps/macro-indicators/`, `apps/stock-price/` in this audit.
**Production code not modified:** QA performed read-only audit + signal emit only.
