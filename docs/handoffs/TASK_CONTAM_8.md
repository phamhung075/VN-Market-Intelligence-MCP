---
sprint: OHLCV-UNIT-CONTAM
branch: task/CONTAM-8-boundary-repair
size: S
zone: apps/mcp-server/
depends_on: []
blocks: []
---

# TASK CONTAM-8: Fix repair heuristic boundary — close >= 1000 not > 1000 (SM-1 scope miss)

## TLDR

QA discovered VNH 2026-06-12 row (open=0.9, close=1000.0 exactly) was excluded from CONTAM-6 repair because the heuristic uses strict `close > 1000` boundary. The correct boundary is `close >= 1000` to catch exactly-1000 closes. Update heuristic, re-run repair on remaining 1 row, verify post-state.

## [PM] Planning Context

- **Zone:** apps/mcp-server/
- **Acceptance Criteria:**
  - [ ] Repair heuristic boundary updated: `close > 1000` → `close >= 1000`
  - [ ] Re-run repair on remaining contaminated rows (dry-run counts 1 row: VNH 2026-06-12)
  - [ ] Live-run executed; VNH 2026-06-12 row normalized (open=900)
  - [ ] Verification: 0 remaining contaminated rows (exact match on revised heuristic)
  - [ ] Commit message follows convention (Task: CONTAM-8)
- **Files to read first:** 
  - `docs/handoffs/TASK_CONTAM_6.md` (parent repair script context)
  - `scripts/migrations/repair-ohlcv-unit-contamination.ts` (the script to update)
  - `docs/agent-memory/decisions/sprint-OHLCV-UNIT-CONTAM-qa-contam6.md` L49 (scope miss finding SM-1)
- **Files to create:** None — in-place fix
- **Files to modify:** 
  - `scripts/migrations/repair-ohlcv-unit-contamination.ts` — update WHERE clause boundary from `close > 1000` to `close >= 1000`
- **Dependencies:** CONTAM-6 (repair script must already exist and be deployed)
- **Knowledge needed:** `docs/standards/task-schema.md` (canonical task format), repair-ohlcv-unit-contamination.ts logic

## Context

QA (2026-06-12) approved CONTAM-6 with a **scope miss** finding: VNH 2026-06-12 row has `open=0.9, close=1000.0` exactly. The repair heuristic checks `close > 1000` (strict greater-than), which **excludes** the boundary case `close == 1000.0`. However, a close of exactly 1000 VND is implausibly high for a thousand-scale open of 0.9 — it is contaminated and should be repaired.

**Correct interpretation:** close >= 1000 (not just > 1000) indicates mixed-unit contamination.

## Implementation Notes

The repair script signature and logic remain the same; only the SQL WHERE clause boundary changes. Update the constant/condition in `repair-ohlcv-unit-contamination.ts`:

**Before:**
```sql
WHERE (open < 100 OR low < 100)
  AND close > 1000          -- <-- CHANGE THIS
  AND open > 0
  AND low > 0
  ...
```

**After:**
```sql
WHERE (open < 100 OR low < 100)
  AND close >= 1000         -- <-- UPDATED
  AND open > 0
  AND low > 0
  ...
```

**Execution:**
1. Run dry-run: expect 1 row (VNH 2026-06-12)
2. Run live-run with prompt
3. Verify post-repair: 0 remaining contaminated rows under revised heuristic

## Risk Mitigation

- **Single row boundary edge case:** Only 1 row affected in current live DB; low risk of collateral impact
- **Off-hours window:** Run during 09:30–14:00 UTC (outside VN market hours 02:00–09:00 UTC)
- **Pre-check:** Confirm live DB contains VNH 2026-06-12 before running

## Definition of Done

- [ ] Script boundary updated (`close >= 1000`)
- [ ] Dry-run identifies exactly 1 row (VNH 2026-06-12)
- [ ] Live-run executes + verify shows 0 remaining contaminated
- [ ] Commit created with Task: CONTAM-8 trailer
- [ ] No test regression (bun test scripts, 14 CONTAM-6 tests still pass)

