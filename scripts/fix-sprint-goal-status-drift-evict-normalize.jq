# scripts/fix-sprint-goal-status-drift-evict-normalize.jq
# Task: FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT (AC-1, mechanical)
#
# ROOT CAUSE: sprint sign-off paths across many PO/dev scripts write non-canonical
# terminal-status synonyms/case-variants into .sprint_goal.entries[].status
# (CLOSED, COMPLETE, done, done_verified, ...) instead of the canonical
# TERMINAL_SET tokens (SSOT apps/mcp-server/src/infrastructure/orchStateSchema.ts
# TERMINAL_SET: DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED). Neither
# scripts/orch-cold-evict.sh's TERMINAL_SPRINT_STATUSES predicate nor a human
# scanning for "DONE" ever matches the drifted spelling -> the sprint never
# evicts -> .sprint_goal.entries grows unbounded (26 seen, cap 15).
#
# THIS SCRIPT: generic (not sprint-id-hardcoded) one-time normalizer. For EVERY
# entry in .sprint_goal.entries[], if its .status case-insensitively matches a
# known terminal-status alias/synonym AND is not already byte-identical to the
# canonical token, rewrite .status to the canonical token. Non-terminal tokens
# (OPEN, active, PLANNING, ACTIVE, ...) are left untouched — closing those
# sprints is a separate PO editorial act (out of scope here).
#
# Idempotent: re-running after normalization is a no-op (every drifted entry's
# status already equals its canonical form, so the `$s != $canon` guard skips it).
#
# Usage (bound --arg only; NEVER raw mv/cp/> — route through orch-apply.sh):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/fix-sprint-goal-status-drift-evict-normalize.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Companion durable fix (AC-2): apps/mcp-server/src/infrastructure/orchStateSchema.ts
#   checkSprintGoalStatusCanonical() + scripts/orch-validate.mjs Stage 1d — rejects
#   any future write containing one of these same aliases (this alias map is the
#   single SSOT; kept in lock-step with the TS SPRINT_GOAL_TERMINAL_ALIASES map).

def terminal_alias:
  {
    "DONE":          "DONE",
    "CLOSED":        "DONE",
    "COMPLETE":      "DONE",
    "COMPLETED":     "DONE",
    "DONE_VERIFIED": "DONE_VERIFIED",
    "CANCELLED":     "CANCELLED",
    "CANCELED":      "CANCELLED",
    "DEFERRED":      "DEFERRED",
    "SKIPPED":       "SKIPPED"
  };

(.sprint_goal.entries // []) as $entries
| .sprint_goal.entries = ($entries | map(
    (.status // "") as $s
    | (terminal_alias[($s | ascii_upcase)]) as $canon
    | if ($canon != null) and ($s != $canon) then
        (. + {status: $canon})
      else
        .
      end
  ))
| .sprint_goal._updated_at = $now
| .sprint_goal._updated_by = "fix-sprint-goal-status-drift-evict-normalize"
