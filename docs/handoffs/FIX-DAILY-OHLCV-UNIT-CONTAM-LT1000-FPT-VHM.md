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

---

## [Developer] Implementation Record — CONTAM-10-WRITER

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Task:** CONTAM-10-WRITER (writer-side durability fix — stops NEW whole-row close<1000 contamination at ingest)
- **Files modified:**
  - `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` — added `CLEAN_CLOSE_FLOOR` constant, `fetchCleanReferenceCloseMap` private function, `cleanRefMap` call in Stage 1, `effectivePrevClose` logic in Stage 3
- **Tests written:** `apps/mcp-server/src/__tests__/OHLCV-WHOLEROW-LT1000-writer-guard.test.ts` — 3 assertions, all GREEN
  - TC-WG-1: contaminated prevClose + cleanRef → ×1000 correction applied
  - TC-WG-2: clean prevClose → effectivePrevClose = prevClose → no regression
  - TC-WG-3: legitimately cheap stock (all-history close < 1000) → no cleanRef → no correction
- **Git commits:** `ec8b409c fix(mcp-server/ohlcv): CONTAM-10-WRITER — writer guard for whole-row close<1000 contamination`
  - in-HEAD: confirmed
  - explicit-paths: `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` + `apps/mcp-server/src/__tests__/OHLCV-WHOLEROW-LT1000-writer-guard.test.ts` (NEVER `-A`)
  - leak-clean: confirmed (no secrets/tokens in diff)
- **Type check:** clean (bun tsc --noEmit — 0 errors)
- **bun test:** 14100 pass / 0 fail (full suite, exit code 0); targeted: 3 pass / 0 fail (writer guard tests alone)
- **Tool count:** 182 tools — matches pre-task baseline (no barrel change, no tool silenced)
- **Scheduler count:** 3 cron.schedule entries — matches pre-task baseline (no scheduler file touched)
- **Rebuild:** mcp-server image rebuilt (`docker compose up -d --build mcp-server`); Up 14s (healthy) confirmed; all peer containers untouched (technical-analysis ~1hr, frontend 14hrs, stock-price 18hrs, macro-indicators 20hrs, api-gateway/pdf-extractor 2 days, kinh-dich/news-fetch/alert-engine 4 days)
- **DDD invariant:** `normalizeOhlcvToVnd` domain function UNCHANGED. Fix lives entirely in `application/usecases`. No new files in application layer (one private function + two variable assignments per brief).
- **Docs updated:** NONE (no architecture/microservice doc touched)
- **Graphify:** skipped (no docs impacted)
- **Simplicity gate:** PASS — fetchCleanReferenceCloseMap mirrors fetchPrevCloseMap pattern, effectivePrevClose is a one-liner ternary; no over-engineering

---

## [Architect] Brownfield Findings — Round 2 (2026-07-08, PO re-triage of telegram 3518/3519)

