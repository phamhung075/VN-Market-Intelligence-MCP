# Handoff — FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM

**Sprint:** OHLCV-UNIT-CONTAM-WHOLEROW-LT1000
**Task ID:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**From:** architect → pm
**Date:** 2026-06-30

---

## [Architect] Brownfield Findings

- **Zone:** `apps/mcp-server/` + `scripts/migrations/`
  - Multi-zone — PM must split into per-zone subtasks per file scope.

- **Verified paths:**
  - `scripts/migrations/repair-ohlcv-unit-contamination.ts:1–314` — prior CONTAM-6 migration; predicate `(open < 100 OR low < 100) AND close >= 1000` structurally blind to whole-row close<1000 class; UPDATE normalizes open+low only.
  - `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:183–207` — `normalizeOhlcvToVnd`: fires only when `max(OHLC) < 100` (STOCK_MIN_VND). Gap: stocks at 100–999 in thousands format pass through uncorrected.
  - `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts:269–339` — `detectAndNormalizeScaleFromPrevClose`: uses DB-seeded prevClose; blind when prevClose is itself contaminated (ratio ≈ 1).
  - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts:1–417` — SSOT write chokepoint; pipeline: C=0 guard → FR-S1 → normalizeOhlcvToVnd → detectAndNormalizeScaleFromPrevClose → validateOhlcvUnit → upsert. `fetchPrevCloseMap` at lines 222–249.
  - `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts:1–333` — CONTAM-5 sanity job; 3 passes (intra-row, cross-day ratio 7-day window, seed-bar). INDEX_TICKERS constant at lines 61–62.
  - `apps/mcp-server/src/infrastructure/db/schema-market-data.ts:88–105` — `daily_ohlcv` schema: only OHLCV + foreign flow + data_env columns. No materialized RS/ROC columns confirmed.
  - `apps/mcp-server/src/interface/mcp/tools/market-data/relativeStrengthTools.ts` — RS computed-on-read by Go TA (source_tier: 3). NOT materialized.
  - `apps/mcp-server/src/interface/mcp/tools/market-data/rocMomentumTools.ts` — ROC computed-on-read by Go TA. NOT materialized.
  - `apps/mcp-server/src/interface/mcp/tools/market-data/52wProximityTools.ts` — 52w computed-on-read by Go TA. NOT materialized.

- **Reuse patterns:**
  - Deliverable A: follow `repair-ohlcv-unit-contamination.ts` structure exactly (exported `runRepair()`, dry-run/live CLI, human-confirm, BEGIN IMMEDIATE transaction, post-verify count). Reuse `INDEX_TICKERS` constant from sanity job.
  - Deliverable C.1: extend `ohlcvWriteService.ts` — add one private function, two variable assignments. No new files in application layer.
  - Deliverable C.2: extend `ohlcvSanityCheckJob.ts` Pass 4 inline. Reuse `INDEX_TICKERS` constant, existing `hits[]` array, existing `sendBugFn` Telegram path.

- **Design decisions:**
  - **A predicate**: per-ticker anchor approach — not blind close<1000. Anchor = most recent bar with `close >= 1000 AND volume > 0 AND date >= date('now','-180 days')` for the ticker. Candidate = bar where `anchor_close / bar.close >= 100`. This correctly handles: (a) index tickers excluded by both anchor and candidate clauses, (b) legitimately cheap stocks skipped (no anchor found), (c) RC3 safe (fresh data → if anchor exists, logic correct; if not, skip).
  - **B reflow**: NONE required. RS/ROC/52w self-heal post-repair (computed-on-read). Post-repair gateway probe is the acceptance gate.
  - **C.1 writer**: add `fetchCleanReferenceCloseMap` (full-history scan for `close >= 1000`). Use as `effectivePrevClose` when standard prevClose < 1000. Leaves `normalizeOhlcvToVnd` domain function UNCHANGED (purity preserved). Application layer only.
  - **C.2 sanity Pass 4**: full-table anchor divergence scan (one batched JOIN, not per-row). Flags `whole_row_lt1000_scale` class; hits join existing `hits[]` → same BUG Telegram path.
  - **DDD layer**: domain function `normalizeOhlcvToVnd` stays pure. Writer fix lives in `application/usecases`. Sanity job stays in `scheduler` (interface layer, infrastructure access allowed).

- **Scan clean:** true — no new microservice, no new ports/adapters, no DDD violations introduced.

- **BUILD-STANDARD: not-applicable** (bug-fix/maintenance, apps/mcp-server/ exists, no new primitives)

---

## Proposed PM Task Decomposition

| Task (proposed) | Zone | Files | Parallel? |
|-----------------|------|-------|-----------|
| CONTAM-10-MIGRATION | `scripts/migrations/` + `__tests__/` | new: `repair-ohlcv-unit-contamination-wholerow-lt1000.ts` + test file + dev-standards pointer | parallel with WRITER+SANITY |
| CONTAM-10-WRITER | `apps/mcp-server/src/application/usecases/` + `__tests__/` | modify: `ohlcvWriteService.ts` + new test | parallel with MIGRATION+SANITY |
| CONTAM-10-SANITY | `apps/mcp-server/src/scheduler/` + `__tests__/` | modify: `ohlcvSanityCheckJob.ts` + new test | parallel with MIGRATION+WRITER |
| CONTAM-10-EXEC | live-DB + gateway probe | dry-run review → live run → B probe | SEQUENTIAL: blocks on CONTAM-10-MIGRATION QA-PASS |

Sequential gate: CONTAM-10-EXEC requires CONTAM-10-MIGRATION to be QA-verified first (live DB mutation risk). WRITER and SANITY tasks do NOT block the exec — they prevent future contamination independently.

Full architecture brief: `docs/architecture-briefs/2026-06-30-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000.md`

---

## RETURN
```
DONE: Technical design complete, brownfield findings written to docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md
ZONE: apps/mcp-server/ + scripts/migrations/ (multi — PM splits per zone)
NEXT: pm | break into CONTAM-10-MIGRATION / CONTAM-10-WRITER / CONTAM-10-SANITY / CONTAM-10-EXEC
HANDOFF: docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md
PIPELINE: continue
```
