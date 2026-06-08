# PO Notebook

## c · 2026-06-08T22:19Z — Triage tick: 3 signals drained — 1 BATCH (notebook-prune maint), CI deduped

**Signals this tick (3, db_count=204):**
1+2. `context_bloat_breach` architect.md → 230L > 200 cap (agent-notebook class; #2 is same-file later sample, treated as one target).
3. `ci_red` CI-RED-f05795c3 (run 27168638852, head f05795c3, job=bun test).

**ROUTING:**
- **#1+#2 (architect.md 230L):** maintenance-lane prune → BATCH CLEAN `NB-PRUNE-ARCHITECT-230`, route_to=claude-manager-helper (on-demand, mutex-wrapped — NOT dev-WIP, does not breach WIP≤2). No existing open prune task (verified task_board; all prior NB-PRUNE-* DONE). Real breach, actionable.
- **#3 (ci_red):** DEDUP → ACTIVE epic CI-BUN-TEST-MULTI-CLASS-FIX covers bun-test failure-count reduction (baseline_real=702). Two-layer dedup hit (title "bun-test" + IN_PROGRESS dispatch B2/NETWORK at this head). NO new task, NO annotation (epic gate=failure-count-DROP supersedes single run_id). Signal already in processed/.

**NOT dispatched (dev WIP AT LIMIT = 2: B2-RAG-DDL + CI-NETWORK-SKIP-GUARDS; dev-mcp-server RUNNING a34fa4bf):**
- Telegram NEW #3104/#3105 CRITICAL A-33: vnstockFundamentalsRefresh cron CRASHED (0% success, last 2026-06-08T01:00Z, zone dev-mcp-server). → pendingObservation, file FIX next tick when WIP frees. Do NOT breach WIP now.
- #3106 BCTC pipeline blocked cycle 26+ (CTG/VCB/REE/NVL/D2D/TCH get_bctc_full empty) → pendingObservation (existing BCTC sprints territory).
- #3102 pollNews 0 items (6/7 active) → likely FIX-MACRO/VPS adjacent; watch, not new task.

**Foreign dirty files (in-flight dev WIP) NOT touched:** 101-job-morning-briefing.test.ts, 1288-poll-news-shape.test.ts, add-init-database-to-tests.ts. Commit ONLY po.md, explicit pathspec, commit-mutex.

## Carry-over
- CI: epic CI-BUN-TEST-MULTI-CLASS-FIX ACTIVE; B2+NETWORK in flight → dev-mcp-server. Gate = FAIL+ERROR count DROP vs 702 on subsequent push (router owns push).
- pendingObservation A-33: vnstockFundamentalsRefresh cron crashed (dev-mcp-server zone) — FIX next tick, WIP-gated.
- pendingObservation: BCTC get_bctc_full empty 6 tickers (cycle 26+) — pipeline, route to BCTC sprint next tick.
- NB-PRUNE-ARCHITECT-230 dispatched to claude-manager-helper this tick (maint lane).
- No DONE flip → no DJ-GATE-1 entry required this tick (routing-only).
- DWF AC-P0-3-6 canary stays RED (never fix).
