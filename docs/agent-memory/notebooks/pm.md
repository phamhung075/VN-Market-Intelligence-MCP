# PM — Notebook

**Last updated:** 2026-05-11 | **Sprint:** 1877a

## Current state

- WIP: 0 / 2 (no tasks In Progress)
- Todo: 1869a, 1869b, 1869b-seed (price_drop precision tuning), 1862c-D/E/F/G (cowork MCP RCA)
- Developer next: 1869a → 1869b → 1869b-seed (sequenced)

## Last session summary

2026-05-03: Received architect design ARCH_1846.md for Sprint 1846 (all 3 blockers resolved). User directive: treat all 6 files as single atomic task 1846b (they are tightly coupled — domain port, SQLite adapter, 3 MCP tools, barrel, registry, tests).

Decomposed into 1 atomic task:
- 1846b: Backtest lifecycle tools — deleteRun() domain port + SQLite impl + backtestLifecycleTools.ts (delete #123 + export_csv #124 + compare #125) + barrel + registry wiring + 19 tests (suites A-D). M size. No deps.

Handoff created: docs/handoffs/TASK_1846b.md. TASKS.md updated (ARCH-1846 moved to Done, 1846b in Todo). pipeline-state.json set to developer/1846b.

## Known patterns / preferences

- TE Chromium scraper has had repeated issues (1815c, 1823d, 1829b, 1833g, 1833k, 1834b). If any further TE failures appear, flag for architect root-cause review per recurring-bug escalation policy.
- Backtesting module is active development (1842b/c/d/e + 1843a/b/c + 1844a + 1845x all done, 1846b next). Domain layer golden rule (zero infra imports) must be enforced strictly.
- export_backtest_run_csv is the only MCP tool in the codebase that returns raw CSV (not JSON). This is intentional per ARCH_1846.md §4 — must not be "fixed" to JSON in review.
- toolCount watermark in registry.ts comment previously diverged from actual toolCount. 1846b will bring actual count to 125 (slots #123-#125 filled). Developer should update the comment watermark to 125 in the registry entry.
- Option C equity curve recomputation is a direct copy of lines 302-307 in backtestEngine.ts. If tests show floating-point divergence, check sort order (localeCompare on exitDate ISO strings).

---

## Recent session — 2026-05-10 (Sprint 1867 ingest / 1863 reconcile)

**Input:** 7 BA atomic tasks (1863a-f + 1863h) + 4 architect amendments + 1 cleanup (1863g)

**Actions:**
- Updated docs/TASKS.md: added 8 reconcile tasks (1863a-h-RECONCILE) to Todo; marked original 1863a-f Done ("SUPERSEDED by 1863X-RECONCILE")
- Created 8 handoff files (docs/handoffs/TASK_1863X_RECONCILE.md) with AC details
- Updated docs/pipeline-state.json: status=in_progress, currentSprint=1867, activeTaskId=1863a-RECONCILE, nextAgent=dev-mcp-server

**Dependency tiers enforced:** Tier 1 (1863a) → Tier 2 (1863b, 1863d parallel) → Tier 3 (1863c, 1863f, 1863h parallel) → Tier 4 (1863g final gate). WIP max=2 respected.

**Status at session end:** READY FOR HANDOFF. Tier 1 ready: 1863a-RECONCILE (alertVerdictStore.ts) → dev-mcp-server.

---

## Recent session — 2026-05-11 (Sprint 1869 decompose)

**Input:** Architect brief 2026-05-11-price-drop-precision-tuning.md + Telegram report 2846 duplicate marking

**Actions:**
- Decomposed brief into 3 atomic tasks per architect plan (A, B, B-seed sequencing):
  - 1869a: FIX, raise DEFAULT_DROP_PCT -5 → -7 (signalDetector.ts const), ~45 min
  - 1869b: SPRINT-S, wire watchlistThresholds into scanMarket line 283 (~1.5h)
  - 1869b-seed: FIX, DB migration populate alert_drop_pct defaults (7.0 standard, 9.0 high-vol)
- Created 3 handoff files (TASK_1869a/b/b-seed.md) with AC details + sequencing
- Updated docs/TASKS.md: added 3 tasks to Todo section; 1869b-seed depends on 1869b
- Telegram report 2846: marked duplicate of 2844 via process_telegram_report(id=2846, resolution=duplicate, delete_telegram_message=true) — pending dev execution

**Dependency edges enforced:** A (independent) → B (B depends on A logically) → B-seed (depends on B wired). Ship sequence: A first (immediate precision lift) → B (wiring) → B-seed (populates wired column).

**WIP snapshot:** Todo = 1869a/b/b-seed + 1862c-D/E/F/G = 7 items. Max 2 In Progress enforced. Developer recommended to start 1869a next.

**Status at session end:** READY FOR HANDOFF. 1869a ready → developer.

---

## Cycle 30 — 2026-05-11 Step 2: Task 1877a Decomposition

**Input:** Architect brief `docs/architecture-briefs/2026-05-17-commit-convention-audit.md` (263 lines, pre-existing design, no architect step needed for Cycle 30). PM instruction: decompose into atomic ACs, create handoff, assign to developer, set WIP.

**Brief context:** Day-7 commit-convention audit script for Phase B greenlight gate (C1+C2 collapse). Window: 2026-05-10 → 2026-05-17. 4 pass criteria (C1≥90% header format, C2≥85% task trailer, C3≥80% ac trailer, C4≥95% scope vocab). All thresholds must pass independently; single fail = FAIL verdict. Script drops greenlight/fail signal per brief §4 schema.

**Actions:**
- Decomposed brief §3 (algorithm) + §4 (signal schemas) into 6 atomic ACs:
  - AC1: Parameterizable SINCE_DATE with defaults (2026-05-10T00:00:00Z)
  - AC2: Parse git log, filter bare merges, audit against 4 criteria
  - AC3: Emit JSON report to docs/signals/processed/commit-convention-audit-<YYYYMMDD>.json with full schema
  - AC4: Correctly compute all 4 criteria pass rates (C1/C2/C3/C4 each independently)
  - AC5: Violations arrays (≤20 per criterion), idempotent overwrite same-day
  - AC6: Exit 0 on PASS, 1 on FAIL; drop greenlight/fail signal with correct schema
- Created handoff file: TASK_1877a.md (126 lines, full acceptance criteria + test plan)
- Updated docs/TASKS.md: added 1877a row to Todo section (MEDIUM priority, deadline 2026-05-17)
- Updated pipeline-state.json: status=in_progress, currentSprint=1877a, activeTaskId=1877a, nextAgent=developer
- Updated PM notebook header: sprint ref updated to 1877a

**File scope verification:** Single file to create (`scripts/audits/commit-convention-audit.sh`). No subdependencies or parallel subtasks. Directory `scripts/audits/` does not exist — developer will `mkdir -p` inline.

**WIP enforcement:** No tasks currently In Progress (WIP = 0/2). Task 1877a spawned to developer; WIP will become 1/2 on handoff acceptance.

**Test plan:** Baseline (run against 2026-05-10 → 2026-05-11 window): JSON parse, schema completeness, verdict computation, violations cap at 20, idempotency (re-run same day), signal files (PASS/FAIL), exit codes (0/1), spot-check 3 violations per criterion.

**Status at session end:** READY FOR HANDOFF. 1877a decomposed and handed off → developer. Branch: task/1877a-commit-convention-audit-script.
