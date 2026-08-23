# PM — Notebook

## c347 SPRINT-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP DECOMPOSITION (6 tasks, 2 prep + 4 FR tiers) · 2026-08-22T21:19Z

**MANDATE:** Architect completed technical design for predict-engine calibration close-loop sprint. BA requirement spec (FR-1..5, NFR-1-3, 6 AC criteria, 0 blockers) from po's D1-D4 investigation (17 resolved predictions, n=17 sample too small for re-fitting but large enough for structural fixes).

**SPRINT CONTEXT:**
- Zone: `apps/mcp-server/` (single zone, Tier-1)
- Owner: dev-mcp-server
- Backlog status before: BACKLOG, next_agent=pm, architect_design_complete=true

**DECOMPOSITION:** 6 atomic tasks created in ready[], owner dev-mcp-server, all status TODO (holding in ready due to WIP limit already at 3/2-max):

**Tier 0 — Prep (independent, can parallel):**
1. **TASK-PEC-PREP-FIXTURES** (S, ~45min): Add evidence_likelihood_ratios table DDL to 1118 test fixture + calibration_correction_factors table DDL to 1128 test fixture. Regression-risk prereq: test fixtures must have tables before code that writes/reads them.
2. **TASK-PEC-PREP-GETLR** (S, ~45min): Add defensive `try { } catch { return [] }` guard to `getLikelihoodRatios()` (plural) in likelihoodRatioStore.ts, matching existing guard on singular `getLikelihoodRatio()`. Unguarded plural read would throw hard SQL error in FR-1 tests.

**Tier 1 — Independent baseline:**
3. **TASK-PEC-FR4** (M, ~2h): Evidence cache recency bound (MAX_SCORE_AGE_DAYS=30) + honest-degrade messaging in evidenceTools.ts. Absorbs SPIKE-EVIDENCE-SCORE-CACHE-FRAGMENT-DECOUPLE root-class finding (cache staleness, not fragment-pruning). Fixes D4: VPB served 13d-stale score with zero fragments.

**Tier 2 — After Tier 1:**
4. **TASK-PEC-FR1** (M, ~2.5h): LR-weighted evidence score aggregation in evidenceAccumulatorJob.ts. Extracts horizon-selection algorithm into shared `selectLikelihoodRatio()` helper (baseRateComputer.ts), consumed by both evidenceAccumulatorJob and evidenceTools. Each fragment contribution now weighted by likelihood_ratio before averaging. Fixes D1: LR table computed but never applied (ACB bullish 0.3012 identity must break once LR rows seeded).

**Tier 3 — After Tier 2:**
5. **TASK-PEC-FR3-FR5** (M, ~3h): Confidence shrinkage toward base rate (new `computeConfidenceShrinkage` in baseRateComputer.ts, wired to get_evidence_summary) + retire flat multipliers from daily-predict.md (both lines 25 TIGHTENING and 30 degrading haircuts removed). Shrinkage: weight = min(1, fragments/5) * min(1, lr_sampleSize/10); strong evidence → no shrinkage, thin evidence → full shrinkage to 0.5. Fixes D3 + FR-5 removes redundant prompt-layer LR multiply. Published probabilities returned by get_evidence_summary (MCP tool update: new `published_probability_{direction}` fields, regime param added).

**Parallel with Tier 3:**
6. **TASK-PEC-FR2** (M, ~3h): Calibration correction-factor feedback loop. New `calibrationCorrectionStore.ts` + schema table + `computeCorrectionFactor()` in baseRateComputer.ts. calibrationReportJob.ts Step 6.5 (between Step 6 compute-curve and Step 7 trend_delta) upserts per-bucket correction factors. get_evidence_summary reads factors before final clamp. Closes the loop: calibration_snapshots (weekly measurement) → correction_factors (write-back) → predictions (read on next cycle). Fixes D2 (the other dead loop).

**WIP HOLD:** in_progress = 3 (UC-CCA-P3, UC-CDC-P1, FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58) already at/over 2-max limit. All 6 new tasks held in ready[], status TODO (matches precedent from c346). dev-team's bounded-pickup sweep promotes once a slot frees.

**orch-state.json:** All 6 rows added to task_board.ready[], sprint in backlog[] updated next_agent="developer" + pm_completed_at stamped. Written via orch-apply.sh — validated Stage 0/1 PASS, task_total 716→725 (net +6 tasks +3 handoff files), conservation OK.

