# Architect — Notebook

**Last updated:** 2026-06-14 03:10 UTC | **Sprint:** ARCH-CRON-SCHEDULER-RELIABILITY

[3 most recent cycles retained. Older cycles archived to git history.]

## 2026-06-14T03:10Z — ARCH-CRON-SCHEDULER-RELIABILITY Design Brief (DESIGN, REVIEW)

**Task:** ARCH-CRON-SCHEDULER-RELIABILITY | zone: apps/mcp-server/ (scheduler layer, 55 cron jobs)
**Output:** docs/architecture-briefs/2026-06-14-arch-cron-scheduler-reliability.md, docs/handoffs/ARCH-CRON-SCHEDULER-RELIABILITY.md

**Root cause confirmed:** node-cron v3.0.3 drops ticks under event-loop saturation when `recoverMissedExecutions=false`. Per-job patching failed twice (53d00955). 3 jobs confirmed dead (ohlcvDailyAggregator, vnstockFundamentals, reputationCompute). Systemic fix required.

**Key design choices:**
- KEEP node-cron v3.0.3 (croner + v4 rejected — brownfield risk, 55 call sites)
- 4-lever system: (1) `recoverMissedExecutions: true` universally, (2) T4 dedup guards in all non-idempotent jobs, (3) deterministic per-job jitter for 8 high-collision jobs, (4) `schedulerWatchdogJob.ts` — missed-fire detection + self-heal
- Phase ordering HARD: dedup guards (1a) BEFORE recoverMissedExecutions (1b) — otherwise recovery replays double-fire Telegram
- IMPL gate: FIX-MCP-CRASH-LOOP-WRITEWAL must land first (crash-looping server = tick-drop source)
- BUILD-STANDARD: lean

## 2026-06-14T00:15Z — FIX-MCP-CRASH-LOOP-WRITEWAL Design Brief (DESIGN, REVIEW)

**Task:** FIX-MCP-CRASH-LOOP-WRITEWAL | zone: apps/mcp-server/ (db/connection layer + scheduler)
**Output:** docs/architecture-briefs/2026-06-14-fix-mcp-crash-loop-writewal.md, docs/handoffs/FIX-MCP-CRASH-LOOP-WRITEWAL.md

**Root cause confirmed:** `wal_autocheckpoint=4000` (16 MB) + FULL-only live-hours cron. 40+ cron jobs hold read snapshots that pin WAL frames; passive autocheckpoint is defeated by concurrent readers; FULL mode never resets WAL file size. TRUNCATE + reader-expiry via `BEGIN IMMEDIATE; COMMIT` is the definitive fix.

**Key design choices:**
- Lower `wal_autocheckpoint` 4000→1000 (4 MB trigger, 4× more frequent passive drain)
- `runForcedTruncateCheckpoint()` = BEGIN IMMEDIATE + COMMIT + PRAGMA TRUNCATE, every 30 min unconditionally
- Restart-cadence alert via existing `cron_job_runs` sentinel (no new table)
- Orch-state escalation injected at scheduler layer (not inside infrastructure — DDD boundary preserved)
- BUILD-STANDARD: not-applicable (bug-fix)

## 2026-06-13T21:00Z — FIX-COWORK-GUARANTEED-BACKSTOP Design Brief (DESIGN, REVIEW)

**Task:** FIX-COWORK-GUARANTEED-BACKSTOP | zone: docs/agents/cowork-team/flow/ (cowork reliability)
**Output:** docs/architecture-briefs/2026-06-13-cowork-guaranteed-backstop.md

**Chosen: Option A — Restore Layer-A RemoteTriggers for 5 guaranteed slots.**

**Key findings:**
- Option C (launchd/durable CronCreate) rejected: no proven persistence mechanism; exact observed failure mode.
- Option B (watchdog) rejected: watchdog itself needs session-independent trigger = proxies Option A with 20+ min latency gap; G3 unsatisfied.
- Option A closes root: RemoteTriggers are session-independent, survived the 32h Layer-B gap per runbook §1.
- Dedup mechanism: `last_fired` wall-clock gate already exists from sprint 1951 dual-layer parallel run (§7 of 2026-05-18-cowork-team-command.md). Agent-father must VERIFY it lives in each agent flow (not only in dispatcher), not just assume.
- §9 stability gate violation: Layer A was deleted before 2x session-restart survivals — deletion lock field added to cowork-schedule.json._notes to prevent recurrence.
- 5 slots: chef-morning, chef-eod, chef-evening, digest-sunday, tnb-audit. chef-intraday excluded (sub-hourly, API_MIN_INTERVAL blocks RemoteTrigger).
- Workspace trigger count: 3 existing + 5 new = 8 total (well within any limit).
- BUILD-STANDARD: not-applicable (reliability fix).

## 2026-06-13T20:45Z — SPIKE-DOCLANG-OTSL-OVERLAP Measurement (SPIKE, CLOSED)

**Task:** SPIKE-DOCLANG-OTSL-OVERLAP | zone: apps/pdf-extractor/
**Output:** scripts/spike-doclang-otsl-overlap.py, docs/agent-memory/decisions/spike-doclang-otsl-overlap.md

**Verdict: net-new = 0 → CLOSE. DocLang adds nothing over native gates.**

