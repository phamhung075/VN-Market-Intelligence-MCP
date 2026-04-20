# Sprint Goal

> Previous sprint goals live in their `docs/REQ_NNN.md` specs. This file = current sprint only.

## Sprint 211 — ACTIVE (2026-04-20)

**Goal:** Modular Monolith Phase 3a — move kinhdich tool + wrapper files into their module subfolders. Barrels from Phase 2 already in place; only re-export paths and relative imports inside moved files change.

**Scope:**

| Area | IN | OUT |
|------|----|-----|
| tools/kinhdich/ | Move kinhDichTools.ts into subfolder, update barrel | Other modules |
| domain/services/kinhDich/ | Move kinhDichWrapper.ts into existing subfolder, update services/index.ts | Logic changes |
| scheduler | No kinhdich jobs exist | — |

**Success metric:**
- `kinhDichTools.ts` + `kinhDichWrapper.ts` no longer at root of their layer dirs
- `bun tsc --noEmit` clean, `bun test` all green
- Test `211-kinhdich-module-move.test.ts` verifies barrel exports resolve

**Sprint sequence (Phase 3 full plan):**

| Sprint | Module | Tool files | Domain files | Jobs |
|--------|--------|-----------|--------------|------|
| 211 | kinhdich | 1 | 1+subfolder | 0 |
| 212 | financial-reports | 3 | ~8 extractors | 2 |
| 213 | system | 6 | ~8 utils | 2 |
| 214 | briefings | 5 | 0 direct | 3 |
| 215 | alerts | 8 | 6 | 3 |
| 216 | portfolio | 7 | 4 | 1 |
| 217 | macro | 6 | 7 | 6 |
| 218 | market-data | 9 | ~10 | 8 |
| 219 | news-analysis | 8 | 10 | 5 |
| 220 | sector | 14 | 10 | 4 |

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
