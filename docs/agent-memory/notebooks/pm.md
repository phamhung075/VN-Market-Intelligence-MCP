# PM — Notebook

## c318 ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP decomposition · 2026-06-18T000000Z

**PARENT:** ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP (architect design FINAL, Option-B: threshold-checked push inside PO tick)

**INPUT:** Architect brief (docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md), current orch-state.json .task_board, PM init (docs/agents/pm/init.md)

**OUTPUT:** 4 atomic subtasks (TASK-AUTO-PUSH-A/B-PO/B-DT/C) added to ready[]; parent design moved to done[] (DESIGN_COMPLETE); 4 handoff files created (TASK-AUTO-PUSH-*.md)

**Board mutation (atomic):**
- **Before:** ready=N, review=6 (including ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP), done=M
- **After:** ready=N+4, review=5 (ARCH moved out), done=M+1
- ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP moved from review → done with status DESIGN_COMPLETE
- 4 atomic subtasks added to ready (all TODO)

**Task structure (ready dispatch order):**

1. **TASK-AUTO-PUSH-A (S, ~2h, READY now):** Create `scripts/fleet-worktree-push.sh` — full implementation of proven worktree recipe from po-s84/po-s98 (new file, root-level scripts/). Includes: worktree isolation, divergence-reconcile (classify behind-set chore vs non-chore), orch-state.json conflict handling (keep-HEAD), pre-push tsc gate, Telegram notifications. BLOCKS B-PO + B-DT (script must exist).

2. **TASK-AUTO-PUSH-B-PO (S, ~1.5h, READY after A ships):** Add Step PUSH-BACKSTOP to `docs/agents/po/flow/main.md` § No-Task Guard (every exit path). Threshold check + safety guards (dirty critical files, commit-mutex held) + script invocation. Uses agent-md-factory skill (required edit pattern). PRIMARY location for auto-push decision (PO is semantic owner).

3. **TASK-AUTO-PUSH-B-DT (XS, ~30min, READY after A ships, parallel with B-PO):** Add fallback PUSH-BACKSTOP to `docs/agents/dev-team/flow/post-cycle.md` Step 4.9. Identical guard logic; activates when dev-team runs without PO spawn. Uses agent-md-factory skill.

4. **TASK-AUTO-PUSH-C (XS, ~15min, READY now, can pair with A):** Add note to `docs/standards/cron-jobs.md` — clarifies Option-B: no new cron/launchd/RemoteTrigger; push backstop reuses existing PO tick cadence. Documentation-only; unblocks no tasks.

**Sequencing & WIP:** dev-team can start A + C in parallel (2 lanes). After A merges + container rebuild, spawn B-PO + B-DT in parallel (2 lanes). Total elapsed: ~3–4h (A 2h + rebuild 30min + B-PO+B-DT parallel 1.5h). WIP capacity: 2 coding lanes available.

**Key constraints (from brief §4, §10):**
- **Safety-critical:** Script MUST NEVER touch main working tree (worktree-isolated only). No git stash/reset/checkout on main.
- **Divergence guard:** Classify behind-set before merge; abort if non-chore detected (send BUG telegram).
- **Conflict handling:** orch-state.json merge conflicts → keep HEAD (--ours); cloud chores are additive only.
- **Red-tree gate:** If pnpm check fails, exit 1 + BUG telegram; never push around red.
- **Option-B lock-in:** No new cron entry, no launchd plist, no RemoteTrigger. Threshold-checked push fires ONLY inside existing PO tick + fallback in dev-team post-cycle. Proof: ARCH brief §2 Options Evaluation table.

**Safety gate (before B ships):** Script must pass verification gate (run PO tick with ahead > 20, observe successful push + WORK telegram + origin updated). Then test guards (dirty notebooks block, commit-mutex blocks).

**Follow-ons (queued backlog):** None; this sprint is self-contained and completes the recurring manual-push debt (po-s102 rationale).

**Handoffs:** 4 files (TASK-AUTO-PUSH-A.md through C.md) created and placed in docs/handoffs/.

**Commit discipline:** Board mutation (orch-state.json + notebook + handoffs) via Python script (workaround for jq memory limit on large orch-state). Single atomic write to orch-state.json (review → ready/done moves). PM notebook appended (this entry). Handoff files committed as standalone .md (no code). PM owns board state; dev owns code commits.

