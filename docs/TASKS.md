# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed this session (detail → commits / TASKS_ARCHIVE.md)

- **SIGDRAIN-PERSIST** ✅ CLOSED 2026-05-29 (CLEAN) — drain-signals.md had documented persist+commit, no enforcement; added MANDATORY PERSIST GUARD (>50 files OR >24h db mtime → full drain+commit). Drained 742 stale signals; signals.db 05-22→05-29 (512 rows today, integrity_check ok); `## po` 8 NEW→READ (inbox 0); root signals 742→1. dev `5e9e929e` (scope-clean) / QA APPROVE. Done-bar 3/3.
- **BOOTSTRAP-ENUM-BCTC** ✅ CLOSED 2026-05-29T17:51Z — `bctc-analyst` added to `VALID_AGENT_NAMES` (getCycleBootstrap.ts); guard 1975 PROVEN-RED, report #3009 resolved. dev a0103b84 / QA APPROVED. SSOT-derive deferred → proposal `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`.
- **VNH-SECTOR-FIX** ✅ CLOSED 2026-05-29T17:45Z — VNH `real_estate`→`agriculture` (seed + live db); `domain` typed `string`→`DomainType`. QA 24/24, anti-false-green PROVEN. dev 9713118f / qa 29d5629f. Spec `docs/REQ_VNH-SECTOR-FIX.md`.

---

## Backlog — string-vs-enum hardening (recurring class, do NOT action; next triage)

Structural fields typed as bare `string` compile bad enum values silently. Recurring across: VNH `DomainType` (seedWatchlist), `commit-mutex` task_claim kind, `verified_decision` enum, bootstrap agent_name enum. Two SPIKE candidates: (1) fleet-wide one-pass audit of seed/config arrays typing structural fields as `string` → tighten to unions; (2) bootstrap agent_name SSOT-derive from `system-map.json` roster → `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`. PO triage 2026-05-29: candidate (2) HELD (not opened) — WIP=2 both HIGH; priority medium; guard test 1975 already mitigates; full runtime-derive risks app→infra boundary. Revisit when WIP frees or 5th recurrence.

---

## Note — MACRO-SEED-WIRING (report #3003) → FALSE-RED, MONITORING

PO live-probe 2026-05-29T17:29Z: `get_macro_snapshot` returns `dataSource:"live"` (oil 90.74, gold 4594.6, usdvnd 26255) — stale-seed HEADLINE symptom NOT reproducible. Residual: `carry`/`yield` sub-signals carry `computedAt:"2026-05-23"` (cached sub-computations, not headline miscalibration). Report #3003 `monitoring`; escalate to cache-TTL FIX only if a future tick re-probes a STALE headline.

---

## Sprint DATA-PIPELINE-INTEGRITY — Macro + Foreign-Flow Live-Data Correctness

**Status:** ✅ SIGNED OFF (DPI-EXIT) 2026-05-30 — **CRITICAL incident CLOSED.** All 4 user-facing data bugs root-caused, code-fixed, deployed, and verified. **3 of 4 surfaces fully live-DONE; DPI-3/DPI-4 are CODE-DONE + path-PROVEN, awaiting only a natural schedule/market tick no human can force on a weekend** (documented residuals below — NOT false-green per `feedback_fence_false_green`). PO independent live re-probe 2026-05-30 corroborated the QA+ops ledger on all four. Zone: `multi` (`apps/macro-indicators` DPI-1/2/2b + `apps/mcp-server` DPI-3/4). VPS infra HEALTHY. Goal `docs/SPRINT_GOAL.md` § DATA-PIPELINE-INTEGRITY.

