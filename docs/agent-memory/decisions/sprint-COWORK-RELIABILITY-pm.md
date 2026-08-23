# PM Decisions — COWORK-RELIABILITY Sprint

## c335 FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE · Decomposition + Developer Handoff · 2026-07-31T01:45Z

**MANDATE:** Relay PM task: architect design is complete (6-file fix, appended to BA spec). Break into atomic dev task(s), create handoff doc(s), advance to developer.

**RECEIVED FROM:** Architect (design complete — [Architect] Brownfield Findings in docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-ba-spec.md)

**CONTEXT VERIFIED:**
- Task board row: FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE (P1, S-sized, IN_PROGRESS)
- Zone: cross-service/ (confirmed via system-map.json, specialist=developer, not dev-<service>)
- Resume-lock held by dev-team across relay chain (po→ba→architect→pm→developer) — do NOT release
- Production defect: 2 confirmed duplicate-fire incidents in 27h (2026-07-30 and 2026-07-31), AC-3 "someone must probe" gate discharged by production evidence
- NFR-1 landmine verified: pressure-state.json tick_id (second-precision) vs nominal TICK (minute-precision) — naive `==` is always false

**DECOMPOSITION DECISION:**
Architect explicitly states: "S-sized (6 files: 1 script + 1 test file extension + 4 flow/skill docs) and may not need splitting into multiple sub-tasks, but that's your call to make, not mine."

**Decision: ONE atomic task, NOT split.**

**Rationale:**
1. All 6 files implement ONE coherent fix: pre-election tombstone check (FR-1), new verdict (FR-2), zero-claim guarantee (FR-3), plus NFR testing and rollout notes
2. Files are tightly coupled: _tick_already_ran() predicate in script must match its prose mirror in leader-lock.md; both must pre-date the election claim on their respective paths; verdict must be documented in main.md JUMP-TO table; test assertions must verify both paths; cron prompt must know the verdict exists
3. No file can be developed independently — they enforce ordering invariants and cross-check the same tick-precision normalization bug
4. Cannot parallelize: split would force sequencing anyway (test file references script, flow docs reference script verdict enum, SKILL.md references flow docs verdict)
5. Total scope: ~50L new code (predicate + checks + tests) + ~30L comments/docs, easily within 2h developer window for S-size

**HANDOFF CREATED:**
- docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-dev.md
  - TLDR + production context
  - NFR-1 landmine highlighted (CRITICAL, read first)
  - 3 ACs explicit (AC-1 zero-claim, AC-2 no-over-suppress, AC-3 positive-control regression)
  - 6 files with line ranges and precise change specifications (per architect design)
  - Test strategy (unit + integration + flow-doc QA review)
  - Risk flags and regression guard (DO-NOT-SIMPLIFY comment, landing site for naive-compare reversion)
  - Commit message trailer format (AC: required per C2)

**BOARD MUTATION APPLIED:**
- Updated task: FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE
  - next_agent: pm → developer
  - updated_at: 2026-07-31T01:42:42Z (stamped by orch-apply.sh)
  - updated_by: "pm (PM decomposition relay)"
  - status: remains IN_PROGRESS (relay not terminal, lock stays with dev-team)

**VERIFICATION:**
- orch-apply.sh: Stage 0+1 PASS, conservation check PASSED (task_total 738 stable)
- Board row confirmed: next_agent=developer, zone=cross-service/ (correct routing)

**NEXT:** dev-team Step 3 dispatcher routes FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE to `developer` (zone-based routing). Developer picks up from docs/handoffs/FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE-dev.md and executes 6-file fix per architect design. Task status advances to review after developer branch is ready; QA verifies AC-3 positive-control assertions specifically (landmine guard per project memory feedback). On QA done, task → done_verified, lock released by dev-team loop.

---

## Notes for Future PM Cycles

- **Terminal-lane bloat:** done[] = 11 (> 10 threshold, HSC-3 gate). Task-archive subflow should run before next planning cycle to evict done→archive/YYYYMM.json.
- **Cron re-arm deployment gate:** Post-merge, rollout requires explicit `CronDelete` + `CronCreate` (bare `/cron-cowork-team` re-run is a no-op). Flag to QA/ops as required deployment step, not optional cleanup.
- **Project memory escalation:** NFR-1 precision-mismatch normalization is a known landmine (search MEMORY.md for similar pattern mismatches in other cowork/tick/precision contexts). This task's positive-control tests should become a template for precision-conversion regression guards in related tasks (e.g., other pressure-state comparisons, other TICK-format conversions).

### STEP pm-S1 · pm · 2026-08-23T13:42:32Z
task_id: FIX-CHEF-MARKER-KEY-WINDOW-ANCHOR
**what-considered:** (a) re-decompose — rejected, already split into FIX-CHEF-MARKER-KEY-ANCHOR-1..4 (all live in ready[], all TODO, verified on the board not inferred from the note); (b) leave in ready[] with corrected next_agent — rejected, that is exactly the state that kept re-routing it to pm; (c) closeout-shaped per flow Step 3e DECOMPOSITION_COMPLETE=true — chosen.
**why-change:** no change from plan. All scope is delegated; is_epic_wrapper() already made it non-dispatchable, so ready[] membership bought nothing and cost a pm hop every manual-dispatch sweep.
**hazard handled:** FIX-CHEF-INTRADAY-MARKER-KEY-UTC-HOUR-BASIS-MIGRATION (backlog[]) depended on this parent. A closed-as-decomposed parent can never reach DONE_VERIFIED, so deps_satisfied() would have stranded it forever — retargeted onto the 4 concrete ANCHOR children in the same write, and its legacy `.depends` field deleted to avoid the Stage-1f both-fields divergence hard-fail.
**note:** pm_closeout_note states explicitly that DONE = decomposed, NOT delivered — a P0 chef marker-key defect must not read as fixed.

### STEP pm-S2 · pm · 2026-08-23T13:42:32Z
task_id: FIX-CHEF-PUBLISHED-MARKER-RELEASE
**what-considered:** (a) close as fully folded into UC-CCA-P3 (now DONE_VERIFIED) — rejected: UC-CCA-P3 is claim-TIMING, orthogonal to release-gating; (b) mint both Components A and B — rejected, Component A is already live as ANCHOR-1..4; (c) mint Component B only — chosen.
**why-change:** no change from the 2026-08-06 unified brief. Component B (Published Marker Release Gate in spawn-fanout.md: any task_release on published:* must pass a delivery-evidence check or be refused) is covered by no existing child.
**child minted:** TASK-CHEF-MARKER-RELEASE-GATE, depends_on FIX-CHEF-MARKER-KEY-ANCHOR-3 — a same-file serialization edge (both edit spawn-fanout.md), deliberately same owner (developer) so the file has one owner, not a logical dependency.
**premise preserved:** the child's note carries architect's correction that ZERO code paths call task_release on published:* today (the 08-06 release was a manual PO action) so the gate is written to govern human releases too, not just automated ones.
