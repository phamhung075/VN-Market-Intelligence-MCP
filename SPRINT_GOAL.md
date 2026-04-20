# Sprint Goal

## Sprint 227 — fix(watchdog): MARKET "pipeline restored" alert on VPS recovery

**Goal:** When VPS data pipeline recovers after going stale, send a recovery confirmation alert to MARKET channel. Users should know when the briefing pipeline is working again, not just when it breaks.

**Scope:**

| Area | IN | OUT |
|------|----|-----|
| `1557_a` TDD RED | `src/__tests__/1557-watchdog-recovery.test.ts` — 3 assertions: (1) recovery fires after stale, (2) silent if never stale, (3) reset clears flag | SSH healing |
| `1557_b` GREEN | Add `lastWasStale` flag to vpsProxyWatchdogJob; export `_resetWatchdogStaleFlag()`; "ok" branch sends recovery MARKET msg + returns "restored"; set flag on alert-sent | |

**Success metric:**
- `bun test src/__tests__/1557-watchdog-recovery.test.ts` → 3 pass ✅
- Full suite: 5956 pass / 0 fail ✅
- `bun tsc --noEmit` clean ✅
- BOTH tasks (1557_a + 1557_b) merged to main ✅

**Status:** COMPLETE (2026-04-21)

---

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Phase 3 Modular Monolith — COMPLETE (2026-04-20)

**Goal:** Move all source files into dedicated module subfolders across 10 modules. Barrels from Phase 2 (sprint 210) already in place.

**Result:**

| Sprint | Module | Tool files | Jobs | Status |
|--------|--------|-----------|------|--------|
| 211 | kinhdich | 1 | 0 | DONE |
| 212 | financial-reports | 3 | 2 | DONE |
| 213 | system | 6 | 2 | DONE |
| 214 | briefings | 5 | 3 | DONE |
| 215 | alerts | 8 | 3 | DONE |
| 216 | portfolio | 7 | 1 | DONE |
| 217 | macro | 6 | 6 | DONE |
| 218 | market-data | 9 | 8 | DONE |
| 219 | news-analysis | 8 | 5 | DONE |
| 220 | sector | 14 | 0 | DONE |

All 10 modules restructured. tsc clean, all tests green.

---

## Sprint 210 — COMPLETE (2026-04-20)

**Goal:** Modular Monolith Phase 2 — add barrel `index.ts` files per feature module so agents and developers know exactly what each module exposes. No file moves, no logic changes.

**Scope:**

| Area | IN | OUT |
|------|----|-----|
| Tool module barrels | 10 sub-barrel dirs under `tools/` each with `index.ts` | Moving source files (Phase 3) |
| Top-level tools barrel | Replace outdated `tools/index.ts` with full grouped re-exports | Changes to registry.ts |
| Domain services barrel | Replace partial `domain/services/index.ts` with complete re-exports | Business logic changes |
| Scheduler barrel | New `scheduler/index.ts` re-exporting from `jobs.ts` | New scheduler logic |

**Success metric:**
- All 10 tool module barrels exist and export their register functions
- `bun tsc --noEmit` clean
- `bun test` all green
- Test `210-module-barrels.test.ts` verifies barrel exports are defined

---

## Sprint 209 — COMPLETE (2026-04-20)

**Goal:** Modular Monolith Phase 1 — split `schema.ts` (1,571 lines) into 9 per-domain schema slices.

---

## Sprint 208 — COMPLETE (2026-04-20)

**Goal:** fix(briefing): BCTC-overdue prefix dedup in unresolvedAlerts

---

## Sprint History (recent)

| Sprint | Goal | Status |
|--------|------|--------|
| 208 | fix(briefing): BCTC-overdue prefix dedup in unresolvedAlerts | COMPLETE 2026-04-20 |
| 207 | fix(signalDetector): priceSeverity HIGH threshold 10→7 | COMPLETE 2026-04-20 |
| 206 | fix(jobs): remove double recordJobRun wrap | COMPLETE 2026-04-20 |
| 205 | fix(test-isolation): 1526 mock.module poison removed | COMPLETE 2026-04-20 |
