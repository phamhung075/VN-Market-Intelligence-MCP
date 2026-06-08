# Architect — Notebook

**Last updated:** 2026-06-08 21:35 UTC | **Sprint:** CI-RED-RECONCILE

[3 most recent cycles retained below. Archive in git history.]

## 2026-06-08T21:35Z — SPIKE-CI-COVERAGE-OFF-MECHANISM: recurring-bug, CI coverage suppression

**Task:** SPIKE-CI-COVERAGE-OFF-MECHANISM (SPIKE, S, zone: apps/mcp-server/ + .github/)

**Key findings (dry-run evidence on bun 1.3.13):**
- Root cause of 2 prior fix failures: both shipped unverified CLI flags. bun 1.3.13 `--coverage` is boolean-only (no `=value`). `--coverage=false` = parse error. `--coverage` silently ignored when bunfig `coverage=false`.
- A2 (separate CI bunfig) dead: `-c <other>` and `BUN_CONFIG_FILE=<other>` do NOT override `[test] coverage` while default `bunfig.toml` is present in CWD.
- A1 verified: `coverage=false` in bunfig.toml + bare `bun test` → no coverage table, clean exit.
- Local-dev recovery: `scripts/test-coverage.sh` (trap-based bunfig rename+restore) + `bun test --coverage` → coverage table produced correctly.

**Decision: A1.** All 4 files changed and in working tree. Dev-mcp-server to verify + commit.

**Brief:** `docs/architecture-briefs/2026-06-08-ci-coverage-off-mechanism.md`
**DJ-GATE-1:** `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` STEP arch-S2

## 2026-06-08T20:30Z — CI-TEST-ISOLATION-SPIKE: bun-test 639-failure root-cause diagnosis

**Task:** CI-TEST-ISOLATION-SPIKE (SPIKE, M, HIGH, zone: apps/mcp-server/)

**Key findings (evidence-first):**
- CI has NEVER been green in 200-run history (703 fails on 2026-05-11, trending to 639 now) — accumulated debt, not regression.
- THREE independent failure classes, NOT one systemic cascade:
  - Class A (~80–150 fails): Injectable seam removed from `macroTools.ts` `get_macro_snapshot` — tool refactored to HTTP proxy for Go macro-indicators service, but tests still pass `_testSbvClient`/`_testCommodityClient` which are now ignored. Also: `sbv.ts` module-level constants baked at import time (may bake as 0 in full CI suite via env mutation from co-running test).
  - Class B (~300–400 fails): Real code not yet implemented — 1ms assertion failures across unrelated domains (diacritics, source_tier, cron schedule hardcode, debounce mock wiring). TDD RED tests as living spec.
  - Class C (~100–150 fails): Network isolation — 5000ms timeouts, CI has no external API access (HOSE/HNX/UPCOM/Yahoo/NewsAPI).
- Local `bun test` (full suite) crashes (Bun v1.3.13 OOM/C++ exception at RSS 1.69GB). Per-file isolation works fine.

**Decision:** Rename task to CI-BUN-TEST-MULTI-CLASS-FIX. Three sequential fix batches: Fix 1+2 (Class A — injectable seam + sbv constant), Fix 3 (Class C — CI skip guards), Fix 4 (Class B — per-test triage). All in dev-mcp-server zone.

**Brief:** `docs/architecture-briefs/2026-06-08-ci-bun-test-mass-failure.md`

**DJ-GATE-1:** `docs/agent-memory/decisions/sprint-CI-RED-RECONCILE-architect.md` (appended STEP arch-S1).

**NEXT:** PO dispatches po→ba→pm→dev-mcp-server→qa. Three batches are independently deployable. PO triage needed for Class B (retire vs implement per test).

## 2026-06-08T13:22Z — ARCH-DFR-P2 + ARCH-DFR-P3: directed design, Phase 2 + Phase 3

**Tasks:** ARCH-DFR-P2 (deep-fetch pipeline, 3-zone split) + ARCH-DFR-P3 (FTS+RRF hybrid search)

