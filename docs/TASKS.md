# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- BCTC-TRUST-RED ✅ e0c900d0 → FU-TRUST-REFRESH ✅ EXIT-WITH-CAVEAT 2026-05-31 (mock GONE; FPT serving; ACB scalars correct but `get_bctc_full(ACB)` blocked on bank-form B02-TCTD — DATA trustworthy / SERVING blocked; record→SPRINT_GOAL §FU-EXIT) → BANK-AWARE-BCTC ACTIVE below · BCTC-AI-INPUT-TAB ✅ b4ed9266 · BCTC-HUMAN-CONFIRM ✅ 441f8e18 · BCTC-AGENTIC-REFINE ✅ 🔄 AR-FU-DETERMINISM DEFERRED · DATA-PIPELINE-INTEGRITY ✅ 🔄 FU-C DEFERRED ⏳ FU-MON (Monday) · BCTC-TABLE-BOUNDARY ✅ FU-BTB-OCR registered
- DYN-WF-FOUNDATION ✅ DWF-EXIT 2026-05-31 (84643927…eee22112) · DWF-PHASE1 ✅ P1-PO-EXIT 2026-05-31 (5a19485e…38d241c5) ⛔ Phase 3+ DEFERRED · MACRO-CMDTY-DELTA ✅ PO-EXIT 2026-05-31 (e510e5df…fdc17265) 🔄 FU-MON · FF-DEAD ✅ fixed 0cbce0b4 ⏳ FU-MON · PEK-INTEGRATE ✅ DONE-PENDING-G9 2026-05-28 (12 corpus has_pek:true; awaits USER verbal G9)

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

## Sprint BANK-AWARE-BCTC — Make EVERY BCTC consumer bank-form (B02-TCTD) aware in ONE pass

**Status:** OPEN 2026-05-31 (SPLIT from FU-TRUST-REFRESH, recurring-bug escalation). **Priority: HIGH.** Zone: `apps/mcp-server/`. Class patched 3× (FU-6d/FU-6f B-1/B-3) + still blocks ACB → `feedback_recurring_bug_escalation` + `feedback_silent_swallow_serial_bugs`. Full shape → SPRINT_GOAL §BANK-AWARE-BCTC.

- ✅ **BANK-ARCH (architect)** — 7 consumers enumerated; `isBankForm(domain)` discriminator; `bctcFormType.ts` SSOT; DV-BANK-1..6 anti-false-green suite designed. Brief: `docs/architecture-briefs/2026-05-31-bank-aware-bctc.md`. NEXT: pm → BANK-DEV.
- ⛔ **BANK-DEV (dev-mcp-server)** — GATED on BANK-ARCH. Implement bank-aware handling across ALL enumerated consumers in one change set; deliberate-violation test per consumer (RED-before-GREEN).
- ⛔ **BANK-OPS (ops)** — GATED on BANK-DEV. Rebuild mcp-server (`--no-cache`+force-recreate) + re-finalize/re-eval ACB (`fea19bae`). Serialize vs ENV-ISOLATION EI-P2-2 rebuild (same zone).
- ⛔ **BANK-QA (qa)** — GATED on BANK-OPS. `get_bctc_full(ACB)` serves real bank data RAW in-container (no refusal); eval stage-6 not-red; FPT 0-regression; all DV tests RED-before-GREEN.

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
- 🔄 **NB-PRUNE-1 (developer)** — Reconcile anchor contract in SKILL to match heading format agents actually write (`## <ISO-ts>`, grep `^## [0-9]`) + fix mis-describing flow notes. Target: `.claude/skills/notebook-write/SKILL.md` + offending flow `.md`. Baseline: 5 notebooks >cap (≥223L), 0 `## c` fleet-wide. AC: skill run on a >3-section sample (e.g. agents-architect.md) prunes oldest → wc -l ≤200 + oldest section gone. **QA REQUIRED** (deliberate-violation: 6-section notebook, prove prune fires).

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY. **Pri: HIGH.** Zone: multi. Brief `…/2026-05-26-bctc-layout-first-pipeline.md`. 🔄 LF-EXTRACT (dev-pdf-extractor) · 🔄 LF-OVERLAY (zone-toggle only, persist ✅ SPIKE_3011 2a4e036d, 177 units) · 🔄 LF-DEPLOY + LF-QA (TR-2: opex 11/24/25/26 + equity + EBITDA + OCF) + LF-EXIT

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Per-stock diversity cap on `buildAlertsSection`. **Pri: MEDIUM.** Zone: `apps/mcp-server/`. 🔄 CHEF-ATTN-BA → IMPL (dev-mcp-server) → DEPLOY (ops) → QA → EXIT (po).

---

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close) · KD-QREF-LANG OPEN (EN/VI switch) · code-janitor DOUBLON CLEAN candidate (3 live + 10 proposed, HELD, batch when apps/mcp-server has no active reliability sprint) · Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
