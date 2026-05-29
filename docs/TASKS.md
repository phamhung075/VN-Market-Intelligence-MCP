# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Sprint SELF-IMPROVE-GATE — Gated Self-Improvement Loop

**Status:** OPEN — Phase 2 (lane-B code gate) live 2026-05-28. PO verdict: APPROVE-WITH-CONDITIONS (commits 062a6569 + ef109a76). All conditions met; X-1 (synthetic-data dry-run) open. **Priority: HIGH.** Zone: `apps/mcp-server/`.

- ✅ SIG-DESIGN + SIG-PO-GATE + SIG-IMPL-MD (phase 1): flow wiring → `docs/architecture-briefs/2026-05-27-gated-self-improvement-loop.md`
- ✅ SIG-IMPL-GATE phase 2 (code): `selfImproveOrchestratorJob` + degradationRules + improveCheckStore live, GATE-PROOF PROVEN-RED
- 🔄 SIG-FOLLOWUP-DRYRUN (X-1): synthetic-data dry-run, D-IMPROVE emit path end-to-end

---

## Sprint PEK-INTEGRATE — Re-engine apps/pdf-extractor on PDF-Extract-Kit

**Status:** ✅ DONE-PENDING-G9 (2026-05-28). Render-seam fix LIVE; FPT e71f845d = 7 fresh PEK units; all 12 corpus has_pek:true; mcp-server rebuilt. **Condition:** USER verbal G9.

- ✅ All phases DONE: spec (docs/REQ_PEK-INTEGRATE.md) + design + code (8535b175) + multipage fix (2e228f0d + ed347661) + deploy + QA PASS (12/12 corpus)

---

## Sprint BCTC-LAYOUT-FIRST — Document-Structure-First Extraction

**Status:** OPEN — Phase 0 READY (LF-DESIGN done). LF-EXTRACT + LF-OVERLAY ready in parallel. **Priority: HIGH (recurring-bug RCA).** Zone: multi (pdf-extractor + mcp-server).

- ✅ LF-BA + LF-DESIGN: spec + blueprint → `docs/architecture-briefs/2026-05-26-bctc-layout-first-pipeline.md`
- 🔄 LF-EXTRACT (dev-pdf-extractor): Tier 0-3 + zone-geometry JSON
- 🔄 LF-OVERLAY (dev-mcp-server): `POST /api/push-bctc-layout` + zone toggle
- 🔄 LF-DEPLOY + LF-QA + LF-EXIT: sequential single-doc, DIRECT DB arbiter

---

## Sprint BCTC-TABLE-3 → ✅ CLOSED 2026-05-26T00:12Z

**Status:** DONE. FPT Q4 = 79 clean rows, 0 orphans, 0 junk, balance_delta=0. Root cause: dual-path drift → architect FILTER-STRATEGY ruling → live-substrate fixture mandate. **Lesson:** AC-0 fixture regenerated from live poppler OCR; positive-keep + positional-cutoff; balance badge alone FORBIDDEN as gate.

---

## Sprint BCTC-TABLE-2 → QUEUED

Multi-ticker quarterly coverage (follow-up post-TABLE-3). Next: dispatch after LF-EXTRACT + LF-OVERLAY close.

---

## Sprint CHEF-ATTN — Bootstrap Attention Diversity Cap

**Status:** READY (2026-05-27). Pre-redesign targeted fix: per-stock diversity cap on `buildAlertsSection`. **Priority: MEDIUM.** Zone: `apps/mcp-server/`.

- 🔄 CHEF-ATTN-BA (ba) → CHEF-ATTN-IMPL (dev-mcp-server) → CHEF-ATTN-DEPLOY (ops) → CHEF-ATTN-QA (qa) → CHEF-ATTN-EXIT (po)

---

## Sprint MCPZONE-HARDEN-1 → ✅ CLOSED 2026-05-26T18:04Z

MZH-1 (DB-verified rows_stored) + MZH-2 (prod-db test guard) shipped 2d4f71d9. Write-wedge gone; health 200, 146 tools, 2.6GB/8GB.

---

## Sprint PDF-INSPECT → ✅ CLOSED 2026-05-24T19:34Z

Served FastAPI viewer `http://localhost:3000/api/bctc-inspect` reads real `market.db`. User acceptance MET on real data.

---

## Phase 0/1 Backlogs (Stock-Price Pilot 3 | pdf-extractor SCALE)

See `docs/TASKS_ARCHIVE.md`. Pilots frozen; post-pilot correctness work active.

---

## Follow-On Enhancements (POST-PILOT)

- KD-QREF → ✅ CLOSED: 64-Quẻ reference | KD-QREF-LANG — OPEN: EN/VI switch

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
