#!/usr/bin/env bash
# test-devteam-bounded1-supervised-flag.sh — hermetic gate for the
# detail-authoritative supervised filter in
# scripts/devteam-backlog-promote-bounded1.jq.
#
# OWNING TASK: FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE
# OWNING FLOW: docs/agents/dev-team/flow/main.md § Idle-capacity backlog
#   pickup (BOUNDED-1)
#
# ROOT CAUSE UNDER TEST: on 2026-07-09T15:48Z the promote script auto-
# promoted+claimed FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (a P0 row explicitly
# marked "NOT a BOUNDED-1 auto-pickup target", supervised since
# 2026-07-04T19:23:49Z) into in_progress. The old filter
# (`select((.value.supervised // false) != true)`) read `supervised` ONLY off
# the thin task_board.backlog[] row, but `supervised:true` is authoritatively
# written to docs/data/orch/archive/backlog-detail.json
# `.items[<id>].supervised` for detail_ref'd rows — so the check silently
# evaluated false for every detail_ref'd supervised row (all 8 in the Phase-1
# set). This test proves the shipped `effective_supervised` gate now blocks
# that class structurally, in BOTH shapes supervised can live in (inline on
# the board row, or only inside backlog-detail.json), that it also blocks the
# case where BOTH locations carry the flag, and that it does NOT regress the
# common unsupervised case.
#
# USAGE: bash scripts/test-devteam-bounded1-supervised-flag.sh
#        exit 0 = all cases pass; exit 1 = a case failed (gate is RED).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHIPPED="$REPO_ROOT/scripts/devteam-backlog-promote-bounded1.jq"
FLOW_DOC="$REPO_ROOT/docs/agents/dev-team/flow/main.md"

PASS=0
FAIL=0
check() {
  local name="$1" got="$2" want="$3"
  if [ "$got" = "$want" ]; then
    echo "[test] PASS: $name (got=$got)"
    PASS=$((PASS + 1))
  else
    echo "[test] FAIL: $name — got=$got want=$want" >&2
    FAIL=$((FAIL + 1))
  fi
}

TMP="$(mktemp -d -t devteam-bounded1-supervised-flag-XXXXXX)"
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

NOW="2026-07-09T00:00:00Z"

# run_promote <orch-state-fixture.json> <backlog-detail-fixture.json>
# -> prints the promote script's output document on stdout.
run_promote() {
  local orch="$1" detail="$2"
  jq --arg now "$NOW" --slurpfile detail "$detail" -f "$SHIPPED" "$orch"
}

EMPTY_DETAIL="$TMP/detail-empty.json"
echo '{"items": {}}' > "$EMPTY_DETAIL"

# ── STATIC PROOF: shipped script defines the detail-authoritative gate ──
check "shipped script defines effective_supervised (detail-lookup path)" \
  "$(grep -c 'def effective_supervised' "$SHIPPED")" "1"
check "candidate-selection filter calls effective_supervised" \
  "$(grep -c 'effective_supervised(\$detail_items)' "$SHIPPED")" "2"
flow_slurp_count="$(grep -c -- '--slurpfile detail' "$FLOW_DOC")"
check "dev-team flow doc still threads --slurpfile detail (unchanged call site)" \
  "$([ "$flow_slurp_count" -ge 1 ] && echo present || echo absent)" "present"

