# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Sprint BCTC-AGENTIC-REFINE — ✅ SIGNED OFF 2026-05-30 (AR-EXIT, APPROVE-WITH-CONDITIONS)

Geometry middle (YOLO + bbox-grouping + `bctc_page_grouper.py` 5-state machine) REPLACED OUTRIGHT by an agent refine step. **Option-Y** (architect §0.7): orchestration runs in the host fleet-cron CC session; mcp-server is a pure data service. QA cycle-153 GREEN on all 7 §0.7.5 DV gate items via live FPT+ACB bake-off at HEAD `3b4c62a2` (100/100 AR tests, tsc clean). PO verified live: in-container cron removed, host cron skill `.claude/commands/crons/cron-refine-bctc.md` armed `'0 9,14,20 * * *'`, tools #141-144 registered, `spawn("claude")` deleted, PEK subtree 0-diff. Brief `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md`; goal record `docs/SPRINT_GOAL.md`.

- 🔄 **AR-FU-DETERMINISM** (zone `apps/mcp-server` + `docs/agents/refine_bctc_md`): MEDIUM follow-up. QA Gate-3 idempotency showed store stable (18=18=18) but FPT run-1=91 vs run-2=18 row delta = Haiku refine subagents emit DIFFERENT markdown across fan-outs (LLM non-determinism UPSTREAM of the idempotent store). Store-correctness NOT affected; coverage variance IS a trust concern since refined rows are the sole figure source for the 6 expert passes. Scope: lower refine temperature / determinism guard / golden-markdown snapshot regression on FPT. NOT a store bug. DEFERRED behind live ticks.

---

## Sprint DATA-PIPELINE-INTEGRITY — ✅ SIGNED OFF 2026-05-30

All 4 user-facing data bugs root-caused, code-fixed, deployed. 3 of 4 fully live-DONE; DPI-3/DPI-4 CODE-DONE + path-PROVEN, awaiting market schedule. FU detail → `docs/REQ_DATA-PIPELINE-INTEGRITY.md` § Follow-ups.

**DPI follow-ups** (zone `apps/mcp-server`): ✅ FU-A (`ff9a64ce`: `fedFundsRate=3.62` LIVE, regime→NEUTRAL) · ✅ FU-B (`ff9a64ce`: `earningYield=6.83` LIVE) · ✅ **FU-D** (`d7ee43d7`, PO-SIGNOFF 2026-05-30: two-layer SBV zero-write guard, 7/7 tests RED→GREEN + 36/36 suite, image `6c45aeed`. Live-proven re-probe `get_macro_snapshot` computedAt 10:08:37Z dataSource=live → carry spread=1.38 NEUTRAL, yield spread=1.83 FAIRLY_VALUED; direct-DB `sbv_rates` deposit=5/usd_vnd=26115 source=sbv. DPI-2b FULLY WHOLE — all 3 carry/yield inputs live. QA hit a harness parse-error on final RETURN; dispatcher+PO dual live re-probe covered the gap — no re-run needed.) · 🔄 FU-C (MEDIUM test-debt: retro-own `36a91a59` + foreign-flow real-schema test, `ohlcvForeignFlowStore.ts`; DEFERRED — yields WIP to HIGH BCTC-AGENTIC-REFINE) · ⏳ FU-MON (Monday: DPI-3/DPI-4 live-probe).

---

## Sprint BCTC-TABLE-BOUNDARY — ✅ SIGNED OFF 2026-05-30

User's over-merge bug RESOLVED on live canonical path (PATH B). FPT=31 (27 table+4 prose) / ACB=22 (17 table+5 prose), 0 dup unit_ids. Prose units emitted; largest table span=2 pages. BTB-DRIFT dual-path convergence completed (commits `06fb1f10` + `ae5bb26c`). Follow-up FU-BTB-OCR registered. Zone: `apps/pdf-extractor/`. See `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.

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