**Key findings (brownfield — Phase 1 verified LIVE):** `rag_analyses.body_text` column live (schema-news.ts:64). LanceDB rag_entries has 16 cols including depth_tier/doc_type. pollNews.ts already passes all 8 metadata fields to ragIndex. article-body-fetcher.py LIVE on VPS with cafef.vn + vneconomy.vn support. /proxy/article-body endpoint LIVE at VPS:8765. vps-proxy-server.js ARTICLE_BODY_ALLOWED_DOMAINS at line 160.

**DFR-P2 design decisions:**
- Gate: 3-signal OR (ticker match / sector keyword / impact>=7+non-neutral) — post-dedup in tryInsertEntry()→true block. Pure domain function `deepFetchGate.ts`.
- Queue: deep_fetch_queue (source_url UNIQUE, status enum 5 states) + deep_fetch_stats (per-domain daily cap). Both in schema-news.ts.
- Executors: deepFetchVpsJob.ts (VPS via /proxy/article-body, max 10/cycle) + deepFetchMainJob.ts (news-fetch Playwright, max 5/cycle, vps-failed only).
- Re-index: `_deep` id suffix — two rows coexist, NO delete. `depth_tier="deep"` filter selects richer content.
- Zone split: 3 disjoint zones (mcp-server / vps-crawls / mainserver-crawls). File collision impossible.

**DFR-P3 design decisions:**
- FTS index: 2-call pattern (`create_fts_index('title', replace=True)` then `('summary', replace=True)`). Lazy init on first hybrid request + daily /admin/rebuild-fts.
- Hybrid query: `.vector().text()` pattern (NOT string-in-search). RRFReranker from lancedb.rerankers.
- mcp-server slice: ONE field only (`hybrid?: boolean` on RagSearchRequest). Collision with P2: LOW (ragIndex vs ragSearch, separate interfaces). PM sequences P3-mcp after P2-mcp or serializes via commit-mutex.
- Opt-in policy: pollNews defaultRagRetriever uses vector-only. CHEF/bctc-analyst callers use hybrid=true.

**Briefs written:** docs/architecture-briefs/2026-06-08-dfr-p2-deepfetch-blueprint.md + docs/architecture-briefs/2026-06-08-dfr-p3-hybrid-search-blueprint.md
**DJ-GATE-1:** Steps architect-S6 + architect-S7 in sprint-DEEPFETCH-RAG-REDESIGN-architect.md.
**NEXT:** po → ba (decompose P2 3-way + P3) → pm (atomic tasks) → dev-{mcp-server,vps-crawls,mainserver-crawls,rag-service} → qa.

## 2026-06-08T10:45Z — ARCH-DEEPFETCH-RAG-REDESIGN: deep-fetch pipeline + RAG schema redesign

**Task:** ARCH-DEEPFETCH-RAG-REDESIGN (DESIGN, L, brownfield+brief, zones: vps-scripts + rag-service + mcp-server)

**Key brownfield finding:** `article-body-fetcher.py` EXISTS on VPS but is NOT wired — it is a standalone script with no systemd service, no VPS router endpoint, no integration with `fetch-vn-news.sh`. The infrastructure for body fetching is partially present but not activated. LanceDB `rag_entries` table has 8 columns — missing ticker/sector/source_domain/depth_tier/doc_type/published_at/confidence/impact_score. Single global decay half-life (7 days) is wrong for filings (should be 30d) and too slow for news (should be 1-3d). RAG search has no BM25 path — ticker queries like "VCB" rely entirely on embedding similarity which is weak for short tokens.

**DJ-GATE-1 decision:** Option R (VPS-first + main-server fallback deep-fetch, relevance-gated) for Pillar A. Additive metadata schema + per-doc_type decay + Phase 2 BM25 hybrid for Pillar B. BM25 deferred pending LanceDB FTS feasibility probe (Q3).

**Build standard:** lean (both pillars — existing zones, no new microservice).

