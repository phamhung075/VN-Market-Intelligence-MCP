# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · architect

**Sprint goal:** no goal set (sprint_id resolved from orch-state; no matching sprint_goal.entries description found)
**Agent:** architect
**Started:** 2026-07-08T00:00:00Z

---

### STEP architect-S1 · architect · 2026-07-08T00:00:00Z
**task-id:** FIX-DAILY-OHLCV-UNIT-CONTAM-LT1000-FPT-VHM
**what-done:** Round-2 brownfield probe (live container RAW-query, not local decoy DB) found Writer H (`handlePushOhlcvHistory`, `/api/push-ohlcv-history`) never migrated to `writeOhlcvBatch` — actively re-contaminating up to yesterday, ~15-30min cadence. Appended findings to handoff + brief.
**what-considered:**
- Redesign repair predicate as boundary/discontinuity date-scan — REJECTED: flat cold-start seed bars (volume>0, confirmed live) would corrupt a boundary-scan's "clean data starts here" assumption.
- Keep existing per-row anchor-ratio predicate (order-independent, no boundary needed) — CHOSEN, already safe by construction.
- Fix Writer H locally (duplicate cross-day check inline) vs migrate to writeOhlcvBatch — CHOSEN migrate (DRY, reuses SSOT chokepoint, no new duplicated logic).
**why-decision:** Live evidence (VHM/VIC anchor=flat-seed value, numerically correct per PO) proves ratio-predicate math stays safe without redesign; Writer H migration closes the actual active leak with minimal diff, non-overlapping with stalled P0's narrower Rule-5 coercion fix on the same file.
**why-change:** Original 2026-06-30 design assumed CONTAM-10-WRITER (ohlcvWriteService.ts) alone would close the class — did not account for Writer H bypass; corrected in Round 2 with a new sequential EXEC gate on WRITER-H.

### STEP architect-S2 · architect · 2026-07-08T04:45:00Z
**task-id:** SPIKE-GATEWAY-BLIND-CLI-HANDSHAKE
**what-done:** Ran full curl MCP handshake (initialize→notifications/initialized→tools/call) against live gateway — 100% success, proves server fully healthy. Cross-checked mcp-gateway container's own `call_tool invoked` logs: zero successful calls logged since 2026-07-04T19:10:48Z (~3.5d), surviving a 2026-07-07T16:35Z manual restart unchanged — defect is client-side, not server-side, and is a sustained outage not "some sessions."
**what-considered:**
- Trust the prior dev-team probe's bare stateless tools/list rejection as "server healthy" — REJECTED as incomplete: it never proved initialize itself succeeds, the actual thing the CLI client needs.
- Root-cause the CLI client internals directly — REJECTED: out of repo scope per task directive, can only hypothesize from external evidence.
- Extend mcp-call.sh for the 3 gateway meta-tools now vs defer — CHOSEN defer to a scoped FIX task (architect does not implement); scope proven feasible via the curl replay so the follow-up task carries a working recipe, not a research gap.
**why-decision:** Evidence chain (own-session blind + full live handshake success + 3.5-day container-log silence spanning an ineffective restart) triangulates cleanly on client-side/CLI-harness root cause from three independent angles — strong enough to close the SPIKE conclusively within timebox rather than extend.
**why-change:** Supersedes F1-GATEWAY-TRANSPORT-PROBE/F1-WRITE-MCP-JSON-GATEWAY/F1-AGENT-FATHER-BLIND-GUARD-REMOVE (already CANCELLED by PO pre-dispatch) — this SPIKE's evidence goes further than the CRITICAL bug-escalation that triggered the cancellation, adding the full-handshake proof and the container-log forensics.

### STEP architect-S3 · architect · 2026-07-10T02:00:00Z
**task-id:** ARCH-DAILY-FOREIGN-FLOW-TABLE
**what-done:** Designed the parent's queued Option-F follow-on: additive `daily_foreign_flow` table (no NOT NULL price coupling → unconditional write, R-1 structurally closed not windowed) + `daily_ohlcv_with_flow` compat VIEW so 9 read sites migrate via one-line rename, not rip-and-replace. Backfill (Change 4) ordered strictly before writer cutover (Change 2) — R-6.
**what-considered:**
- Big-bang column move off `daily_ohlcv` in one PR — REJECTED: 9 read sites + ~15 tests coupled to column names; unnecessary blast radius for P1/non-blocking.
- Compat VIEW (COALESCE new-table over frozen legacy columns) — CHOSEN: safe incremental per-file migration, no synchronized flag-day.
- Class-B freshness probes (4 files) query `daily_foreign_flow` directly rather than the view — CHOSEN: closes a latent false-negative (OHLCV-stall read as foreign-flow-stale) as a bonus, not just a rename.
**why-decision:** New table has zero price-coupled constraints (unlike `daily_ohlcv.close NOT NULL`) — the only design that makes the write truly unconditional, not merely a longer/shorter deferral window.
**why-change:** n/a — first design pass for this follow-on task, first time in this repo a compat VIEW is used for a table-split migration.