- ✅ DPI-BA: Spec `docs/REQ_DATA-PIPELINE-INTEGRITY.md` — 4 bugs decomposed; DDD layer mapped; zero PO blockers.
- ✅ DPI-ARCH (architect): `docs/handoffs/DPI-ARCH.md` — Option A canonical SBV FX; SBVRateSQLiteAdapter pattern; DPI-2 inline time.Now(); DPI-3 pre-tx prev-close read + delta; DPI-4 UPSERT + R-1 race fix.
- ✅ **DPI-1 — FX Canonical Source** (dev-macro-indicators): SBVRateSQLiteAdapter + usecases.go + main.go wiring. **DONE — PO live-verified 2026-05-30: `get_macro_snapshot` usdVnd=26115 AND `get_cycle_bootstrap` MACRO block USD_VND=26115 (identical; Yahoo 26255 GONE). Dual-path divergence eliminated.** QA record `be9741f6`.
- ✅ **DPI-2 — Carry/Yield ComputedAt** (dev-macro-indicators): inline `time.Now().UTC()` in Execute(). **DONE — PO live-verified 2026-05-30: carry.computedAt & yield.computedAt = 2026-05-29T23:49:41Z (today, NOT frozen 2026-05-23).**
- ✅ **DPI-2b — Carry/Yield LIVE Inputs** (dev-macro-indicators): `CarryYieldInputsSQLiteAdapter` wires 3 live sources; fixtures kept as explicit safe-degrade fallback. **DONE-WITH-DOCUMENTED-DEGRADE — PO live-verified 2026-05-30: vndDepositRate=5.0 LIVE from sbv_rates (≠ fixture 4.7, adapter PROVEN). fedFundsRate=5.33 & earningYield=8.2 correctly SAFE-DEGRADE to fixtures because upstream feeds are stale/empty (FU-A/FU-B) — the WIRING is correct, the upstream DATA is the gap.**
- ✅🕒 **DPI-3 — Brent/Gold Delta** (dev-mcp-server) [zone: `apps/mcp-server`]: prev-close lookup + computeDelta() + ON CONFLICT upsert. Commit `32d201e8`. **CODE-DONE + math PROVEN live (BRENT +0.0764%, GOLD −0.0787% via computeDelta).** RESIDUAL (schedule-gated, NOT a bug): live display currently shows 0.00% because consecutive same-hour manual ticks had equal prices; the `0 6 * * *` daily cron spaces rows 24h apart = real day-over-day delta. **LIVE-CONFIRM at next 06:00 UTC cron → FU-MON re-probe.**
- ✅🕒 **DPI-4 — Foreign-Flow UPSERT + R-1 Race Fix** (dev-mcp-server) [zone: `apps/mcp-server`]: TWO bugs fixed — UPDATE-only silent-skip (`32d201e8`) + incomplete-INSERT NOT NULL (`36a91a59`, ops emergency out-of-zone patch → FU-C owns/tests) + R-1/R-5 race fixes. **CODE-DONE + end-to-end path PROVEN (VPS push → upserted=102 → mcp-server log "ohlcv rows updated changes=102" → NO NOT NULL error).** RESIDUAL (market-hours-gated, NOT a bug): foreign VALUES are 0 because weekend (VPS bgapidatafeed returns 0 outside VN market hours); `get_foreign_flow(HPG)` still "No data" but now for the LEGITIMATE weekend-zero reason, not the bug. **LIVE-CONFIRM Monday ~02:15 UTC market open → FU-MON re-probe.**
- ✅ DPI-OPS (ops): mcp-server + macro-indicators force-recreated; live re-probe confirmed fixes loaded.
- ✅ DPI-QA (qa): live re-probe all four; DPI-1/2/2b PASS; DPI-3/4 code+path PROVEN-GREEN; residuals documented (be9741f6).
- ✅ DPI-EXIT (po): independent live re-verify 2026-05-30 — all four corroborated. Signed off with DPI-3/DPI-4 honest residuals + 4 follow-ups (FU-A/B/C/MON).

**Follow-ups spawned (see DPI-FOLLOWUPS):** FU-A (FRED EFFR feed stale), FU-B (market_earning_yield zero rows), FU-C (own + real-schema test commit 36a91a59), FU-MON (Monday live-confirm DPI-3/DPI-4).

---

## DPI-FOLLOWUPS — DATA-PIPELINE-INTEGRITY residual closers (registered by DPI-EXIT 2026-05-30)

**Status:** OPEN. Spun out of DPI sign-off. FU-A/FU-B are the upstream-data gaps behind DPI-2b's safe-degrade fallbacks (real DEGRADE→LIVE wins). FU-C closes the unit-test false-green gap per `project_mcp_server_write_wedge`. FU-MON is the scheduled live-confirm flip for DPI-3/DPI-4. **Feasibility assessed before commit:** all four scoped to `apps/mcp-server` / dev-mcp-server zone; FU-MON is a pure live-probe (no code). **Priority:** FU-MON time-critical (Monday); FU-A/FU-B MEDIUM (degrade is correct, fixtures are sane); FU-C MEDIUM (hardening / test debt). Triage next cron tick against WIP cap.