**Brief:** `docs/architecture-briefs/2026-06-08-deepfetch-rag-redesign.md`

**Open feasibility questions:** Q1-Q2 to dev-vps-crawls; Q3-Q4 to dev-rag-service; Q5 to dev-mcp-server (all non-blocking).

**NEXT:** po → ba → pm → dev-{vps-crawls, rag-service, mcp-server} → qa. Phase 1 (metadata schema) is LOW risk and can proceed in parallel with Phase 2 feasibility probes.

## 2026-06-08T08:20Z — A20-EVENTLOOP-STARVATION-ARCHITECT: event-loop blocking in PdfplumberExtractionEngine

**Task:** A20-EVENTLOOP-STARVATION-ARCHITECT (UNBLOCK, M, P1, 4th recurrence, zone: apps/pdf-extractor/)

**Root cause (evidence-first):** `PdfplumberExtractionEngine.extract_tables()` and `extract_text_ocr()` in `infrastructure/extraction_engine.py` are declared `async def` but contain NO `await`. They run pdfplumber page iteration and `pytesseract.image_to_string()` synchronously on the uvicorn event loop. During a POST /extract call, the event loop is fully blocked — `/health` (which needs the event loop to return immediately) cannot be served until extraction completes. cpus:2.0 makes the block run faster, but does NOT allow /health to interleave. This is why the 4th recurrence survived the cgroup fix.

**Decision: Option B — asyncio.to_thread() wrappers.** Extract sync logic to `_extract_tables_sync()` + `_extract_text_ocr_sync()` helpers; make the async methods thin `asyncio.to_thread()` wrappers. Consistent with 6+ other infrastructure files. No caller changes, no memory impact, no workers change.

**Options rejected:**
- Option A (uvicorn workers>1): multiplies RSS 600MB/worker; reverses max_workers=1 host-safety decision.
- Option C (gunicorn+uvicorn): same multi-process RSS problem.

**Files to change:**
- `apps/pdf-extractor/infrastructure/extraction_engine.py` — asyncio.to_thread() wrappers
- `apps/pdf-extractor/__tests__/unit/test_extraction_engine_nonblocking.py` — NEW TC-EE-1/2

**Brief:** `docs/architecture-briefs/2026-06-08-pdf-extractor-eventloop-starvation.md`

**AC:** host /health returns 200 within 5s WHILE /extract OCR job in flight, >=15min persistent (multi-probe, not single-probe pass).

**BUILD-STANDARD:** not-applicable (bug fix, no new primitives)

**NEXT:** dev-pdf-extractor implements → ops targeted rebuild (NEVER down&&up) → FIX-AUDITOR-A20-MULTIPROBE

## 2026-06-08T02:26Z — ARCH-A20-CPU-CGROUP-REVIEW: pdf-extractor cpus 1.0→2.0

**Task:** ARCH-A20-CPU-CGROUP-REVIEW (UNBLOCK, S, P1, zone: apps/pdf-extractor/)

**Root cause confirmed (evidence-first):** pdf-extractor pinned at 99% CPU (NanoCpus=1000000000). CFS cgroup exhaustion: Tesseract OCR child (ProcessPoolExecutor) consumes the full 1-core budget → uvicorn gets 0 scheduler slices → healthcheck curl times out at 30s. 3rd recurrence (48a64056, 3033e1dc both failed for same reason).

**Decision: Option A — cpus:1.0→2.0.** Host has 6 Docker VM CPUs; peers idle at ~0% CPU; mcp-server at 205% CPU on its 2.0 limit works fine (same pattern). Total limits rise to 11.25 but CFS limits are burst ceilings. Secondary: start_period 15s→60s (PEK model warm-up).

**Options rejected:**
- Option B (OCR sidecar): new container + IPC + no capacity gain; over-engineered for 1-line fix.
- Option C (exec healthcheck): exec probes are throttled identically inside the same cgroup — zero effect on the root cause.