### STEP architect-S4 · architect · 2026-07-10T00:00:00Z
**task-id:** FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION
**what-done:** Designed 3-part fix (auto PEK trigger + deferred gate/reconciliation cron; pdf_path at save-time; shell-row decoupled from OCR-confidence gate) on top of SPIKE-BCTC-2025Q4-PDFPULL-OCR-0ROW. Found 2 NEW risks the SPIKE didn't surface: (1) `financial_reports.id` regenerates on every `INSERT OR REPLACE` re-parse (no FK, so re-parse silently orphans already-landed PEK rows); (2) `/pek-extract`'s push-back writes ONLY `bctc_layout_units`/`bctc_page_zones` — NOT `bctc_table_rows`/`bctc_md_tables`, the tables the existing 0-row gate actually checks, so wiring PEK alone (without retargeting the gate) reproduces the same silent-0-row bug one layer down.
**what-considered:**
- Reuse `bctcReparseJob` as the reconciliation pass — REJECTED: built around `agent_feedback` stranded-PDF rows + the legacy scalar pipeline this task routes around; SPIKE itself flags it out-of-scope.
- Gate reconciliation on `bctc_table_rows`/`bctc_md_tables` only (as SPIKE's literal text implied) — REJECTED once RAW-verified `pushBctcLayoutHandler.ts`'s own doc comment ("zero writes to bctc_table_rows... or bctc_md_tables") — CHOSEN: check `bctc_layout_units`(quarantined=0) OR legacy tables, forward-compatible.
- Leave `financial_reports.id` regeneration as-is (out of stated scope) — REJECTED: directly undermines this task's own goal (PEK rows would get silently orphaned by any later scalar re-parse) — CHOSEN: fold in an `ON CONFLICT(action_code,sort_key) DO UPDATE` rewrite of `storeReport()` preserving `id`, as a prerequisite (D1) for the shell-row work.
**why-decision:** Both new risks are load-bearing — shipping concern 1 without D1 (id stability) or the corrected gate-target would leave the exact "0 rows after extraction ran" symptom this task exists to close, just relocated.
**why-change:** Widens the SPIKE's "populate bctc_table_rows/bctc_md_tables" framing (all 4 endpoints treated as equivalent) — RAW-verified only 2 of 4 endpoints write those tables; `/pek-extract` (the only proven-functional one) writes a different pair. Design retargets the reconciliation check accordingly rather than trusting the SPIKE's endpoint-table mapping verbatim.

### STEP pm-S5 · pm (router terminal) · 2026-07-10T12:00:00Z
**task-id:** FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION
**action:** DECOMPOSED into 7 atomic tasks per architect sequencing (D1→D2→D3A→D3B→D3C + R-HIGH-1 + R-HIGH-2)
**decomposition-rationale:**
- Architect flagged SEQUENCING-CRITICAL ordering: D1 (id stability) MUST land first (foundational data-integrity fix), then D2 (shell-row), then D3 substeps (auto-trigger + gate + reconciliation). Shipping out-of-order leaves latent data-loss (D2 id gets orphaned if legacy scalar re-parses after PEK lands) or silent 0-row bug one layer down (gate retargeting missed).
- R-HIGH-1 (status enum in 3 files) folded into D3B (same zone, same developer, same PR surface — no risk of separate dispatch). R-HIGH-1 is NOT optional; missing it creates false "queue idle" alarms during normal PEK async work.
- R-HIGH-2 (market-hours guard) flagged as open PM decision (Option A recommended: client-side guard; Option B: no guard, let reconciliation absorb retries). Task created ready for Option A; can move to backlog-close if PO chooses B.
**tasks-created:** 7 tasks in backlog/READY (all zones apps/mcp-server/, owner dev-mcp-server):
1. FIX-BCTC-D1-STABILIZE-REPORT-ID (S) — parseBctcReport.ts ON CONFLICT fix, foundational
2. FIX-BCTC-D2-ENSURE-SHELL-ROW (S) — ensureFinancialReportShellRow usecase, depends D1
3. FIX-BCTC-D3A-PEK-TRIGGER-HELPER (S) — extract shared triggerPekExtractionForReport helper, depends D2
4. FIX-BCTC-D3B-GATE-PEK-TRIGGERED-STATUS (M) — remove gate, wire shell-row + trigger, add status + enum updates, depends D3A
5. FIX-BCTC-D3C-RECONCILE-JOB (M) — new bctcExtractReconcileJob cron, depends D3B
6. FIX-BCTC-R-HIGH-1-STATUS-ENUM-UPDATE (S) — verify pek_triggered in 3 status-enum files, depends D3B
7. FIX-BCTC-R-HIGH-2-MARKET-HOURS-GUARD (XS) — market-hours skip guard (Option A default; PM decision), depends D3B
**board-mutations:**
- .task_board.ready -= [FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION]
- .task_board.in_progress += [FIX-BCTC-PDFPULL-WIRE-TABLE-EXTRACTION with status=DECOMPOSED + decomposed_into=[7 tasks] + dependency_order]
- .task_board.backlog += [all 7 new tasks, status=READY, depends arrays wired]
**key-decisions:**
1. Accepted architect sequencing as-written — D1 first, no renegotiation
2. All tasks READY (not backlog-hold) — developer can start immediately on D1
3. R-HIGH-1 mandatory, same-cycle with D3B (no separate dispatch risk)
4. R-HIGH-2 flagged PM decision, default Option A (client-side guard recommended)
**next-agent:** dev-mcp-server — claim D1 first (no deps), then D2, then D3A, then D3B (gates R-HIGH-1), then D3C/R-HIGH-2 parallel