**DJ-GATE-1 (decision journal):** docs/agent-memory/decisions/sprint-2026-06-18-pm.md (new file) documents: ARCH brief received, Option-B design confirmed, no design changes needed, 4 subtasks minted with explicit zone/owner/dependencies, safety constraints encoded in AC per brief, WIP decision (2 lanes, serialization A→B*), decomposition complete.

**Verification:** After full sprint completion (all 4 tasks shipped): run one 24h maintenance cycle with no manual intervention; verify git rev-list count never exceeds N+5 (≤25) without push. Backstop auto-fires at ≤25 and pushes. No accumulation >100 commits (the problem ARCH-AUTO-PUSH-THRESHOLD-BACKSTOP solves).

---

## c317 ARCH-OHLCV-WRITER-SSOT-DURABLE atomization · 2026-06-17T053000Z

**PARENT:** ARCH-OHLCV-WRITER-SSOT-DURABLE (recurring escalation, 4th recurrence, architect design FINAL)

**INPUT:** Architect handoff (ARCH-OHLCV-WRITER-SSOT-DURABLE-architect-design.md), brief (2026-06-17-ohlcv-writer-ssot-durable.md), router 60s re-fetch finding (cadence documented to prevent stub-hack compensations)

**OUTPUT:** 3 P0 subtasks (SUBTASK-OHLCV-WRITER-1/2/3) added to ready[]; 2 P1 follow-ons (LINT-OHLCV-WRITE-BYPASS, ARCH-DAILY-FOREIGN-FLOW-TABLE) queued backlog; parent normalized ready/REVIEW → done/DESIGN_COMPLETE; 1 workorder doc + 3 handoff files created.

**Board mutation (atomic):**
- **Before:** ready=3, in_progress=1, backlog=294, done=162
- **After:** ready=5, in_progress=1, backlog=296, done=163
- Parent task moved from ready → done (design deliverable complete)
- 3 P0 subtasks added to ready
- 2 P1 follow-ons added to backlog

**Task structure (ready dispatch order):**

1. **SUBTASK-1 (S, ~2h, READY now):** Rewrite writeForeignFlowToOhlcv — merge-only UPDATE (no INSERT stub). File: ohlcvForeignFlowStore.ts L57-69. CRITICAL: verify both callers (foreignFlowFetcher L136-137/L219-220, pushForeignFlowHandler L319) treat changes=0 as non-error. Rebuild=YES.

2. **SUBTASK-2 (XS, ~30min, READY now, parallel with SUBTASK-1):** Add SSOT annotation to ohlcvWriteService.ts. JSDoc inventory of 8 writers (A–H) + sentinel pattern explanation. Documentation-only, no logic changes.

3. **SUBTASK-3 (S, ~2h, BLOCKS on SUBTASK-1):** Unit tests T-1..T-4 + integration gate. T-4 is the REGRESSION PROOF: SELECT close FROM daily_ohlcv WHERE code=X AND date=Y after deferred write on empty DB returns ZERO rows (NOT close=0). Rebuild=YES.

**Sequencing & WIP:** dev-mcp-server can start SUBTASK-1+SUBTASK-2 in parallel (2 lanes, at limit). After SUBTASK-1 merges, start SUBTASK-3. Total dev time: ~4–5h. FIX-ALERT-SCAN-REJECT-STUB-BAR-P0 is parallel consumer guard (already in-flight, 1 lane). Both P0s gate on shared verification 2026-06-18 market open 02:15Z (RSI canonical match, no BB spam, zero close=0 stubs on live DB).

**Router 60s re-fetch finding (carried verbatim to dev):** CRONS.foreignFlowFetch fires every 60s (startupHelpers.ts:219, startScheduler.ts:840). Architect's R-1 "2–3h data-loss window" is correct risk assessment, but the merge-only UPDATE fix is definitive (re-fetch within 60s, moment real bar lands next fetch UPDATEs). DO NOT justify re-introducing stub hacks. Same-day loss ≤ 60s; honest gap beats fake close=0 (/goal#1).