**Files changed:**
- `docker-compose.yml` — cpus:'2.0' + start_period:60s for pdf-extractor
- `docs/architecture-briefs/2026-06-08-pdf-extractor-cpu-cgroup-fix.md` — decision brief
- `docs/data/orch/orch-state.json` — A20-3RD-CPU-CGROUP-ARCHITECT signal → RESOLVED
- `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN-architect.md` — STEP architect-S1

**BUILD-STANDARD:** not-applicable (infra config maintenance only — no new primitives)

**Unblocks (router sequences):** FIX-PDF-EXTRACTOR-UNHEALTHY, Q1-2026 ingest, VHM/HCM/HSG/KBC reparse, 26 blocked_pdf_extractor queue rows re-queue, pdfx zone unfreeze.

## 2026-06-07T08:04Z — TOOL-SURFACE-UPGRADE blueprint

**Sprint:** TOOL-SURFACE-UPGRADE — 6-unit surface audit (telemetry, registry, 12 weak-claims, delta sweep, holding ratio, TSH merges).

**Key rulings (8 decisions):**
- ARCH-U2-2 RESOLVED: delta 161 vs 162 = `sequential_market_analysis` uses `server.registerTool()` not `server.tool()`. Generator must scan both APIs. Runtime 162 is correct.
- ARCH-U2-1 RESOLVED: no registrations outside tools/**/*.ts. server.ts uses toolRegistry array only.
- U1 COUNTER DESIGN: server proxy shim post-registerAllTools wraps _registeredTools handlers to increment in-memory Map. `trackSessionToolUsageJob` reads Map snapshot. `sessionCount` field REMOVED (meaningless post-gateway).
- U2 GENERATOR: static grep (`server.tool(` + `server.registerTool(`), group by category folder, write tool-registry.json with `_maintained_by` header.
- U3 VERDICTS: 5 DEREGISTER (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day); 7 INTEGRATE (mark_alert_outcome, get_market_foreign_flow, diagnose+reset circuit breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction).
- ARCH-U5-1 RESOLVED: VPS API returns fBVol/fSVolume/fRoom only — no holding_ratio. Serve-null permanent this sprint.
- U6 ALL KEEP BOTH: get_market_summary/generate_market_summary distinct (read-cache vs force-regen); get_insider_signals/get_insider_transactions distinct (domain classifier vs DB reader); 5 triggers KEEP SEPARATE (schema diverges).
- ARCH-U4-1 RESOLVED: VnIndex delta from daily_ohlcv; Oil/Gold/UsdVnd prev-session not persisted → direction:"unknown". U4 fix is in Go macro-indicators service zone, not mcp-server.

**Zone split:** dev-mcp-server (U1, U2, U3, U5, U6) + dev-macro-indicators (U4 Go delta fields) — 7 subtasks for PM.

**Files produced:**
- `docs/handoffs/TOOL-SURFACE-UPGRADE-BA-spec.md` — [Architect] Brownfield Findings appended (all 6 units)
- `docs/agent-memory/decisions/sprint-TOOL-SURFACE-UPGRADE-architect.md` — 8 STEP journal entries

**NEXT:** pm → create 7 subtasks per PM split table; dispatch dev-mcp-server for TSU-DEV-U1 + TSU-DEV-U2-GEN first (parallel); dev-macro-indicators for TSU-DEV-U4 (independent).

## 2026-06-07T00:31Z — WF-3 SPIKE: dev-* MCP gateway binding ruling

**Sprint:** WORKFLOW-FLUIDITY — WF-3 SPIKE (timebox 120 min, findings-only, no code changes).

**Ruling issued (Option III):** Dev-*/qa/ba/pm/architect specialist agents do NOT have `mcp__claude_ai_gateway__call_tool` in their `tools:` frontmatter. This is the root cause. The binding is absent by design omission, not session inheritance. Ruling: codify the session-scoped constraint as an enforced invariant (INV-GATEWAY-1): all task_claim / task_release / commit-mutex MCP calls for dev-* specialists are the SOLE responsibility of the outer dispatcher session.

