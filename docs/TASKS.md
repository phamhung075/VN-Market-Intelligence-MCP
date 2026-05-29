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

## Sprint DATA-PIPELINE-INTEGRITY — Macro + Foreign-Flow Live-Data Correctness

**Status:** OPEN — PO incident triage 2026-05-29T22:16Z. **Priority: CRITICAL (user-facing live market data wrong/missing on 4 surfaces).** Zone: `multi` (`apps/macro-indicators` bugs 1-3 + `apps/mcp-server` bug 4). VPS infra HEALTHY (all 5 pushes HTTP 200); blockers are 4 root-caused CODE bugs. Goal `docs/SPRINT_GOAL.md` § DATA-PIPELINE-INTEGRITY. **Owner chain:** ba → architect → pm → dev-macro-indicators + dev-mcp-server → ops (REBUILD) → qa (live re-probe) → po (DPI-EXIT). DoD = live MCP-tool re-probe of all four, NOT user sign-off.

- 🔄 DPI-BA: Decompose 4 bugs into REQ spec (`docs/REQ_DATA-PIPELINE-INTEGRITY.md`); confirm multi-zone split. NEXT: po approve → architect.
- 🔄 DPI-1 (dev-macro-indicators) [zone: `apps/macro-indicators`]: **FX dual-path divergence** — `get_macro_snapshot` USD/VND=26255 vs `get_cycle_bootstrap` 26115. Pick ONE canonical FX source (SBV official policy-correct) OR source-tag both; make both code paths agree. DoD: both tools return single consistent value live.
- 🔄 DPI-2 (dev-macro-indicators) [zone: `apps/macro-indicators`]: **carry/yield regime STALE** — `carry.computedAt`/`yield.computedAt` stuck at 2026-05-23. Find recompute scheduler/job, why it stopped, restore + persist `computedAt`. DoD: fresh `computedAt` live. (Escalated from MACRO-SEED-WIRING #3003 monitoring note.)
- 🔄 DPI-3 (dev-macro-indicators) [zone: `apps/macro-indicators`]: **Brent/Gold delta +0.00%** — prices live but change-% zero. Fix prev-close store + delta computation. DoD: non-zero directional deltas live.
- 🔄 DPI-4 (dev-mcp-server) [zone: `apps/mcp-server`]: **foreign-flow data loss** — `get_foreign_flow(HPG)` "No data"; `ohlcvForeignFlowStore.ts` L~31 UPDATE-only silently skips when no `daily_ohlcv (code,date)` row yet. Fix: UPSERT / INSERT…ON CONFLICT, or ensure OHLCV row exists first. DoD: `get_foreign_flow(HPG)` populated + direct DB count >0 post-rebuild.
- 🔄 DPI-OPS (ops): REBUILD affected container(s) — `build` + `up -d --no-deps --force-recreate` (NOT restart, `feedback_rebuild_after_dev_change`).
- 🔄 DPI-QA (qa): live re-probe all four MCP tools post-rebuild; verify bug-4 via live `get_foreign_flow` + direct DB count (not push echo). PROVEN-RED→GREEN where a test seam exists.
- 🔄 DPI-EXIT (po): independent live re-verify all four surfaces; sign off.

---

## Sprint BCTC-TABLE-BOUNDARY — Multi-Page Table Stitcher Boundary State Machine

**Status:** OPEN — BA spec ready. **Priority: HIGH (user-reported data-correctness bug).** Zone: `apps/pdf-extractor/`.

- ✅ BTB-BA: Spec `docs/REQ_BCTC-TABLE-BOUNDARY.md` — 4 boundary states (START/CONTINUE/END/NEW), FR-1..5, DV tests, two real-data sentinels. NEXT: architect.
- ✅ BTB-ARCH (architect): design state-machine transition (per-page type × geometric continuity × title-band × intervening-prose), title-band detector, revised _flush_unit, revised blank-bridge — brief `docs/architecture-briefs/2026-05-29-bctc-table-boundary.md`. NEXT: dev-pdf-extractor.
- ✅ BTB-DEV (dev-pdf-extractor): 5-state machine (NO_TABLE/TABLE_OPEN/TABLE_END/TABLE_NEW + deferred blank buffer), _is_title_band D-5, schema-page-type _flush_unit — commit d297f3ba. DV-1 PROVEN-RED→GREEN. DV-2 PROVEN-RED→GREEN. 659/659 unit tests pass. NEXT: ops rebuild.
- 🚫 BTB-OPS (ops): BLOCKED — 2 cycles, conflicting diagnoses (cycle-1 `df159c7f` write-wedge: units_stored=28 echo vs DB=0; cycle-2 force-recreate then "hang" at 13min/101%CPU, container KILLED). Held pending BTB-UNBLOCK.
- 🔄 BTB-QA (qa): DV-1 + DV-2 PROVEN-RED pre-fix, then PROVEN-GREEN post-fix; direct DB verification both sentinels; REJECT if any prose page in a table unit's page_numbers_json.
- 🔄 BTB-EXIT (po): independent live re-verify sentinels A + B via direct DB; sign off.

### BTB-UNBLOCK — PO triage 2026-05-29T21:57Z (UNBLOCK, runtime not boundary code)

**d297f3ba EXONERATED on loop/hang** (PO read generic_md_table_extractor.py L2696-2784): boundary grouping is a single bounded `for page_num in range(1, total_pages+1)` pass; no inner while, no re-queue; `pending_blanks` appended-or-reset every branch (cannot grow unbounded). Structurally cannot infinite-loop/hang. Boundary change confined to grouping; unit-GREEN. → Runtime blocker is PRE-EXISTING infra (write-wedge + slow-CPU priors), NOT introduced by d297f3ba.

**Cycle-1/cycle-2 contradiction RECONCILED by PO code-read** (handlers.py L185-233): (a) `units_stored=28` logs `push_result.get("units_stored")` = push-client return, which per `project_mcp_server_write_wedge` is input-echo not committed-DB count → "DONE 28 vs DB 0" = documented write-wedge echo, not success. (b) `except Exception as exc: _log.error(..., error=%s)` has NO traceback/`exc_info` → silent-swallow (`feedback_silent_swallow_serial_bugs`), hides real error one-rebuild-at-a-time. (c) ZERO per-page heartbeat between extract start and DONE → cycle-2 "hang" indistinguishable from normal-slow CPU PaddleOCR (46pp × ~26s ≈ 20min); KILL at 13min = likely PREMATURE, not a proven hang.

**Mandate → dev-pdf-extractor (primary):** (i) audit d297f3ba state machine for any loop/hang (PO pre-checked clean — confirm + document); (ii) make `_run_pek_extract` FAIL-LOUD: `_log.error(..., exc_info=True)` full traceback + re-surface to a status the DB can show; (iii) add per-page progress HEARTBEAT log in PekEngineAdapter extraction loop; (iv) add a hard extraction TIMEOUT (>= 30min, generous for 46pp CPU) so a genuine hang self-aborts loudly instead of needing a manual kill. **→ dev-mcp-server (conditional):** if instrumented run proves push 200-OK but DB COUNT=0, fix push handler to COMMIT + return real DB count (write-wedge), per MCPZONE-HARDEN priors.

**Then:** ops runs ONE instrumented extraction to COMPLETION off-hours (HOSE 02:00–08:59 UTC closed; CPU-only/8GB; patience ≥ timeout, do NOT kill before heartbeat stalls past timeout) on FPT `e71f845d` + sentinel B; verify via DIRECT in-container market.db COUNT (not push echo). → qa direct-DB done-bar → po BTB-EXIT.

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