**Follow-on tasks queued (backlog P1):** LINT-OHLCV-WRITE-BYPASS (ESLint rule, depends SUBTASK-1), ARCH-DAILY-FOREIGN-FLOW-TABLE (separate staging table design, future architect pass). NOT in_progress, serialize after P0s.

**Decision journal:** docs/agent-memory/decisions/sprint-2026-06-17-pm.md (DJ-GATE-1..6) documents parent normalization, router finding, board mutation, shared gate.

**Workorder:** docs/handoffs/WORKORDER-dev-mcp-server-OHLCV-WRITER-SSOT-DURABLE.md (complete task breakdown + 60s cadence fact + verification gate rules).

**Handoffs:** 3 files (SUBTASK-OHLCV-WRITER-*.md) created.

**Commit discipline:** Explicit pathspec only (orch-state.json + this DJ entry + notebook update). Atomic temp→rename on board. PM owns board mutation; dev owns code commits.

---

## c316 FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE task atomization · 2026-06-16T000000Z

**PARENT:** FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE (ERROR-AUDIT-2026-06-15 Wave 2, P1, L-size, ready→decomposed)

**INPUT:** BA spec FINAL (`docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-BA-spec.md`), architect ratifications (ARCH-RATIFY-W2-1..4, RISK-1..5), PM init bootstrap (`docs/agents/pm/init.md`)

**OUTPUT:** 12 atomic child tasks (W2-T-1..W2-T-12) added to `docs/data/orch/orch-state.json .task_board.backlog`; 12 handoff files created (`docs/handoffs/FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-T*.md`); parent task marked DECOMPOSED with critical path annotation.

**Task structure (critical path: T-1→T-7→T-11→T-12):**

1. **T-1 (foundation, ~2h, S):** Create `fetchDeadline.ts` with `withDeadline<T>` + `macroFetch<T>` + `DegradeEnvelope` type. Infrastructure layer utility (bctcHttpFetcher.ts pattern generalized). Zero callers yet — pure definition. BLOCKS all 11 downstream tasks.

2. **T-2 (trivial, ~15min, XS):** Barrel export in `fetchers/index.ts` — one-liner re-export of T-1's exports. BLOCKS T-3..T-10 (they import it).

3. **T-3..T-6, T-8..T-10 (parallel, ~1.5-3h each, S/XS):** Six fetch-site migrations + two DRY consolidations:
   - **T-3 (muasamcong:216):** VPS-proxied, 30s deadline, `withDeadline` wrap
   - **T-4 (sscInsider:134):** VPS-proxied, 30s deadline, `withDeadline` wrap
   - **T-5 (newsHeadlinesRefreshJob:41+79):** Two sites in one task per ARCH-RATIFY-W2-4 expansion (fetchFromNewsFetch 20s + pushToMcpServer 10s)
   - **T-6 (bctcPdfPullJob:165):** Background job, 45s deadline (no gateway timeout, TCP hang guard), `withDeadline` wrap
   - **T-8 (server.ts:642):** pdf-extractor call, 30s deadline, wrapped into existing try/catch
   - **T-9 (taOhlcvBackfillJob:149-170):** DRY: inline AbortController→`withDeadline` consolidation, 15s (no behavior change)
   - **T-10 (deepFetchVpsJob:96):** DRY: AbortSignal.timeout→`withDeadline`, 15s + timer cleanup fix

4. **T-7 (critical, ~2h, S):** Migrate `macroTools.ts:446` → `macroFetch` (PATTERN SETTER for T-11). Establishes discriminated-result pattern: `const result = await macroFetch<T>(baseUrl, path, body, { deadlineMs: 15_000 }); if (!result.ok) { return degrade; }`. BLOCKS T-11 (pattern precedent).

5. **T-11 (critical, ~3.5h, M):** Replicate T-7 pattern across 7 sibling macro tools (8 total fetch calls: carryTools:57+134, tradeBalance:96, bop:119, liquidityState:137, cpiComponents:95, macroIndicatorsVn:80, dinhGia:56). Per ARCH-RATIFY-W2-3, carryTools has TWO sites (both migrated in one task sweep). Consolidates ~25 lines × 7 files of duplication. BLOCKS T-12.

