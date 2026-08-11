# PM — Notebook

## c336 CHORE-COMMIT-OVERHEAD · Sprint Goal Right-Sized, 4 Backlog Rows Decomposed to 4 Atomic Tasks · 2026-08-11T13:00Z

**MANDATE (from router, session $CLAUDE_CODE_SESSION_ID):** Decompose PO-minted 4 backlog rows from sprint CHORE-COMMIT-OVERHEAD (commit cf451b52b) into atomic dev-team tasks. PO has already surfaced acceptance-bearing detail — architecture is satisfied, do NOT re-spike. Create handoff files per PM→Developer chain.

**PO DECISION JOURNAL CONTEXT (read first):**
From `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md`:
- 4 backlog rows minted from `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md`
- PO identified 3 gaps the brief itself missed (dedup-hash re-drain loop, gitignore validation on clean checkout, mutex-hold strategy redesign)
- Size R1 as M not S (mutex-hold duration is a design decision, not mechanical)
- All 4 rows are size/cadence/tracking-granularity fixes ONLY — no write/readback model changes

**THE 4 BACKLOG ROWS:**
1. `FIX-DRAIN-PAYLOADREF-UNBOUNDED-INLINE-SIZE-GATE` (FIX/S/P1) — cap ~50KB inline; above cap use pointer. **CRITICAL:** dedup hash MUST be over pointer to prevent re-drain infinite loop
2. `FIX-DBINTEGRITY-SIGNAL-PAYLOADREF-WHOLE-ACCUMULATOR` (FIX/S/P1) — narrow from 745KB whole-file ref to specific finding/fragment
3. `FIX-SIGNALS-PROCESSED-UNTRACK-GITIGNORE` (FIX/S/P2) — finish half-shipped 2026-07-12 P7: untrack 536 files, add gitignore, update drain-signals.md
4. `FIX-AUDITOR-DASHBOARD-COMMIT-BATCH-PER-TIER-CYCLE` (FIX/M/P2) — batch commits per tier-cycle, **requires explicit design call on mutex-hold strategy**

**DECOMPOSITION APPLIED (4 atomic tasks, all backlog-tracked):**

1. **TASK_CHORE-COMMIT-1-DRAIN-PAYLOAD-SIZE-GATE** (Zone: cross-service/dev-flow/, Size S, P1, ~1.5h)
   - Add size gate to drain-signals.md §0a-D (cap ≤50KB inline)
   - Update dedup hash computation to hash over pointer when size-gated
   - Implement target-class awareness (inline for processed/, pointer only for stable targets)
   - Flow-doc changes only; no script modification (drain-signals.js already implements correctly)
   - **Load-bearing:** dedup hash recomputation is the hazard; must be over what actually stores, not old payload-hash logic
   - Handoff: `docs/handoffs/TASK_CHORE-COMMIT-1-DRAIN-PAYLOAD-SIZE-GATE.md`

2. **TASK_CHORE-COMMIT-2-DBINTEGRITY-PAYLOAD-NARROW** (Zone: cross-service/, Size S, P1, ~1.5h)
   - Narrow --payload-ref in db-integrity-history-append.sh:98 from whole 745KB to specific finding
   - Use #fragment syntax (already supported by drain-signals.js:467)
   - Implement fragment encoding scheme (table+severity+ts or array index, choice TBD)
   - Maintain structural safety: to/payload-ref remain HARDCODED, never agent-supplied
   - Files: scripts/db-integrity-history-append.sh (primary); possibly scripts/agents-flow/drain-signals.js (verify fragment parsing)
   - Handoff: `docs/handoffs/TASK_CHORE-COMMIT-2-DBINTEGRITY-PAYLOAD-NARROW.md`

3. **TASK_CHORE-COMMIT-3-SIGNALS-PROCESSED-UNTRACK** (Zone: cross-service/, Size S, P2, ~1h)
   - Add `docs/signals/processed/` to .gitignore
   - Run one-time `git rm --cached` migration (536 files)
   - Update drain-signals.md to remove `git add -- docs/signals/processed/` staging line
   - **Validate from clean checkout** (PO-mandated): verify files don't re-track after drain creates them
   - Archival note: finish of 2026-07-12 P7 (half-shipped, half-stalled)
   - Files: .gitignore, docs/agents/dev-team/flow/drain-signals.md
   - Handoff: `docs/handoffs/TASK_CHORE-COMMIT-3-SIGNALS-PROCESSED-UNTRACK.md`