**Decision journal:** sprint-PREDICT-ENGINE-CALIBRATION-CLOSE-LOOP-pm.md STEP pm-S1 (decomposition + orch-apply).

**Dependency graph (ready[] eligible for pickup once prior tier completes):**
```
[Tier 0 prep]  TASK-PEC-PREP-FIXTURES, TASK-PEC-PREP-GETLR (parallel)
     ↓
[Tier 1 ind]   TASK-PEC-FR4 (parallel, no prep prereqs)
     ↓
[Tier 2]       TASK-PEC-FR1 (depends prep + fr4 independent)
     ↓
[Tier 3]       TASK-PEC-FR3-FR5 (depends fr1) | TASK-PEC-FR2 (parallel, depends prep only)
```

**Acceptance discipline:** NFR-1 binding — QA must verify via structural/code-level tests (unit tests on arithmetic/store contracts/recency bounds), never via Brier/hit-rate off n=17 sample. Re-run calibration report on 17 historical claims for directional sanity-check + no-regression gate.

---

## c346 GHOSTZONE P0 DECOMPOSITION (2 dev tasks + 1 follow-up) · 2026-08-22T19:13Z

**MANDATE:** Router dispatch — architect completed blueprints for 2 P0 GHOST-ZONE query-correctness fixes in `apps/mcp-server/`, both fully specified, zero blockers, zero file overlap between them.

**DECOMPOSITION:**
- **FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST:** `backlog[]` → `ready[]`, status TODO, owner/next_agent = dev-mcp-server. Two-stage SQL wrap (inner `ORDER BY date DESC LIMIT ?` selects newest, outer `ORDER BY date ASC` restores the documented return contract `convictionHistoryHandler.ts` depends on) ratified verbatim by architect. PM work-order: `docs/handoffs/FIX-GHOSTZONE-CONVICTION-ASC-LIMIT-TRUNCATES-NEWEST-PM-workorder.md`.
- **FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD:** `backlog[]` → `ready[]`, status TODO, owner/next_agent = dev-mcp-server. One-line subquery guard fix (`foreign_volume IS NOT NULL` moved inside the `MAX(date)` subquery) ratified verbatim. AC-15 regression test (2 edge cases: all-NULL table-wide, consecutive NULL-only days). PM work-order: `docs/handoffs/FIX-GHOSTZONE-FOREIGN-FLOW-MAXDATE-MISSING-NONNULL-GUARD-PM-workorder.md`.
- **FOLLOWUP-CONVICTION-HISTORY-COVERAGE-FLOOR-CHECK:** minted new to `backlog[]` (P2, next_agent=ba) per architect's NFR-2 recommendation — a coverage-floor fail-loud check for the 2000-row LIMIT window (reuses existing `checkConvictionHistoryGap.ts`/`dataAuditShared.ts` audit-check plumbing, no new monitoring machinery). NOT a blocker on either fix; needs a BA spec before further dispatch.

**WIP HOLD:** `in_progress[]` = 3 (UC-CCA-P3, UC-CDC-P1, FIX-SYSTEM-MAP-WATCHLIST-STALE-34-OF-58) already at/over the 2-max hard limit. Both new tasks held in `ready[]`/TODO, NOT pushed to `in_progress[]` — matches precedent (`sprint-DASH-CRON-RECHECK-TABLE-pm.md`: "WIP limit respected: added to ready[], not in_progress[]"). dev-team's normal bounded-pickup sweep promotes once a slot frees; no PIPELINE:blocked needed since decomposition/TODO-creation is not itself WIP-gated.

**orch-state.json:** both rows moved `backlog[]`→`ready[]` (status TODO, owner/next_agent=dev-mcp-server, depends:[]), 1 new `backlog[]` row minted. Written via `orch-apply.sh` — validated (Stage 0/1 PASS), conservation OK (task_total 716→717), 0 net-new prose-ceiling violations (37 pre-existing grandfathered WARNs, unrelated). `.head` was already `{status:idle, active_task_id:null}` pre-cycle — Step 4c non-closeout release is a no-op by construction (no match to release).

**Decision journal:** `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-pm.md` STEP pm-S9.

---

## c345 FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE — CLOSEOUT VERIFIED · 2026-08-22T18:55Z

