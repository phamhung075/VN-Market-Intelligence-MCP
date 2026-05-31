# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- **BCTC-TRUST-RED** ✅ SIGNED OFF 2026-05-30 (e0c900d0). Ingest gate + publish guard + DDD validators; FPT+ACB purged→PENDING. Brief `docs/architecture-briefs/2026-05-30-bctc-trust-red.md`. Follow-up now ACTIVE as sprint **FU-TRUST-REFRESH** below.
- **BCTC-AI-INPUT-TAB** ✅ SIGNED OFF 2026-05-30. Additive 7th tab "Đầu vào AI" on `/api/bctc-inspect` (per-page agent-input PNG + OCR text + page-window). QA cycle-157 all 7 gates @ b4ed9266. Live-verified real PNG / honest 404 / DB row untouched.
- **BCTC-HUMAN-CONFIRM** ✅ SIGNED OFF 2026-05-30. Human correction layer on `/api/bctc-inspect` (review red/yellow cells, hand-correct, lock "ĐÃ XÁC NHẬN"; 3-layer lock survives cron re-runs; 50/50 viewer + 6 tabs). QA HC-QA-3 cycle-156 all 9 gates @ 441f8e18. Brief `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md`.
- **BCTC-AGENTIC-REFINE** ✅ SIGNED OFF 2026-05-30. Brief `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`. 🔄 **AR-FU-DETERMINISM** (MED, DEFERRED): Haiku refine non-deterministic markdown coverage (FPT run-1=91 vs run-2=18); store-correctness unaffected.
- **DATA-PIPELINE-INTEGRITY** ✅ SIGNED OFF 2026-05-30. 🔄 FU-C (MED test-debt, DEFERRED) · ⏳ FU-MON (Monday: DPI-3 Brent/Gold + DPI-4 `get_foreign_flow` live-probe).
- **BCTC-TABLE-BOUNDARY** ✅ SIGNED OFF 2026-05-30. Over-merge bug resolved (FPT=31/ACB=22, 0 dup). FU-BTB-OCR registered. Brief `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.
- **DYN-WF-FOUNDATION** ✅ SIGNED OFF 2026-05-31 (DWF-EXIT). Phase 0 + Phase 2 SHIPPED — closes duplicate-publish + session-scoped SPOF (4× chef-morning dup). Brief `docs/architecture-briefs/2026-05-29-dynamic-workflow-architecture.md`. PO live-verified `is_trading_day` holiday/open, TTL-cap fix, routing-policy 8 rules, 14 enabled slots. Commits 84643927·8105f8fd·fa25aa5f·288e8888·e0f200c3·c937599b·149f64e8·eee22112. **DWF-TSC-DEBT** RESOLVED/NO-OP 2026-05-31 (verified-not-dispatched: `tsc --noEmit` = 0 TS18048, file uses `!` assertions L92/137; `bun test` 7 pass — false-RED, not dispatched).
- **DWF-PHASE1** ✅ DONE/SHIPPED 2026-05-31 (P1-PO-EXIT). Adaptive cadence (heartbeat consults Cadence Policy); zero `apps/mcp-server/` prod code, NO rebuild. `cadence-policy.json` (19 rules/3 IDs) + `cadence-policy.js` evaluator + `cowork-match-slots.js` adaptive `--mode` + 14 slots `policy_id`+`last_fired` + flow Steps 4.2–4.5b/5b + `DWF-phase1-cadence.test.ts` (48 assertions). QA P1-QA 8 gates GREEN. PO critique-before-approve: ran suite (48/48), own RED proof on EC-6 chef-intraday null-injection (load-bearing). Brief `docs/architecture-briefs/2026-05-31-dwf-phase1-adaptive-cadence.md`, sign-off `docs/handoffs/P1-PO-EXIT-signoff.md`. Commits 5a19485e..d8892afc · fbdba703 · 7a461eb7 · 38d241c5. ⛔ Phase 3+ (content-router/workgraph/backpressure) DEFERRED — operator-gated.
- **MACRO-CMDTY-DELTA** ✅ DONE/SHIPPED 2026-05-31T01:34Z (PO-EXIT APPROVE). Brent/Gold change%=+0.00% root cause in `apps/mcp-server/` (NOT macro-indicators): off-market repeated-close prev-close query matched ~1h-old identical row → fixed with previous-calendar-day baseline (`date(fetched_at) < date(?) AND brent/gold > 0`). PO raw-verified honest-flat 0.00% + correct logic + DPI-3 4 pass + clean scope. Report `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P4, DASHBOARD cow-20260529T221054-MCP-P4 RESOLVED. Commits e510e5df · dab1bf86 · fdc17265, image 802d6463e665. 🔄 FU: signed-non-zero in-the-wild on next real move (~Monday open).
- **FF-DEAD** ✅ FIXED 2026-05-31 (PO live-verified). Foreign-flow pipeline dead fleet-wide; root cause VPS field-name drift; FF-DIAG fix `0cbce0b4` live + redeployed. PO raw-reprobe: `get_foreign_flow(FPT)` returns real daily history (2026-05-30 net −37905, foreign room 34.75M). Zone `vps-scripts/`. ⏳ **FU-MON** (Monday open): probe non-zero net during live trading to confirm in-the-wild. Report `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P1.

---

## Sprint TOOL-SURFACE-HYGIENE — Clean the vn-market MCP tool surface

**Status:** OPEN 2026-05-31 (PO self-init, operator-approved). **Priority: MEDIUM.** Zone: `apps/mcp-server/` (dev-mcp-server) — #1 may route to kinh-dich-service zone IF architect picks "wire". NOT BCTC (no recurring-bug conflict). Goal `docs/SPRINT_GOAL.md` (TOOL-SURFACE-HYGIENE § — full context + PO raw-source findings). Live tool count PO-verified = **154** (matches HC-EXIT container probe); stale `project-stats.json toolCount=146`.

**PO raw-source findings (binding, feed the brief):** (1) the 501 on `get_market_hexagram` is emitted by **kinh-dich-service /market (port 5005)**, NOT a mcp-server stub — `kinhDichTools.ts:510` delegates honestly via `clients.ts:505`. "Wire"=kinh-dich-service zone; "deregister"=`apps/mcp-server/` zone. (2) NO double-registration — `marketTools.ts:64` is the private helper `appendMarketHexagram`, not a tool. (3) the other 5 kinhdich tools are wired; scope is `get_market_hexagram` ONLY.

- 🔄 **BA-TSH (BA)** — pending. Requirement spec for SPRINT_GOAL.md § TOOL-SURFACE-HYGIENE. Decompose into: #1 (CONFIRMED, ship first — architect picks wire vs deregister + names zone), #2 `mark_alert_outcome` vs `write_alert_verdict` (diff-before-merge), #3 macro accuracy trio (diff), #4 `get_patterns` vs `get_technical_indicators` (diff), #5 `trigger_*_vps_fetch` ×5 (OPTIONAL/LOW), #6 `toolCount` 146→154 reconcile (LAST). OUT: BCTC tools, the 3 cleared pairs, other 5 kinhdich tools. Owner: dev-mcp-server (+ kinh-dich-service dev if #1=wire). Architect brief REQUIRED for #2/#3/#4 source diffs before any merge.

---

## Sprint FU-TRUST-REFRESH — Wire dead OCR seam, then genuine re-refine FPT+ACB

**Status:** OPEN 2026-05-31 (PO self-init, all 5 ODs adjudicated). **Priority: HIGH.** Zone: dev-pdf-extractor (`apps/pdf-extractor/`) + ops + qa. Brief `docs/architecture-briefs/2026-05-31-bctc-trust-remediation-investigation.md` (aa753e5e). Goal `docs/SPRINT_GOAL.md` (FU-TRUST-REFRESH § — full OD rationale). Root cause: `/page-text` (handlers.py:728) returns `""` permanently (main.py never wires `ocr_text_source`); real OCR exists in `pdf_extracted_text` (FPT 35p / ACB 27p); re-refine TODAY would re-fabricate → seam fix is gating prereq. **WIP-aware: FU-0→FU-1→FU-2→FU-3→FU-4, strictly sequential.**

- ✅ **FU-0 (architect)** — DONE 2026-05-31 (`e7056ce3`). DECISION: **Option A — direct `SqliteOcrTextSource(MARKET_DB_PATH)`** wired in `create_app()`. Corrected both PO-flagged facts (volume already mounted both services; `OcrTextFetchClient` keyed by `report_id` ≠ `/page-text` `(filename,page_number)` interface → Option B is cross-zone, rejected). FU-0 Seam Decision § appended to brief with binding 4-file change list + fail-loud spec. **FU-1 now UNBLOCKED.**
- ✅ **FU-1 (dev-pdf-extractor)** — DONE 2026-05-31 (`af50d67a`, QA APPROVE). Wired `select_ocr_text_source(MARKET_DB_PATH)` in `create_app()`→`register_routes()`; `config.py market_db_path`; compose `MARKET_DB_PATH`. RISK-1 fail-loud: startup `_probe_ocr_source`→`/health ocr_source_ok`, `/page-text source_reachable:false` on source-fail (not silent `""`) + 10-test deliberate-violation suite. **Dispatcher raw-verified live** (not badge): FPT p7→2764 chars/200 VN diacritics, `source_reachable:true`, real BCTC (`CÔNG TY CỔ PHẦN FPT…CHỈ TIÊU`); `/health ocr_source_ok:true`. **QA raw-sealed**: suite 783 pass / 40 fail (all 40 PRE-EXISTING — reproduced on parent `e7056ce3`, 0 regression; +23 new pass), fail-loud RED-path proven live, ACB p20 no-regression. 🔄 FU-DEBT: 40 pre-existing pdf-extractor suite failures (test-debt, not this sprint). Container rebuilt+healthy on :5001. **FU-2 now UNBLOCKED.**
- 🔄 **FU-2 (ops)** — NEXT (rebuild ALREADY done by FU-1; remaining = rasterize all FPT(46)+ACB(27) pages). ⚠ disk-intensive (73 PNGs @150 DPI) — heed `project_disk_full_lancedb_bloat`/`project_host_memory_panic`; dispatch as deliberate fresh ops unit. **BLOCKS FU-3.**
- 🔄 **FU-3 (ops, off-HOSE only)** — confirm PENDING, run refine cron (today Sat=permitted; weekday 09:00–01:59 UTC), monitor `get_bctc_refined`. **BLOCKS FU-4.**
- 🔄 **FU-4 (qa)** — `get_bctc_full(FPT/ACB)` real numbers; `bctc_table_rows COUNT>0`; `refine_status=DONE`; gates didn't falsely block (RISK-2/4). OD-4 verdict: opex 11/24/25/26 present or → BCTC-LAYOUT-FIRST.
- ⛔ **FU-5 (EBITDA mapping, `apps/mcp-server/`)** — DEFERRED to BCTC-LAYOUT-FIRST per OD-3 (zone discipline; not this single-zone sprint).

---

## Sprint ENV-ISOLATION — Fleet-wide test/prod data isolation (split P1/P2)

**Status:** OPEN 2026-05-31 (PO adjudicated all 6 ODs). **Pri: MEDIUM.** Zone: multi (ops + `apps/mcp-server/` + `scripts/` + rag compose). Brief `…/2026-05-31-fleet-env-isolation-architecture.md` (6e8f3d23). **Full shape + acceptance + OD rationale → `docs/SPRINT_GOAL.md` ENV-ISOLATION §.** Model: single-stack dev override, `.dev` datastores, `APP_ENV` default `production`, dev port 3099. **OD:** A=same-volume·B=5 tables·C=P1-now/P2-after-FU-TRUST-REFRESH·D=manual SOP·E=defer partial·F=SPLIT.
- 🔄 **P1 (NOW):** EI-P1-1 ops (`APP_ENV: production`+explicit `COORDINATION_DB_PATH` in `docker-compose.yml`) · ✅ **EI-P1-2 DONE** (scripts/ guards: `run-bt7-backfill.ts`+`purge-phantom-reports.ts` — APP_ENV/DB_PATH printed, refuse on mismatch unless `--force-dev`) · ✅ **EI-P1-3 DONE** (`docs/protocols/dev-environment.md` — start/seed/promote FK-ordered/LanceDB/restore/RISK-5).
- ⛔ **P2 (GATED, only after FU-TRUST-REFRESH FU-4 — FU-2 currently NEXT):** EI-P2-1 dev-mcp-server (startup assertion + `setup.ts APP_ENV=test`) → EI-P2-2 dev-mcp-server (`data_env` audit col ×5 tables, INSERT stamp, no read-filter; ops rebuild after) → EI-P2-3 ops/rag (`docker-compose.dev.yml`) → EI-P2-QA qa (ENV-GUARD-1 deliberate-violation, 0-regression). **Dispatch:** ops EI-P1-1 → developer EI-P1-2/3 ‖ then P2 chain.

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
- 🔄 LF-OVERLAY (dev-mcp-server): `POST /api/push-bctc-layout` + zone toggle. **Persistence NO LONGER a blocker** — report #3011 was FALSE-RED (see SPIKE below): handler persists correctly on current image. Remaining LF-OVERLAY scope = zone-toggle UI feature only, not a write-wedge fix.
  - ✅ **SPIKE_3011-LF-PERSIST-DIAG** — DONE 2026-05-31T08:45Z (dev-mcp-server, mode:spike, findings `docs/spikes/SPIKE_3011-LF-PERSIST-DIAG.md` commit `2a4e036d`). **VERDICT: STALE-FALSE-RED.** Live re-push → `units_stored=2`; in-container bun COUNT=2 (match); table has 177 `bctc_layout_units` rows (NOT 0). Dispatcher independently re-confirmed COUNT=177 / `bctc_page_zones`=569. #3011 conflated wrong handler (write-wedge was `pushBctcTableHandler`, not `pushBctcLayoutHandler`) + a since-fixed idempotency bug (`60dfac7f`, produced too-many not zero rows); FPT 2024-Q4 doesn't exist in DB (only 2025-Q4 + 2026-Q1). **Report #3011 resolved wontfix (processed=true). No LF-OVERLAY persist FIX needed.**
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter. **LF-QA absorbs TR-2** (BCTC-TRUST-RED): refine_status=DONE must yield non-zero opex codes 11/24/25/26, non-zero equity+liab, non-zero EBITDA, ≥1 OCF row from page 9/10/16.

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po)

---

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · code-janitor DOUBLON CLEAN candidate (3 live + 10 proposed, HELD, batch when apps/mcp-server has no active reliability sprint) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
