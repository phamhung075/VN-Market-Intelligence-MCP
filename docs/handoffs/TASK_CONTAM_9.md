---
sprint: OHLCV-UNIT-CONTAM
branch: task/CONTAM-9-low-zero-pattern
size: M
zone: apps/mcp-server/
depends_on: []
blocks: []
---

# TASK CONTAM-9: Investigate and repair 519 rows with low=0 contamination pattern (SM-2 + SM-3 scope miss)

## TLDR

QA discovered 519 contaminated rows with a distinct defect pattern: `open < 100`, `close > 1000`, `low = 0` (with `open > 0`). These rows were outside the CONTAM-6 binding amendment scope (`low > 0` guard excluded them). 460 rows are pre-repair legacy; 59 rows inserted 2026-06-12 post-repair suggest CONTAM-2 guard does not fully block this pattern. Triage root cause (writer path), create repair migration, verify zero remaining.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] Root-cause identified: which writer emits `low=0` with `open < 100`? (Likely CONTAM-2 feed or upstream normalizer)
  - [ ] 460 pre-repair legacy rows repaired (open * 1000)
  - [ ] 59 post-repair rows (2026-06-12) investigated — CONTAM-2 guard scope reviewed or upstream bug identified
  - [ ] Migration script created (separate from CONTAM-6, similar dry-run + live modes)
  - [ ] Verification: 0 rows remaining with pattern `open < 100 AND close > 1000 AND low = 0 AND open > 0`
  - [ ] Commit follows convention (Task: CONTAM-9)
- **Files to read first:**
  - `docs/handoffs/TASK_CONTAM_6.md` (parent repair logic, binding amendment note)
  - `docs/agent-memory/decisions/sprint-OHLCV-UNIT-CONTAM-qa-contam6.md` L51–53 (scope miss findings SM-2 + SM-3)
  - `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` (original writer race analysis)
  - Apps where daily_ohlcv is written: `pushPricesHandler.ts`, `ohlcvDailyAggregatorJob.ts` (check normalization paths)
- **Files to create:**
  - `scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts` — new migration (parallel to CONTAM-6 script)
  - (Optional) Root-cause brief if upstream bug discovered
- **Files to modify:**
  - `docs/policies/dev-standards.md` § Script Persistence — add pointer to new script
- **Dependencies:** None (can run independently, but sequenced after CONTAM-8 close)
- **Knowledge needed:** CONTAM-6 repair pattern, daily_ohlcv schema, SQL filtering

## Context

### QA Findings (2026-06-12)

**SM-2:** 460 pre-repair rows match pattern:
- `open < 100` (scaled thousand-VND)
- `open > 0` (not all-zero defect)
- `close > 1000` (indicates mixed-unit contamination)
- `low = 0` (EXCLUDED from CONTAM-6 heuristic, which checks `low > 0`)

These rows were inserted before CONTAM-6 repair ran. Outside binding amendment scope by design (`low > 0` guard).

**SM-3:** 59 rows inserted 2026-06-12 (post-repair, post-CONTAM-2 deployment) with same pattern. This suggests:
- CONTAM-2 guard (which was supposed to stop new contamination) does NOT block `low=0` contamination
- Separate writer path or upstream normalizer issue

### Root-Cause Hypothesis

The CONTAM-2 guard likely checks `open < 100 AND close > 1000` (catches main split-scale bug) but may not enforce `low > 0`. Separately, upstream data sources or live-ticker feeds may emit `low=0` when only intraday high/close are available. 

**Triage scope:**
- Probe `pushPricesHandler.ts` and `ohlcvDailyAggregatorJob.ts` for low-value initialization/default
- Check upstream source (HSX/HNX/TCBS market-data feeds)

## Implementation Plan

### Phase 1: Root-Cause (Gated)

1. Query live DB: `SELECT DISTINCT code FROM daily_ohlcv WHERE open < 100 AND open > 0 AND close > 1000 AND low = 0 LIMIT 20` — note tickers and date range
2. Cross-check CONTAM-2 deployment date (2026-06-12) vs row insertion dates → confirm 59 rows are POST-deployment
3. Read writer paths (`pushPricesHandler`, `ohlcvDailyAggregatorJob`) — find where `low` defaults to 0
4. **Decision gate:** If root cause is upstream/feed-side (TCBS/HNX emits low=0), escalate to data-source owner; if writer-side, proceed to Phase 2

### Phase 2: Repair

If writer path is confirmed scoped (not upstream):

1. Create migration script `scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts`
   - Dry-run mode: SELECT count + sample 5 rows matching pattern
   - Live-run mode: UPDATE `open * 1000` where pattern matches
   - **DO NOT repair low** — low=0 is a separate defect (leave for upstream/TCBS fix or future sprint)
   - Safety guard: `AND NOT (open = 0 AND low = 0 AND high = 0 AND close = 0)` (skip all-zero rows)
2. Run dry-run: expect ~519 rows
3. Run live-run with user prompt
4. Verify: 0 rows remaining with the pattern

### Phase 3: CONTAM-2 Scope Review (Optional)

If confirmed that CONTAM-2 guard is incomplete:
- Output brief describing the gap (e.g., "CONTAM-2 blocks `open<100 AND close>1000` but not `low=0` variant")
- Recommend next-cycle enhanced guard or upstream fix

## Risk Mitigation