- 🔄 **FU-A** (dev-mcp-server) [zone: `apps/mcp-server`]: **FRED EFFR feed STALE 15 days.** `fred_series_daily` EFFR latest = 2026-05-14 (>96h → DPI-2b fedFundsRate safe-degrades to fixture 5.33). The FRED fetcher (`fetchFredEffrIorb` / its scheduler job) stopped updating. **Find why it stopped; restore fresh EFFR** so DPI-2b fedFundsRate uses live data instead of fallback. DoD: `fred_series_daily` EFFR latest ≤96h + `get_macro_snapshot` carry.fedFundsRate sourced live (not fixture).
- 🔄 **FU-B** (dev-mcp-server) [zone: `apps/mcp-server`]: **market_earning_yield ZERO rows.** `tracked_indicators` has no `market_earning_yield` rows → DPI-2b earningYield safe-degrades to fixture 8.2. `marketEarningYieldJob` / `computeMarketEarningYield` not running or not persisting. **Restore** so DPI-2b earningYield uses live data. DoD: `tracked_indicators` market_earning_yield populated fresh + `get_macro_snapshot` yield.earningYield sourced live.
- 🔄 **FU-C** (dev-mcp-server) [zone: `apps/mcp-server`]: **Retroactively OWN + review commit `36a91a59`** (authored out-of-zone by ops/`report-analyzer` as an emergency live-incident NOT-NULL patch) AND **add a real-schema integration test** (bun/FastAPI TestClient against the ACTUAL `daily_ohlcv` schema, NOT an in-memory stub) exercising `writeForeignFlowToOhlcv` + the push-foreign-flow handler end-to-end, that WOULD have caught the NOT NULL miss. Closes the unit-test false-green gap per `project_mcp_server_write_wedge`. DoD: dev-mcp-server owns the diff; real-schema test PROVEN-RED if NOT-NULL columns dropped, GREEN with fix.
- 🔄 **FU-MON** (po, live-probe only — no code) [zone: n/a]: **Monday live-confirm DPI-3 + DPI-4.** After 06:00 UTC daily cron, re-probe `get_macro_snapshot` / `get_market_snapshot` → BRENT & GOLD change_pct NON-ZERO directional. After ~02:15 UTC HOSE open, re-probe `get_foreign_flow(HPG)` → POPULATED. **Flip both to fully-DONE if live-green; REOPEN with a FIX task if either fails live.** DoD: both surfaces show real values OR a reopen task is registered with the failure mode.

---

## Sprint BCTC-TABLE-BOUNDARY — Multi-Page Table Stitcher Boundary State Machine

**Status:** ✅ SIGNED OFF (BTB-EXIT) 2026-05-30 — **User's over-merge bug RESOLVED on the live canonical path (PATH B).** PO independent re-verify (not rubber-stamp): (1) source-traced PATH B `_run_extraction` L728 calls shared `group_pages_into_units()`; `_group_bboxes_into_units` DELETED (AD-2); AD-1 asserts PATH A≡PATH B shapes (single-source proven, drift #3 closed). (2) direct live-DB read FPT=31 (27 table+4 prose) / ACB=22 (17 table+5 prose), 0 dup unit_ids, 0 dup page-spans — matches QA exactly; prose units PRESENT on live path. (3) over-merge sentinel: largest table-unit span FPT=2 pages [22,23] (genuine continuation), ACB=1 page — NO giant merged unit; bug gone. (4) text_table_extractor.py + PDF-Extract-Kit 0-diff (frozen); tree clean. 718/718 + 33/33 + 25/25 + anti-drift all green & non-hollow. Zone: `apps/pdf-extractor/`. **KNOWN-LIMITATION (shipped as documented, NOT a blocker → FU-BTB-OCR):** PATH B runs `stored_text=""` so D-5 title-band detector is disabled live and YOLO page-type classification has margin errors (a Balance-Sheet page can be mislabeled prose, a Notes page mislabeled table). This is page-TYPE labeling noise, NOT the grouping bug — AD-1 proves the boundary logic itself is correct regardless of label source.

