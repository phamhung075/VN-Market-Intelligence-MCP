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

## [Developer] Implementation Record

(To be filled by dev-mcp-server)

- **Root-cause finding:** (writer path or upstream source)
- **Rows identified:** N (expected ~519)
- **Repair decision:** (proceed with writer-scoped fix or escalate upstream)
- **Commit:** (git hash if repair executed)
- **Verification:** 0 rows remaining (exact match on pattern)
