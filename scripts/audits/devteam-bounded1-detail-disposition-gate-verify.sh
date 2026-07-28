#!/usr/bin/env bash
# devteam-bounded1-detail-disposition-gate-verify.sh
# Regression verifier for FIX-DEVTEAM-BOUNDED1-DETAIL-DISPOSITION-GATE (2026-07-12)
# + its 3rd sibling FIX-DEVTEAM-BOUNDED1-PLAN-ONLY-GATE (2026-07-12)
# + its 4th sibling FIX-DEVTEAM-BOUNDED1-DETAIL-NEXTAGENT-NONDEV-GATE (2026-07-12)
# + its 5th sibling FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE (2026-07-13)
# + its 6th sibling FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE
#   (2026-07-16, subsumes FIX-DEVTEAM-BOUNDED1-MAINTLANE-NEXTAGENT-GATE).
# Brief: this fix (scripts/devteam-backlog-promote-bounded1.jq AC-1..AC-7) —
# see docs/agents/dev-team/flow/main.md § Idle-capacity backlog pickup (BOUNDED-1).
#
# Proves, against the CURRENT live docs/data/orch/orch-state.json +
# docs/data/orch/archive/backlog-detail.json:
#   AC-1: a detail-authoritative DEFERRED* row is NEVER auto-promoted, even
#         when forced to top priority.
#   AC-2: a row whose detail owner is a non-dev deliberate-launch agent
#         (po/ops/architect/...) AND whose board `next_agent` is null is
#         NEVER auto-promoted, even when forced to top priority.
#   AC-3: a row whose detail entry carries `plan_only:true` is NEVER
#         auto-promoted, even when forced to top priority and even when it
#         defeats AC-1/AC-2 (dev-role owner, non-DEFERRED status) — the
#         live proof row is FIX-MCP-MEMORY-CODE-LEAK (board
#         `status:BACKLOG,next_agent:null`; detail `plan_only:true,
#         next_agent:"architect",owner:"dev",status:"TODO"`).
#   AC-4: a row whose detail `next_agent` is a non-dev deliberate handler
#         (architect/ba/pm/ops*/po/qa/...) AND whose board `next_agent` is
#         null is NEVER auto-promoted, even when it defeats AC-1/AC-2/AC-3
#         (non-DEFERRED status, absent/empty detail owner, not plan_only) —
#         the live proof row is FEAT-SEVERITY-OVERRIDE-SURFACING (board
#         `status:BACKLOG`, only a `detail_ref`, no inline `next_agent`/
#         `owner`; detail `next_agent:"architect"`, no `owner` field at all —
#         the AC-2 owner gate is silent here because `owner` is absent, not
#         non-dev).
#   AC-5: a row with NO backlog-detail.json entry at all, whose BOARD-level
#         `.owner` names a non-dev deliberate-launch agent AND whose board
#         `.next_agent` is null, is NEVER auto-promoted (the board-fallback
#         half of effective_owner — closes the class AC-2 could not see
#         because AC-2's owner read is detail-only). Live proof rows (both
#         clean of every other gate): FIX-VERIFY-DEPLOY-SHA-BENIGN-DOC-DRIFT
#         (owner:"ops") and FIX-POSTCYCLE-STEP45-NB-WRITE-AC3
#         (owner:"agent-father") — both pre-fix WRONGLY promoted (verified
#         against git HEAD's pre-fix script during implementation), post-fix
#         correctly withheld.
#   AC-6: a row with NO backlog-detail.json entry, non-dev BOARD owner, but a
#         NON-EMPTY board `.next_agent` (already correctly routed) IS still
#         promoted — proves the board-fallback does not over-block a row that
#         doesn't need it. SYNTHETIC fixture (no live row currently matches
#         this exact shape without ALSO tripping the unrelated `supervised`
#         gate — grep-confirmed 2026-07-13 — so a synthetic single-row doc
#         guarantees deterministic coverage of this combination).
#   AC-7: detail-owner-present-stays-authoritative regression guard (two
#         directions, both SYNTHETIC — no live row has a detail owner that
#         actually CONFLICTS with its board owner; the one live owner
#         mismatch, OPS-BCTC-REFINE-REPASS-NONBANK-5T, has non-dev owners on
#         BOTH sides so it can't distinguish precedence direction):
#         AC-7a: detail owner="po" (non-dev) vs board owner="developer"
#                (dev-role) → MUST still be gated (detail wins over a
#                dev-role board owner — proves effective_owner does not
#                silently prefer board when detail is present).
#         AC-7b (reverse): detail owner="developer" (dev-role) vs board
#                owner="po" (non-dev) → must NOT be gated (detail wins as
#                dev-role, board's non-dev value correctly ignored — this is
#                the pre-existing behavior for detail_ref'd rows, unchanged
#                by this fix; identical pre-fix and post-fix).
#   CONTROL: a clean row (no detail-DEFERRED*, no non-dev-owner+null-
#            next_agent block on EITHER board or detail, no supervised/epic/
#            depends_on block, no plan_only, no non-dev-next_agent+null-
#            board-next_agent block) IS still promoted — proves the new
#            gates do not over-block.
#   AC-8: a row whose BOARD `.next_agent` is INLINE a non-dev deliberate
#         agent (architect/ba/pm/...) AND has NO backlog-detail.json entry
#         at all is NEVER auto-promoted — this is the exact shape
#         FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE
#         (2026-07-16) closes (previously slipped every gate: e.g. live
#         GUARD-COWORK-NOTEBOOK-AGENTS-SELF-EDIT-FLOW-DOC,
#         next_agent=architect, no detail entry, pre-fix). Live proof rows
#         discovered dynamically (no hardcoded IDs) — any task_board.backlog[]
#         row whose `.id` is absent from backlog-detail.json `.items[]` and
#         whose inline `.next_agent` does not match the dev-role pattern.
#   AC-9: a row whose BOARD `.plan_only` is INLINE `true` (no
#         backlog-detail.json entry at all) is NEVER auto-promoted — closes
#         the equivalent board-only-plan_only class the same 2026-07-16 fix
#         closes. SYNTHETIC (no live row currently carries an inline board
#         `plan_only:true` with no matching detail entry).
#   AC-10: a row with NO backlog-detail.json entry, whose inline board
#          `.next_agent` = "developer" (a dev-role value) IS still promoted
#          — proves the generalized effective_next_agent() (2026-07-16) does
#          not over-block a genuinely dev-routable row. SYNTHETIC control.
#
#   NOTE (2026-07-16): AC-6's fixture `next_agent` value was corrected from
#   "architect" to "developer". Under the PRE-fix NON-DEV-NEXT_AGENT gate,
#   next_agent's VALUE was irrelevant to the OWNER gate's board-fallback
#   check (only presence/absence mattered — the old next_agent gate never
#   looked at a board-only next_agent at all). The new EFFECTIVE-DISPOSITION
#   gate (AC-8 above) now correctly withholds ANY non-dev next_agent value,
#   including "architect" — so AC-6 must use a dev-role value to isolate the
#   OWNER gate's board-fallback behavior without also (correctly) tripping
#   the next_agent gate.
#
# READ-ONLY: never writes back to the live orch-state.json/backlog-detail.json
# (no orch-apply.sh call anywhere) — all fixtures are synthetic copies in a
# mktemp scratch dir, discarded on exit. AC-1..AC-6(live)/CONTROL fixture task
# IDs are discovered dynamically from live data at runtime — NO hardcoded
# task-id literals, mirroring the promote script's own no-hardcode discipline.
# AC-6(fallback)/AC-7a/AC-7b use clearly-labeled synthetic `ZZ-SYNTH-*` ids
# (never real task ids) because no live example of that exact shape exists.
#
# Portability note: written for macOS default /bin/bash 3.2 (no mapfile, no
# nameref) — uses plain newline-delimited scratch files + `while read` loops
# instead.
#
# Usage: bash scripts/audits/devteam-bounded1-detail-disposition-gate-verify.sh
# Exit 0 = all discovered assertions pass (an assertion is skipped, not
# failed, if no live fixture candidate currently exists for it).
# Exit 1 = a regression was detected — prints which assertion failed.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
PROMOTE_JQ="scripts/devteam-backlog-promote-bounded1.jq"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (2026-07-28): the
# promote script now requires --slurpfile archive unconditionally
# (dep_status_map($archive)). Empty archive here is deliberate — every
# fixture in this file uses synthetic ids never present in any real
# cold-archive month doc, so archive-awareness is a no-op for these
# assertions; only the required-flag plumbing changed.
: > "$WORK/empty-archive.json"