## Zone & DDD Layer

- **Zone:** apps/mcp-server/ (scripts/migrations/ — pure SQL utility)
- **DDD:** Migration layer (utility, not domain logic)

## Related Documents

- CONTAM-6 scope miss finding: `docs/agent-memory/decisions/sprint-OHLCV-UNIT-CONTAM-qa-contam6.md`
- Repair script origin: `docs/handoffs/TASK_CONTAM_6.md`

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files modified:**
  - `scripts/migrations/repair-ohlcv-unit-contamination.ts` — CONTAM_WHERE `close > 1000` → `close >= 1000` (comment + const); header comment updated
  - `apps/mcp-server/src/__tests__/CONTAM-7-ohlcv-unit-contam-integration.test.ts` — TR-4 stale `close > 1000` in inline verify query fixed to `close >= 1000`; TR-6 boundary test added (close=1000.0 exactly detected + repaired)
- **Tests written:** TR-6 boundary case (1 new test in CONTAM-7 suite) — 1 assertion, GREEN
- **Git commits:** (see below)
- **Type check:** clean (bun tsc --noEmit)
- **bun test:** 62 pass / 0 fail (CONTAM suite); 45 pass / 0 fail (CONTAM-7 alone, +1 TR-6)
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 79 cron.schedule entries — matches pre-task baseline
- **Docs updated:** NONE
- **Graphify:** skipped (no docs impacted)

### G12 Gate Evidence

| Gate | Result |
|------|--------|
| bun test (CONTAM suite) | 62 pass / 0 fail |
| bun tsc --noEmit | exit 0 (TSC_CLEAN) |
| toolCount | 157 (matches baseline) |
| schedulerCount | 79 (matches baseline) |

### Dry-run result
`1 row identified: VNH 2026-06-12 open=0.9→900 low=0.9→900 close=1000 data_env=null`

### Live-run result
`1 row normalized (UPDATE committed: 1 rows changed)`

### Verification
`Remaining contaminated rows: 0 (close >= 1000 heuristic clean)`

### VNH post-verify (live DB)
`VNH 2026-06-12: open=900, high=1000, low=900, close=1000`

### Derived pct-change sanity
`vs 2026-06-10 close=900: (1000-900)/900 = +11.1% — within |pct|<30% bound`
`Note: VNH 2026-06-11 close=0.9 is CONTAM-9 (low=0 family, out of scope for this task)`

---

## [QA] Review Record

- **Date:** 2026-06-12T10:18:00Z
- **Verdict:** APPROVED
- **Report:** reports/TASK_REPORT_CONTAM-8.md

### Checks

| Check | Result |
|-------|--------|
| Live DB — VNH 2026-06-12 open/low/high/close scale | open=900 low=900 high=1000 close=1000 — PASS |
| Live DB — pct sanity \|pct\|<30% | +11.1% vs prior close=900 — PASS |
| Live DB — full contamination scan (close>=1000 heuristic) | 0 rows remaining — PASS |
| Script boundary scripts/migrations/repair-ohlcv-unit-contamination.ts L94 | `AND close >= 1000` confirmed — PASS |
| TR-6 boundary test (close=1000.0 exactly) | contaminated_count=1 before; open=900/low=900 after — genuine test PASS |
| bun test (CONTAM-7 suite, 45 TCs incl TR-6) | 45 pass / 0 fail — PASS |
| bun tsc --noEmit | exit 0 — PASS |
| DDD scan (modified files) | no domain→infra imports — PASS |
| Security scan (process.env, secrets) | none found — PASS |
| mock-guard | EXIT 0 — PASS |

### Board update
CONTAM-8 REVIEW → DONE (orch-state updated 2026-06-12T10:18:04Z)