echo "[test] -------- Case (a): supervised ONLY in backlog-detail.json .items[] (board row has no flag) -> SKIPPED (the exact 2026-07-09 failure reproduced) --------"
cat > "$TMP/orch-a.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-DETAIL-ONLY-SUPERVISED","status":"BACKLOG","priority":"P0","depends_on":[],"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-DETAIL-ONLY-SUPERVISED"},
      {"id":"ELIGIBLE-FALLBACK-A","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-a.json" <<'JSON'
{"items": {"CAND-DETAIL-ONLY-SUPERVISED": {"id":"CAND-DETAIL-ONLY-SUPERVISED","supervised":true}}}
JSON
out_a=$(run_promote "$TMP/orch-a.json" "$TMP/detail-a.json")
check "CaseA: detail-only-supervised P0 row NOT promoted (reproduces the 07-09 near-miss)" \
  "$(echo "$out_a" | jq '[.task_board.ready[] | select(.id=="CAND-DETAIL-ONLY-SUPERVISED")] | length')" "0"
check "CaseA: detail-only-supervised row stays in backlog untouched" \
  "$(echo "$out_a" | jq '[.task_board.backlog[] | select(.id=="CAND-DETAIL-ONLY-SUPERVISED")] | length')" "1"
check "CaseA: lower-ranked but eligible P1 row promoted instead" \
  "$(echo "$out_a" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-A"

echo "[test] -------- Case (b): supervised ONLY on the board row (router-stamp case) -> SKIPPED --------"
cat > "$TMP/orch-b.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-BOARD-ONLY-SUPERVISED","status":"BACKLOG","priority":"P0","depends_on":[],"detail_ref":null,"supervised":true},
      {"id":"ELIGIBLE-FALLBACK-B","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
out_b=$(run_promote "$TMP/orch-b.json" "$EMPTY_DETAIL")
check "CaseB: board-only-supervised P0 row NOT promoted (baseline behavior preserved)" \
  "$(echo "$out_b" | jq '[.task_board.ready[] | select(.id=="CAND-BOARD-ONLY-SUPERVISED")] | length')" "0"
check "CaseB: board-only-supervised row stays in backlog untouched" \
  "$(echo "$out_b" | jq '[.task_board.backlog[] | select(.id=="CAND-BOARD-ONLY-SUPERVISED")] | length')" "1"
check "CaseB: lower-ranked but eligible P1 row promoted instead" \
  "$(echo "$out_b" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-B"

echo "[test] -------- Case (c): supervised in NEITHER location -> promoted (baseline, no regression) --------"
cat > "$TMP/orch-c.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-UNSUPERVISED","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-UNSUPERVISED"}
    ]
  }
}
JSON
cat > "$TMP/detail-c.json" <<'JSON'
{"items": {"CAND-UNSUPERVISED": {"id":"CAND-UNSUPERVISED","supervised":false}}}
JSON
out_c=$(run_promote "$TMP/orch-c.json" "$TMP/detail-c.json")
check "CaseC: unsupervised in both places -> promoted (baseline)" \
  "$(echo "$out_c" | jq -r '.task_board.ready[0].id // "NONE"')" "CAND-UNSUPERVISED"

echo "[test] -------- Case (c2): supervised key absent entirely in both places -> promoted (conservative default) --------"
cat > "$TMP/orch-c2.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-NO-SUPERVISED-KEY","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null}
    ]
  }
}
JSON
out_c2=$(run_promote "$TMP/orch-c2.json" "$EMPTY_DETAIL")
check "CaseC2: supervised key missing everywhere -> promoted (conservative default = promotable)" \
  "$(echo "$out_c2" | jq -r '.task_board.ready[0].id // "NONE"')" "CAND-NO-SUPERVISED-KEY"

echo "[test] -------- Case (d): supervised in BOTH locations -> SKIPPED --------"
cat > "$TMP/orch-d.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-BOTH-SUPERVISED","status":"BACKLOG","priority":"P0","depends_on":[],"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-BOTH-SUPERVISED","supervised":true},
      {"id":"ELIGIBLE-FALLBACK-D","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-d.json" <<'JSON'
{"items": {"CAND-BOTH-SUPERVISED": {"id":"CAND-BOTH-SUPERVISED","supervised":true}}}
JSON
out_d=$(run_promote "$TMP/orch-d.json" "$TMP/detail-d.json")
check "CaseD: supervised-in-both P0 row NOT promoted" \
  "$(echo "$out_d" | jq '[.task_board.ready[] | select(.id=="CAND-BOTH-SUPERVISED")] | length')" "0"
check "CaseD: lower-ranked but eligible P1 row promoted instead" \
  "$(echo "$out_d" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-D"

echo "[test] -------- Bonus: ARRAY-shaped detail .items (live-data shape, FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX) resolves supervised correctly, no crash --------"
cat > "$TMP/orch-e.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-ARRAYSHAPE-SUPERVISED","status":"BACKLOG","priority":"P0","depends_on":[],"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-ARRAYSHAPE-SUPERVISED"},
      {"id":"ELIGIBLE-FALLBACK-E","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-e.json" <<'JSON'
{"items": [
  {"id":"UNRELATED-ROW","supervised":false},
  {"id":"CAND-ARRAYSHAPE-SUPERVISED","supervised":true}
]}
JSON
out_e=$(run_promote "$TMP/orch-e.json" "$TMP/detail-e.json")
check "Bonus: ARRAY-shaped detail .items -> supervised row NOT promoted (no crash)" \
  "$(echo "$out_e" | jq '[.task_board.ready[] | select(.id=="CAND-ARRAYSHAPE-SUPERVISED")] | length')" "0"
check "Bonus: eligible fallback row promoted instead" \
  "$(echo "$out_e" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-E"

echo "[test] -------- $PASS passed, $FAIL failed --------"
[ "$FAIL" -eq 0 ] || exit 1
echo "[test] ALL CASES PASS — supervised gate blocks detail-only, board-only, and both-location supervised candidates (never starves an eligible lower-ranked row), and does not regress the unsupervised/absent-key common case."
exit 0
