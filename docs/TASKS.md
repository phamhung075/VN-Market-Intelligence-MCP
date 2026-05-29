# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed this session (detail → commits / TASKS_ARCHIVE.md)

- **SIGDRAIN-PERSIST** ✅ CLOSED 2026-05-29 (CLEAN) — drain-signals.md had documented persist+commit, no enforcement; added MANDATORY PERSIST GUARD (>50 files OR >24h db mtime → full drain+commit). Drained 742 stale signals; signals.db 05-22→05-29 (512 rows today, integrity_check ok); `## po` 8 NEW→READ (inbox 0); root signals 742→1. dev `5e9e929e` (scope-clean) / QA APPROVE. Done-bar 3/3.
- **BOOTSTRAP-ENUM-BCTC** ✅ CLOSED 2026-05-29T17:51Z — `bctc-analyst` added to `VALID_AGENT_NAMES` (getCycleBootstrap.ts); guard 1975 PROVEN-RED, report #3009 resolved. dev a0103b84 / QA APPROVED. SSOT-derive deferred → proposal `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`.
- **VNH-SECTOR-FIX** ✅ CLOSED 2026-05-29T17:45Z — VNH `real_estate`→`agriculture` (seed + live db); `domain` typed `string`→`DomainType`. QA 24/24, anti-false-green PROVEN. dev 9713118f / qa 29d5629f. Spec `docs/REQ_VNH-SECTOR-FIX.md`.

---

## Backlog — string-vs-enum hardening (recurring class, do NOT action; next triage)

Structural fields typed as bare `string` compile bad enum values silently. Recurring across: VNH `DomainType` (seedWatchlist), `commit-mutex` task_claim kind, `verified_decision` enum, bootstrap agent_name enum. Two SPIKE candidates: (1) fleet-wide one-pass audit of seed/config arrays typing structural fields as `string` → tighten to unions; (2) bootstrap agent_name SSOT-derive from `system-map.json` roster → `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`. PO triage 2026-05-29: candidate (2) HELD (not opened) — WIP=2 both HIGH; priority medium; guard test 1975 already mitigates; full runtime-derive risks app→infra boundary. Revisit when WIP frees or 5th recurrence.

---

## Note — MACRO-SEED-WIRING (report #3003) → FALSE-RED, MONITORING

PO live-probe 2026-05-29T17:29Z: `get_macro_snapshot` returns `dataSource:"live"` (oil 90.74, gold 4594.6, usdvnd 26255) — stale-seed HEADLINE symptom NOT reproducible. Residual: `carry`/`yield` sub-signals carry `computedAt:"2026-05-23"` (cached sub-computations, not headline miscalibration). Report #3003 `monitoring`; escalate to cache-TTL FIX only if a future tick re-probes a STALE headline.

---

## Sprint BCTC-TABLE-BOUNDARY — Multi-Page Table Stitcher Boundary State Machine

**Status:** OPEN — BA spec ready. **Priority: HIGH (user-reported data-correctness bug).** Zone: `apps/pdf-extractor/`.

- ✅ BTB-BA: Spec `docs/REQ_BCTC-TABLE-BOUNDARY.md` — 4 boundary states (START/CONTINUE/END/NEW), FR-1..5, DV tests, two real-data sentinels. NEXT: architect.
- ✅ BTB-ARCH (architect): design state-machine transition (per-page type × geometric continuity × title-band × intervening-prose), title-band detector, revised _flush_unit, revised blank-bridge — brief `docs/architecture-briefs/2026-05-29-bctc-table-boundary.md`. NEXT: dev-pdf-extractor.
- ✅ BTB-DEV (dev-pdf-extractor): 5-state machine (NO_TABLE/TABLE_OPEN/TABLE_END/TABLE_NEW + deferred blank buffer), _is_title_band D-5, schema-page-type _flush_unit — commit d297f3ba. DV-1 PROVEN-RED→GREEN. DV-2 PROVEN-RED→GREEN. 659/659 unit tests pass. NEXT: ops rebuild.
- 🔄 BTB-OPS (ops): rebuild pdf-extractor container (`build` + `up --force-recreate`); off-hours re-extract sentinels A + B.
- 🔄 BTB-QA (qa): DV-1 + DV-2 PROVEN-RED pre-fix, then PROVEN-GREEN post-fix; direct DB verification both sentinels; REJECT if any prose page in a table unit's page_numbers_json.
- 🔄 BTB-EXIT (po): independent live re-verify sentinels A + B via direct DB; sign off.

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
- SIGDRAIN-DB-IGNORE-NIT (low-pri, non-blocking) → drain-signals.md L6 commit-scope lists `docs/signals/signals.db` but `.gitignore` `*.db` makes that `git add` a silent no-op. Fix: drop signals.db from guard commit list OR add `!docs/signals/signals.db` exception. (QA-identified post-SIGDRAIN-PERSIST.)
- Phase 0/1 pilot backlogs frozen → `docs/TASKS_ARCHIVE.md`

---

**Binding:** explicit-file staging; no `-A`/`--force`; all on `main`; no `pilot-status-*.json` edits; main terminal commits.