**New evidence folded in:** FU-MCP-GATEWAY-DEV-FRONTEND — dev-frontend AND qa in FETCH-OPS-PAGE-TRUTH both lacked the binding; dispatcher serialized QA gates manually. Entry 6 in `sprint-FETCH-OPS-PAGE-TRUTH-dev-frontend.md` documents the failure and carry-forward.

**WF-2 blockers resolved:** BLOCKER-WF2-A (TS path = orchStateStore.ts L221 appendSignalQueueRow); BLOCKER-WF3-A (Option A mtime retry chosen over SQLite migration).

**Commit-mutex flow debt flagged:** dev-* specialist flow files that reference commit-mutex skill directly will always hit C-2 FAIL-CLOSED (skip commit + bug telegram). Correct path = dispatcher invokes mutex, not specialist. Correcting these flow references is WF-3-IMPL scope (agent-father).

**Files produced:**
- `docs/architecture-briefs/2026-06-07-wf3-dev-gateway-binding-ruling.md` — ruling + INV-GATEWAY-1 + downstream handoff table
- `docs/agent-memory/decisions/sprint-WORKFLOW-FLUIDITY-architect.md` — STEP arch-S1 journal entry
- `docs/data/orch/orch-state.json` — WF-3 task status → REVIEW

**NEXT:** WF-3 is REVIEW. WF-3-IMPL handed to agent-father (flow edits A+B) and dev-mcp-server (orchStateStore.ts fix C). Phase 4 Option A (gateway binding grant) is gated pending c44+c45 verification.

## 2026-06-06T21:34Z — FETCH-OPS-PAGE-TRUTH blueprint

**Sprint:** FETCH-OPS-PAGE-TRUTH — fetch-operations page honest sources + real operational detail.

**Key rulings (4 decisions):**
- D-1 (source truth): `GET /api/fetch-status` new endpoint on mcp-server queries `rag_analyses` for sources actually in DB — ground truth. Frontend loader calls this; no hardcoded source names in JSX, no system-map.json import in frontend.
- D-2 (bloomberg filter): domain-anchor `LIKE '%bloomberg.com%'` / `'%reuters.com%'` in `buildSql()` and `deriveProvider()`. 1-line fix. Bloomberg panel will honestly show 0 results (not crawled).
- D-3 (fake latency): Remove `"totalLatencyMs": 0` and per-source `latencyMs` entirely from `handlers_external.go`. Frontend `!== undefined` guard already in place — span disappears cleanly.
- D-4 (gateway duality): SPIKE F-4, alias-only approach (add `/api/` routes in mcp-server alongside `/mcp/api/` routes). New `/api/fetch-status` endpoint avoids the duality entirely (uses `/api/` virtual alias).

**Zone split:** F-1 (mcp-server, M) → F-2 (macro-indicators, XS) → [Batch1 parallel] → F-3 (frontend, M) → [Batch2] → F-4 SPIKE (api-gateway + mcp-server, 4h timebox).

**Files produced:**
- `docs/handoffs/FETCH-OPS-PAGE-TRUTH-ARCH.md` — full blueprint (subtask spec, risk flags, AC)
- `docs/agent-memory/decisions/sprint-FETCH-OPS-PAGE-TRUTH-architect.md` — 4 arch decision entries

**NEXT:** pm → create 4 subtasks: F-1 (dev-mcp-server), F-2 (dev-macro-indicators), F-3 (dev-frontend depends F-1), F-4 (dev-api-gateway SPIKE deferred-ok), QA; then QA after all done.

## 2026-06-06T20:15Z — ORCH-TASK-CANON blueprint

**Sprint:** ORCH-TASK-CANON — canonical task schema + decision visibility on orchestration dashboard.

