# PM Session Log — OHLCV-UNIT-CONTAM Sprint Decomposition

**Date:** 2026-06-12  
**Agent:** pm  
**Task:** OHLCV-UNIT-CONTAM-PM (head.next=pm in orch-state)  
**Input:** architect brief `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` + PO amendments  
**Status:** DECOMPOSITION COMPLETE

---

## Execution Summary

**Binding Amendments (signed 2026-06-12T07:53:30Z):**
1. CONTAM-4 PRIMARY FIX: Writers D/E must NORMALIZE to full-VND, not just guard; root-cause seed = Writer D space-timestamp rows (L113+L255-259)
2. CONTAM-6 repair must tolerate all-zero-rows defect (separate, out-of-scope)
3. franceSummaryJob must NOT be patched
4. Sequence: normalize-fix (CONTAM-4) + unit guard (CONTAM-1) land before repair (CONTAM-6)

**Handoff Files Created:**
- `docs/handoffs/TASK_CONTAM_1.md` — foundational domain service
- `docs/handoffs/TASK_CONTAM_2.md` — PRIMARY FIX (Writer A)
- `docs/handoffs/TASK_CONTAM_3.md` — Writer B patch
- `docs/handoffs/TASK_CONTAM_4.md` — PRIMARY FIX per amendment (Writers D/E)
- `docs/handoffs/TASK_CONTAM_5.md` — Writer C guard
- `docs/handoffs/TASK_CONTAM_6.md` — Repair migration script
- `docs/handoffs/TASK_CONTAM_7.md` — Detection job + integration tests
- `docs/handoffs/BACKLOG_CONTAM_8.md` — Follow-up for all-zero defect (queued)

---

## Task Execution Order

### Phase 1: Foundational (1 task)
1. **CONTAM-1** (2h) — Create `ohlcvUnitGuard.ts` domain service + unit tests
   - All downstream tasks (CONTAM-2..7) depend on this
   - Pure function, no I/O, independently testable
   - Zone: `apps/mcp-server/src/domain/services/`

### Phase 2: Parallel Guard Deployment (3 tasks, disjoint files)
After CONTAM-1 commits, dispatch in parallel (WIP=2 limit honored):

2. **CONTAM-2** (2h) — PRIMARY FIX Writer A (pushPricesHandler.ts)
   - Add unit guard BEFORE upsert (fail-loud, skip row)
   - Fix ON CONFLICT clause: `open = CASE WHEN open < 100 THEN excluded.open ELSE open END`
   - Zone: `apps/mcp-server/src/interface/mcp/routes/`

3. **CONTAM-3** (1h) — Writer B guard (server.ts /api/push-ohlcv-history)
   - Add unit guard on each TCBS bar before insert
   - Zone: `apps/mcp-server/src/interface/mcp/`

4. **CONTAM-4** (2h) — PRIMARY FIX per amendment, Writers D/E (backfill normalization)
   - Add unit guard in taOhlcvBackfillJob.ts (L113+L255-259)
   - Add unit guard in ohlcvBackfill.ts (insertMany transaction)
   - Zone: `apps/mcp-server/src/scheduler/market-data/` + `apps/mcp-server/src/infrastructure/fetchers/`

### Phase 3: Defense-In-Depth (1 task)
5. **CONTAM-5** (1.5h) — Writer C guard (ohlcvDailyAggregatorJob.ts)
   - Add unit guard on derived OHLCV before upsert
   - Zone: `apps/mcp-server/src/scheduler/market-data/`
   - Can overlap with Phase 2 if developer capacity exists

### Phase 4: Repair & Detection (2 tasks, sequential)
6. **CONTAM-6** (2.5h) — Repair migration script
   - Create `scripts/migrations/repair-ohlcv-unit-contamination.ts`
   - Dry-run + live-run modes
   - Dependency: CONTAM-2 must be deployed (stop new contamination first)
   - Zone: `scripts/migrations/`

7. **CONTAM-7** (3h) — Detection job + integration test suite
   - Create `ohlcvSanityCheckJob.ts` (post-aggregation detection)
   - Create `__tests__/ohlcvUnitContam.test.ts` (8 test cases covering all writers + repair)
   - Dependency: CONTAM-1..6 all committed
   - Zone: `apps/mcp-server/src/scheduler/market-data/` + `apps/mcp-server/src/__tests__/`