**CLOSEOUT TASK:** done_verified row moved from qa-approved state by QA (commit 3738a567c); next_agent="pm" for closeout duties.

**CHANGE SUMMARY:**
- **Row:** FIX-DEVTEAM-HEAD-PIN-STALE-THRESHOLD-24H-VS-TICK-CADENCE (P1, dev-team flow discipline, head-pin auto-reset 24h->2h threshold + resume-attempt bound)
- **Chain:** architect brief (e6f4455a7, corrected §5c WF-3 lane-move gap) → agent-father implementation (dc0f90334) → qa re-verify (independent dry-run, WF-3 structural mirroring + duration-parenthetical rendering confirmed) → promoted to done_verified
- **Verification Status:** APPROVED (non-blocking cosmetic note: brief cite to execute-tier.md:125 vs actual :116, already corrected in main.md)

**DOWNSTREAM BLOCKER CHECK:**
- **Direct dependencies:** none (row.depends = [])
- **Reverse dependencies (tasks depending on THIS row):** none found (jq search across all lanes negative)
- **Related rows with block-able impact:**
  - FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION (BACKLOG, independent mechanism — chronic lane starvation, NOT triggered by this row's head-pin surface)
  - ARCH-SESSION-CRON-PLANE-LIVENESS-WATCHDOG (BACKLOG, independent plane — session-scoped CronCreate liveness, orthogonal to board-head staleness)
  - FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN (READY, minted 2026-08-14 by PO from architect's recommendation inside THIS row's own status_note as a scoped-out follow-up, now awaiting dispatch to agent-father — no block on main row, PO already mint completed)

**LIVE BOARD STATE (@ 2026-08-22T18:55Z):**
- in_progress: 3 (WIP limit respected, no blockage from this row)
- ready: 94
- qa: 10
- review: 25
- done_verified: 28 (including this row)

**CLOSEOUT SUMMARY:**
✓ Downstream blockers: none
✓ Related board entries: FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN is independent (different trigger class per architect note, already minted/ready for dispatch, not cascaded from this row)
✓ Board coherence: row exited review[] → done_verified[], no lane-move needed (QA already executed)
✓ WIP/capacity: no new task dispatch needed; 3 in_progress is within bounds

**NEXTACTIONS:**
1. PO dispatch FIX-DEVTEAM-HEAD-NEXTAGENT-RESYNC-ON-REASSIGN (READY, agent-father) as next follow-up (separate row, independent mechanism, architect-recommended but not a closeout blocker for this one)
2. No PM task decomposition triggered (this was architect→implementation→qa chain, not a PM decomposition)
3. Session closeout ready (no downstream WIP blockers, no dependent task activation)

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).

## Session 2026-08-23T09:00Z — Decompose signal-type-registry fix

**Context:** Architect completed P0 pass on FIX-PO-TRIAGE-SIGNALS-TABLE-MATCHES-ZERO-LIVE-SIGNAL-TYPES, decided (b) registry-derived routing + self-filing fallback. Routed to PM for decomposition into exactly two per-owner subtasks.

**Decomposition completed:**

1. **TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY** (owner: dev-mcp-server, SPRINT-S)
   - Extend guard-signal-type-coverage.sh: parse both Pipeline-A (pending_triage_inbox[]) and Pipeline-B (signal_queue.rows[])
   - Add self-filing mint to task_board.backlog[] on unrouted type (dedup-keyed)
   - Proof: synthetic Pipeline-A-only type is caught by cross-pipeline check
   - Status: READY, zone: scripts/

2. **TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION** (owner: agent-father/po, SPRINT-S)
   - Fix AC-2 falsified claims: system_issue/system-issue are "≤1-2 fires" (FALSE: 112/109 fires, concurrently live)
   - Add tactical Pipeline-B audit-handoff rule to unblock CI red
   - Replace frozen prose with instruction to consult derived registry
   - Status: READY, zone: docs/agents/po/flow/

**Board state:** ready+=2 (104→106), WIP unchanged (36 within limit), backlog+=0 (companion row already exists)

**Handoff files created:**
- docs/handoffs/TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY.md
- docs/handoffs/TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION.md

**Sequence:** Tasks can run in parallel (different zones, no file overlap). Audit-handoff rule from task 2 unblocks CI; guard extension from task 1 prevents recurrence.

**Session:** 007e33e4-b453-4bb3-8ab1-ef31495906a3

