# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- BCTC-TRUST-RED ✅ e0c900d0 → FU-TRUST-REFRESH ✅ EXIT-WITH-CAVEAT 2026-05-31 → BANK-AWARE-BCTC ✅ PO-EXIT 2026-05-31 (941bf552 HYBRID; QA 040409f9; live img 7f413304; ACB B02-TCTD serves raw + FPT B01-DN 0-regression, both router-raw-verified; 🔄 FU-BANK-CODECOL below) · BCTC-AI-INPUT-TAB ✅ b4ed9266 · BCTC-HUMAN-CONFIRM ✅ 441f8e18 · BCTC-AGENTIC-REFINE ✅ 🔄 AR-FU-DETERMINISM DEFERRED · DATA-PIPELINE-INTEGRITY ✅ 🔄 FU-C DEFERRED ⏳ FU-MON (Monday) · BCTC-TABLE-BOUNDARY ✅ FU-BTB-OCR registered
- DYN-WF-FOUNDATION ✅ DWF-EXIT 2026-05-31 (84643927…eee22112) · DWF-PHASE1 ✅ P1-PO-EXIT 2026-05-31 (5a19485e…38d241c5) ⛔ Phase 3+ DEFERRED · MACRO-CMDTY-DELTA ✅ PO-EXIT 2026-05-31 (e510e5df…fdc17265) 🔄 FU-MON · FF-DEAD ✅ fixed 0cbce0b4 ⏳ FU-MON · PEK-INTEGRATE ✅ DONE-PENDING-G9 2026-05-28 (12 corpus has_pek:true; awaits USER verbal G9)

---

## Sprint BRIEF-SECTOR-DRIFT — Stale brief sector vs seedWatchlist SSOT (VNH recurrence)

**Status:** ✅ DONE 2026-05-31. QA APPROVED. Commits 4670393a (BSD-1+BSD-2) · ef146e1a (BSD-3 docs) · 61b0e224 (BSD-3 test).
- ✅ **BSD-1** — DONE 4670393a. VNH→agriculture, PLX→oil_gas, GVR→agriculture in analysis-briefs. QA: **Sector** grep 0 (raw confirmed).
- ✅ **BSD-2** — DONE 4670393a. VNH removed from BĐS lists in 3 published files; 1 đính-chính line each; 4th file (GVR.md) had no VNH content (confirmed). QA APPROVED.
- ✅ **BSD-3** — DONE ef146e1a+61b0e224. Dropped **Sector**: from template+43 briefs+2 flows. Drift structurally impossible. Test 4/4 pass; tsc exit 0; zone-split clean (ef146e1a=docs-only, 61b0e224=apps-only). QA APPROVED.
- ✅ **BSD-QA** — DONE. AC-1: grep 0 confirmed raw. AC-2: 0 VNH↔BĐS coupling; 1 đính-chính per file; 4th file no-VNH confirmed. AC-3: 4 pass 0 fail; positive-control fixture live; tsc 0 errors; no regression (BANK-AWARE-1 33/33). AC-4: zone-split verified. QA: APPROVED 2026-05-31.

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

## Sprint ENV-ISOLATION — Fleet-wide test/prod data isolation (split P1/P2)

