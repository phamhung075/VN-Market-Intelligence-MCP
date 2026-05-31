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
- 🔄 **ARCH-TSH (architect)** — pending. Read REQ file; pick FR-1a/1b + name zone; written source diff FR-2/3/4; FR-5 yes/no; task breakdown for PM. Constraint: #1 first, #6 last, ops rebuild after mcp-server change.

---

## Sprint FU-TRUST-REFRESH — Wire dead OCR seam, then genuine re-refine FPT+ACB

**Status:** OPEN 2026-05-31. **Priority: HIGH.** Zone: dev-pdf-extractor + ops + qa. Brief `aa753e5e`. Seam fixed (FU-1 done). Sequential: FU-2→FU-3→FU-4.

- ✅ **FU-0** — Option A `SqliteOcrTextSource(MARKET_DB_PATH)` e7056ce3. FU-1 UNBLOCKED.
- ✅ **FU-1 (dev-pdf-extractor)** — af50d67a QA APPROVE. Seam wired; FPT p7 real text 2764 chars; 783 pass / 40 pre-existing fail (0 regression). Container :5001 healthy. FU-2 UNBLOCKED.
- 🔄 **FU-2 (ops)** — rasterize FPT(46)+ACB(27). Disk-intensive (73 PNGs). BLOCKS FU-3.
- 🔄 **FU-3 (ops, off-HOSE)** — run refine cron (Sat permitted). BLOCKS FU-4.
- 🔄 **FU-4 (qa)** — `get_bctc_full` real numbers; COUNT>0; refine_status=DONE; OD-4 opex verdict.
- ⛔ **FU-5 (EBITDA)** — DEFERRED to BCTC-LAYOUT-FIRST (OD-3 zone discipline).

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
