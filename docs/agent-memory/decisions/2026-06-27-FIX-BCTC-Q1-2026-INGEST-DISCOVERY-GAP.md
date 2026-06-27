---
task-id: FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP
date: 2026-06-27
agent: pm
verdict: DONE_VERIFIED
---

## PM Decision Journal — FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP

### Task Summary

Status: DONE_VERIFIED (moved to done_verified lane)

**Verified Evidence (router RAW-confirmed, not relayed):**
- `f1998b7c` — production fix: added `refine_pending` counter to `queryBctcCounts()` / `/api/fetch-status` (`SELECT COUNT(*) FROM financial_reports WHERE text_status='COMPLETE' AND refine_status='PENDING'`). QA PASSED SQL correctness + security (parameterized, no creds) + DDD.
- `34c4dfc8` — test-harness fix (QA Round-1 CHANGES_REQUESTED): added `financial_reports` DDL to `makeDb()` in FIX-BCTC-VPS-QUEUE-STALE-TRIAGE.test.ts + CLEAN-DEAD-SOURCE-IDS.test.ts (12 regressions QA caught that dev had mislabeled "pre-existing").
- Router RAW re-run: 36 pass / 0 fail across the 2 fixed files + F-1 (23/23). tsc exit 0. Full suite 118→107 fail (12 cleared; residual 106 pre-existing & disjoint per QA: 1133-foreignFlowAlertJob, _deprecated/1302-technical-indicators, T11/1837a orch-state, network-timeout class).
- Chain: dev-mcp-server → qa (CHANGES_REQUESTED) → fixer (FIXED) → router RAW-verify.

### Root-Cause Understanding

The FIX revealed the TRUE data gap: HPG (HOSE) + ACV (UPCOM) Q1-2026 BCTC were on-source, pulled, and enriched (`text_status=COMPLETE`) but stuck `refine_status=PENDING`. The fleet-cron REFINE pipeline stalled after the 2026-06-07 batch — **47 reports total** with `text_status='COMPLETE' AND refine_status='PENDING'` (incl. GVR, HPG, HVN, MBB, POW, DPM, VPB, VRE, KBC, HSG, VHM, ACV + others).

PUBLISH stays BLOCKED (`checkPublishability()` rejects PENDING) so the data is absent from `get_bctc_full` for end users.

**This task is a visibility fix only** — the `refine_pending` counter is now observable at /api/fetch-status. The underlying 47-report REFINE backlog is NOT cleared by this code change.

### Why This Was Split into Two Tasks

The DISCOVER-layer hypothesis was wrong. The real gap is REFINE throughput, not DISCOVER. Rather than attempt a 2h refine operation inside this FIX (which violates PM atomic task rule ~2h per file), this decision journals the split:

1. **FIX-BCTC-Q1-2026-INGEST-DISCOVERY-GAP** (DONE_VERIFIED) — visibility only; make the stall observable
2. **BCTC-REFINE-STALL-RETRIGGER** (BACKLOG, opened concurrently) — operational data re-trigger; clear the 47-report queue

### Board Impact

- FIX task moved from BACKLOG → DONE_VERIFIED
- New BCTC-REFINE-STALL-RETRIGGER opened in BACKLOG (P1, size M, operations zone)
- WIP count remains 0 (no IN_PROGRESS tasks running)
- Board backlog count: 319 → 320 (net +1 for new task, accounting for FIX removal from backlog view)

### Why DONE_VERIFIED (not CLOSED)

Router RAW-confirmed the fix delivery chain (dev → qa → router). The code change is production-ready. The follow-up REFINE data operation is scoped separately per PM atomicity rules and will be PO-triaged independently.

### Status Note

"Visibility fix only — REFINE stall now observable at /api/fetch-status. Underlying 47-report REFINE backlog NOT cleared by this task; see follow-up BCTC-REFINE-STALL-RETRIGGER."