NOW="2026-01-01T00:00:00Z"   # fixed synthetic timestamp — value irrelevant to the assertions
FAIL=0

# --- board-side eligibility helpers (query the live $STATE) ----------------

board_backlog_status_ok() {
  # $1 = id -> "true" if present in task_board.backlog[] with status BACKLOG/TODO
  jq -r --arg id "$1" '
    ([.task_board.backlog[]? | select(.id == $id) | .status] | any(. == "BACKLOG" or . == "TODO"))
  ' "$STATE"
}

board_next_agent_empty() {
  jq -r --arg id "$1" '
    (([.task_board.backlog[]? | select(.id == $id) | (.next_agent // "")] | first) // "") == ""
  ' "$STATE"
}

board_inline_clean() {
  # $1 = id -> "true" if the board row itself carries no inline supervised/
  # children/depends_on/depends/blocked_by that would block promotion
  jq -r --arg id "$1" '
    ([.task_board.backlog[]? | select(.id == $id)] | first) as $row
    | ($row.supervised // false) != true
      and (($row.children // []) | length) == 0
      and (($row.depends_on // []) | length) == 0
      and (($row.depends // []) | length) == 0
      and (($row.blocked_by // []) | length) == 0
  ' "$STATE"
}

run_promote_picked_id() {
  # $1 = synthetic state json path -> prints picked ready[] id (or empty)
  jq --arg now "$NOW" --slurpfile detail "$DETAIL" --slurpfile archive "$WORK/empty-archive.json" -f "$PROMOTE_JQ" "$1" \
    | jq -r '.task_board.ready[0].id // empty'
}

run_promote_picked_id_with_detail() {
  # $1 = state json path, $2 = detail json path (object with .items[]) ->
  # AC-7 needs a SYNTHETIC detail entry (a controlled owner conflict that
  # does not exist in live backlog-detail.json), so this variant threads a
  # caller-supplied detail file instead of the live $DETAIL.
  jq --arg now "$NOW" --slurpfile detail "$2" --slurpfile archive "$WORK/empty-archive.json" -f "$PROMOTE_JQ" "$1" \
    | jq -r '.task_board.ready[0].id // empty'
}

make_synthetic_ac6_state() {
  # $1 = output path. Case-b fixture: no backlog-detail entry, non-dev BOARD
  # owner, but a NON-EMPTY dev-role board next_agent (already correctly
  # routed) -> must still be promoted (owner gate's board-fallback must not
  # over-block). NOTE (2026-07-16): next_agent uses "developer" (dev-role),
  # NOT "architect" — see the AC-6 fixture-correction note in the file
  # header: a non-dev next_agent value like "architect" is now (correctly)
  # caught by the generalized effective_next_agent() gate (AC-8), so it can
  # no longer serve as an "already correctly routed" filler value here.
  jq -n '
    { task_board: {
        backlog: [ { id: "ZZ-SYNTH-AC6-NONDEV-OWNER-ROUTED", status: "BACKLOG",
                      priority: "P0", owner: "po", next_agent: "developer" } ],
        ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
      } }
  ' > "$1"
}

make_synthetic_ac9_state() {
  # $1 = output path. AC-9: no backlog-detail entry, board-INLINE
  # `plan_only:true` -> must NEVER be promoted (effective_plan_only's
  # board-OR-detail OR-check must catch a board-only true just as it catches
  # a detail-only true).
  jq -n '
    { task_board: {
        backlog: [ { id: "ZZ-SYNTH-AC9-BOARD-PLAN-ONLY", status: "BACKLOG",
                      priority: "P0", plan_only: true, next_agent: null } ],
        ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
      } }
  ' > "$1"
}

make_synthetic_ac10_state() {
  # $1 = output path. AC-10 control: no backlog-detail entry, board-INLINE
  # `next_agent:"developer"` (dev-role) -> must still be promoted — proves
  # effective_next_agent()'s board-fallback does not over-block a genuinely
  # dev-routable row.
  jq -n '
    { task_board: {
        backlog: [ { id: "ZZ-SYNTH-AC10-DEV-NEXTAGENT-ROUTED", status: "BACKLOG",
                      priority: "P0", next_agent: "developer" } ],
        ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
      } }
  ' > "$1"
}

make_synthetic_ac7a() {
  # $1 = state out path, $2 = detail out path. Detail owner="po" (non-dev) vs
  # board owner="developer" (dev-role), next_agent null -> MUST be gated
  # (detail wins over a dev-role board owner).
  jq -n '
    { task_board: {
        backlog: [ { id: "ZZ-SYNTH-AC7A-DETAIL-WINS", status: "BACKLOG",
                      priority: "P0", owner: "developer", next_agent: null } ],
        ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
      } }
  ' > "$1"
  jq -n '{ items: [ { id: "ZZ-SYNTH-AC7A-DETAIL-WINS", owner: "po" } ] }' > "$2"
}

make_synthetic_ac7b() {
  # $1 = state out path, $2 = detail out path. Reverse of AC-7a: detail
  # owner="developer" (dev-role) vs board owner="po" (non-dev), next_agent
  # null -> must NOT be gated (detail dev-role wins, board's non-dev value
  # correctly ignored -- pre-existing behavior, unchanged by this fix).
  jq -n '
    { task_board: {
        backlog: [ { id: "ZZ-SYNTH-AC7B-DETAIL-WINS-REV", status: "BACKLOG",
                      priority: "P0", owner: "po", next_agent: null } ],
        ready: [], in_progress: [], qa: [], review: [], done: [], done_verified: []
      } }
  ' > "$1"
  jq -n '{ items: [ { id: "ZZ-SYNTH-AC7B-DETAIL-WINS-REV", owner: "developer" } ] }' > "$2"
}

make_isolated_fixture() {
  # $1 = id, $2 = output path — reduces backlog[] to exactly this one row
  # (forced to P0 priority), clears in_progress[] to simulate WIP=0, AND
  # clears ready[] (pre-existing latent bug, found+fixed incidentally
  # 2026-07-28 while regression-testing FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-
  # RESOLVES-MISSING: run_promote_picked_id() reads `.task_board.ready[0]`,
  # which promote-bounded1.jq APPENDS to — so a non-empty live ready[]
  # (routine; ready[] is a staging queue, 47 rows live 2026-07-28) leaked
  # its OWN pre-existing ready[0] entry into every equality-checking
  # assertion using this fixture, independent of whether THIS fixture's
  # single backlog row was actually promoted. Verified pre-existing and
  # unrelated to that fix: reproduced identically against the git-HEAD
  # (pre-fix) promote-bounded1.jq + devteam-eligibility.jq before applying
  # this correction.
  jq --arg id "$1" '
    .task_board.in_progress = []
    | .task_board.ready = []
    | .task_board.backlog = ([ .task_board.backlog[] | select(.id == $id) ] | map(. + {priority: "P0"}))
  ' "$STATE" > "$2"
}

# --- candidate pools from backlog-detail.json (detail-only predicates) ----

jq -r '
  .items[]
  | select((.status // "" | ascii_downcase) | startswith("deferred"))
  | select((.owner // "") == "")
  | .id
' "$DETAIL" > "$WORK/ac1-pool.txt"

jq -r '
  .items[]
  | select(.owner != null and (.owner|type)=="string" and .owner != "")
  | select((.owner | test("^dev(-|$)|^developer$"; "i")) | not)
  | select(((.status // "" | ascii_downcase) | startswith("deferred")) | not)
  | select((.supervised // false) != true)
  | select(((.children // []) | length) == 0)
  | select((.depends_on // null) == null)
  | select((.depends // null) == null)
  | select((.blocked_by // null) == null)
  | select((.plan_only // false) != true)
  | .id
' "$DETAIL" > "$WORK/ac2-pool.txt"

jq -r '
  .items[]
  | select((.plan_only // false) == true)
  | select(((.status // "" | ascii_downcase) | startswith("deferred")) | not)
  | select((.supervised // false) != true)
  | select(((.children // []) | length) == 0)
  | select((.depends_on // null) == null)
  | select((.depends // null) == null)
  | select((.blocked_by // null) == null)
  | select((.owner // "") == "" or (.owner | test("^dev(-|$)|^developer$"; "i")))
  | .id
' "$DETAIL" > "$WORK/ac3-pool.txt"

jq -r '
  .items[]
  | select(.next_agent != null and (.next_agent|type)=="string" and .next_agent != "")
  | select((.next_agent | test("^dev(-|$)|^developer$"; "i")) | not)
  | select(((.status // "" | ascii_downcase) | startswith("deferred")) | not)
  | select((.supervised // false) != true)
  | select(((.children // []) | length) == 0)
  | select((.depends_on // null) == null)
  | select((.depends // null) == null)
  | select((.blocked_by // null) == null)
  | select((.plan_only // false) != true)
  | .id
' "$DETAIL" > "$WORK/ac4-pool.txt"

jq -r '
  .items[]
  | select(((.status // "" | ascii_downcase) | startswith("deferred")) | not)
  | select((.supervised // false) != true)
  | select(((.children // []) | length) == 0)
  | select(((.depends_on // []) | length) == 0)
  | select(((.depends // []) | length) == 0)
  | select(((.blocked_by // []) | length) == 0)
  | select((.owner // "") == "" or (.owner | test("^dev(-|$)|^developer$"; "i")))
  | select((.plan_only // false) != true)
  | select((.next_agent // "") == "" or (.next_agent | test("^dev(-|$)|^developer$"; "i")))
  | .id
' "$DETAIL" > "$WORK/control-pool.txt"

# AC-5 pool (board-only, NOT keyed off backlog-detail.json): rows with NO
# detail entry at all, whose BOARD-level `.owner` is non-dev and whose board
# `.next_agent` is null. FIX-DEVTEAM-BOUNDED1-NONDEV-OWNER-BOARD-FALLBACK-GATE
# (2026-07-13), 5th sibling.
jq -r '[.items[]?.id]' "$DETAIL" > "$WORK/detail-ids.json"
jq -r --slurpfile did "$WORK/detail-ids.json" '
  ($did[0]) as $dids
  | .task_board.backlog[]?
  | select(.owner != null and (.owner|type)=="string" and .owner != "")
  | select((.owner | test("^dev(-|$)|^developer$"; "i")) | not)
  | select((.next_agent // "") == "")
  | .id as $rid
  | select(($dids | index($rid)) == null)
  | $rid
' "$STATE" > "$WORK/ac5-pool.txt"

# AC-8 pool (board-only, NOT keyed off backlog-detail.json): rows with NO
# detail entry at all, whose BOARD-level `.next_agent` is INLINE non-dev.
# FIX-DEVTEAM-BOUNDED1-EFFECTIVE-DISPOSITION-BOARD-FALLBACK-GATE (2026-07-16),
# 6th sibling. Owner/plan_only are intentionally left unconstrained here
# (with next_agent non-empty, the OWNER gate's board-empty-next_agent
# precondition is never met, so it cannot confound this pool regardless of
# owner value) — attribution is to the next_agent gate specifically.
jq -r --slurpfile did "$WORK/detail-ids.json" '
  ($did[0]) as $dids
  | .task_board.backlog[]?
  | select(.next_agent != null and (.next_agent|type)=="string" and .next_agent != "")
  | select((.next_agent | test("^dev(-|$)|^developer$"; "i")) | not)
  | select((.plan_only // false) != true)
  | .id as $rid
  | select(($dids | index($rid)) == null)
  | $rid
' "$STATE" > "$WORK/ac8-pool.txt"

pick_first_ac1() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ]; then echo "$id"; return 0; fi
  done < "$WORK/ac1-pool.txt"
  return 1
}

pick_first_ac2() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_next_agent_empty "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/ac2-pool.txt"
  return 1
}

pick_first_ac3() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/ac3-pool.txt"
  return 1
}

pick_first_ac4() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_next_agent_empty "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/ac4-pool.txt"
  return 1
}

pick_first_control() {
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/control-pool.txt"
  return 1
}

pick_first_ac5() {
  # ac5-pool.txt is already board-only-filtered (non-dev owner, null
  # next_agent, no detail entry); still requires board_inline_clean to
  # exclude rows gated by an UNRELATED sibling gate (supervised/children/
  # depends_on/depends/blocked_by) so a failure here is attributable ONLY to
  # the board-fallback gate.
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_next_agent_empty "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/ac5-pool.txt"
  return 1
}

pick_first_ac8() {
  # ac8-pool.txt is already board-only-filtered (non-empty inline non-dev
  # next_agent, no detail entry, board plan_only not true); still requires
  # board_inline_clean to exclude rows gated by an UNRELATED sibling gate
  # (supervised/children/depends_on/depends/blocked_by) so a failure here is
  # attributable ONLY to the effective_next_agent (2026-07-16) gate. Does
  # NOT check board_next_agent_empty — by construction these rows have a
  # non-empty inline next_agent (that is the whole point of this fixture).
  while IFS= read -r id; do
    [ -z "$id" ] && continue
    if [ "$(board_backlog_status_ok "$id")" = "true" ] \
       && [ "$(board_inline_clean "$id")" = "true" ]; then
      echo "$id"; return 0
    fi
  done < "$WORK/ac8-pool.txt"
  return 1
}

AC1_ID=""
AC2_ID=""
AC3_ID=""
AC4_ID=""
AC5_ID=""
AC8_ID=""
CONTROL_ID=""
AC1_ID=$(pick_first_ac1) || true
AC2_ID=$(pick_first_ac2) || true
AC3_ID=$(pick_first_ac3) || true
AC4_ID=$(pick_first_ac4) || true
AC5_ID=$(pick_first_ac5) || true
AC8_ID=$(pick_first_ac8) || true
CONTROL_ID=$(pick_first_control) || true

if [ -n "$AC1_ID" ]; then
  make_isolated_fixture "$AC1_ID" "$WORK/ac1.json"
  PICKED=$(run_promote_picked_id "$WORK/ac1.json")
  if [ "$PICKED" = "$AC1_ID" ]; then
    echo "[FAIL] AC-1 regression: detail-DEFERRED row $AC1_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-1: detail-DEFERRED row $AC1_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-1: no eligible detail-DEFERRED* fixture candidate in live data"
fi

if [ -n "$AC2_ID" ]; then
  make_isolated_fixture "$AC2_ID" "$WORK/ac2.json"
  PICKED=$(run_promote_picked_id "$WORK/ac2.json")
  if [ "$PICKED" = "$AC2_ID" ]; then
    echo "[FAIL] AC-2 regression: non-dev-owner/null-next_agent row $AC2_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-2: non-dev-owner/null-next_agent row $AC2_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-2: no eligible non-dev-owner/null-next_agent fixture candidate in live data"
fi

if [ -n "$AC3_ID" ]; then
  make_isolated_fixture "$AC3_ID" "$WORK/ac3.json"
  PICKED=$(run_promote_picked_id "$WORK/ac3.json")
  if [ "$PICKED" = "$AC3_ID" ]; then
    echo "[FAIL] AC-3 regression: plan_only row $AC3_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-3: plan_only row $AC3_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-3: no eligible plan_only fixture candidate in live data"
fi

if [ -n "$AC4_ID" ]; then
  make_isolated_fixture "$AC4_ID" "$WORK/ac4.json"
  PICKED=$(run_promote_picked_id "$WORK/ac4.json")
  if [ "$PICKED" = "$AC4_ID" ]; then
    echo "[FAIL] AC-4 regression: non-dev-next_agent/null-board-next_agent row $AC4_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-4: non-dev-next_agent/null-board-next_agent row $AC4_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-4: no eligible non-dev-next_agent/null-board-next_agent fixture candidate in live data"
fi

if [ -n "$AC5_ID" ]; then
  make_isolated_fixture "$AC5_ID" "$WORK/ac5.json"
  PICKED=$(run_promote_picked_id "$WORK/ac5.json")
  if [ "$PICKED" = "$AC5_ID" ]; then
    echo "[FAIL] AC-5 regression: no-detail-entry non-dev-board-owner/null-next_agent row $AC5_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-5: no-detail-entry non-dev-board-owner/null-next_agent row $AC5_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-5: no eligible no-detail-entry non-dev-board-owner/null-next_agent fixture candidate in live data"
fi

# AC-6: SYNTHETIC (no clean live example — see header). Case-b: no detail
# entry, non-dev board owner, NON-EMPTY board next_agent -> must be promoted.
make_synthetic_ac6_state "$WORK/ac6.json"
AC6_PICKED=$(run_promote_picked_id "$WORK/ac6.json")
if [ "$AC6_PICKED" = "ZZ-SYNTH-AC6-NONDEV-OWNER-ROUTED" ]; then
  echo "[PASS] AC-6 (synthetic): no-detail-entry non-dev-owner + non-empty next_agent row IS still promoted (picked='$AC6_PICKED')"
else
  echo "[FAIL] AC-6 regression (synthetic): no-detail-entry non-dev-owner + non-empty next_agent row was NOT promoted (picked='${AC6_PICKED:-<none>}')"
  FAIL=1
fi

# AC-7a: SYNTHETIC. Detail owner="po" (non-dev) vs board owner="developer"
# (dev-role), next_agent null -> MUST be gated (detail wins over dev-role
# board owner -- proves effective_owner does not silently prefer board when
# a non-empty detail owner is present).
make_synthetic_ac7a "$WORK/ac7a-state.json" "$WORK/ac7a-detail.json"
AC7A_PICKED=$(run_promote_picked_id_with_detail "$WORK/ac7a-state.json" "$WORK/ac7a-detail.json")
if [ "$AC7A_PICKED" = "ZZ-SYNTH-AC7A-DETAIL-WINS" ]; then
  echo "[FAIL] AC-7a regression (synthetic): detail owner (non-dev) did NOT win over dev-role board owner — row WAS promoted"
  FAIL=1
else
  echo "[PASS] AC-7a (synthetic): detail owner (non-dev) wins over dev-role board owner — NOT promoted (picked='${AC7A_PICKED:-<none>}')"
fi

# AC-7b: SYNTHETIC reverse of AC-7a. Detail owner="developer" (dev-role) vs
# board owner="po" (non-dev), next_agent null -> must NOT be gated (detail
# dev-role wins, pre-existing behavior unchanged by this fix).
make_synthetic_ac7b "$WORK/ac7b-state.json" "$WORK/ac7b-detail.json"
AC7B_PICKED=$(run_promote_picked_id_with_detail "$WORK/ac7b-state.json" "$WORK/ac7b-detail.json")
if [ "$AC7B_PICKED" = "ZZ-SYNTH-AC7B-DETAIL-WINS-REV" ]; then
  echo "[PASS] AC-7b (synthetic): detail owner (dev-role) wins over non-dev board owner — still promoted (picked='$AC7B_PICKED')"
else
  echo "[FAIL] AC-7b regression (synthetic): detail owner (dev-role) did NOT win over non-dev board owner — row was NOT promoted"
  FAIL=1
fi

if [ -n "$AC8_ID" ]; then
  make_isolated_fixture "$AC8_ID" "$WORK/ac8.json"
  PICKED=$(run_promote_picked_id "$WORK/ac8.json")
  if [ "$PICKED" = "$AC8_ID" ]; then
    echo "[FAIL] AC-8 regression: no-detail-entry inline-non-dev-board-next_agent row $AC8_ID WAS promoted"
    FAIL=1
  else
    echo "[PASS] AC-8: no-detail-entry inline-non-dev-board-next_agent row $AC8_ID NOT promoted (picked='${PICKED:-<none>}')"
  fi
else
  echo "[SKIP] AC-8: no eligible no-detail-entry inline-non-dev-board-next_agent fixture candidate in live data"
fi

# AC-9: SYNTHETIC (no live row currently carries an inline board
# plan_only:true with no matching detail entry). Board-INLINE plan_only:true,
# no detail entry -> must NEVER be promoted.
make_synthetic_ac9_state "$WORK/ac9.json"
AC9_PICKED=$(run_promote_picked_id "$WORK/ac9.json")
if [ "$AC9_PICKED" = "ZZ-SYNTH-AC9-BOARD-PLAN-ONLY" ]; then
  echo "[FAIL] AC-9 regression (synthetic): no-detail-entry board-inline plan_only:true row WAS promoted"
  FAIL=1
else
  echo "[PASS] AC-9 (synthetic): no-detail-entry board-inline plan_only:true row NOT promoted (picked='${AC9_PICKED:-<none>}')"
fi

# AC-10: SYNTHETIC control. No detail entry, board-INLINE next_agent:
# "developer" (dev-role) -> must still be promoted (effective_next_agent's
# board-fallback does not over-block a genuinely dev-routable row).
make_synthetic_ac10_state "$WORK/ac10.json"
AC10_PICKED=$(run_promote_picked_id "$WORK/ac10.json")
if [ "$AC10_PICKED" = "ZZ-SYNTH-AC10-DEV-NEXTAGENT-ROUTED" ]; then
  echo "[PASS] AC-10 (synthetic): no-detail-entry dev-role board next_agent row IS still promoted (picked='$AC10_PICKED')"
else
  echo "[FAIL] AC-10 regression (synthetic): no-detail-entry dev-role board next_agent row was NOT promoted (picked='${AC10_PICKED:-<none>}')"
  FAIL=1
fi

if [ -n "$CONTROL_ID" ]; then
  make_isolated_fixture "$CONTROL_ID" "$WORK/control.json"
  PICKED=$(run_promote_picked_id "$WORK/control.json")
  if [ "$PICKED" = "$CONTROL_ID" ]; then
    echo "[PASS] control: clean row $CONTROL_ID still promoted (gates do not over-block)"
  else
    echo "[FAIL] control regression: clean row $CONTROL_ID was NOT promoted (picked='${PICKED:-<none>}')"
    FAIL=1
  fi
else
  echo "[SKIP] control: no eligible clean fixture candidate in live data"
fi

exit $FAIL
