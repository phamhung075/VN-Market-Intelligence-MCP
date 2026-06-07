# PO Notebook

## c · 2026-06-07T00:54Z — DAILY TRIAGE 2026-06-07 (dispatcher-held task po-triage-20260607, PLAN/DECIDE only)

**Channel audit:** MARKET/WORK/BUG read (identical 6-msg feed, newest Jun 6 22:35Z) — every item already addressed by shipped fixes (c045 pre-fix staleness / BCTC-1345b designed guard / sbv_fx+news SLA → d71e3f2e / dead source ids → d267e997). TNB c89 already ACKed 22:24Z, no new cycle — no re-ACK.

**Dispositions (orch-state written atomic+CAS, re-read verified):**
1. **Schema drift → DO-NOW backlog `FIX-ORCH-KEY-NORMALIZE-TASKID` (high).** Dispatcher said 4 rows drifted; measured truth: active 159/159 `task_id`, backlog 28/36, done only 2/84 — undercounted 39x. Canon `id` stands (authority = OrchStateTaskBoardTask TS interface; done[] already migrated). One-shot migration + never-write note + real-`date -u` timestamp rule in task-schema.md (folds hand-typed `_updated_at` nit).
2. **Bloat-hook vs doc → BACKLOG `FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS` (low).** Hook fires unconditionally (script verified); Pass 5b honors justification downstream (claude-manager-helper main.md:97); loop proven working (commit-mutex 201L signal → fdcd5444). Brief 2026-06-04-data-serve-integrity §7 attribution WRONG — §7 = Risk Flags, contains no exemption claim; no doc fix needed.
3. **Tier-3 sqlite3 gap → BACKLOG `FIX-AUDITOR-DB-CHECKS-HOSTSIDE` (medium, route agent-father).** sqlite3 absent in container (verified live); host volume path apps/mcp-server/data/market.db exists. Host-side > image change (no rebuild peer-kill risk).
4. **Signals:** sau-news → DONE (d71e3f2e QA APPROVED, in image built 00:45Z > commit 23:32Z; live get_sla_status shows calendar thresholds). rtr-sbv → DONE (hypothesis (b) shipped; weekend acceptance observed c061/c062 HEALTHY). rtr-bctc-playwright → STAYS READ + progress note (last_push MOVED, bctc 325/360 ok; awaiting 10-item Q1/2026 queue-drain proof).
5. **Parked:** TECH-DEBT-LINTING promoted low→medium (5 tsc errors re-litigated in every QA scan). FIX-FETCH-VERYSTALE-LABEL stays parked low (cosmetic).

**Watch:** news 43/30min HIGH at 00:52Z Sunday in-window — marginal; if auditor re-flags weekend mornings repeatedly → news weekend-cadence tuning follow-up (distinct from the closed overnight class).

**Carry-over (next PO cycle):**
- Dispatch FIX-ORCH-KEY-NORMALIZE-TASKID first (board-walking correctness).
- Confirm rtr-bctc-playwright queue drain → close row.
- CTG WATCH: c030 cowork cycle must refine 49c11ce2; deferred again or composite=0.00 → architect escalation.
- Still open: FIX-ORCH-DONE-GRID-COLS live-verify post-rebuild; HEADROOM-COMPRESS-P1 pickup; WF-3 sub-task D Phase-4 gated under SPIKE-C44-PARALLEL-PROOF.
