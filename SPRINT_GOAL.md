# Sprint Goal

## Sprint 230 — Verify Bootstrap Performance + Signal Quality Hardening

**Goal:** Validate that `get_cycle_bootstrap` tool meets its ≤3s p95 latency SLA, verify signal validation logic prevents hallucinated prices from reaching MARKET channel, and harden the fail-loud protocol for partial bootstrap failures.

**Scope:**
- **FR-1**: Instrument bootstrap tool with latency telemetry; run 100+ calls during market hours; validate p95 ≤ 3s
- **FR-2**: Spot-check signal validation in agents (last 7 days); verify prices within ±5% of backend
- **FR-3**: Test fail-loud protocol with injected bootstrap failures; verify agents handle gracefully (no silent skip)
- **FR-4**: Extend signal confidence scoring to include timing + source freshness metadata

**Success metric:**
- Bootstrap p95 latency ≤ 3s (confirmed via instrumentation)
- 100% of posted signals (last 7 days) pass price ±5% validation
- All 3 bootstrap sub-call failures handled gracefully (agent-level fail-loud confirmed)
- Signal metadata now includes `confidence_score` + `validated_at` timestamp

**Size: M** (verification + hardening, full BA→Arch→PM pipeline)

---

## Sprint 229 — COMPLETE

**Status:** Price-staleness watchdog + fallback assessment COMPLETE & MERGED (2026-04-21)

**Recent completions:**
- Sprint 227: VPS watchdog recovery alerts
- Sprint 228: Foreign-flow parse hardening + defensive validation
- Sprint 226: Agent merge (9→7) + unified bootstrap tool

---

## Sprint 228 — fix(foreign-flow): root-cause parse errors + add defensive validation

**Goal:** Harden foreign-flow VPS fetch/parse pipeline against truncation + timeouts. Implement server-side validation + circuit breaker integration.

**Result:**
- `1566_a` RED: TDD test suite with 5 assertions ✅
- `1566_b` GREEN: foreignFlowValidator domain service + server.ts handler + DDD fix ✅
- `1566_c` VPS: fetch-foreign-flow.sh hardening + 16-section audit report ✅

**Success metric:**
- `bun test src/__tests__/1566-*.test.ts` → 5 pass ✅
- Full suite: 5982 pass baseline ✅
- `bun tsc --noEmit` clean ✅
- All 3 tasks merged to main ✅
- DDD layer violations resolved ✅

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