- ✅ BTB-EXIT (po): see status line — APPROVED 2026-05-30. Follow-up FU-BTB-OCR registered.

- ✅ BTB-BA: Spec `docs/REQ_BCTC-TABLE-BOUNDARY.md` — 4 boundary states (START/CONTINUE/END/NEW), FR-1..5, DV tests, two real-data sentinels. NEXT: architect.
- ✅ BTB-ARCH (architect): design state-machine transition (per-page type × geometric continuity × title-band × intervening-prose), title-band detector, revised _flush_unit, revised blank-bridge — brief `docs/architecture-briefs/2026-05-29-bctc-table-boundary.md`. NEXT: dev-pdf-extractor.
- ✅ BTB-DEV (dev-pdf-extractor): 5-state machine (NO_TABLE/TABLE_OPEN/TABLE_END/TABLE_NEW + deferred blank buffer), _is_title_band D-5, schema-page-type _flush_unit — commit d297f3ba. DV-1 PROVEN-RED→GREEN. DV-2 PROVEN-RED→GREEN. 659/659 unit tests pass. NEXT: ops rebuild.
- 🚫 BTB-OPS (ops): BLOCKED — 2 cycles, conflicting diagnoses (cycle-1 `df159c7f` write-wedge: units_stored=28 echo vs DB=0; cycle-2 force-recreate then "hang" at 13min/101%CPU, container KILLED). Held pending BTB-UNBLOCK.
- ✅ BTB-QA (qa) cycle-151: DV-1/DV-2 PROVEN-RED→GREEN; AD-1/AD-2/DV-1-B/DV-2-B/9-page all green & non-hollow; direct-DB both sentinels; no prose page inside any table unit. GREEN.
- ✅ BTB-EXIT (po): independent live re-verify both sentinels via direct DB + source-trace of PATH B + over-merge sentinel. APPROVE 2026-05-30.

### FU-BTB-OCR — feed OCR text into PATH B so D-5 title-band works live (registered by BTB-EXIT 2026-05-30)

**Status:** OPEN, MEDIUM. Zone: `apps/pdf-extractor/`. Not a regression — pre-existing PATH-B characteristic surfaced by BTB. PATH B passes `stored_text=""` into the grouper, so the D-5 title-band detector silently no-ops and unit page-TYPE relies on YOLO geometry alone (margin errors: Balance-Sheet↔prose, Notes↔table mislabels). The boundary GROUPING is correct (AD-1 path-agreement proven); this follow-up improves page-TYPE LABEL accuracy. DoD: PATH B `_run_extraction` feeds the per-page OCR text into PageDescriptor so D-5 title-band fires live; a sentinel page known to be mislabeled by YOLO-only is corrected; AD-1 still green (no new drift).

### BTB-UNBLOCK — PO triage 2026-05-29T21:57Z (UNBLOCK, runtime not boundary code)

**d297f3ba EXONERATED on loop/hang** (PO read generic_md_table_extractor.py L2696-2784): boundary grouping is a single bounded `for page_num in range(1, total_pages+1)` pass; no inner while, no re-queue; `pending_blanks` appended-or-reset every branch (cannot grow unbounded). Structurally cannot infinite-loop/hang. Boundary change confined to grouping; unit-GREEN. → Runtime blocker is PRE-EXISTING infra (write-wedge + slow-CPU priors), NOT introduced by d297f3ba.

**Cycle-1/cycle-2 contradiction RECONCILED by PO code-read** (handlers.py L185-233): (a) `units_stored=28` logs `push_result.get("units_stored")` = push-client return, which per `project_mcp_server_write_wedge` is input-echo not committed-DB count → "DONE 28 vs DB 0" = documented write-wedge echo, not success. (b) `except Exception as exc: _log.error(..., error=%s)` has NO traceback/`exc_info` → silent-swallow (`feedback_silent_swallow_serial_bugs`), hides real error one-rebuild-at-a-time. (c) ZERO per-page heartbeat between extract start and DONE → cycle-2 "hang" indistinguishable from normal-slow CPU PaddleOCR (46pp × ~26s ≈ 20min); KILL at 13min = likely PREMATURE, not a proven hang.

