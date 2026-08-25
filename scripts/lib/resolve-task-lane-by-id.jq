# scripts/lib/resolve-task-lane-by-id.jq
#
# FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD (developer, 2026-08-25).
# Canonicalizes the architect ruling in
# docs/architecture-briefs/2026-07-22-fix-orphan-adoption-board-state-guard-design.md
# §2 ("Canonicalize this filter as ... — SSOT for 'find a task_board row by id
# across both shapes'"). That brief names the path
# `scripts/agents-flow/resolve-task-lane-by-id.jq`; this file lands at
# `scripts/lib/` instead — DELIBERATE PATH DEVIATION, evidence-based, not a
# guess: every `.jq` file in this repo lives at either `scripts/` (per-task
# one-shot mutations) or `scripts/lib/` (shared, `include`-based, multi-
# consumer predicate libraries — the sibling `devteam-eligibility.jq` and
# `po-manual-dispatch-eligibility.jq` are the exact same shape this file is:
# one resolver, several independent callers). `scripts/agents-flow/` holds
# zero `.jq` files repo-wide (confirmed by find before writing this) — it is
# reserved for standalone `.sh`/`.js`/`.mjs` hook/probe scripts, not jq
# `include` modules. Following the brief's literal path would have created
# the first-ever `.jq` file in a directory that structurally doesn't hold
# them, diverging from the codebase's own established convention instead of
# matching it.
#
# WHY THIS FILE EXISTS: FR-3 (router, `.claude/skills/dispatch-claim/SKILL.md`
# § Orphan-Adoption Probe), FR-4 (dev-team read-guard,
# `docs/agents/dev-team/flow/orphan-adoption.md`), and FR-5 (the adjacent
# board-flip write, same file) all need to answer the identical question —
# "given a (possibly `task:`-prefixed) task id, which `.task_board` lane is
# it in, and what is its `.status`/`.supervised`?" — across BOTH board shapes
# (7 flat lanes + 1 nested `active_sprints[].tasks[]`). Two of those three
# call sites (FR-4's read-guard, FR-5's board-flip) are landing in THIS
# ticket; hand-deriving the lookup independently in each would recreate the
# exact byte-identical-defect-in-two-places class this ticket exists to fix
# (EC-1 prefix-strip, EC-2 flat-lane blindness — see the architecture brief).
#
# `include` path resolution (verified empirically, jq 1.8.1): relative to the
# CALLER's current working directory, not this file's own location. Every
# caller in this repo runs from the project root, so
# `include "scripts/lib/resolve-task-lane-by-id";` resolves correctly with no
# extra `-L` flag — same convention `devteam-eligibility.jq`'s own header
# documents.
#
# ---- lane_map: ONE hot-board read, batch-resolves every id in one jq pass
# (EC-8/FR-3 step 5 — never re-open the file per-signal in a loop). Extends
# the brief's literal {id, lane, status} shape with `supervised` (additive,
# non-breaking) so a caller can also apply the SUPERVISED-SKIP widening
# (po_corroboration_20260808, subtask 2(ii) of this ticket's own board row)
# without a second lookup. `.` at call time must be the FULL orch-state.json
# document (or an equivalent `.task_board`-bearing object). ----
def lane_map:
  def entry($lane): {id: .id, lane: $lane, status: .status, supervised: (.supervised // false)};
  [ (.task_board.backlog[]?        | entry("backlog")),
    (.task_board.ready[]?          | entry("ready")),
    (.task_board.in_progress[]?    | entry("in_progress")),
    (.task_board.review[]?         | entry("review")),
    (.task_board.qa[]?             | entry("qa")),
    (.task_board.done[]?           | entry("done")),
    (.task_board.done_verified[]?  | entry("done_verified")),
    (.task_board.active_sprints[]?.tasks[]? | entry("active_sprints"))
  ] | INDEX(.id);

# ---- bare_id: strip the outer "task:" wrap every orphan-signal payload's
# original_task_id carries (EC-1 — .task_board.*[].id fields are always
# bare). Idempotent on an already-bare id. ----
def bare_id($tid): $tid | ltrimstr("task:");

# ---- resolve_lane($map; $tid): index a possibly-prefixed id into an
# already-built lane_map (the SAME $bare_id used by both the guard-read and
# the board-flip write, per architect brief §2 — no second ltrimstr call).
# Returns {id, lane, status, supervised} or null (not found in any hot lane
# — caller must treat null as terminal/absent per FR-3 step 3, NEVER as
# active; this file does not itself consult the cold archive — see
# docs/data/orch/archive/YYYY-MM.json `.done_tasks[]`/`.closed_sprints[]?.tasks[]`,
# left to the caller since only the hot-lane read is batch-once-per-tick;
# archive fallback is a per-signal rare path). ----
def resolve_lane($map; $tid): $map[bare_id($tid)];
