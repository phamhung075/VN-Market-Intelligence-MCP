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