**Mandate → dev-pdf-extractor (primary):** (i) audit d297f3ba state machine for any loop/hang (PO pre-checked clean — confirm + document); (ii) make `_run_pek_extract` FAIL-LOUD: `_log.error(..., exc_info=True)` full traceback + re-surface to a status the DB can show; (iii) add per-page progress HEARTBEAT log in PekEngineAdapter extraction loop; (iv) add a hard extraction TIMEOUT (>= 30min, generous for 46pp CPU) so a genuine hang self-aborts loudly instead of needing a manual kill. **→ dev-mcp-server (conditional):** if instrumented run proves push 200-OK but DB COUNT=0, fix push handler to COMMIT + return real DB count (write-wedge), per MCPZONE-HARDEN priors.

**Then:** ops runs ONE instrumented extraction to COMPLETION off-hours (HOSE 02:00–08:59 UTC closed; CPU-only/8GB; patience ≥ timeout, do NOT kill before heartbeat stalls past timeout) on FPT `e71f845d` + sentinel B; verify via DIRECT in-container market.db COUNT (not push echo). → qa direct-DB done-bar → po BTB-EXIT.

### BTB-DRIFT — PO triage 2026-05-29T23:57Z (DUAL-PATH DRIFT confirmed by PO code-trace → architect-FIRST)

**CANONICAL PATH = PATH B (PEK adapter). PO-CONFIRMED by code-trace (not assumed):**
- LIVE route: `/api/trigger-pek-extract` (server.ts) → pdf-extractor `/pek-extract` → `_run_pek_extract` (handlers.py L193-219) → `pek_adapter.extract_layout_and_tables()` → its OWN grouping `_group_bboxes_into_units` (pek_engine_adapter.py L541). It does NOT import or call `build_document_map`; it does NOT touch `ExtractLayoutFirstUseCase`. PATH A is reached ONLY via the SEPARATE `/extract-layout-first` route.
- **d297f3ba (BTB boundary fix) is NOT in the live path** — it landed in `build_document_map()` (PATH A). The 659-unit-test / DV-1 / DV-2 GREEN proof is on a path the USER does not exercise. Same failure class as BCTC-TABLE-3 dual-path drift #2 (`project_bctc_table_sprint`) + recurring-bug-escalation (`feedback_recurring_bug_escalation`: ≥2 fixes same concern → architect RCA first).
- **Why QA saw correct live boundaries anyway:** PATH B's `_group_bboxes_into_units` (page-adjacency + 8-page cap + prose-as-boundary, RC-1/RC-2 fixes) produces correct table spans INDEPENDENTLY — the original over-merge was fixed by PATH B's own RC-1, NOT by d297f3ba. Coincidental agreement, not shared logic.
- **BLOCKING-2 (prose units not persisted) is BY DESIGN in PATH B** (L593-597: prose/blank pages finalize-but-never-create; `page_type` always "table" via RC-2 fix). Prose emission must land HERE, not in PATH A.

**RESOLUTION DECISION (PO): Option (a) CONVERGE on PATH B as the single canonical path** — route the boundary state-machine semantics + prose-unit emission INTO the live PEK adapter, and kill-or-delegate `build_document_map`/`ExtractLayoutFirstUseCase` so ONE grouping implementation exists. Rationale: PATH B already IS the live, RC-1/RC-2-hardened, user-facing path; converging onto a dead path (option b) would re-route production through unproven code; option (c) shared-module is acceptable as a fallback IF architect finds the two cannot be merged cleanly under the constraints. The prose contract + boundary semantics MUST end up in the live path with a guard/test proving either single-path or path-agreement.

