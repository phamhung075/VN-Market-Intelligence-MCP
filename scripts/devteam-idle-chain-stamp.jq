# scripts/devteam-idle-chain-stamp.jq
#
# FIX-DEVTEAM-IDLE-CHAIN-STEP1-TRIAGE-STARVATION — per-tick stamp-update
# writer for the 5-consumer aged round-robin (architect brief
# 2026-07-25-devteam-idle-chain-rotation-durable-inbox.md §2.3;
# TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES).
#
# WHAT THIS DOES: after the dev-team idle-tick's rotation-selected consumer
# (scripts/lib/devteam-eligibility.jq rotation_selected($doc)) has run its
# block — dispatch or genuine no-op, either way — this script stamps that
# ONE consumer's `.dev_team_idle_chain.rotation.<id>.last_served_tick` to
# "now", unconditionally. This is what guarantees the round-robin invariant:
# the just-served consumer becomes the FRESHEST of the 5, so it cannot be
# selected again until the other 4 have each had a turn (brief §2.3's
# fairness bound — every consumer served exactly once per 5 consecutive
# idle-fallthrough ticks).
#
# Deliberately kept as its OWN small write, separate from each of the 6
# existing promote/claim scripts (devteam-backlog-promote-bounded1.jq,
# devteam-backlog-claim-bounded1.jq, devteam-backlog-promote-supervised-
# lane-sweep.jq, devteam-backlog-claim-supervised-lane-sweep.jq,
# devteam-backlog-claim-ready-lane-consumer.jq, devteam-backlog-claim-qa-
# drain.jq) — zero lines changed in any of them, and orch-apply.sh's CAS
# retry already makes a second small write on the same tick safe (brief
# §2.3). A future caller MAY fold this into the same transform as a
# micro-optimization; not architecturally required.
#
# Self-healing on the bootstrap tick: `.dev_team_idle_chain` and
# `.dev_team_idle_chain.rotation` need not pre-exist — jq's `=` assignment
# creates every missing intermediate object along the path automatically
# (verified: `echo '{}' | jq '.a.b.c = 1'` -> `{"a":{"b":{"c":1}}}`), so the
# very first stamp write on a doc with no `.dev_team_idle_chain` key at all
# produces the correct nested shape with no separate migration step. Mirrors
# rotation_selected($doc)'s own `// {}` / `// "1970-01-01T00:00:00Z"`
# defaults (brief §8 risk flag: "migration/bootstrap tick").
#
# `$c` is guarded against the fixed 5-id set (same list rotation_selected
# hardcodes) — an unrecognized id is a caller bug (e.g. a typo, or a stale
# consumer name after a future rename), and this script refuses to write a
# 6th/garbage rotation key rather than silently accepting it. No-op
# (document unchanged) on an unrecognized `$c`.
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" --arg c "$SELECTED" \
#     -f scripts/devteam-idle-chain-stamp.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# `$SELECTED` is the id returned by rotation_selected($doc) for this tick —
# one of: bounded1 | sls | rlc | qa_drain | step1_triage.
#
# Pointer: docs/agents/dev-team/flow/main.md § idle-tick rotation dispatch
# (downstream task — NOT this task; this task is schema+utilities only, see
# TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES's note: "No changes to
# dev-team/flow docs (plan_only)").

(["bounded1", "sls", "rlc", "qa_drain", "step1_triage"]) as $known_ids
| if ($known_ids | index($c)) == null then
    .   # unrecognized consumer id — refuse to write a garbage rotation key, no-op
  else
    .dev_team_idle_chain.rotation[$c].last_served_tick = $now
    | .dev_team_idle_chain._updated_at = $now
    | .dev_team_idle_chain._updated_by = "dev-team"
  end
