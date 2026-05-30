# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Sprint BCTC-HUMAN-CONFIRM — Human-in-the-loop correction layer for flagged BCTC cells

**Status:** KICKOFF 2026-05-30 (PO, user-requested). **Priority: HIGH.** Zone: `apps/mcp-server/` (viewer + tools + parser overrides). Goal: `docs/SPRINT_GOAL.md`. User wants to review red/yellow flagged cells, hand-correct, lock report "ĐÃ XÁC NHẬN", and have corrected figures flow back into `bctc_table_rows` — surviving later cron refine re-runs. ADDITIVE on top of shipped BCTC-AGENTIC-REFINE; does NOT rebuild the refine pipeline.

- ✅ **HC-BA** (ba): DONE. Spec → `docs/REQ_BCTC-HUMAN-CONFIRM.md`. All 6 design questions resolved as requirements. ARCH-DECIDE A (override injection mechanism) + ARCH-DECIDE B (row re-anchoring after re-parse) framed for architect.
- ✅ **HC-ARCH** (architect): DONE. Brief → `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md`. ARCH-DECIDE A = post-pass override (A2); ARCH-DECIDE B = stable key `(label, page_number, statement_section, code_or_null)` + `anchor_ambiguous` safe-fail. 9 new files, 8 modified, 1 agent-father edit. Zone: `apps/mcp-server/` + `docs/agents/` (1 file).
- ✅ **HC-PM** (pm): DONE. Decomposed HC-ARCH brief §9 into 7 atomic tasks (HC-DEV-1..6 for dev-mcp-server, HC-AF-1 for agent-father). Handoffs: `docs/handoffs/HC-DEV-1.md` through `HC-DEV-6.md` + `HC-AF-1.md`. Summary: `docs/handoffs/HC-TASK-SUMMARY.md`.

**Atomic Tasks (7 total):**
- ✅ **HC-DEV-1** (dev-mcp-server): DONE. Schema migrations (3 idempotent blocks) + bctcHumanCorrectionsStore + bctcFlagEnumerationService + bctcCorrectionService. 25/25 DV GREEN. Commit 4c40939c. Blocks DEV-2/3/4 now unblocked.
- ✅ **HC-DEV-2** (dev-mcp-server): DONE. Layer 1+2 cron-survival guards + source_confidence INSERT fix + applyCorrections post-pass. 30/30 DV GREEN. Commit 89100e07. CORE INVARIANT proven (DV-HC-8).
- ⬜ **HC-DEV-3** (dev-mcp-server): HTTP handlers + server dispatch. Depends: DEV-1. Duration ~1.5h. Blocks: DEV-6.
- ⬜ **HC-DEV-4** (dev-mcp-server): MCP tools + registry. Depends: DEV-1. Duration ~1h. Independent.
- ⬜ **HC-DEV-5** (dev-mcp-server): DV test suite (13 cases, bundled with production). Depends: DEV-1..4. Spread ~2h. Not separate step.
- ⬜ **HC-DEV-6** (dev-mcp-server): Viewer panel "Sửa tay / Xác nhận cuối". Depends: DEV-1, DEV-3. Duration ~1.5h.
- ⬜ **HC-AF-1** (agent-father): Flow guard Phase 0 Step 2b. Depends: DEV-1. Duration ~20min. Parallel to any dev-mcp-server task. Requires Cowork refresh.

**Dispatch order:** HC-DEV-1 → parallel HC-DEV-2+AF-1 → HC-DEV-3/4 → HC-DEV-6. WIP≤2 (serialize within dev-mcp-server zone to avoid concurrent-commit-race). Total duration ~10h.

---

## Closed sprints (live follow-ups only — full records in briefs/archive)

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