4. **TASK_CHORE-COMMIT-4-DASHBOARD-COMMIT-BATCH** (Zone: cross-service/dev-flow/, Size M, P2, ~2-3h)
   - **BLOCKING PREREQUISITE:** Design call with PO/Architect to decide mutex-hold strategy (AC-D1)
   - Separate write from commit in emit-dashboard-row.sh
   - Modify system-auditor flows (main.md, tier1-probe.md) to orchestrate batched per-tier commits
   - Ensure bounded-uncommitted window doesn't violate coldevict safeguard (per feedback_coldevict_bare_commit_sweeps_worker_staged_index)
   - Precedent: market-watcher + news-scout already batch writes/commits this way
   - **Size M (not S):** mutex redesign is load-bearing complexity, not mechanical
   - Handoff: `docs/handoffs/TASK_CHORE-COMMIT-4-DASHBOARD-COMMIT-BATCH.md`

**BOARD MUTATIONS APPLIED:**
1. Parent 4 backlog rows: status=BACKLOG (unchanged), added decomposed_tasks array with task ids
2. Added 4 new tasks to backlog (TASK_CHORE-COMMIT-1..4):
   - all status=BACKLOG
   - priority=(P1|P2), size=(S|M)
   - owner=developer, next_agent=pm→developer (per zone classification)
   - no cross-task dependencies (all independent) EXCEPT Task 4 has internal AC-D1 design-gate
   - created_by=pm/decompose-chore-commit-overhead-20260811T1300Z

**WIP CHECK:** Current in_progress=2 (at limit: one BLOCKED, one active). Cannot dispatch Task 4 until design call completes. Tasks 1-3 ready for dispatch conditional on WIP capacity (monitor for in_progress→done transitions).

**HANDOFF FILES CREATED (4 total):**
- `docs/handoffs/TASK_CHORE-COMMIT-1-DRAIN-PAYLOAD-SIZE-GATE.md` (flow-doc, dedup hash hazard, target-class rule)
- `docs/handoffs/TASK_CHORE-COMMIT-2-DBINTEGRITY-PAYLOAD-NARROW.md` (fragment scheme, hardcoding safety, drain-signals.js integration)
- `docs/handoffs/TASK_CHORE-COMMIT-3-SIGNALS-PROCESSED-UNTRACK.md` (gitignore, migration, clean-checkout validation mandate)
- `docs/handoffs/TASK_CHORE-COMMIT-4-DASHBOARD-COMMIT-BATCH.md` (design-call requirement, mutex strategies, precedent patterns)

**DECISION JOURNAL:**
- **Decomposition rationale:** Tasks 1-2 are size/granularity narrowing (payload cap and ref scope). Task 3 finishes the half-shipped untrack. Task 4 is commit batching with a design prerequisite. All 4 are independent on the branch/implementation level, but Task 4 has an internal gate (AC-D1 design call) that blocks its code phase.
- **Task 4 sizing:** Sized M because mutex-hold strategy is a load-bearing design choice, not a mechanical batch-commit refactor. Long hold vs bounded window + reconciliation has different risk profiles. Requires explicit PO/Architect sign-off before coding.
- **Scope boundary compliance:** All 4 respect the bound from po's scope_out — no touch to write/readback model, audit-trail policy, notebook-commit isolation, or write+readback actuators.
- **WIP respect:** Current WIP=2 (at limit). Tasks 1-3 are P1/P2 S-sized and ready to queue; Task 4 queued but cannot progress until AC-D1 design call completes (internal prerequisite).

**NEXT STEPS:**
1. **Router dispatch (conditional):** Tasks 1-3 ready for dispatch to dev-team zone specialist immediately upon WIP capacity (monitor in_progress for completions). Task 4 queued but awaits design-call completion (dev-team blocked until decision made).
2. **Task 4 design gate:** Before Task 4 code begins, schedule design call: present 3 strategies (long mutex hold / bounded window / bounded + reconciliation), discuss risk/benefit, document choice in new architecture brief.
3. **Parallel work (Tasks 1-3):** Can proceed independently while Task 4 design gate is in flight.
4. **Merges:** After all land, expect ~5-10% reduction in fleet commit count (Tasks 1-3 remove the highest-churn sources), plus flatter commit distribution from Task 4 batching.

**VERIFICATION:**
- Handoff files staged in docs/handoffs/ (4 files created) ✓
- Board mutations (TBD — pending jq transform + orch-apply.sh)
- git commit: chore(pm/CHORE-COMMIT-OVERHEAD-DECOMP) — 4 handoff files + notebook + board update

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