CONTAM-10-MIGRATION and CONTAM-10-WRITER (above) shipped 2026-06-30 and are in the deployed
image (built 2026-07-04T07:58Z, confirmed via `docker exec ... grep CLEAN_CLOSE_FLOOR` on the
live container — code present). CONTAM-10-EXEC (the live repair run) was **never executed** —
dry-run against the live named volume TODAY still shows **6,533 candidate rows / 27 tickers**
(grew from the original alert's "10 rows/7 days"). Root cause of the growth, found via RAW
verification against the live container (not the local decoy `data/market.db`):

### RAW evidence

```
docker exec vn-market-intelligence-mcp-mcp-server-1 bun run /app/repair-ohlcv-wholerow-check.ts --dry-run
→ 6533 rows / 27 tickers; VHM 155 rows (2025-08-27..2026-07-07) anchor_close=146000
                          VIC 246 rows (2025-07-11..2026-07-07) anchor_close=214000
```
VHM/VIC contaminated ranges extend to **2026-07-07 (yesterday)** — contamination is still
ACTIVE, not just historical residue. Querying `daily_ohlcv` directly: 24+ tickers (VHM, VIC,
SSI, TCB, VCB, …) share one identical `updated_at=2026-07-07T19:10:48.142Z` timestamp across
~750 rows each (2023-07-04..2026-07-07 full history) — a single bulk backfill write, not the
daily aggregator (which writes one row/day). `docs/…/daily_ohlcv` also has 9 `ohlcv_backfill_queue`
rows queued between 16:35–19:04 on 2026-07-07 alone → this path fires roughly every 15–30 min.

### Root cause chain — Writer H bypasses the CONTAM-10-WRITER guard entirely

`apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts::handlePushOhlcvHistory`
(route `POST /api/push-ohlcv-history`, called by `vps-scripts/fetch-ohlcv-backfill.sh` on the
`ohlcv_backfill_queue` poll cycle — confirmed live/active, NOT a one-time script) does a raw
`INSERT … ON CONFLICT DO UPDATE` and calls **only** `validateOhlcvUnit` (intra-row). It never
calls `writeOhlcvBatch` — so it never benefited from CONTAM-10-WRITER's `fetchCleanReferenceCloseMap`
/ `effectivePrevClose` cross-day scale detector. `validateOhlcvUnit` alone is structurally blind
to whole-row-uniform values in `[100, 10_000_000]` (Rule 2/3 only fire on a *mixed* intra-row
scale, not a uniformly-scaled row) — same blind spot the 2026-06-30 brief already diagnosed for
`normalizeOhlcvToVnd`. This is the SAME class as CONTAM-6's blind spot, now reproduced in a writer
that was never migrated.

The source-side script has the identical gap: `vps-scripts/fetch-ohlcv-backfill.sh:245`
`normalizeThousandVnd` jq filter — `if (.close > 0 and .close < 100) then …*1000…` — uses the
same `STOCK_MIN_VND=100` threshold, so VNDirect thousand-scale values of 100–999 (e.g. VHM≈150,
VIC≈214, FPT≈130, BMP≈150, KSV≈155 — every ticker in the 27-ticker candidate list) pass through
unnormalized on the client side too. Server-side is the authoritative SSOT gate per existing
architecture (never trust the client) — the durable fix belongs in Writer H, not the shell script.

### PO hazard investigated — flat seed bars ARE picked up as anchors, confirmed live

```
VHM 2026-04-30 & 2026-05-01: open=high=low=close=146000, volume=6988500 (IDENTICAL both days)
VIC 2026-04-30 & 2026-05-01: open=high=low=close=214000, volume=5786200 (IDENTICAL both days)
```
These are the cancelled-FIX-OHLCV-CLASS3 cold-start seed rows. They have **volume > 0** (not the
`volume=0` FR-G3 signature), so both the repair migration's anchor CTE (`close>=1000 AND
volume>0`) and the writer's `fetchCleanReferenceCloseMap` (same predicate) pick VHM's anchor as
this exact seed row (`anchor_close=146000`, confirmed in the dry-run output above). Per PO: the
VALUE is correct-scale, so the ×1000 candidate-detection math stays numerically safe — **no
predicate change needed for correctness**.

**Design decision (no algorithm change):** a plain `O=H=L=C` filter is NOT a safe way to exclude
these rows from anchor selection — the live DB has 148,803 legitimately-flat bars with
`volume>0` (illiquid VN stocks genuinely trade a single price all day; verified via direct query,
e.g. ticker A32 has dozens). Filtering all flat bars out of the anchor pool would silently break
anchor selection for hundreds of thin tickers. The existing predicate (per-row ratio vs the most
recent `close>=1000 AND volume>0` bar — **not** a boundary/discontinuity scan that has to locate
"where clean data starts") is inherently robust to this hazard because it never has to decide
whether any single row is "the start of clean, organic data" — it only needs the row's *value* to
be correct-scale, which the seed bars are. **Do not redesign toward a boundary-scan algorithm** —
that is the design PO's hazard note is warning against, and it is not what's implemented.
Residual, cosmetic-only gap: the repair script's per-ticker dry-run report prints
`anchor_close=146000` with no indication it's a synthetic flat seed row, which could mislead a
human reviewer eyeballing the report into treating it as an organic trading day. Recommend a
non-blocking diagnostic annotation only (see PM decomposition below) — not a correctness fix.

### Durable writer guard — the actual scope of this task

**Fix:** migrate `handlePushOhlcvHistory` to call `writeOhlcvBatch(rows, db, {conflictStrategy:
"backfill"})` instead of hand-rolled INSERT + `validateOhlcvUnit`-only. `writeOhlcvBatch`'s
`UPSERT_BACKFILL_SQL` conflict clause is already semantically identical to Writer H's current SQL
(unconditional overwrite of open/high/low/close/volume/updated_at, foreign-flow columns
untouched) — this is a drop-in swap, not a rewrite. Keep the existing per-bar
number-or-numeric-string parse-and-reject pre-pass (`TASK-OHLCV-WIC-2`, already in the file) as a
thin adapter that builds `OhlcvWriteRow[]` — `writeOhlcvBatch` expects numeric fields, it does not
coerce strings itself. Response shape (`ok, inserted, skipped, code`) derives from
`writeResult.written` / `writeResult.skipped + writeResult.rejected.length`.

**Overlap check vs `FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0` (REVIEW, stalled 16d) — NOT a
conflict, confirmed non-overlapping:** that P0's Decision D-3 also touches `handlePushOhlcvHistory`,
but for the high/low **type-coercion** gap (never default high/low to `open`) — pure Rule-5
intra-row plausibility, already present in the current file (`TASK-OHLCV-WIC-2-writer-h-coerce.test.ts`,
GREEN) and explicitly scoped by that task's own Decision D-1 as "the remaining gaps are Writer F
and Writer H (type coercion)" — cross-day whole-row scale detection was explicitly NOT in that
task's scope (same distinction PO's dispatch note draws). Migrating Writer H to `writeOhlcvBatch`
in THIS task **preserves** the existing coercion pre-pass (does not touch/revert it) and
additionally runs the coerced values through `writeOhlcvBatch`'s own `validateOhlcvUnit` call, so
Rule 5 stays enforced either way — no regression risk to the P0's existing coverage. PM should
still leave the P0 task's own status/verification gate untouched; this is an additive, disjoint
change.

**Residual accepted gap (flag only, out of scope):** a brand-new ticker backfilled for the first
time with **zero** prior `daily_ohlcv` history and a real price ≥100,000 VND has no `prevClose`/
`cleanRef` reference at all — even post-fix, `writeOhlcvBatch` cannot detect the scale error on
that very first write (symmetric to the already-accepted "legitimately cheap stock" case). Not
exploitable for VHM/VIC/FPT (deep history exists) — only matters for a freshly-added watchlist
ticker's first backfill. Note for PM/QA visibility; not actionable in this task.

**Lower-priority sibling gap (flag only, recommend separate backlog item):** Writer E
(`apps/mcp-server/src/infrastructure/fetchers/ohlcvBackfill.ts`, called once from
`ohlcvStartupProbe.ts` at container boot) calls `normalizeOhlcvToVnd` only — same structural gap,
but fires once per boot vs Writer H's ~15–30 min cadence. Not the active/reproducing vector for
this incident; do not fold into this task's WIP to keep it tight.

### Files (Round 2 delta)

| File | Action | DDD Layer |
|------|--------|-----------|
| `apps/mcp-server/src/interface/mcp/routes/ohlcvBackfillHandler.ts` | MODIFY — `handlePushOhlcvHistory`: swap raw INSERT + validateOhlcvUnit-only for `writeOhlcvBatch(rows, db, {conflictStrategy:"backfill"})` call; keep existing parse-and-reject pre-pass | interface |
| `apps/mcp-server/src/__tests__/CONTAM-10-WRITER-H-*.test.ts` | CREATE — regression: contaminated-batch + existing cleanRef → ×1000 corrected; brand-new ticker no history → written as-is (documents accepted gap); legit-cheap stock → unchanged | test |
| `apps/mcp-server/src/__tests__/{1350-ohlcv-backfill-endpoint,TASK-OHLCV-WIC-2-writer-h-coerce}.test.ts` | REGRESSION GUARD — must stay GREEN unmodified | test |
| `scripts/migrations/repair-ohlcv-unit-contamination-wholerow-lt1000.ts` | OPTIONAL MODIFY — per-ticker report: annotate when `anchor_close` row is itself `O=H=L=C` (diagnostic only, no predicate/math change) | migration script |

### Updated PM Task Decomposition (supersedes Round-1 table above for EXEC ordering)

| Task (proposed) | Zone | Parallel? | Depends |
|---|---|---|---|
| CONTAM-10-WRITER-H | `apps/mcp-server/src/interface/mcp/routes/` + `__tests__/` | parallel-safe (disjoint file from WRITER round 1) | none |
| CONTAM-10-MIGRATION-ANCHOR-DIAG (optional, small) | `scripts/migrations/` | parallel | none |
| CONTAM-10-EXEC-2 (re-run live repair + B serving-layer probe) | live-DB / gateway | **SEQUENTIAL — blocks on CONTAM-10-WRITER-H landing + redeploy first** (new gate; running the repair before the writer fix just gets re-contaminated by the next ~15-30min VPS poll cycle) | CONTAM-10-WRITER-H |
| BACKLOG (not this sprint): Writer E hardening, brand-new-ticker cold-start gap, VPS-script `normalizeThousandVnd` defense-in-depth threshold fix | `apps/mcp-server/src/infrastructure/fetchers/` / `vps-scripts/` | — | — |

**Critical ordering change vs Round 1:** Round 1 gated EXEC only on MIGRATION QA-pass. Round 2
adds a hard gate on WRITER-H, because WRITER-H (not WRITER round-1) is the actively-reproducing
leak — confirmed by live evidence above, not present at Round-1 design time.

### RETURN (Round 2)
```
DONE: Round-2 design complete — durable writer guard gap identified (Writer H bypasses
  CONTAM-10-WRITER), hazard investigated (flat-seed anchors confirmed live, predicate already
  safe by design), findings appended to this handoff.
ZONE: apps/mcp-server/ (primary) + scripts/migrations/ (optional diagnostic)
NEXT: pm | decompose CONTAM-10-WRITER-H / CONTAM-10-MIGRATION-ANCHOR-DIAG (optional) /
  CONTAM-10-EXEC-2 (sequential, gated on WRITER-H)
HANDOFF: docs/handoffs/FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM.md
PIPELINE: continue
```