- **Upstream defect:** If root cause is TCBS/feed-side, do NOT repair in this task — escalate as separate backlog
- **Cross-writer race:** Same window as CONTAM-6 (off-hours, 09:30–14:00 UTC, outside VN market 02:00–09:00)
- **All-zero row collision:** Guard against all-zero rows (separate defect) using same `AND NOT (...)` clause as CONTAM-6

## Definition of Done

- [ ] Root-cause identified + logged (writer path or upstream)
- [ ] If writer-scoped: 519 rows repaired (460 legacy + 59 post-deploy)
- [ ] Verification: 0 remaining rows matching pattern
- [ ] Script in scripts/ with pointer in dev-standards.md
- [ ] Commit with Task: CONTAM-9 trailer
- [ ] Tests pass (bun test scripts)
- [ ] If upstream: escalation brief written + backlog entry queued for next cycle

## Zone & DDD Layer

- **Zone:** apps/mcp-server/ (scripts/migrations/ + writer inspection)
- **DDD:** Migration + writer diagnostics (utility)

## Related Documents

- Scope miss findings: `docs/agent-memory/decisions/sprint-OHLCV-UNIT-CONTAM-qa-contam6.md`
- Original architecture: `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md`
- CONTAM-2 guard scope: `docs/handoffs/TASK_CONTAM_2.md` (check guard implementation)

---

## [PM] Router Probe Evidence — Updated 2026-06-12T22:30Z

**Fresh leak specimen (FPT ticker, user-visible on frontend chart):**
- FPT 2026-06-03: `open=74.8, high=77700, low=0, close=76500` (open ~hundred-scale, high ~thousand-scale — mixed-unit defect)
- FPT 2026-06-11: `open=0, high=73900, low=0, close=73100` (partial-zero pattern)
- FPT 2026-06-12: `open=73.1, high=74300, low=0, close=73500` — **INSERTED TODAY POST-GUARD** (confirms CONTAM-2/3/4/5 still bleeding; SM-3 class confirmed live)

**Leak path:** FPT 2026-06-12 row insertion timestamp ≈ this morning's rebuild → cron_job_runs around insert time identifies active writer. Chart self-heals once rows are repaired (no frontend change needed).

**Status:** User-visible severity → escalated CRITICAL.

---

## [PM] Fresh User Evidence — 2026-06-12 (appended per CONTAM-9 user directive)

User-reported frontend display defects (price table/chart) on 2026-06-12:
- FPT 2026-06-12: close=73.500 displayed with biến động +100447.2%, open=73,1, high=74.300, low=0, volume=568.820
- FPT 2026-06-11: close=73.100, open=0, high=73.900, low=0, volume=350.73
- User verdict: "close is 0 is impossible" — partial-zero rows (open=0 and/or low=0) plus mixed-unit rows (open hundred-scale vs close/high thousand-scale) are being SERVED and the % change calc explodes (+100447.2%) because prev-close vs close are on different unit scales.

**Developer confirmation:** All 3 defect classes confirmed live on 2026-06-12 DB:
- SM-2/SM-3: 519 rows with open<100+low=0 (mixed-unit contamination)
- Partial-zero open: 598 rows with open=0 (not all-zero)
- Low=0: 1694 total rows with low=0 and close>=1000

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/ + scripts/migrations/
- **Root-cause finding:** Pre-guard container run (2026-06-12T08:59Z, 25min before CONTAM-2/3/4/5 rebuild at 09:24Z) inserted SM-3 rows. Legacy SM-2 rows were excluded by CONTAM-6 binding amendment (`low > 0` guard). Additionally `MIN(daily_ohlcv.low, excluded.low)` ON CONFLICT clause permanently propagated any legacy `low=0` via MIN(0, n)=0 — active ongoing leak even with guards in place.
- **Rows identified:** Class A=519, Class B=598, Class C=1694 total low=0 rows
- **Repair decision:** Writer-scoped fix (confirmed pre-guard container; guards now working). Proceeded with all three repair classes.
- **Files modified:**
  - `scripts/migrations/repair-ohlcv-unit-contamination-low-zero.ts` — new migration (3-pass: A/B/C)
  - `scripts/migrations/__tests__/CONTAM-9-repair-ohlcv-low-zero.test.ts` — 12 TCs
  - `apps/mcp-server/src/domain/services/market-data/ohlcvUnitGuard.ts` — added Rule 3 mixed-unit cross-field check
  - `apps/mcp-server/src/__tests__/unit/ohlcvUnitGuard.test.ts` — 3 new TCs (TC-14/15/16)
  - `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` — CONTAM-9 low=0 self-heal ON CONFLICT fix
  - `apps/mcp-server/src/__tests__/1987-contam2-push-prices-ohlcv-guard.test.ts` — TC-7 low self-heal
  - `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts` — comment clarification
  - `docs/policies/dev-standards.md` — CONTAM-9 script pointer added
- **Live repair executed (2026-06-12T17:25Z):** A=519, B=598, C=1175 rows updated
- **Verification:** 0 Class A, 0 Class B, 0 Class C rows remaining (all queries = 0)
- **Commit:** 6657fc3e
- **Type check:** clean (bun tsc --noEmit)
- **bun test (targeted):** 89 pass / 0 fail across changed test files
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 79 cron.schedule entries — matches pre-task baseline
- **Docs updated:** `docs/policies/dev-standards.md` § Script Persistence — CONTAM-9 canonical pointer added
- **Graphify:** skipped (no architecture docs impacted)
