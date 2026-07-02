# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · developer

**Sprint goal:** (resolved via decision-journal SKILL fallback — last `active`-status sprint_goal
entry at task time; this task, FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT, is a task_board item, not
itself a sprint_goal entry)
**Agent:** developer
**Started:** 2026-07-02T01:07Z

---

### STEP developer-S1 · developer · 2026-07-02T02:07:00Z
**task-id:** FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT
**what-done:** Diagnosed that `.sprint_goal.entries[]` and `.task_board.active_sprints[]` are
TWO SEPARATE arrays — `scripts/orch-cold-evict.sh`'s TERMINAL_SPRINT_STATUSES predicate operated
ONLY on the latter; it had never touched `.sprint_goal.entries[]` at all (confirmed via `grep -n
sprint_goal scripts/orch-cold-evict.sh` → zero hits pre-fix). This changes the fix shape from
"just canonicalize + run the existing evictor" to "canonicalize AND wire the evictor to a new array".
**what-considered:**
- Only normalize the 8 tokens and stop (literal AC-1 text) — rejected: dispatcher's AC explicitly
  asserts running cold-evict drops entries 26→18, which is FALSE without wiring; would silently
  fail the acceptance check and leave root cause (unbounded growth) unfixed.
- Reuse existing `closed_sprints` cold array for evicted sprint_goal entries — rejected: different
  key (`sprint_id` vs `id`) and shape (vision/scope_in/scope_out vs id/status/tasks); would corrupt
  semantic meaning of `closed_sprints`. Chose a new parallel `closed_sprint_goals` cold field
  (additive, non-breaking — cold file has no strict schema gate).
**why-decision:** Root-cause fix requires BOTH: (a) one-time normalize (AC-1 mechanical) + (b) wire
cold-evict to actually process `.sprint_goal.entries[]` using the identical TERMINAL_SET predicate,
otherwise the array keeps growing forever even after tokens are fixed once.
**why-change:** Scope grew beyond the literal task text (which assumed cold-evict already handled
sprint_goal.entries) — necessary correction after reading the actual script, not a plan deviation.

### STEP developer-S2 · developer · 2026-07-02T02:20:00Z
**task-id:** FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT
**what-done:** AC-2 durable guard: added `checkSprintGoalStatusCanonical()` to orchStateSchema.ts
(alias map: uppercase(raw)→canonical TERMINAL_SET token; violation iff mapped but not byte-identical)
+ wired as Stage 1d hard-fail in scripts/orch-validate.mjs (same script orch-apply.sh already calls).
**what-considered:**
- Full typed Zod schema for `.sprint_goal.entries[]` (replace `z.record(z.unknown())`) — rejected:
  out of scope (SSOT-W2-SPRINT-GOAL-PRUNE is the backlogged full-schema task); a narrow drift-alias
  check closes the acute recurring-8x class without a schema migration.
- Case-insensitive-only check (no synonym map) — rejected: misses "CLOSED"/"COMPLETE" (not case
  variants of DONE, they're synonyms) — the ACTUAL 2 of 8 drift shapes seen live.
**why-decision:** Alias map generalizes past the 8 named incidents (also catches CANCELED/COMPLETED
variants never yet seen) while staying narrow enough to need zero schema migration and zero
container rebuild for the LOCAL orch-apply.sh path to enforce it immediately.
**why-change:** none from plan.

### STEP developer-S3 · developer · 2026-07-02T02:35:00Z
**task-id:** FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT
**what-done:** Extended `docs/agents/dev-team/flow/post-cycle.md` Step 4.2 bloat-trigger with a
`SPRINT_GOAL_TERMINAL_N` check (same predicate, `.sprint_goal.entries[]`) so the automatic
post-cycle backstop actually fires eviction for this array going forward — closes the gap that let
count reach 26 unnoticed (the existing gate only ever looked at `.task_board.active_sprints[]`/done/`
done_verified`).
**what-considered:** only path — the write-time guard (Stage 1d) prevents NEW drift but does nothing
to trigger the periodic sweep that empties already-canonical terminal entries; without this the
array would still grow to the 15-cap before anyone notices.
**why-decision:** completes the durable fix — guard stops bad tokens, trigger stops silent regrowth.
**why-change:** none from plan; both were implied by "recurring 8x" framing in the task brief.
