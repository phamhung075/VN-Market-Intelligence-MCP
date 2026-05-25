---
title: "Phase 1 Task Plan — frontend (TypeScript/Remix) — MVR Track"
date: "2026-05-25"
author: "architect (P0-FE-5)"
pilot: "frontend"
fleet_pilot_number: 10
phase: "1"
status: "READY-FOR-DISPATCH"
sprint_kickoff: "2026-05-25"
sprint_deadline: "2026-07-06"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/frontend-charter.md"
canonical_goals_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
brownfield_ref: "docs/architecture-briefs/2026-05-22-refactor/scale/frontend-brownfield.md"
language: "TypeScript"
runtime: "Node 20 / Remix"
owner: "dev-frontend"
wip_limit: 1
mvr_verdict: "MVR"
---

# Phase 1 Task Plan — `frontend` (TypeScript/Remix) — MVR Track

**Generated:** 2026-05-25 by architect (Phase 0, task P0-FE-5)
**Zone:** `apps/frontend/` ONLY (anti-scope-creep clause binding)
**Owner:** `dev-frontend`
**Language:** TypeScript / Remix (Node 20) — locked at charter creation
**WIP:** 1 task at a time throughout Phase 1
**Status:** READY-FOR-DISPATCH

---

## MVR-vs-FULL Scope Verdict — BINDING

**VERDICT: MVR (Minimum Viable Refactor)**

