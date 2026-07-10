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

### STEP architect-S5 · architect · 2026-07-10T12:30:00Z
**task-id:** FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS
**what-done:** Read reports.ts (`get_financial_summary` ~L277-356, `compare_financials` ~L392-457) and bctcFullTools.ts's PUB-1 check (~L609-627) to confirm the QA-flagged gap and the shape of the existing gate pattern, then confirmed via DB migration source (schema-financial-reports.ts L504) that `refine_status` is `NOT NULL DEFAULT 'PENDING'` and only ever transitions via the separate agentic-refine pipeline (`finalizeBctcRefine.ts`). Triaged as S-size/mechanical — routed straight to dev-mcp-server (BACKLOG→READY, no design doc) with a corrected gate condition in `status_note`.
**what-considered:**
- Blind-copy PUB-1's exact field (`refine_status === 'PENDING'`) onto the two ungated tools, as the task's framing suggested — REJECTED: `get_financial_summary`/`compare_financials` read the scalar columns (`net_revenue`, `gross_profit`, etc.) populated by the legacy scalar pipeline (`fetchParseAndStoreBctc`/`storeReport()`), which never touches `refine_status`. Historical rows extracted only through that legacy path sit at `refine_status='PENDING'` forever (DB default) even though they carry real, legitimate data — gating on `refine_status` would hide correct legacy reports, a regression, not a fix.
- Gate on `validation_status === 'pending_extraction'` instead — CHOSEN: per `ensureFinancialReportShellRow.ts` (D2, commit d2cad2508) L34 comment, `'pending_extraction'` is a new, additive-only enum value set ONLY on first-insert of a shell row, distinct from all legacy values (`pending|passed|failed|passed_with_warnings|low_confidence`) — zero collision risk with any pre-existing real-data row, surgically targets exactly the D2-introduced case.
- Full architecture/design pass — REJECTED: board size=S, fix is a copyable 2-call-site condition + interface field addition, response shape already established (plain-text content, not thrown, matches both PUB-1's and these same tools' own existing 404 branch). Design-doc overhead not warranted; a precise `status_note` implementation spec is sufficient and de-risks the field-choice pitfall dev-mcp-server would otherwise hit copying PUB-1 verbatim.
**why-decision:** The literal "mirror PUB-1" framing in the task brief was not safe to execute as worded — verifying the write paths (legacy scalar vs. agentic-refine) surfaced a field-choice trap that would have caused a real regression (hiding legitimate un-refined legacy reports) had dev-mcp-server copied `refine_status` mechanically. Catching this before implementation is exactly the value of the architect triage step even on an S-sized ticket; routing to READY with the corrected condition spelled out avoids a second QA round-trip.
**why-change:** n/a — first triage pass for this task; supersedes the task brief's own suggested mirror-pattern (refine_status) with the verified-correct one (validation_status).
**board-mutation:** `.task_board.backlog[id=FIX-BCTC-SERVE-GATE-FINANCIAL-REPORTS]`: status BACKLOG→READY, next_agent architect→dev-mcp-server, status_note replaced with full implementation spec (gate condition, exact insertion points in both tools, response shape, language-boundary note). Applied via `scripts/orch-apply.sh` (Stage 0+1 PASS, pre-existing SHG-migration coherence warnings only, non-blocking).
**next-agent:** dev-mcp-server — implement per status_note, no further design/PM step needed.

### STEP architect-S6 · architect · 2026-07-10T15:45:00Z
**task-id:** FIX-TASKLOCK-OWNER-SESSION-SERVER-SCOPED-DEFEATS-MUTEX
**what-done:** Re-read coordinationTools.ts/coordinationStore.ts fresh (not from the 06-26 note); RAW-ran the 1980/store/tools/DWF-phase2 test files (GREEN, 116 pass/0 fail); live `task_list_held` probe via mcp-call.sh; independently confirmed via server.ts:299-456 (fresh transport+McpServer per /mcp request, no sessionIdGenerator) why option (a) is structurally impossible here.
**what-considered:**
- Option (a) RequestHandlerExtra.sessionId — REJECTED, independently corroborated not just cited: gateway/transport opens+closes a fresh McpServer+transport pair per call, no cross-call server-observable identity exists.
- Option (b) explicit owner-token — the fix ALREADY SHIPPED (TASK_1980/P1-FINAL, commit dea481e40, 2026-06-28), as a stricter mandatory (not opt-in) variant closing the silent-omission gap opt-in would leave.
- Propose new option (c) — REJECTED: shipped design (required owner_client_session, owner_session demoted to diagnostic) is sound, tested, live-correct; no gap found.
**why-decision:** This ticket (minted 2026-06-26) predates and was never cross-linked to the independently-run CROSS-SESSION-MULTI-TEAM-ORCH P1 chain that shipped the identical fix 2 days later (2026-06-28). All 4 backlog ACs verified true (1 is a stale-wording/functionally-met nit, not a gap, per brief §5).
**why-change:** n/a — no new design; this task closes as SUPERSEDED/RESOLVED, not implemented.
**next-agent:** po — close as SUPERSEDED, no dev dispatch. Brief: docs/architecture-briefs/2026-07-10-tasklock-owner-session-already-fixed.md