**CHAIN: ✅ ARCHITECT DONE 2026-05-30** — brief `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`, handoff `docs/handoffs/BTB-DRIFT.md`. CALLER MAP: `/extract-layout-first` is LIVE SPRINT ASSET (BCTC-LAYOUT-FIRST LF-EXTRACT open) — DELEGATE not kill; `build_document_map` stays, delegates to shared core. DESIGN: new `infrastructure/bctc_page_grouper.py` (SSOT: `PageDescriptor`/`UnitDescriptor`/`group_pages_into_units()`); 8-PAGE CAP REPLACED by `_is_continuous` geometric predicate + D-5 title-band; PATH B `_group_bboxes_into_units` DELETED; PATH B emits prose units; anti-drift tests AD-1/AD-2/DV-1-B/DV-2-B/9-page-regression in `test_anti_drift_grouper.py`. **✅ BTB-DRIFT-DEV DONE 2026-05-30** — commits `06fb1f10` + `ae5bb26c`. bctc_page_grouper.py created as SSOT; _group_bboxes_into_units DELETED (AD-2 GREEN); build_document_map delegates to shared grouper (CG-1 PATH A GREEN); PATH B _run_extraction Step 2 builds PageDescriptors + calls group_pages_into_units directly; prose units emitted on both paths; unit_grouper.py shim kept for compatibility. 718/718 tests pass. text_table_extractor.py 0-diff. PEK PRISTINE. → **ops** ONE off-hours instrumented re-extraction (BATCHED with `60dfac7f` idempotency rebuild + BTB-UNBLOCK runtime mandate) → **qa** direct-DB done-bar → **po BTB-EXIT**.

**BATCHED with this chain (do NOT rebuild alone now):** BLOCKING-1 idempotency fix `60dfac7f` (mcp-server push writer, path-agnostic + correct) — its ops rebuild rides the same off-hours re-extraction. BTB-UNBLOCK runtime mandate (fail-loud/heartbeat/timeout) stays live and merges into BTB-DEV's next pass.

**Done-bar (anti-false-green):** SINGLE clean re-extraction (post-idempotency) of FPT `e71f845d` (expect 7 table spans + visible prose units) AND ACB (5 table spans + prose units), verified by DIRECT in-container market.db read, WITH proof the verified data came from the LIVE/canonical PATH B (e.g. log/trace tying the row to `extract_layout_and_tables`, not `build_document_map`).

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO: APPROVE-WITH-CONDITIONS (062a6569 + ef109a76). X-1 open. **Priority: HIGH.** Zone: `apps/mcp-server/`.

- ✅ Phase 1 (flow wiring → `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`) + Phase 2 code (`selfImproveOrchestratorJob` + degradationRules + improveCheckStore, GATE-PROOF PROVEN-RED)
- 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic-data dry-run, D-IMPROVE emit path end-to-end

---

## Sprint PEK-INTEGRATE — Re-engine apps/pdf-extractor on PDF-Extract-Kit

**Status:** ✅ DONE-PENDING-G9 (2026-05-28). Render-seam fix LIVE; all 12 corpus `has_pek:true`; mcp-server rebuilt. **Condition:** USER verbal G9. All phases DONE (spec `docs/REQ_PEK-INTEGRATE.md` + 8535b175 + 2e228f0d + ed347661 + QA 12/12).

---

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY (LF-DESIGN done). **Priority: HIGH (recurring-bug RCA).** Zone: multi (pdf-extractor + mcp-server). Brief `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`.

- 🔄 LF-EXTRACT (dev-pdf-extractor): Tier 0-3 + zone-geometry JSON
- 🔄 LF-OVERLAY (dev-mcp-server): `POST /api/push-bctc-layout` + zone toggle
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po)

---

## Closed (recent) | Backlogs

- BCTC-TABLE-3 → ✅ CLOSED 2026-05-26 (FPT Q4 79 clean rows, balance_delta=0; dual-path drift RCA; balance badge FORBIDDEN as sole gate)
- MCPZONE-HARDEN-1 → ✅ CLOSED 2026-05-26 (2d4f71d9; write-wedge gone)
- PDF-INSPECT → ✅ CLOSED 2026-05-24
- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close)
- KD-QREF → ✅ CLOSED; KD-QREF-LANG — OPEN (EN/VI switch)
- SIGDRAIN-DB-IGNORE-NIT (low-pri, non-blocking) → drain-signals.md L6 commit-scope lists `docs/signals/signals.db` but `.gitignore` `*.db` makes that `git add` a silent no-op. Fix: drop signals.db from guard commit list OR add `!docs/signals/signals.db` exception. (QA-identified post-SIGDRAIN-PERSIST.)
- Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