**Key findings:**
- 5 real BCTC reports, 17 pseudo-tables from bctc_table_rows (live pipeline DB via docker exec).
- DocLang validation (XSD + Schematron): 0/17 flagged. Native gates: 7/17 flagged.
- Root cause: DocLang rectangular rule checks cell COUNT equality only. Our extractor always emits fixed-width rows (empty strings for missing values) → structurally valid XML even for orphan rows. Semantic emptiness ≠ structural shape violation.
- Native `check_no_orphan_rows()` catches semantic orphans; `code_coverage_min` catches sparse code columns. These are disjoint defect classes DocLang cannot reach.
- Confirmed validator is live: deliberate rectangular violation injected into synthetic XML was caught correctly by Schematron `table-rectangular-grid`.
- Also checked bctc_layout_units layer (62 table-type units): 51/62 appear jagged in markdown parse — all are OCR-collapsed pages (artifact), not genuine structural defects. 4/51 already quarantined; rest caught by native code_coverage gate.
- Decision: do NOT build DocLang serializer (Option A). BUILD-STANDARD: not-applicable.

## 2026-06-13T16:38Z — ARCH-TSU TOOL-SURFACE-UPGRADE Design Brief (DESIGN, REVIEW)

**Task:** ARCH-TSU | zone: apps/mcp-server/src/ (U1/U2/U3/U5/U6) + apps/macro-indicators/pkg/ (U4) + scripts/ (U2 generator)
**Output:** docs/architecture-briefs/2026-06-13-tool-surface-upgrade.md

**Key findings:**
- U1: sessionToolCache never populated post-gateway (SSE per-call). Fix: new perCallCounterStore.ts singleton Map + proxy shim in server.ts post-registerAllTools. sessionCount field REMOVED (semantically wrong).
- U2: delta 161 vs 162 = sequential_market_analysis uses server.registerTool() (legacy). Generator must scan both APIs. SSOT = docs/data/project-stats.json toolCount (no hardcoding).
- U3: 12 tools audited 4-layer + internal-call. Verdict: 5 deregister, 7 integrate. is_trading_day DEREGISTER (DWF-PHASE1 not on main). cowork-refactory-expert signal required for list/ doc cleanup.
- U4: Only VnIndex has prev-session data (daily_ohlcv LIMIT 2). Oil/gold/usdVnd: null/unknown permanently this sprint. Fix lives in apps/macro-indicators/ (separate zone — dev-macro-indicators).
- U5: VPS API confirmed no holding_ratio. Serve-null permanent. Seams: vnstockStore.ts:561 (fabrication root), foreignFlowTools.ts:60-101 (gate), foreignFlowAnalyzer.ts (guard), companyProfileTools.ts.
- U6: All 4 pairs KEEP SEPARATE — description updates only. No server.tool() removals in U6.
- Fan-out: TSU-DEV-U2-PARITY pinned LAST (after U3/U6 deregistrations settle count).
- BUILD-STANDARD: lean.

## 2026-06-12T22:10Z — BCTC-ANALYTICS-LAYER Refine State Machine Ruling (DESIGN, REVIEW)

**Task:** FIX-FINALIZE-STATUS-STUCK-PARTIAL + FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE + FIX-PENDING-REFINE-TICKER-TARGETING | zone: apps/mcp-server/src/
**Output:** docs/architecture-briefs/2026-06-12-bctc-refine-state-machine-ruling.md

**Key findings:**
- BUG1: BEQ-7 section guard fires when report_status=DONE with missing sections → silent PARTIAL override → queue re-serves indefinitely. Fix: SQL exclusion subquery to skip PARTIAL reports where ALL units complete.
- BUG2: extraction_confidence stale (frozen at OCR time). Fix: add weighted section-presence formula in finalizeBctcRefineTool BLOCK-5; overwrite only if refined_confidence > current.
- BUG3: Zod strips `ticker`/`report_id` params. Fix: add optional params to existing tool; report_id bypasses filters, ticker filters by action_code.
- Index RF-1: idx_bctc_refined_units_report_status for BUG1 exclusion.
- BUILD-STANDARD: not-applicable (interface-layer only, no new primitives).

## 2026-06-12T15:45Z — ARCH-QUE-REFERENCE-PAGE (DESIGN, REVIEW)

**Task:** ARCH-QUE-REFERENCE-PAGE | zone: apps/frontend/ + scripts/
**Output:** docs/architecture-briefs/2026-06-12-que-reference-page.md

**Key findings:**
- D1: Second generated artifact `que-descriptions-detail.generated.ts` (13 fields + phases[6]); existing `QueDescription` sealed.
- D2–D6: Route dashboard.kinh-dich-reference.tsx (static, no API), nav entry, client-side 64-item search, QueName deep-link, no proxy.
- BUILD-STANDARD: lean. 4 subtasks: codegen, route, nav+QueName, TEST.
- Sequencing: blocked on FE-CORPEVENTS-TICKER-FILTER (PO WIP=2 rule).

## 2026-06-12T09:00Z — ARCH-QUE-TOOLTIP-DRY (DESIGN, REVIEW)

**Task:** ARCH-QUE-TOOLTIP-DRY | multi-zone: apps/frontend/ + scripts/ + apps/mcp-server/
**Output:** docs/architecture-briefs/2026-06-12-que-tooltip-dry.md + [Architect] Brownfield Findings appended to docs/handoffs/QUE-TOOLTIP-DRY-BA-spec.md

**Key findings:**
- BLOCKER-1: Option B (codegen mirror). que-reference.js is committed static; gen-que-descriptions.ts parses directly.
- BLOCKER-2: FlipRow deferred (KinhDichFlip lacks hexagram-number fields).
- BLOCKER-3: coreMeaning.vi (primary) + marketTrendLabel.vi (secondary); QueDescription shrinks 4→2 fields.
- FR-1: 3-line swap in SnapshotRow (hexagramNumber already present).
- BUILD-STANDARD: lean. 3 subtasks for PM.
