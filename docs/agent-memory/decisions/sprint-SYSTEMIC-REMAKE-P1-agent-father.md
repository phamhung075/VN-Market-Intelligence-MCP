# Decision Journal — Sprint SYSTEMIC-REMAKE-P1 · agent-father

**Sprint goal:** Phase 1 containment-now remedies from docs/architecture-briefs/2026-07-04-systemic-remake.md
**Agent:** agent-father
**Started:** 2026-07-04T07:03:03Z

---

### STEP agent-father-S1 · agent-father · 2026-07-04T07:03:03Z
**task-id:** SYSREMAKE-P1DE-SIGNAL-CLOSURE-BACKREF
**what-done:** Wired signal-closure back-reference (brief §1.2, RC-DETECTOR): triage-signals.md `repair_task_request` row now stamps `origin_signal_id` on the minted FIX task; task-archive.md flips the referenced `signal_queue` row `READ→RESOLVED` (per signal-dashboard SKILL.md §CLOSE) before eviction, same commit.
**what-considered:**
- Generalize `origin_signal_id` verbatim into every signal-creating row's JSON (zone_missing_tier3, ci_red) — rejected, overreaches an S-sized additive task; added a one-line generalizing note instead
- Flip signal_queue status inline inside orch-cold-evict.sh — rejected, out of zone (script, not flow doc) and duplicates a distinct write op
- Insert closure step before vs. after eviction script — chosen BEFORE, since done_verified[] rows are evicted off the hot file at that step
**why-decision:** Closure write must read `origin_signal_id` off `.task_board.done_verified[]` before that lane is emptied by orch-cold-evict.sh, and must land uncommitted so Step 6's existing `git add orch-state.json` folds it into the SAME commit — satisfies brief AC#2 with zero new commit path.
**why-change:** no change from dispatch spec — implemented both P1-D/P1-E wiring points as specced, additive-only.
