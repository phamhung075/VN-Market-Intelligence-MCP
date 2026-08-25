#!/usr/bin/env bash
# scripts/lib/resolve-task-lane-by-id.test.sh — Regression test for
# scripts/lib/resolve-task-lane-by-id.jq
#
# FIX-ORPHAN-FR4-FR5-FLOW-DEVTEAM-ADOPTION-GUARD (developer, 2026-08-25).
# Pure-jq module, no live-file mutation — builds a throwaway synthetic
# orch-state.json (all 7 flat lanes + nested active_sprints) and a synthetic
# cold-archive fixture, then asserts:
#   - lane_map resolves every id present, across all 8 shapes
#   - bare_id strips the "task:" prefix (EC-1), is idempotent on an
#     already-bare id
#   - resolve_lane finds a row by prefixed OR bare id, same lane_map
#   - not-found returns null (never defaults to an "active" lane)
#   - supervised field surfaces on the resolved tuple (subtask 2(ii) input)
#   - a synthetic cold-archive fixture (done_tasks[] + closed_sprints[].tasks[])
#     resolves independently of the hot lane_map, mirroring the real
#     docs/data/orch/archive/*.json shape (live-verified separately against
#     TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY in the Implementation Record)

set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

JQ_MODULE="scripts/lib/resolve-task-lane-by-id"

SANDBOX="$(mktemp -d 2>/dev/null)"
[ -z "$SANDBOX" ] && { echo "FAIL: mktemp -d failed"; exit 1; }
cleanup() { rm -rf "$SANDBOX"; }
trap cleanup EXIT

PASS=0
FAIL=0

assert_eq() {
  local label="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    PASS=$((PASS + 1))
  else
    FAIL=$((FAIL + 1))
    echo "FAIL: $label — expected [$expected] got [$actual]"
  fi
}

cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

# ---- synthetic hot-board fixture: one row per lane + one nested ----
FIXTURE="$SANDBOX/orch-state.json"
cat > "$FIXTURE" <<'JSON'
{
  "task_board": {
    "backlog":       [{"id": "T-BACKLOG",  "status": "BACKLOG",  "supervised": false}],
    "ready":         [{"id": "T-READY",    "status": "READY",    "supervised": false}],
    "in_progress":   [{"id": "T-INPROG",   "status": "IN_PROGRESS", "supervised": true}],
    "review":        [{"id": "T-REVIEW",   "status": "REVIEW",   "supervised": false}],
    "qa":            [{"id": "T-QA",       "status": "QA",       "supervised": false}],
    "done":          [{"id": "T-DONE",     "status": "DONE",     "supervised": false}],
    "done_verified": [{"id": "T-DONEVER",  "status": "DONE_VERIFIED", "supervised": false}],
    "active_sprints": [
      {"id": "SPRINT-1", "tasks": [
        {"id": "T-NESTED-ACTIVE", "status": "IN_PROGRESS"},
        {"id": "T-NESTED-TERM",   "status": "DONE_VERIFIED"}
      ]}
    ]
  }
}
JSON

T1=$(jq -r --arg mod "$JQ_MODULE" "include \"$JQ_MODULE\"; lane_map | .[\"T-BACKLOG\"].lane" "$FIXTURE")
assert_eq "backlog lane resolves" "backlog" "$T1"

T2=$(jq -r "include \"$JQ_MODULE\"; lane_map | .[\"T-NESTED-ACTIVE\"].lane" "$FIXTURE")
assert_eq "nested active_sprints lane resolves" "active_sprints" "$T2"

T3=$(jq -r "include \"$JQ_MODULE\"; lane_map | .[\"T-INPROG\"].supervised" "$FIXTURE")
assert_eq "supervised field surfaces" "true" "$T3"

# ---- bare_id / prefix stripping (EC-1) ----
T4=$(jq -rn "include \"$JQ_MODULE\"; bare_id(\"task:FIX-X\")")
assert_eq "bare_id strips task: prefix" "FIX-X" "$T4"

T5=$(jq -rn "include \"$JQ_MODULE\"; bare_id(\"FIX-X\")")
assert_eq "bare_id idempotent on already-bare id" "FIX-X" "$T5"

# ---- resolve_lane: prefixed and bare both hit the same tuple ----
T6=$(jq -r "include \"$JQ_MODULE\"; lane_map as \$m | resolve_lane(\$m; \"task:T-READY\").lane" "$FIXTURE")
assert_eq "resolve_lane finds prefixed id" "ready" "$T6"

T7=$(jq -r "include \"$JQ_MODULE\"; lane_map as \$m | resolve_lane(\$m; \"T-READY\").lane" "$FIXTURE")
assert_eq "resolve_lane finds bare id" "ready" "$T7"

# ---- not-found never defaults to an active lane ----
T8=$(jq -c "include \"$JQ_MODULE\"; lane_map as \$m | resolve_lane(\$m; \"task:GHOST-ROW\")" "$FIXTURE")
assert_eq "not-found resolves to null (never active)" "null" "$T8"

# ---- every flat lane covered in one pass (EC-2 — no flat-lane blindness) ----
T9=$(jq -r "include \"$JQ_MODULE\"; lane_map | length" "$FIXTURE")
assert_eq "lane_map indexes all 9 fixture rows (7 flat + 2 nested)" "9" "$T9"

# ---- cold-archive fallback shape (caller-side pattern this module documents,
# not a lane_map/resolve_lane call — asserts the real archive query the flow
# docs use when lane_map misses, per this file's own header) ----
ARCHIVE_FIXTURE="$SANDBOX/archive-2026-01.json"
cat > "$ARCHIVE_FIXTURE" <<'JSON'
{
  "done_tasks": [{"id": "T-COLD-DONE", "status": "DONE_VERIFIED", "supervised": false}],
  "closed_sprints": [
    {"id": "SPRINT-OLD", "tasks": [{"id": "T-COLD-NESTED", "status": "DONE_VERIFIED", "supervised": false}]}
  ]
}
JSON

T10=$(jq -c --arg id "T-COLD-DONE" -s '
  [.[] | (.done_tasks[]?, (.closed_sprints[]?.tasks[]?))] | map(select(.id == $id)) | first.status
' "$ARCHIVE_FIXTURE")
assert_eq "cold-archive done_tasks[] resolves" '"DONE_VERIFIED"' "$T10"

T11=$(jq -c --arg id "T-COLD-NESTED" -s '
  [.[] | (.done_tasks[]?, (.closed_sprints[]?.tasks[]?))] | map(select(.id == $id)) | first.status
' "$ARCHIVE_FIXTURE")
assert_eq "cold-archive closed_sprints[].tasks[] resolves" '"DONE_VERIFIED"' "$T11"

T12=$(jq -c --arg id "T-GHOST-NOWHERE" -s '
  [.[] | (.done_tasks[]?, (.closed_sprints[]?.tasks[]?))] | map(select(.id == $id)) | first // null
' "$ARCHIVE_FIXTURE")
assert_eq "cold-archive not-found returns null" "null" "$T12"

echo ""
echo "=== resolve-task-lane-by-id.jq: $PASS pass, $FAIL fail ==="
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