### Phase 5: Follow-Up (queued, lower priority)
8. **BACKLOG_CONTAM_8** (TBD) — All-zero-rows defect investigation
   - Separate from CONTAM sprint
   - Queue for PO review after sprint completes
   - Zone: Likely `apps/mcp-server/src/scheduler/` (root cause TBD)

---

## Task Sequence Rationale

**Critical path:** CONTAM-1 → (CONTAM-2,3,4,5 parallel) → CONTAM-6 → CONTAM-7

**Justification:**
- **CONTAM-1 unblocks all:** Domain service must exist before any writer imports it
- **CONTAM-2,3,4,5 parallel:** Each touches different files; guard calls are identical (copy-paste safe)
- **CONTAM-6 requires CONTAM-2 deployed:** Must stop new contamination before repair script runs
- **CONTAM-7 last:** Needs all guards + repair script working to write comprehensive tests

**WIP limit:** Max 2 In Progress at once
- Phase 1 (CONTAM-1): 1 task
- Phase 2+3: Batch 2-3 tasks from (CONTAM-2, CONTAM-3, CONTAM-4) parallel, hold CONTAM-5
- Phase 4: CONTAM-6 then CONTAM-7

---

## Risk Mitigation

| Risk | Mitigation | Status |
|---|---|---|
| RF-1 (VPS backoff) | Guard failure caught + HTTP 200 always returned | Documented in CONTAM-2 |
| RF-2 (open self-heal race) | Guard rejects invalid pushes BEFORE upsert; ON CONFLICT only heals valid rows | Documented in CONTAM-2 |
| RF-3 (repair script race) | Run during off-hours (outside 02:00-09:00 UTC) | Documented in CONTAM-6 |
| RF-4 (INSERT OR IGNORE) | Writer E skips now-healed rows (cnt > 100 still holds) | Documented in CONTAM-6 |
| RF-5 (data_env column) | Repair script preserves data_env values | Documented in CONTAM-6 |
| RF-6 (DDD violation) | Guard lives in domain/services/ (pure function) | Enforced in CONTAM-1 |

---

## Board Status (to update orch-state)

| Task ID | Title | Status | Owner | Size | Depends | Zone |
|---|---|---|---|---|---|---|
| CONTAM-1 | Create ohlcvUnitGuard.ts domain service + unit tests | ASSIGNED | dev-mcp-server | S | — | domain/services/ |
| CONTAM-2 | Fix pushPricesHandler.ts — unit guard + ON CONFLICT self-heal | ASSIGNED | dev-mcp-server | S | CONTAM-1 | interface/mcp/routes/ |
| CONTAM-3 | Add unit guard to /api/push-ohlcv-history in server.ts | ASSIGNED | dev-mcp-server | XS | CONTAM-1 | interface/mcp/ |
| CONTAM-4 | Add unit guard to Writers D & E (VNDIRECT backfill) | ASSIGNED | dev-mcp-server | S | CONTAM-1 | scheduler/ + infrastructure/ |
| CONTAM-5 | Add unit guard to ohlcvDailyAggregatorJob.ts | ASSIGNED | dev-mcp-server | S | CONTAM-1 | scheduler/market-data/ |
| CONTAM-6 | Create repair migration script (385 contaminated rows) | ASSIGNED | dev-mcp-server | M | CONTAM-2 | scripts/migrations/ |
| CONTAM-7 | Detection job + integration test suite | ASSIGNED | dev-mcp-server | M | CONTAM-1..6 | scheduler/ + __tests__/ |

---

## Next Steps

1. **PM updates orch-state:** Add 7 tasks to task_board with above metadata
2. **PM sends dispatch message:** Present TASK_CONTAM_1 as first task to dev-mcp-server
3. **After CONTAM-1 commit:** Dispatch CONTAM-2+3+4 in parallel (all independent)
4. **After CONTAM-2 deployed:** Dispatch CONTAM-6
5. **After CONTAM-1..6 committed:** Dispatch CONTAM-7

---

## Notes

- **No schema changes:** All guards are additive; no migrations needed beyond repair script
- **No new services:** ohlcvUnitGuard is a domain function, not a service (no I/O)
- **Test coverage:** 8 integration test cases (all writers + repair + sanity check)
- **Binding amendments respected:** CONTAM-4 primary, CONTAM-6 tolerates zero-rows, franceSummaryJob untouched
- **Follow-up:** BACKLOG_CONTAM_8 for all-zero-rows defect (separate investigation)

