# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Sprint BCTC-AGENTIC-REFINE — Agent refine step replaces the geometry middle

**Status:** OPEN — PO kickoff 2026-05-30 (USER-APPROVED plan `/Users/admin/.claude/plans/magical-cooking-cocoa.md`). **Priority: HIGH (recurring-bug RCA-to-replace).** Zone: `multi` (`apps/pdf-extractor/` + `apps/mcp-server/`). Goal record: `docs/SPRINT_GOAL.md` § BCTC-AGENTIC-REFINE.

Replace YOLO + bbox-grouping + `bctc_page_grouper.py` 5-state machine OUTRIGHT with a cron-driven agent refine step (OCR text + crisp page image, numbers←text / structure←image / disagreement→FLAG never guess). Feed BOTH `bctc_table_rows` (via deterministic markdown→rows parser — the new single point of correctness) AND `get_bctc_refined`.

- 🔄 AR-BA (ba): REQ decomposition + confirm pdf-extractor↔mcp-server zone split
- 🔄 AR-ARCH (architect): brief — dead-text/OCR-mandate, refine contract, **deterministic markdown→rows parser spec (TIGHT)**, cron-refiner packaging, swappable OCR interface, replace-outright delete list
- 🔄 AR-PM (pm): atomic tasks + handoffs in `docs/handoffs/`
- 🔄 AR-PDF (dev-pdf-extractor): `page_rasterizer.py`; remove YOLO/grouping/boundary machine; OCR text feed
- 🔄 AR-MCP (dev-mcp-server): 3 tools + `bctc_refined_units` table + markdown→rows parser + `get_bctc_refined` + refine orchestration/cron + idempotency/claim/gate
- 🔄 AR-AGENT (agent-father): `refine_bctc_md` agent `.md`
- 🔄 AR-QA (qa): bake-off FPT+ACB, parser+store DV (RED→GREEN), idempotency ≥3×, readiness gate, expert-flow-intact — all anti-false-green
- 🔄 AR-OPS (ops): REBUILD both containers (build --no-cache + force-recreate)
- 🔄 AR-EXIT (po): independent live re-verify

---

## Sprint DATA-PIPELINE-INTEGRITY — ✅ SIGNED OFF 2026-05-30

All 4 user-facing data bugs root-caused, code-fixed, deployed. 3 of 4 fully live-DONE; DPI-3/DPI-4 CODE-DONE + path-PROVEN, awaiting market schedule. Follow-ups FU-A/FU-B/FU-C/FU-MON registered (zone: `apps/mcp-server`). See `docs/REQ_DATA-PIPELINE-INTEGRITY.md` + `docs/handoffs/DPI-ARCH.md` for details.

---

## Sprint BCTC-TABLE-BOUNDARY — ✅ SIGNED OFF 2026-05-30

User's over-merge bug RESOLVED on live canonical path (PATH B). FPT=31 (27 table+4 prose) / ACB=22 (17 table+5 prose), 0 dup unit_ids. Prose units emitted; largest table span=2 pages. BTB-DRIFT dual-path convergence completed (commits `06fb1f10` + `ae5bb26c`). Follow-up FU-BTB-OCR registered. Zone: `apps/pdf-extractor/`. See `docs/architecture-briefs/2026-05-30-bctc-table-boundary-drift-convergence.md`.

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