6. **T-12 (validation, ~30min, XS):** `bun check` full pass (zero TypeScript errors) + container rebuild (mandatory, not restart). FINAL gate before QA.

**Sequencing & parallelization:**
- **Serial critical path:** T-1 (foundation) → T-2 (barrel) + T-7 (pattern) → T-11 (siblings) → T-12 (validation)
- **Parallel tier-1 (after T-1):** T-3, T-4, T-5, T-6, T-8, T-9, T-10 all independent (each depends only on T-1; none block each other)
- **Parallel tier-2 (after T-7):** T-11 only (depends on T-1, T-2, T-7)
- **Serial gate:** T-12 (all 11 upstream must merge)
- **Total estimated:** T-1 (2h) + max(T-7, {T-3..6,T-8..10 parallel = 3.5h}) + T-11 (3.5h) + T-12 (0.5h) ≈ **~10–11 developer-hours** (can compress to ~6–7h with 2 dev lanes in parallel)

**Architect scope changes propagated into task descriptions (non-negotiable per DDD review, blueprint commit c5c0dc3d):**
1. **RISK-1 (DDD upward-import fix):** `macroFetch` signature gains `baseUrl: string` as FIRST param. All macro callers pass `getMacroBaseUrl()` explicitly. Enforced in T-7 and T-11 task descriptions.
2. **ARCH-RATIFY-W2-4 (T-5 scope expansion):** newsHeadlinesRefreshJob has TWO unbounded fetches (:41 external, :79 local). T-5 migrates both atomically in one task (same file). Deadlines: 20s (external) + 10s (local).
3. **ARCH-RATIFY-W2-3 (T-11 granularity):** 7 files but 8 fetch calls (carryTools has 2). T-11 covers all 8 calls in one sweep; description explicitly flags carryTools:57 + carryTools:134 as "two sites in one file."

**Handoff files created:** 12 files, each with architecture justification, acceptance criteria, dependency graph, knowledge load, implementation notes. TASK_FIX-ERRAUDIT-W2-MCP-FETCH-DEADLINE-T*.md (T-1 through T-12).

**Commit discipline:** Board mutation (orch-state.json backlog + parent status update) via atomic read→modify→rename. Explicit path only. Handoff files created as standalone .md files (no code). PM notebook appended (this entry).

**WIP capacity check:** Current coding: 1 active lane (dev-pdf-extractor on FIX-BCTC-BANK-PDF-OCR-RASTERIZE). WIP limit = 2. dev-mcp-server can spawn T-1 immediately (would be 2/2). After WIP drops below 2 again (or when router decides), full tier-1 fan-out (T-3..T-10 parallel) can dispatch.

