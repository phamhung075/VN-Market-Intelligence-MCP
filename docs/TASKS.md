# TASKS — VN Market Intelligence MCP

> **Active sprints only.** Historical: `docs/TASKS_ARCHIVE.md` | WIP≤2 | Decisions: `docs/po-decisions/` | Goals: `docs/SPRINT_GOAL.md`

---

## Closed this session (detail → commits / TASKS_ARCHIVE.md)

- **BOOTSTRAP-ENUM-BCTC** ✅ CLOSED 2026-05-29T17:51Z — `bctc-analyst` added to `VALID_AGENT_NAMES` (getCycleBootstrap.ts); guard 1975 PROVEN-RED, report #3009 resolved. dev a0103b84 / QA APPROVED. SSOT-derive deferred → proposal `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`.
- **VNH-SECTOR-FIX** ✅ CLOSED 2026-05-29T17:45Z — VNH `real_estate`→`agriculture` (seed + live db); `domain` typed `string`→`DomainType`. QA 24/24, anti-false-green PROVEN. dev 9713118f / qa 29d5629f. Spec `docs/REQ_VNH-SECTOR-FIX.md`.

---

## Backlog — string-vs-enum hardening (recurring class, do NOT action; next triage)

Structural fields typed as bare `string` compile bad enum values silently. Recurring across: VNH `DomainType` (seedWatchlist), `commit-mutex` task_claim kind, `verified_decision` enum, bootstrap agent_name enum. Two SPIKE candidates: (1) fleet-wide one-pass audit of seed/config arrays typing structural fields as `string` → tighten to unions; (2) bootstrap agent_name SSOT-derive from `system-map.json` roster → `docs/signals/improvement-proposal-bootstrap-enum-ssot-derive.json`. PO triage 2026-05-29: candidate (2) HELD (not opened) — WIP=2 both HIGH; priority medium; guard test 1975 already mitigates; full runtime-derive risks app→infra boundary. Revisit when WIP frees or 5th recurrence.

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

## CLEAN SIGDRAIN-PERSIST — Signal drain not committing (root-cause + sweep)

**Status:** OPEN — CLEAN (hygiene lane, does NOT count vs feature WIP). **Priority: CLEAN (> SPRINT-S).** Zone: `cross-service/` (dev-team flow + signal-dashboard skill). Opened 2026-05-29 (2nd recurrence — armed last tick, never fired).

Symptom: `docs/signals/signals.db` frozen at 2026-05-22; file count 730→741; DASHBOARD `## po` 8 NEW rows (2026-05-25/26) never consumed. Drain Step 0a (`docs/agents/dev-team/flow/drain-signals.md`) reads but does not persist/commit. Scope: (1) RCA the write/commit seam in drain-signals.md + signal-dashboard SKILL (why mark-READ + db-write not landing); (2) prove fix by a single drain run that advances signals.db mtime + drops file count; (3) sweep stale heartbeats/acks (cowork-fire, context_bloat → route to claude-manager-helper janitor, completion-acks May 23-27); (4) consume/mark-READ the 8 stale `## po` rows (all liveverify/already-actioned, no dev code). Done-bar: signals.db mtime current + `## po` inbox empty + file count drops materially.

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