**Rationale:** The frontend is the LEAST domain-driven service in the fleet. The trust thesis is sharpest for computational services where AI agents fix pure-logic bugs. For a UI service, the trust question is "does the screen render correctly?" — not "does an algorithm compute correctly?" The existing Vitest + Playwright harnesses already cover the key pure functions. Heavy primitive extraction (sandbox runner, scenario JSON, 3-tier dashboard) would replicate the computational-service pattern in a domain where it delivers marginal trust value. The charter explicitly names this risk (§Key risks #4) and authorizes the lighter path.

**What MVR means for this service:**
1. **Pure formatter extraction** — 4 small pure functions extracted as primitives into `app/domain/formatters/`. No sandbox runner. No scenario JSON tier. Tested with Vitest (same harness already in place).
2. **Render-gate** — Playwright render check via `tests/e2e/` expanded with 3 targeted checks. This IS the frontend's trust contract (G9 analog).
3. **View-model tests** — Loader output shape tested with injected fake API responses (no real network). This is the frontend's G2 analog.
4. **No heavy 3-tier sandbox** — No `bun run sandbox --tier=primitive` command. No trace JSON. No standalone HTML dashboard separate from the running app.
5. **Dashboard = the running app itself** — For a UI, the Playwright-verified running app IS the dashboard trust layer. The three-level trust hierarchy collapses to: formatters (unit-tested) + Playwright render-gate (integration).

**What G7, G8 mean in MVR context:**
- G7 (edit-JSON-rerun) → edit a formatter unit test fixture, rerun `npm test`, see updated assertion. Zero DB creds in test env (already true — frontend has no DB).
- G8 (honest red/green) → Playwright spec deliberately fails a page check (mutate expected content), confirm the test goes red. Revert, confirm green.

**Market-data UI policy baked in (§Key risks #3, BINDING):**
The policy "always show change direction + delta %, never bare snapshot" MUST appear as an explicit test scenario for the `formatChangePct` primitive (P1-B2). The primitive must return the direction symbol + delta string, never a bare number.

---

## Why This Plan Is More Explicit Than Comparable Plans

Owner = `dev-frontend` is a specialist agent, but the MVR path is new territory for this fleet. This plan carries all context needed without requiring the dev to cross-reference multiple docs.

---

## Phase 1 Overview

Phase 1 delivers:
1. **4 pure formatter primitives** extracted from `dashboard.analysis.tsx` into `app/domain/formatters/`
2. **Vitest tests** for each formatter (reusing existing harness)
3. **View-model module stub** (`app/lib/view-models/analysis-vm.ts`) covering the loader→display-model transformation
4. **Playwright render-gate** (3 checks replacing/extending the 1-test smoke)
5. **Honest red/green proof** via Playwright deliberate-fail
6. **G12 flow rule** documented in `dev-frontend` flow

**Key constraint from brownfield:** `computeDecision`, `accuracyBadgeProps`, `deriveAccuracyDigestState` are ALREADY tested. Do NOT re-extract them — they are already primitive-level. Phase 1 extracts the 4 formatters that are CURRENTLY UNTESTED and buried in the route file.

---

## G12 Streak Tasks (3-Task Streak)

1. **P1-B1** (`formatDirectionArrow` primitive) — streak task #1
2. **P1-B2** (`formatChangePct` primitive with market-data policy baked in) — streak task #2
3. **P1-C** (view-model module stub + loader fixture test) — streak task #3

**Streak rule:** dev-frontend must not mark any of these tasks DONE until `npm test` shows all tests green and Playwright render-gate still passes.

---

## Pre-Revert Tags

| Tag | Phase | Who creates | Purpose |
|---|---|---|---|
| `frontend-pre-inject` | Phase 2 | qa | G10 rollback anchor before formatter bug injection |

No Phase 1 tags needed.

---

## Task Ledger

| ID | Title | Goals advanced | Blocks | Blocked by | Est | AC count |
|----|-------|----------------|--------|------------|-----|----------|
| **P1-A** | Playwright render-gate: expand smoke to 3 targeted checks | G6, G8, G9, G12 | P1-B1 | — | 1h | 6 |
| **P1-B1** | Formatter: `formatDirectionArrow` — extracted from dashboard.analysis.tsx | G1, G7, G12 | P1-B2 | P1-A | 45m | 5 |
| **P1-B2** | Formatter: `formatChangePct` — market-data policy baked in as tested scenario | G1, G7, G12 | P1-B3 | P1-B1 | 45m | 6 |
| **P1-B3** | Formatter: `formatSignalTypeLabel` — extracted from dashboard.analysis.tsx | G1, G7, G12 | P1-B4 | P1-B2 | 30m | 4 |
| **P1-B4** | Formatter: `classifyStaleBadge` — stale price detection for WatchlistTile | G1, G7, G12 | P1-C | P1-B3 | 45m | 5 |
| **P1-C** | View-model module stub: `analysis-vm.ts` + loader fixture test | G2, G7, G12 | P1-E | P1-B4 | 1.5h | 7 |
| **P1-E** | Honest red/green proof + zero-creds audit | G7, G8, G12 | P1-QA | P1-C | 45m | 5 |
| **P1-QA** | Phase 1 close-gate verification | G1, G2, G6, G7, G8, G12 | — | P1-E | 30m | 5 |

**Total atomic tasks:** 8
**Total estimated effort:** ~6.5 dev-hours (WIP=1 sequential)
**Total AC count:** 43

---

## Per-Task Acceptance Criteria

---

### P1-A — Playwright Render-Gate (3 targeted checks)

**Files touched:**
- `apps/frontend/tests/e2e/render-check.spec.ts` (CREATE — replaces / supplements smoke.spec.ts)

**Purpose:** Proves G6 (trust layer renders), G8 (honest red on broken page), G9 (dashboard is the trust contract). For the frontend, the running app IS the dashboard — Playwright is the render-gate.

**Three checks required:**

1. **Dashboard nav renders** — Navigate to `/dashboard/analysis`, confirm `<nav>` contains "VN Market Intelligence" and at least 4 nav links (Analysis, Services, Fetch Ops, VPS Proxy, Database).
2. **Stock selector section renders** — Page contains "Chọn cổ phiếu" section header and at least one ticker badge (e.g. VNM).
3. **Graceful degrade on API failure** — Navigate to `/dashboard/analysis`, page does NOT show unhandled error (no "Internal Server Error" in body text). Errors from api-gateway should be surfaced via the error banner, not as a 500 crash.

**Playwright config constraint:** `baseURL: http://localhost:3001` (existing). No change to playwright.config.ts needed.

**AC-1:** `tests/e2e/render-check.spec.ts` exists with 3 test cases named "dashboard nav renders", "analysis stock selector renders", "graceful degrade on API error".

**AC-2:** `npm run test:e2e` passes all 3 checks against a running dev server (`npm run dev`). Evidence: Playwright output showing 3/3 passed.

**AC-3:** Dashboard nav check confirms at least 4 NAV_ITEMS rendered (checks they match `dashboard.tsx` NAV_ITEMS array).

**AC-4 (G8 setup — honest red):** Dev deliberately introduces a broken expectation (e.g. expects "XXXX-NONEXISTENT" in nav), confirms test goes RED. Evidence: test failure output showing `expected: XXXX-NONEXISTENT`. Reverts, confirms GREEN. Evidence in handoff.

**AC-5 (G12 DoD gate):** All 3 render checks AND the existing smoke test pass before this task is marked DONE.

**AC-6 (zero-creds in test env):** Playwright specs contain zero hardcoded credentials. Verify: `grep -E "API_KEY|TOKEN|SECRET|PASSWORD|DB_PATH" apps/frontend/tests/e2e/` returns 0. Evidence in handoff.

---

### P1-B1 — Formatter: `formatDirectionArrow`

**Files touched:**
- `apps/frontend/app/domain/formatters/direction-arrow.ts` (CREATE)
- `apps/frontend/app/domain/formatters/direction-arrow.test.ts` (CREATE)
- `apps/frontend/app/routes/dashboard.analysis.tsx` (MODIFY — import from formatter, remove local `directionArrow` fn)

**Background:** `directionArrow(direction)` currently lives as an unexported function inside the 1440-line route file. It is a pure formatter: `string → {symbol: string, cls: string}`. Extraction makes it independently testable and moves display logic out of the route.

**G12 streak task #1.**

**Function signature (exact):**
```typescript
// apps/frontend/app/domain/formatters/direction-arrow.ts
export interface DirectionDisplay {
  symbol: string;
  cls: string;
}

export function formatDirectionArrow(
  direction: "up" | "down" | "flat" | string
): DirectionDisplay
```

**Expected outputs:**
- `"up"` → `{ symbol: "↑", cls: "text-green-400" }`
- `"down"` → `{ symbol: "↓", cls: "text-red-400" }`
- any other string → `{ symbol: "—", cls: "text-slate-500" }`

**AC-1:** `apps/frontend/app/domain/formatters/direction-arrow.ts` exists. Exported function `formatDirectionArrow`. Zero imports from `app/lib/api/` or `app/routes/` or `app/components/`.

**AC-2:** Unit test with ≥3 `it()` blocks: up → ↑ green, down → ↓ red, flat/unknown → — slate.

**AC-3:** `dashboard.analysis.tsx` updated: local `directionArrow` function REMOVED. Import `formatDirectionArrow` from `~/domain/formatters/direction-arrow.js`. All existing callers in the route updated.

**AC-4 (test green gate):** `npm test` exits 0, all tests including new direction-arrow tests PASS. Evidence: paste `npm test` output showing direction-arrow tests in PASS list.

**AC-5 (G12 DoD gate):** Playwright render-gate still passes after this change. `npm run test:e2e` shows all 3 checks PASS. Evidence in handoff.

---

### P1-B2 — Formatter: `formatChangePct` (market-data policy baked in)

**Files touched:**
- `apps/frontend/app/domain/formatters/change-pct.ts` (CREATE)
- `apps/frontend/app/domain/formatters/change-pct.test.ts` (CREATE)

**Background:** The market-data policy requires showing direction + delta %, never bare snapshot. Currently the `WatchlistTile` component renders this inline (see `dashboard.analysis.tsx:470-478`). Extracting it as a tested formatter makes the policy a first-class invariant.

**G12 streak task #2 — market-data policy baked in as a tested scenario (BINDING).**

**Function signature (exact):**
```typescript
// apps/frontend/app/domain/formatters/change-pct.ts
export interface ChangePctDisplay {
  formatted: string;   // e.g. "+2.5%" or "-1.3%" or "0.0%"
  symbol: string;      // "↑" | "↓" | "—"
  cls: string;         // tailwind color class
}

/**
 * Format a change percentage for display.
 * Market-data UI policy: ALWAYS show direction symbol + delta %.
 * NEVER return a bare number. Even 0.0% must show the "—" symbol.
 */
export function formatChangePct(changePct: number): ChangePctDisplay
```

**Expected outputs:**
- `2.5` → `{ formatted: "+2.5%", symbol: "↑", cls: "text-green-400" }`
- `-1.3` → `{ formatted: "-1.3%", symbol: "↓", cls: "text-red-400" }`
- `0.0` → `{ formatted: "0.0%", symbol: "—", cls: "text-slate-400" }`

**AC-1:** `apps/frontend/app/domain/formatters/change-pct.ts` exists. Zero imports from api/ or routes/.

**AC-2 (market-data policy test — MANDATORY):** Unit test MUST include an explicit test named "never returns bare number — market-data policy":
```typescript
it("never returns bare number — market-data policy", () => {
  const result = formatChangePct(2.5);
  // Must include both direction symbol AND % sign — never a raw float
  expect(result.formatted).toMatch(/[↑↓—]|[+-]?\d+\.\d+%/);
  expect(result.symbol).not.toBe("");
  expect(result.formatted).toContain("%");
});
```

**AC-3:** Test covers: positive change (↑ green), negative change (↓ red), zero change (— slate), large positive, large negative.

**AC-4:** Route file `dashboard.analysis.tsx` updated to import and use `formatChangePct` in `WatchlistTile` (replaces inline logic at L470-478).

**AC-5 (test green gate):** `npm test` exits 0. Evidence in handoff.

**AC-6 (G12 DoD gate):** Playwright render-gate still passes. Evidence in handoff.

---

### P1-B3 — Formatter: `formatSignalTypeLabel`

**Files touched:**
- `apps/frontend/app/domain/formatters/signal-type-label.ts` (CREATE)
- `apps/frontend/app/domain/formatters/signal-type-label.test.ts` (CREATE)
- `apps/frontend/app/routes/dashboard.analysis.tsx` (MODIFY — import, remove local `signalTypeLabel`)

**Background:** `signalTypeLabel(signalType)` maps internal enum keys to display labels. Pure string mapping, currently unexported in route file.

**Function signature (exact):**
```typescript
// apps/frontend/app/domain/formatters/signal-type-label.ts
export function formatSignalTypeLabel(signalType: string): string
```

**Mapping (exact — must match existing behavior):**
- `"chain_catalyst"` → `"cascade"`
- `"urgent_news"` → `"news"`
- `"price_anomaly"` → `"price"`
- `"cross_validate"` → `"validate"`
- `"fundamental_validation"` → `"BCTC"`
- `"price_confirmation"` → `"confirm"`
- `"verified_chain"` → `"verified"`
- `"signal_feedback"` → `"feedback"`
- any unknown → return `signalType` unchanged (passthrough)

**AC-1:** `apps/frontend/app/domain/formatters/signal-type-label.ts` exists. Zero infra imports.

**AC-2:** Unit test with ≥4 `it()` blocks: known keys map correctly, unknown key passthrough, empty string passthrough.

**AC-3:** Route updated: local `signalTypeLabel` removed, import from formatter.

**AC-4 (test green gate):** `npm test` exits 0. Evidence in handoff.

---

### P1-B4 — Formatter: `classifyStaleBadge`

**Files touched:**
- `apps/frontend/app/domain/formatters/stale-badge.ts` (CREATE)
- `apps/frontend/app/domain/formatters/stale-badge.test.ts` (CREATE)

**Background:** Stale-price detection is needed for the `WatchlistTile` display. Currently the absence of tile data yields `"Không có giá"` inline. A `classifyStaleBadge` formatter makes this deterministic and testable. It takes a `timestamp: string | undefined` and a threshold in minutes, returns a badge classification.

**Function signature (exact):**
```typescript
// apps/frontend/app/domain/formatters/stale-badge.ts
export type StaleBadge = "fresh" | "stale" | "unknown";

/**
 * Classify a price timestamp as fresh, stale, or unknown.
 * "unknown" when timestamp is absent/invalid.
 * "stale" when age > thresholdMinutes.
 * "fresh" otherwise.
 *
 * Note: Takes `now` as parameter for testability — never calls Date.now() internally.
 */
export function classifyStaleBadge(
  timestamp: string | undefined,
  thresholdMinutes: number,
  now: Date
): StaleBadge
```

**AC-1:** `apps/frontend/app/domain/formatters/stale-badge.ts` exists. Function accepts `now: Date` as parameter (never calls `Date.now()` or `new Date()` internally — deterministic). Zero infra imports.

**AC-2:** Unit test with ≥4 `it()` blocks: undefined timestamp → unknown, valid fresh timestamp → fresh, valid stale timestamp → stale, invalid string → unknown.

**AC-3:** Tests inject `now` explicitly — no `vi.useFakeTimers()` needed.

**AC-4 (test green gate):** `npm test` exits 0. Evidence in handoff.

**AC-5 (G12 DoD gate):** Playwright render-gate still passes. Evidence in handoff.

---

### P1-C — View-Model Module Stub

**Files touched:**
- `apps/frontend/app/lib/view-models/analysis-vm.ts` (CREATE)
- `apps/frontend/app/lib/view-models/analysis-vm.test.ts` (CREATE)

**Background:** The analysis loader at `dashboard.analysis.tsx:87-171` fetches data and aggregates it into `LoaderData`. Extracting the pure data-assembly step (data → view model) into a separate module tests the loader's computation without live network calls. This is the G2 (module composes primitives) analog for a UI service.

**G12 streak task #3.**

**View model function (exact pattern):**
```typescript
// apps/frontend/app/lib/view-models/analysis-vm.ts

import type { KinhDichMarket, MacroSnapshot, KinhDichReading } from "~/domain/market.js";
import { formatChangePct } from "~/domain/formatters/change-pct.js";
import { formatDirectionArrow } from "~/domain/formatters/direction-arrow.js";

export interface WatchlistSummaryVM {
  ticker: string;
  hasPrice: boolean;
  priceDisplay: string;
  changePctDisplay: string;  // always direction + %, never bare
  directionSymbol: string;
  directionCls: string;
}

/**
 * Build view model for a single watchlist tile.
 * Pure: no fetch, no Date.now() — inputs come from loader data.
 * Composes formatChangePct + formatDirectionArrow formatters.
 */
export function buildWatchlistTileVM(
  ticker: string,
  close: number | undefined,
  changePct: number | undefined,
  direction: "up" | "down" | "flat" | undefined
): WatchlistSummaryVM
```

**AC-1:** `apps/frontend/app/lib/view-models/analysis-vm.ts` exists. Imports ONLY from `~/domain/` and `~/domain/formatters/`. Zero imports from `~/lib/api/`.

**AC-2:** Unit test uses hardcoded fixture data (no mocking fetch). Tests: tile with price → correct formatted display, tile without price → hasPrice=false, direction "up" → ↑ symbol, direction "down" → ↓ symbol.

**AC-3 (multi-formatter scenario — G2 analog):** At least 1 test calls `buildWatchlistTileVM` and verifies BOTH `formatChangePct` AND `formatDirectionArrow` outputs are present in the view model. This is the multi-primitive composition proof.

**AC-4 (loader fixture test):** Add 1 test in `analysis-vm.test.ts` that verifies the market-data policy is upheld end-to-end: given a tile with `changePct: 1.5, direction: "up"`, `changePctDisplay` contains "%" and a direction symbol. Named: `"market-data-policy: view model output includes direction + delta, never bare snapshot"`.

**AC-5 (test green gate):** `npm test` exits 0, all 4 view-model tests PASS. Evidence in handoff.

**AC-6 (G12 DoD gate):** Playwright render-gate still passes (all 3 checks). Evidence in handoff.

**AC-7:** `grep -r "from.*lib/api/client" apps/frontend/app/lib/view-models/` returns 0.

---

### P1-E — Honest Red/Green Proof + Zero-Creds Audit

**Files touched:**
- `apps/frontend/tests/e2e/render-check.spec.ts` (MODIFY — add G8 deliberate-fail annotation)

**Purpose:** Proves G7 (edit-fixture-rerender) and G8 (honest red). For a UI service:
- G7 = edit a unit test fixture, rerun `npm test`, see updated outcome
- G8 = deliberately break a Playwright assertion, confirm red, revert, confirm green

**AC-1 (G7 proof — edit-fixture-rerun):** Dev edits `direction-arrow.test.ts` (changes an expected output, e.g. expects `"▲"` instead of `"↑"`), runs `npm test`, confirms test fails with expected vs received mismatch. Evidence: paste failing test output. Reverts fixture, reruns — PASS. Paste passing output.

**AC-2 (G8 Playwright deliberate-fail):** Dev edits `render-check.spec.ts` to assert non-existent content (`expect(page.locator("text=XXXX-NONEXISTENT")).toBeVisible()`), runs `npm run test:e2e`, confirms RED. Evidence: Playwright failure output. Reverts, reruns — GREEN. Evidence in handoff.

**AC-3 (zero-creds audit in test env):** `grep -rE "API_KEY|TOKEN|SECRET|PASSWORD|DB_PATH" apps/frontend/app/__tests__/ apps/frontend/tests/` returns 0. Evidence pasted in handoff.

**AC-4:** `grep -rE "process\.env\." apps/frontend/app/domain/formatters/` returns 0 (formatters are pure — no env access).

**AC-5 (G12 DoD gate):** `npm test` exits 0 (all Vitest tests pass). Playwright 3/3 PASS. Evidence in handoff.

---

### P1-QA — Phase 1 Close-Gate Verification

**Owner:** qa
**Files touched:** `docs/data/pilot-status-frontend.json` (update phase1 fields — QA reads, does not flip goals)

**AC-1:** `npm test` exits 0 with all Vitest tests PASS. Evidence: `npm test` output showing test count including all formatter + view-model tests.

**AC-2:** `npm run test:e2e` exits 0 with 3/3 Playwright render checks PASS. Evidence: Playwright output.

**AC-3:** G12 streak confirmed: P1-B1, P1-B2, P1-C each have `npm test` green evidence pasted into handoff before marked DONE. QA verifies handoff files for each.

**AC-4:** `grep -r "from.*lib/api/client" apps/frontend/app/domain/formatters/ apps/frontend/app/lib/view-models/` returns 0.

**AC-5:** Market-data policy test present: `grep -r "never returns bare number" apps/frontend/app/domain/formatters/change-pct.test.ts` returns 1 match. Evidence pasted.

---

## G7/G8 Goal Verification Adaptations for UI Service

Per charter §Key risks #2 (BINDING), the canonical G7/G8 verification methods are adapted for a UI:

| Goal | Canonical (computational) | Frontend adaptation (MVR) |
|---|---|---|
| G7 (edit-JSON-rerun) | Edit scenario JSON, run sandbox, see trace change | Edit test fixture value, run `npm test`, see assertion change |
| G8 (honest red/green) | Dashboard shows red on broken primitive | Playwright spec goes RED on broken page assertion |
| G9 (dashboard trust contract) | Separate HTML dashboard rendered from JSON traces | Running Remix app, verified by Playwright — confirmed with user "Can you tell if the formatters work from these test results?" |
| G10 (AI fixes bug ≤2 cycles) | AI fixes primitive, dashboard turns green | AI fixes formatter bug, `npm test` turns green in ≤2 cycles |
| G11 (regression alarm) | Dashboard flips another card red | Second formatter test breaks when fixing first — caught by `npm test` before DONE |

---

## File Layout After Phase 1

```
apps/frontend/
  app/
    domain/
      formatters/                    ← NEW
        direction-arrow.ts           ← P1-B1
        direction-arrow.test.ts      ← P1-B1
        change-pct.ts                ← P1-B2
        change-pct.test.ts           ← P1-B2
        signal-type-label.ts         ← P1-B3
        signal-type-label.test.ts    ← P1-B3
        stale-badge.ts               ← P1-B4
        stale-badge.test.ts          ← P1-B4
    lib/
      view-models/                   ← NEW
        analysis-vm.ts               ← P1-C
        analysis-vm.test.ts          ← P1-C
  tests/
    e2e/
      smoke.spec.ts                  ← EXISTING (keep)
      render-check.spec.ts           ← NEW (P1-A)
```

---

## Sequencing

```
P1-A (Playwright render-gate — 3 checks)
  └─► P1-B1 (formatDirectionArrow)           ← G12 streak #1
        └─► P1-B2 (formatChangePct + policy)  ← G12 streak #2
              └─► P1-B3 (formatSignalTypeLabel)
                    └─► P1-B4 (classifyStaleBadge + now injection)
                          └─► P1-C (view-model module stub)  ← G12 streak #3
                                └─► P1-E (G7/G8 proof + zero-creds)
                                      └─► P1-QA (close gate)
```

---

## Hard Constraints

| Constraint | Source |
|---|---|
| WIP=1 sequential throughout Phase 1 | MVR policy |
| Anti-scope-creep: `apps/frontend/` ONLY | charter |
| All `app/domain/formatters/` files: zero api/ or routes/ imports | DDD golden rule analog |
| All `app/lib/view-models/` files: zero api/client imports | DDD golden rule analog |
| `classifyStaleBadge` accepts `now: Date` — never calls `Date.now()` internally | testability rule |
| Market-data policy test MANDATORY in P1-B2 | charter §Key risks #3 |
| No `--no-verify`, no force push, no branch creation | CLAUDE.md |
| Explicit file staging only (`git add <path>`) | day-0 binding rules |
| G12 DoD: no DONE without `npm test` green evidence in handoff | G12 rule |

---

## Goals Roadmap — Phase 1 Contributions

| Goal | Status after Phase 1 | Verification source |
|---|---|---|
| G1 (primitives + scenarios) | EARNED-PENDING | 4 formatters × Vitest tests (adapted: Vitest ≠ scenario JSON, but MVR analog) |
| G2 (module composes primitives) | EARNED-PENDING | analysis-vm.ts multi-formatter proof |
| G6 (dashboard renders) | EARNED-PENDING | Playwright render-check 3/3 PASS |
| G7 (edit-rerun, zero creds) | EARNED-PENDING | P1-E fixture-edit + zero-creds grep |
| G8 (honest red/green) | EARNED-PENDING | Playwright deliberate-fail → RED proof |
| G3 (clean composition root) | N/A for MVR | Remix loader = composition root — already clean, no change needed |
| G5 (old code deleted) | N/A | No prior mcp-server location; G5=N/A for frontend |
| G4 (architecture fence) | STILL-UNMET | Phase 2: ESLint rule blocking `app/domain/formatters/` → `app/lib/api/` imports |
| G9 (trust contract) | STILL-UNMET | Phase 2: user verbal confirmation from Playwright output |
| G10 (AI fixes bug ≤2 cycles) | STILL-UNMET | Phase 2: QA injects bug in formatter |
| G11 (regression alarm) | STILL-UNMET | Phase 2: 2-trial coupling proof |
| G12 (streak 3/3) | EARNED-PENDING | P1-B1 + P1-B2 + P1-C streak |

**goalsEarned:** stays 0. PO-only flip at 12/12 terminal Phase 2 (§4.5 compliance).

---

## §4.5 Compliance

NO goal flip instructions in any task. `dev-frontend` does NOT update `pilot-status-frontend.json` goal fields. `goalsEarned` stays 0. `decisionMatrix` stays all-TBD. Phase 1 tasks carry only `goals advanced` labels (informational). PO is the sole authority for terminal goal state transitions.
