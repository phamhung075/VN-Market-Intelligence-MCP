# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Sprint BOOTSTRAP-ENUM-BCTC → ✅ CLOSED 2026-05-29T17:51Z

**Status:** DONE. `get_cycle_bootstrap` agent_name Zod enum rejected real roster agent `bctc-analyst` → `invalid_enum_value` (report #3009); workaround impersonated `financial-analyst`, polluting attribution. Fix: added `bctc-analyst` to `VALID_AGENT_NAMES` in `getCycleBootstrap.ts`. PO done-bar MET: enum accepts `bctc-analyst` in RUNNING container (ops force-recreated; ops + qa both live-probed `get_cycle_bootstrap(bctc-analyst)` SUCCESS), guard test 1975 PROVEN RED-on-regression (independently re-run 4p/2f→6p/0f), legacy `financial-analyst` regression-clean, tsc clean, suites 1563+1975 green; report #3009 resolved + Telegram msg 2613 deleted. Commits: dev a0103b84; QA verdict 2026-05-29T17:48Z APPROVED. SSOT-derive (enum from `system-map.json` roster, not hardcoded literal) deferred → SPIKE proposal `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json` (next triage). Created/closed 2026-05-29.

---

## Sprint VNH-SECTOR-FIX → ✅ CLOSED 2026-05-29T17:45Z

**Status:** DONE. VNH domain `real_estate`→`agriculture` in seed + live market.db (rebuilt container); `domain` field typed `string`→`DomainType` (compile-time guard); 3 comment fixes (DAG/TCH/DPM). QA 24/24 green, anti-false-green PROVEN (bogus domain→TS2322); independent live `get_cycle_bootstrap` confirms `VNH [HNX] agriculture`. Commits: dev 9713118f, qa 29d5629f. Spec `docs/REQ_VNH-SECTOR-FIX.md`.

---

## Backlog — string-vs-enum hardening (recurring class, do NOT action; next triage)

Structural fields typed as bare `string` compile bad enum values silently. Recurring across: VNH `DomainType` (seedWatchlist), `commit-mutex` task_claim kind, `verified_decision` enum, bootstrap agent_name enum. Two SPIKE candidates: (1) fleet-wide one-pass audit of seed/config arrays typing structural fields as `string` → tighten to unions; (2) bootstrap agent_name SSOT-derive from `system-map.json` roster → `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`.

---

## Note — MACRO-SEED-WIRING (report #3003) → FALSE-RED, MONITORING

PO live-probe 2026-05-29T17:29Z: `get_macro_snapshot` returns `dataSource:"live"` (oil 90.74, gold 4594.6, usdvnd 26255) — stale-seed HEADLINE symptom NOT reproducible. Residual: `carry`/`yield` sub-signals carry `computedAt:"2026-05-23"` (cached sub-computations, not headline miscalibration). Report #3003 `monitoring`; escalate to cache-TTL FIX only if a future tick re-probes a STALE headline.

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

## Closed (recent) | Backlogs

- BCTC-TABLE-3 → ✅ CLOSED 2026-05-26 (FPT Q4 79 clean rows, balance_delta=0; dual-path drift RCA; balance badge FORBIDDEN as sole gate)
- MCPZONE-HARDEN-1 → ✅ CLOSED 2026-05-26 (2d4f71d9; write-wedge gone)
- PDF-INSPECT → ✅ CLOSED 2026-05-24
- BCTC-TABLE-2 → QUEUED (multi-ticker; after LF-EXTRACT + LF-OVERLAY close)
- KD-QREF → ✅ CLOSED; KD-QREF-LANG — OPEN (EN/VI switch)
- Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