**Status:** P1 ✅ PO-EXIT 2026-05-31 (9eab754f·89e9b5b8·0c9bed2a, QA cycle-164 APPROVED `reports/TASK_REPORT_EI-P1.md`); P2 ⛔ GATED. **Pri: MEDIUM.** Zone: multi. Brief `…/2026-05-31-fleet-env-isolation-architecture.md` (6e8f3d23). Full shape → `docs/SPRINT_GOAL.md` ENV-ISOLATION §.
- ✅ **EI-P1-1/2/3** — PO raw-verified (not badge): rendered `docker compose config` = 9 `APP_ENV: production` (mcp/pdf/rag/ta/macro/kinhdich/news/stock/alert) + `COORDINATION_DB_PATH` on mcp-server, none on api-gateway/frontend/flaresolverr; both maintenance scripts carry live guard logic (resolved-path print before write + `--force-dev`); `dev-environment.md` (241L) covers start/seed/promote-FK/LanceDB/restore/RISK-5. HCM-DISAMBIG 0-diff, PEK pristine, 3 commits scoped per-file on main.
- 🟢 **P2 (GATE RELEASED 2026-05-31 — FU-TRUST-REFRESH FU-4 data-trust satisfied at FU-EXIT; now schedulable):** EI-P2-1 startup assertion → EI-P2-2 `data_env` ×5 tables → EI-P2-3 `docker-compose.dev.yml` → EI-P2-QA ENV-GUARD-1. Serialize EI-P2-2 mcp-server rebuild vs BANK-AWARE-BCTC BANK-OPS (same zone).
- 🔄 **FU-EI-COMPOSE (backlog, NOT gated):** 2 pre-existing non-P1 items from QA report — (1) `alert-engine` missing `DB_PATH=/app/data/market.db` in compose (brief §2.1); (2) `run-bt7-backfill.ts` ~L20 hardcoded import path. Compose/scripts surface, no schema/refine coupling → pickable independent of P2 gate.

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO APPROVE-WITH-CONDITIONS (062a6569 + ef109a76). **Pri: HIGH.** Zone: `apps/mcp-server/`. ✅ Phase1 (brief `…/2026-05-27-gated-self-improvement-loop.md`) + Phase2 code (selfImproveOrchestratorJob + degradationRules + improveCheckStore, GATE-PROOF PROVEN-RED). 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic dry-run, D-IMPROVE emit path e2e.

---

## Sprint NB-PRUNE-FIX — Notebook prune anchor-format mismatch (fleet bloat)

**Status:** OPEN 2026-05-31 (recurring `context_bloat_breach`; manual prune 41c9ac73). **Pri: HIGH.** Zone: `.claude/skills/` + agent flow `.md` (disjoint from peer `apps/mcp-server/`). Fresh first-fix — normal chain.

- **Defect (call-site/contract mismatch, skill internally correct):** `.claude/skills/notebook-write/SKILL.md` prune+guard (AC-2/3/5) greps ONLY `^## c[0-9]`, but agents emit `## <ISO-ts>`/`## Session:` headings → prune Edits no-op, retention never fires → unbounded growth (ops 5871L, dev-alert-engine 389L, unified-agent 377L, agents-architect 316L; ALL 0 `## c` sections). Notes also inconsistent: po/main.md L126 "OVERWRITE ≤50L" vs developer L125 "append c<NNN>".
- ✅ **NB-PRUNE-1 (developer)** — DONE 2026-05-31 (7166db01). APPROVED by QA. Anchor widened to `^## ` in SKILL.md (104L ≤120L). QA repro (deliberate-violation, 3 fixtures): Session-style 5871L→344L (3 sections retained, AC-5 guard fires correctly); ISO-ts 316L→27L; c-format 166L→58L. Preamble preserved in ISO+c-format fixtures. Exactly-3 no-prune edge case confirmed. Fenced-code-block `## ` over-count risk is theoretical only (0 live occurrences). TODO po/developer invocation-note contradiction: non-blocking (po.md=26L, deferred reconciliation acceptable).

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY. **Pri: HIGH.** Zone: multi. Brief `…/2026-05-26-bctc-layout-first-pipeline.md`. 🔄 LF-EXTRACT (dev-pdf-extractor) · 🔄 LF-OVERLAY (zone-toggle only, persist ✅ SPIKE_3011 2a4e036d, 177 units) · 🔄 LF-DEPLOY + LF-QA (TR-2: opex 11/24/25/26 + equity + EBITDA + OCF) + LF-EXIT

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Pri: MEDIUM.** Zone: `apps/mcp-server/`. 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po).

---

## Backlogs

- FU-BANK-CODECOL (dev-mcp-server, NOT gated) — VN label text leaks into `code` column of bctc_table_rows (markdown→rows column-alignment defect); hybrid discriminator immune (anchored regex won't match prose) but real data-quality bug · BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · code-janitor DOUBLON CLEAN candidate (3 live + 10 proposed, HELD, batch when apps/mcp-server has no active reliability sprint) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
