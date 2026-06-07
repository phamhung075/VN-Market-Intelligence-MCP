# PO Notebook

## c · 2026-06-07T02:21Z — DEV-TEAM TRIAGE (cron cycle 20260607T021724Z, dispatcher-held locks)

**Inputs:** pendingSignals=1 (rtr-ctg-bctc-ocr-corrupt-202606070138 HIGH); dashboard `## po` NEW=1 (same row); telegram state dispatcher-verified (unresolved=[] except 3055 monitoring CTG); TNB c89 ACK 22:24Z stands, no new cycle (mtime 00:25 local = that ACK); branch=main only, no stale branches; board: 0 in-flight tasks, WIP=0.

**CTG signal disposition: TASK CREATED.** Prior carry-over watch tripped (composite=0.00 + corrupt raw served 56% conf). 3rd identical fingerprint (VNM→VEA→CTG) ⇒ recurring-bug rule ⇒ root-cause guard, not per-ticker patch. Backlog row `FIX-BCTC-IDENTITY-SERVE-GUARD` (HIGH, zone apps/mcp-server/) written CAS-OK + re-read verified: (a) balance-sheet-identity gate in serve path, (b) CTG 2026-Q1 inspect/re-extract from 62p PDF 49c11ce2, (c) AC = honest skip or real figures, injected-fixture proof.

**BATCH returned (WIP ≤2 + 1 CLEAN):** 1. FIX-BCTC-IDENTITY-SERVE-GUARD (new, HIGH). 2. FIX-AUDITOR-DB-CHECKS-HOSTSIDE (existing TODO, med, route agent-father). 3. CLEAN-PM-CLOSEOUT-DONE-ROWS (XS — DONE rows still in backlog[]: FIX-ORCH-KEY-NORMALIZE-TASKID, FIX-AUDITOR-FLOW-TIER-EARLYEXIT, EMIT-DARK-RECURRING, BA-* ×3 → done[]; flip FIX-PROJECT-STATS-GENERATED sprint status).

**Deferred (stay backlog):** TECH-DEBT-LINTING (med — scope now 3 TS2379 in 1980-f2-canon-schema.test.ts, tasksMdJanitorJob cleared by f0db4387), FIX-BLOAT-HOOK-JUSTIFY-SUPPRESS (low). Parked: FIX-FETCH-VERYSTALE-LABEL.

**Carry-over (next PO cycle):**
- Verify FIX-BCTC-IDENTITY-SERVE-GUARD live: get_financial_summary(CTG) post-fix raw values, not badge.
- rtr-bctc-playwright stays READ — close on 10-item Q1/2026 queue-drain proof.
- News SLA weekend-morning marginal — watch for auditor re-flag before tuning.
- Still open: FIX-ORCH-DONE-GRID-COLS live-verify post-rebuild; HEADROOM-COMPRESS-P1 pickup; SPIKE-C44-PARALLEL-PROOF gate on WF-3 sub-task D Phase-4.

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