**Blocker rulings (all 4 issued):**
- BLOCKER-1 (schema SSOT): BOTH — TypeScript interface `OrchStateTaskBoardTask` is machine-SSOT (compile-time enforcement) + `docs/standards/task-schema.md` (new, human-readable reference). TypeScript interface gains canonical `id` field (was `task_id`); `task_id` becomes legacy-optional.
- BLOCKER-2 (counts.done): `(taskBoard.done ?? []).length` authoritative. Active-sprint DONE tasks are transitional, excluded from counts.done.
- BLOCKER-3 (F3 rollout): `board.done ?? []` primary source, no startsWith fallback. Ships AFTER F1B migration + F2 REBUILD verified live. Empty done group is correct degraded state, not a crash.
- BLOCKER-4 (migration runner): agent-father runs F1B jq migration (ops-lane, not TypeScript). F1B commit = green light for F2 TypeScript rename.

**Fluidity audit addendum (F-4/F-5) folded into F4:**
- Per-agent journal path: `sprint-${SPRINT_ID}-${AGENT_ID}.md` — eliminates all parallel-append contention.
- CAP-REACHED rolls to continuation file + send_telegram(bug) — mandatory rule never silently broken.
- journalStore.ts glob: `sprint-${id}*.md` reads all per-agent files + legacy single-file (back-compat).

**Dispatch order confirmed:**
AF-ORCH-F1A-F4 (agent-father, merged F1a+F4) → AF-ORCH-F1B (agent-father, migration) → F2-MCP (dev-mcp-server + REBUILD) → F3-FE (dev-frontend + REBUILD) → QA

**Files produced:**
- `docs/handoffs/ORCH-TASK-CANON-ARCH.md` — full blueprint
- `docs/agent-memory/decisions/sprint-ORCH-TASK-CANON.md` — arch-S1 journal entry

**NEXT:** pm → create 5 tasks: AF-ORCH-F1A-F4 (agent-father), AF-ORCH-F1B (agent-father), F2-MCP (dev-mcp-server), F3-FE (dev-frontend), QA-ORCH-TASK-CANON.

## 2026-06-05T21:30Z — ORCH-DASH-DECISION-DRILLDOWN blueprint

**Sprint:** ORCH-DASH-DECISION-DRILLDOWN — clickable DONE-task decision trail on /dashboard/orchestration.

**Serving layer confirmed (raw read):** `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` exclusively. Go api-gateway :4000 not deployed. Zone F2 = dev-mcp-server.

**Key rulings:**
- JOIN-KEY: BOTH (optional `**task-id:**` line in STEP format + sprint_bucket fallback for legacy entries). Parser: task-id present → `by_task[task_id]`; absent → `sprint_bucket[sprint_id]`.
- SPRINT-ID DISCOVERY: union of ALL sprint_goal.entries[*].sprint_id (all statuses, not just active) + task_board.active_sprints[*].id — covers just-closed sprints whose DONE tasks still show on dashboard.
- LATENCY: per-sprint mtime cache (singleton Map in journalStore.ts); invalidated on mtime change; zero re-parse cost on 5s polling loop when no agent is writing.
- ACCORDION UX: multi-open (Set<string> of open task IDs) — audit surface requires comparing multiple task decisions simultaneously; single-open is destructive for that workflow.

**Files produced:**
- `docs/handoffs/ORCH-DASH-DECISION-DRILLDOWN-ARCH.md` — full blueprint (file map, parser pseudocode, risk flags, PM subtask spec)
- `docs/agent-memory/decisions/sprint-ORCH-DASH-DECISION-DRILLDOWN.md` — 4 architect STEP entries (rationale for all rulings)
- `docs/data/orch/orch-state.json` — ORCH-DASH sprint added to active_sprints; ARCH task DONE; PM-ORCH + F1/F2/F3/QA tasks TODO

**NEXT:** pm → create ARCH-ORCH-F1/F2/F3/QA subtask handoffs per PM-ORCH-DASH-DECISION-DRILLDOWN; dispatch agent-father (F1) first.

**Risk to flag for PM:** R-2 (mtime cache test bleed — journalStore.ts must export `_clearCacheForTesting()`); R-1 (buildOrchestrationDto impure after F2 — inject decisionsDir path parameter for testability).

