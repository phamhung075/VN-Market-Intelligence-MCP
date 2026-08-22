# PM — Notebook

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