**Router dispatch recommendation:** T-1 ready now (zero deps). If dev-mcp-server capacity available, spawn T-1 immediately. After T-1 merges + T-2 trivial, dispatch tier-1 {T-3, T-4, T-5, T-6, T-8, T-9, T-10} in parallel to dev-mcp-server (pipelined 2-at-a-time by WIP enforcer). T-7 should be in-flight or queued by the time tier-1 completes (T-7 doesn't depend on tier-1, only on T-1+T-2). After T-7 ships, T-11 unblocks immediately (pattern established). T-12 is the final QA gate (all upstream must be merged).

---

---

## Archive: Earlier Cycles (c313–c189)

Cycles c313 (WAVE-2 contracts), c311 (ARCH-CRON decomposition), c310 (DOCLANG Phase 1 closure), c309 (DOCLANG decomposition), c308 (ARCH-CRON initial), c307 (FIX-MCP-CRASH-LOOP decomposition), c306 (QUE-REFERENCE-PAGE), c305 (OHLCV-CONTAM closure), c304 (FE-CORPEVENTS), c303 (CONTAM-8 approved), c301 (REAUDIT-001), c300 (SHIP-WAVE-REAUDIT). See git history commits 675891163d...5d121989 (2026-06-14 and prior).

Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

---

## c315 MERGE-GATE board update — FIX-BCTC-ENRICH-SILENT-0ROWS · 2026-06-15T185000Z

MERGE-GATE BOARD UPDATE (user directive): **FIX-BCTC-ENRICH-SILENT-0ROWS** (P0, multi-zone BCTC enrich silent-0-rows) merges to main via dev-team :07 merge-gate (2026-06-15T18:30Z).

**Merged commits verified:**
- **68d54c7b** (dev-pdf-extractor LEAD): Layout 6+7 for B02-TCTD Roman-numeral section codes + single-digit sub-codes in apps/pdf-extractor/infrastructure/text_table_extractor.py. Root cause: Layouts 1–5 only matched \d{2,}, so every VCB/CTG bank-form line parsed None → silent 0-rows. 856/856 unit tests pass. Generic, no allowlist. DJ journal: docs/agent-memory/decisions/sprint-KINHDICH-HOVER-DETAIL-dev-pdf-extractor.md
- **989654f2** (dev-mcp-server co-owner): 0-row gate in apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts — reads ACTUAL bctc_table_rows + bctc_md_tables counts; if both 0 marks the bctc_vps_queue row enrich_failed (NOT done) + logger.error + sendTelegramBug. Generic, no per-ticker case. 55/55 tests pass. DJ journal: docs/agent-memory/decisions/sprint-2026-06-15-dev-mcp-server.md

**Board mutation (atomic temp→rename):**
1. Move FIX-BCTC-ENRICH-SILENT-0ROWS: in_progress → review lane
2. Record commit SHAs: 68d54c7b 989654f2
3. Set done_verified: PENDING + reason: "ops must REBUILD BOTH pdf-extractor + mcp-server containers, then re-trigger runBctcReparseJob for VCB/CTG bank tickers, then RAW-verify: (a) get_bctc_full(VCB) returns real VARIED rows vs the NAMED-VOLUME market.db (vn-market-intelligence-mcp_market_data — NEVER host ./data decoy); (b) a 0-row extraction's queue row shows status=enrich_failed not done; (c) non-regression — VCB 2025Q4 (112 rows) + FPT 2026Q1 (145 rows) still parse. done_verified is a LIVE RAW probe, NEVER a badge."
4. Set rebuild_required: BOTH pdf-extractor AND mcp-server

**Follow-on task minted (PREEXISTING defect surfaced during live-verify):**
- **FIX-BCTC-FPT-BT5-BALANCE-GATE** (P1, backlog, dev-pdf-extractor lead): FPT corporate-form (B01-DN, 3-digit codes) real-OCR extraction fails the BT-5 balance gate with delta = 43 TRILLION VND. Test: apps/pdf-extractor/__tests__/.../test_extract_tables_bt3d_real_ocr.py::test_extract_tables_usecase_real_ocr_path. Last touched 9a5527bd (2026-06-13), predates Layout 6+7. Suggested: id FIX-BCTC-FPT-BT5-BALANCE-GATE, route_to dev-pdf-extractor, priority P1 (real served-metric accuracy per /goal#1 plausibility — a 43T VND balance imbalance is wrong data, not just empty data), generic mandate, lane = backlog (NOT in_progress — respect WIP≤2). NOT blocked by FIX-BCTC-ENRICH (different root: B01-DN 3-digit parsing vs B02-TCTD bank-form silent-0). Minted as async follow-on; architect may spike later if BCTC area >2 fix cycles.

**Decision Journal Gate (DJ-GATE-1):**
- ✅ Appended docs/agent-memory/decisions/sprint-2026-06-15-pm.md: pm-S1 (FIX-BCTC move + rationale), pm-S2 (FIX-BCTC-FPT-BT5 follow-on + rationale). Each STEP ≤12L; required before board flip valid.

**WIP impact:**
- FIX-BCTC-ENRICH now: review lane (rebuild-required, WIP-gated → ops job not PM)
- ARCH-CRON-SCHEDULER-RELIABILITY: stays in_progress (architect design, not coding)
- Active coding lanes: 1 (within cap)

**Commit discipline (explicit-stage + RULE 1-3):**
- Staged: docs/data/orch/orch-state.json (task board: move lane + set rebuild_required + new backlog task)
- Staged: docs/agent-memory/decisions/sprint-2026-06-15-pm.md (journal entries)
- Staged: docs/agent-memory/notebooks/pm.md (this notebook entry)

**NEXT:** Router dispatches ops (REBUILD containers) + QA (live-probe after rebuild).
