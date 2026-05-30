# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

- **BCTC-AI-INPUT-TAB** ✅ SIGNED OFF 2026-05-30 (AIT-EXIT). Additive 7th tab "Đầu vào AI" on `/api/bctc-inspect`: per selected page shows the agent-input PNG + OCR text + page-window the refine AI received. QA cycle-157 all 7 gates @ b4ed9266 + path-fix cbe96137. Live-verified: page-image route → real 336KB `image/png` (magic `89 50 4e 47`), miss → honest 404 `png_not_found`, page-window → `bctc_refined_units`; FPT report `e8ea3df5…` pages 6-11 rasterized; DB row untouched (`confirm_status=PENDING`); 6 prior tabs intact; repo==live image.
- **BCTC-HUMAN-CONFIRM** ✅ SIGNED OFF 2026-05-30 (HC-EXIT). Human-in-the-loop correction layer on `/api/bctc-inspect`: review red/yellow flagged cells, hand-correct, lock "ĐÃ XÁC NHẬN"; corrections survive cron refine re-runs (3-layer lock); 50/50 viewer + 6 tabs. QA HC-QA-3 cycle-156 all 9 gates GREEN @ 441f8e18, container dd904d63 toolCount=154. Brief `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md` (+ADDENDUM HC-ARCH-2 transaction-ordering). Commits 4c40939c·89100e07·ae3c5039·dca93898·7a3734ed·204344ec·9234e9c2·d5976d1e·441f8e18. 🔄 follow-up = AR-FU-DETERMINISM (below, shared with BCTC-AGENTIC-REFINE).
- **BCTC-AGENTIC-REFINE** ✅ SIGNED OFF 2026-05-30. Brief `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`. 🔄 **AR-FU-DETERMINISM** (MED, `apps/mcp-server` + `docs/agents/refine_bctc_md`): Haiku refine fan-outs emit non-deterministic markdown coverage (FPT run-1=91 vs run-2=18); store-correctness unaffected, coverage variance a trust follow-up. Lower temp / determinism guard / golden-markdown snapshot. DEFERRED.
- **DATA-PIPELINE-INTEGRITY** ✅ SIGNED OFF 2026-05-30. 🔄 FU-C (MED test-debt, `ohlcvForeignFlowStore.ts`, DEFERRED) · ⏳ FU-MON (Monday: DPI-3 Brent/Gold + DPI-4 `get_foreign_flow` live-probe).
- **BCTC-TABLE-BOUNDARY** ✅ SIGNED OFF 2026-05-30. Over-merge bug resolved (FPT=31/ACB=22, 0 dup). FU-BTB-OCR registered. Brief `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.

---

## Sprint FF-DEAD — Foreign-flow pipeline dead fleet-wide

**Status:** OPEN — PO triage 2026-05-30T10:14Z. **Priority: HIGH** (live-confirmed: `get_foreign_flow(code=FPT)` → source_tier 2, "never collected"; foreign net buy/sell dead for every ticker). Zone: **VPS-crawls (`vps-scripts/`) — UNCONTENDED** (separate from AR-* apps/ fan-out). Producer = `fetch-foreign-flow.sh` + `vn-foreign-flow.service`; receiver handler already exists in mcp-server.

- 🔄 FF-DIAG (dev-vps-crawls): live diagnose — is `vn-foreign-flow.service` running? read `/var/log/vn-foreign-flow.log`; has the producer ever pushed 200-OK? verify field-name drift (`fBuyVol/fSellVol/fRoom` vs current VPS API) + `select(>0)` market-closed exit-0 vs real failure; confirm `foreign_flow` DB row count. Fix root cause in `vps-scripts/`. Source report: `docs/handoffs/MCP-SOURCE-PROBLEMS-20260529.md` § P1.

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

## Backlogs

- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close)
- KD-QREF-LANG — OPEN (EN/VI switch)
- Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
