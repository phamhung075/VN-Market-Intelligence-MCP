# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- BCTC-TRUST-RED ✅ e0c900d0 → FU-TRUST-REFRESH ACTIVE below · BCTC-AI-INPUT-TAB ✅ b4ed9266 · BCTC-HUMAN-CONFIRM ✅ 441f8e18 · BCTC-AGENTIC-REFINE ✅ 🔄 AR-FU-DETERMINISM DEFERRED · DATA-PIPELINE-INTEGRITY ✅ 🔄 FU-C DEFERRED ⏳ FU-MON (Monday) · BCTC-TABLE-BOUNDARY ✅ FU-BTB-OCR registered
- DYN-WF-FOUNDATION ✅ DWF-EXIT 2026-05-31 (84643927…eee22112) · DWF-PHASE1 ✅ P1-PO-EXIT 2026-05-31 (5a19485e…38d241c5) ⛔ Phase 3+ DEFERRED · MACRO-CMDTY-DELTA ✅ PO-EXIT 2026-05-31 (e510e5df…fdc17265) 🔄 FU-MON · FF-DEAD ✅ fixed 0cbce0b4 ⏳ FU-MON

---

## Sprint TOOL-SURFACE-HYGIENE — Clean the vn-market MCP tool surface

**Status:** OPEN 2026-05-31. **Priority: MEDIUM.** Zone: `apps/mcp-server/` (#1 may route to kinh-dich-service if wire). Live toolCount=154. Full context → `docs/SPRINT_GOAL.md` §.

- ✅ **BA-TSH** — DONE 2026-05-31. Spec `docs/REQ_TOOL-SURFACE-HYGIENE.md`. FR-1: 1a=wire/kinh-dich-zone vs 1b=deregister/mcp-zone. FR-2 DISTINCT (SQLite alerts vs JSON file). FR-3 DISTINCT (3 sources). FR-4 DISTINCT (RAG vs Go TA). FR-5 optional. FR-6 last. NEXT: architect.
- ✅ **ARCH-TSH** — DONE 2026-05-31. Decision: FR-1=**1b DEREGISTER** (`apps/mcp-server/` zone). FR-2/3/4 all DISTINCT — description-clarify tasks. FR-5 WONTFIX-LOW (schema divergence + param shape incompatibility make consolidation harmful). Brief `docs/architecture-briefs/2026-05-31-tool-surface-hygiene.md`. NEXT: pm → dev-mcp-server.
- 🔄 **TSH-1 (dev-mcp-server)** — Remove `server.tool("get_market_hexagram")` block `kinhDichTools.ts:510–546`; remove dead `getMarketHexagram` import if orphaned. AC: tool absent from `list_server_tools("vn-market")` in-container after rebuild; other 5 kinhdich tools intact; 0 new tsc errors. **SHIPS FIRST. Ops rebuild #1 after.**
- ✅ **TSH-2 (dev-mcp-server)** — DONE f4da532f 2026-05-31. mark_alert_outcome (SQLite alerts table, POST-HOC) vs write_alert_verdict (JSON alert-verdicts file, AT FIRE TIME) — descriptions now explicit. Ops rebuild #2 required before live verification.
- ✅ **TSH-3 (dev-mcp-server)** — DONE f4da532f 2026-05-31. get_calibration_report (calibration_snapshots/Brier), get_label_accuracy_report (market_messages/human-label), get_prediction_accuracy (Polymarket precision) — all three now name source + distinct question. Ops rebuild #2 required.
- ✅ **TSH-4 (dev-mcp-server)** — DONE f4da532f 2026-05-31. get_patterns (LanceDB rag_analyses / semantic precedent) vs get_technical_indicators (Go TA service port 5003 / price-derived). Ops rebuild #2 required.
- 🔄 **TSH-5 (PM/system-auditor)** — LAST: reconcile `toolCount` + `infrastructureStatus.toolCount` in `docs/data/project-stats.json` to live count after TSH-1 rebuild (expected 153). AC: both fields + date 2026-05-31; scoped single-file commit.

---

## Sprint FU-TRUST-REFRESH — Wire dead OCR seam, then genuine re-refine FPT+ACB

**Status:** OPEN 2026-05-31. **Priority: HIGH.** Zone: dev-pdf-extractor + ops + qa. Brief `aa753e5e`. Seam fixed (FU-1 done). Sequential: FU-2→FU-3→FU-4.

- ✅ **FU-0** — Option A `SqliteOcrTextSource(MARKET_DB_PATH)` e7056ce3. FU-1 UNBLOCKED.
- ✅ **FU-1 (dev-pdf-extractor)** — af50d67a QA APPROVE. Seam wired; FPT p7 real text 2764 chars; 783 pass / 40 pre-existing fail (0 regression). Container :5001 healthy. FU-2 UNBLOCKED.
- 🔄 **FU-2 (ops)** — rasterize FPT(46)+ACB(27). Disk-intensive (73 PNGs). BLOCKS FU-3.
- 🔄 **FU-3 (ops, off-HOSE)** — run refine cron (Sat permitted). BLOCKS FU-4.
- 🔄 **FU-4 (qa)** — `get_bctc_full` real numbers; COUNT>0; refine_status=DONE; OD-4 opex verdict.
- 🔄 **FU-5 (dev-mcp-server)** — 6cc75437 IMPL done; awaiting QA. BLOCK-1: scalar backfill (bctcScalarAggregator + finalize UPDATE). BLOCK-2: inline eval recompute. 8 DV tests GREEN. ops must rebuild + re-finalize FPT+ACB before QA re-gate.
- ⛔ **FU-6 (ops)** — GATED on FU-5 QA APPROVED. rebuild mcp-server + re-finalize e8ea3df5 (FPT) + fea19bae (ACB).
- ✅ **FU-6-redo ARCH** — 2026-05-31. Root-cause: aggregator-only (upstream clean). FPT: code "270" = "Tài sản dài hạn khác" (3.4T), real total_assets at code "280". ACB: equity label pattern matches "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" before pure equity row; code "I" collision balance-sheet vs income. Fix: label-canonical + exclusion-filter + section-scoped code lookup + balance-identity invariant. Brief `docs/architecture-briefs/2026-05-31-bctc-scalar-aggregator-root-cause.md`. NEXT: pm → dev-mcp-server FU-6-redo-DEV.
- ⛔ **FU-6-redo-DEV (dev-mcp-server)** — GATED on ARCH above. Implement: `findTotalAssetsCorporate`, `findByLabelExcluding`, `labelHint` on `findByCode`, `enforceBalanceIdentity` (structured return), update `aggregateScalars` resolution, update `finalizeBctcRefineTool.ts` call site, amend DV-FU5-1/2, add `FU-6-scalar-correctness.test.ts` (DV-FU6-1…5). RED-before-GREEN mandatory. Files: bctcScalarAggregator.ts + FU-6-scalar-correctness.test.ts + FU-5-scalar-backfill.test.ts + finalizeBctcRefineTool.ts (call site only).

---

## Sprint ENV-ISOLATION — Fleet-wide test/prod data isolation (split P1/P2)

**Status:** P1 ✅ PO-EXIT 2026-05-31 (9eab754f·89e9b5b8·0c9bed2a, QA cycle-164 APPROVED `reports/TASK_REPORT_EI-P1.md`); P2 ⛔ GATED. **Pri: MEDIUM.** Zone: multi. Brief `…/2026-05-31-fleet-env-isolation-architecture.md` (6e8f3d23). Full shape → `docs/SPRINT_GOAL.md` ENV-ISOLATION §.
- ✅ **EI-P1-1/2/3** — PO raw-verified (not badge): rendered `docker compose config` = 9 `APP_ENV: production` (mcp/pdf/rag/ta/macro/kinhdich/news/stock/alert) + `COORDINATION_DB_PATH` on mcp-server, none on api-gateway/frontend/flaresolverr; both maintenance scripts carry live guard logic (resolved-path print before write + `--force-dev`); `dev-environment.md` (241L) covers start/seed/promote-FK/LanceDB/restore/RISK-5. HCM-DISAMBIG 0-diff, PEK pristine, 3 commits scoped per-file on main.
- ⛔ **P2 (GATED — MUST NOT start before FU-TRUST-REFRESH FU-4 sign-off, OD-C/OD-F):** EI-P2-1 startup assertion → EI-P2-2 `data_env` ×5 tables → EI-P2-3 `docker-compose.dev.yml` → EI-P2-QA ENV-GUARD-1.
- 🔄 **FU-EI-COMPOSE (backlog, NOT gated):** 2 pre-existing non-P1 items from QA report — (1) `alert-engine` missing `DB_PATH=/app/data/market.db` in compose (brief §2.1); (2) `run-bt7-backfill.ts` ~L20 hardcoded import path. Compose/scripts surface, no schema/refine coupling → pickable independent of P2 gate.

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO: APPROVE-WITH-CONDITIONS (062a6569 + ef109a76). X-1 open. **Priority: HIGH.** Zone: `apps/mcp-server/`.

- ✅ Phase 1 (flow wiring → `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`) + Phase 2 code (`selfImproveOrchestratorJob` + degradationRules + improveCheckStore, GATE-PROOF PROVEN-RED)
- 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic-data dry-run, D-IMPROVE emit path end-to-end

---

## Sprint PEK-INTEGRATE ✅ DONE-PENDING-G9 (2026-05-28). 12 corpus has_pek:true. Condition: USER verbal G9.

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY. **Priority: HIGH.** Zone: multi. Brief `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`.

- 🔄 LF-EXTRACT (dev-pdf-extractor) · 🔄 LF-OVERLAY (zone-toggle only, persist ✅ per SPIKE_3011 2a4e036d, 177 units confirmed) · 🔄 LF-DEPLOY + LF-QA (TR-2 gate: opex 11/24/25/26 + equity + EBITDA + OCF) + LF-EXIT

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po)

---

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · code-janitor DOUBLON CLEAN candidate (3 live + 10 proposed, HELD, batch when apps/mcp-server has no active reliability sprint) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
