# scripts/fix-orchstate-blocks-coedit-decorative-normalize.jq
# Task: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE (AC-2, one-time data migration)
#
# ROOT CAUSE (full analysis on the task row itself): `blocks` and `co_edit` are
# write-only task_board fields -- read by ZERO consumers anywhere in the repo
# (scripts/lib/*.jq, scripts/devteam-*.jq, scripts/orch-*.mjs/.sh,
# scripts/agents-flow/*.sh all grep-confirmed clean). effective_depends_on()
# in scripts/lib/devteam-eligibility.jq only ever reads a row's OWN
# depends_on/depends/blocked_by -- never a reverse `blocks` edge from another
# row, and there is no forward-field equivalent for `co_edit` at all.
#
# THIS SCRIPT: generic (not id-hardcoded) one-time normalizer, run once against
# the live document to bring it into compliance with the new write-time guard
# (checkDecorativeSequencingFields() in orchStateSchema.ts / Stage 1e in
# orch-validate.mjs) BEFORE that guard goes live -- otherwise the guard would
# immediately reject the very file it exists to protect.
#
# For every task_board row (all 9 lane shapes), by field:
#
#   blocks:
#     - empty array []                          -> unchanged (harmless, no edge asserted)
#     - non-empty array, EVERY target id both (a) resolves to a real row AND
#       (b) that target already carries the source id in its own
#       depends_on/depends/blocked_by (i.e. the edge is ALREADY backed by a
#       field the eligibility gate actually reads)                -> unchanged;
#       `blocks` stays as pure human-readable documentation of an edge that is
#       for-real enforced elsewhere.
#     - non-empty array with ANY unresolvable or unbacked target id -> `blocks`
#       DELETED. Cannot be normalised (target id doesn't exist, or normalising
#       would require guessing/writing a dependency the author never actually
#       encoded) -- remedy [c] (delete) from the task row's own menu.
#     - present but NOT a valid array of non-empty strings (the one known
#       malformed case: FIX-MCP-SUITE-HEALTH-BASELINE's prose paragraph) ->
#       value PRESERVED verbatim under a new `migrated_blocks_prose` key,
#       `blocks` deleted. Never silently dropped.
#
#   co_edit:
#     - absent/null/empty array -> unchanged
#     - any non-empty value -> no forward-field equivalent exists (verified:
#       repo-wide grep, zero consumers) so it can never be normalised into a
#       working gate the way `blocks` sometimes can. Value PRESERVED under a
#       new `migrated_co_edit_partner` key, `co_edit` deleted -- remedy (ii)
#       from the task row's co_edit-specific menu (delete + force the intent
#       into prose/depends_on on the affected rows). This script only
#       guarantees no silent loss; hand-follow-up may add a real depends_on
#       edge where the co-edit intent is still operationally live.
#
# Idempotent: after one run, no row carries `blocks`/`co_edit` in a shape this
# script would still touch, so a second run is a no-op.
#
# Usage (NEVER raw mv/cp/> -- route through orch-apply.sh):
#   jq -f scripts/fix-orchstate-blocks-coedit-decorative-normalize.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Companion durable fix (ongoing guard, closes the class for every future write):
#   apps/mcp-server/src/infrastructure/orchStateSchema.ts
#   checkDecorativeSequencingFields() + scripts/orch-validate.mjs Stage 1e.

def as_dep_array:
  if . == null then []
  elif (type == "string") then [.]
  elif (type == "array") then .
  else [] end;

def fwd_ids:
  (.depends_on|as_dep_array) + (.depends|as_dep_array) + (.blocked_by|as_dep_array);

def all_rows:
  ( (.task_board.backlog // [])[], (.task_board.done // [])[], (.task_board.done_verified // [])[],
    (.task_board.in_progress // [])[], (.task_board.qa // [])[], (.task_board.ready // [])[], (.task_board.review // [])[],
    (.task_board.archive // [])[],
    ((.task_board.active_sprints // [])[] | (.tasks // [])[]),
    ((.task_board.closed_sprints // [])[] | (.tasks // [])[])
  );

def fix_blocks($byid):
  if (has("blocks")) and (.blocks != null) then
    (.blocks) as $bv
    | (.id) as $sid
    | if (($bv|type) == "array") and ($bv | all(type == "string" and length > 0)) then
        if ($bv | length) == 0 then
          .
        else
          ( [ $bv[] as $tid
              | ($byid[$tid] != null) and (($byid[$tid] | fwd_ids) | index($sid) != null)
            ] | all
          ) as $all_backed
          | if $all_backed then . else del(.blocks) end
        end
      else
        (del(.blocks) | .migrated_blocks_prose = $bv)
      end
  else .
  end;

def fix_co_edit:
  if (has("co_edit")) and (.co_edit != null)
     and (((.co_edit|type) != "array") or ((.co_edit|length) > 0)) then
    (.co_edit) as $ce
    | (del(.co_edit) | .migrated_co_edit_partner = $ce)
  else .
  end;

( [ all_rows | select(.id != null) | {key: .id, value: .} ] | from_entries ) as $byid

| (.task_board.backlog       |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (.task_board.done          |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (.task_board.done_verified |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (.task_board.in_progress   |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (.task_board.qa            |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (.task_board.ready         |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (.task_board.review        |= ((. // []) | map(fix_blocks($byid) | fix_co_edit)))
| (if .task_board.archive then (.task_board.archive |= map(fix_blocks($byid) | fix_co_edit)) else . end)
| (.task_board.active_sprints |= map(if .tasks then (.tasks |= map(fix_blocks($byid) | fix_co_edit)) else . end))
| (.task_board.closed_sprints |= ((. // []) | map(if .tasks then (.tasks |= map(fix_blocks($byid) | fix_co_edit)) else . end)))
