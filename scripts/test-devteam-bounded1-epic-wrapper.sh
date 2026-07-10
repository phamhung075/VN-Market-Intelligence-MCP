#!/usr/bin/env bash
# test-devteam-bounded1-epic-wrapper.sh — hermetic gate for the
# detail-authoritative epic-wrapper (children[]) filter in
# scripts/devteam-backlog-promote-bounded1.jq.
#
# OWNING TASK: FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE
# OWNING FLOW: docs/agents/dev-team/flow/main.md § Idle-capacity backlog
#   pickup (BOUNDED-1)
#
# ROOT CAUSE UNDER TEST: on 2026-07-09T23:17Z the promote script auto-
# claimed the P1 epic AUDIT-FETCH-COMPLETE (mode=audit-epic, children=[4
# ids], no own next_agent/probe) for direct dispatch. dev-team reverted and
# point-fixed supervised:true onto that ONE row. A structurally identical
# second row, FACTORY-GUARD-CI-REGRESSION-SPIKE (children=[7 ids],
# supervised:null everywhere), remained exposed — the supervised gate does
# NOT catch supervised:null, so only a dedicated children[]-based gate
# protects it (and any future epic row nobody remembers to hand-stamp
# supervised). This test proves the shipped `is_epic_wrapper` gate now
# blocks that class structurally, in BOTH shapes children can live in
# (inline on the board row, or only inside backlog-detail.json), regardless
# of the supervised flag's value, and that it does NOT regress the common
# no-children case.
#
# USAGE: bash scripts/test-devteam-bounded1-epic-wrapper.sh
#        exit 0 = all cases pass; exit 1 = a case failed (gate is RED).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SHIPPED="$REPO_ROOT/scripts/devteam-backlog-promote-bounded1.jq"

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

TMP="$(mktemp -d -t devteam-bounded1-epic-wrapper-XXXXXX)"
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

NOW="2026-07-10T00:00:00Z"

# run_promote <orch-state-fixture.json> <backlog-detail-fixture.json>
# -> prints the promote script's output document on stdout.
run_promote() {
  local orch="$1" detail="$2"
  jq --arg now "$NOW" --slurpfile detail "$detail" -f "$SHIPPED" "$orch"
}

EMPTY_DETAIL="$TMP/detail-empty.json"
echo '{"items": {}}' > "$EMPTY_DETAIL"

# ── STATIC PROOF: shipped script defines the epic-wrapper gate ──
check "shipped script defines effective_children (detail-lookup path)" \
  "$(grep -c 'def effective_children' "$SHIPPED")" "1"
check "shipped script defines is_epic_wrapper" \
  "$(grep -c 'def is_epic_wrapper' "$SHIPPED")" "1"
check "candidate-selection filter calls is_epic_wrapper" \
  "$(grep -c 'is_epic_wrapper(\$detail_items)' "$SHIPPED")" "2"

echo "[test] -------- Case (a): children ONLY in backlog-detail.json .items[], supervised:null EVERYWHERE -> SKIPPED (the exact FACTORY-GUARD-CI-REGRESSION-SPIKE reproducer, live-data root-cause row) --------"
cat > "$TMP/orch-a.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"FACTORY-GUARD-CI-REGRESSION-SPIKE","status":"BACKLOG","priority":"P2","zone":"cross-service/","detail_ref":"docs/data/orch/archive/backlog-detail.json#FACTORY-GUARD-CI-REGRESSION-SPIKE","supervised":null},
      {"id":"ELIGIBLE-FALLBACK-A","status":"BACKLOG","priority":"P3","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-a.json" <<'JSON'
{"items": {"FACTORY-GUARD-CI-REGRESSION-SPIKE": {"id":"FACTORY-GUARD-CI-REGRESSION-SPIKE","mode":"spike","children":["FACTORY-GUARD-CI-size-lint-justification","FACTORY-GUARD-CI-metric-mask-lint","FACTORY-GUARD-CI-depguard-tier-boundaries","FACTORY-GUARD-CI-dead-code-gate","FACTORY-GUARD-CI-no-hardcode-allowlist-scan","FACTORY-GUARD-CI-shared-package-import-check","FACTORY-GUARD-CI-rebuild-raw-verify-hook"]}}}
JSON
out_a=$(run_promote "$TMP/orch-a.json" "$TMP/detail-a.json")
check "CaseA: detail-only-children (supervised:null) epic row NOT promoted (the live near-miss class)" \
  "$(echo "$out_a" | jq '[.task_board.ready[] | select(.id=="FACTORY-GUARD-CI-REGRESSION-SPIKE")] | length')" "0"
check "CaseA: epic-wrapper row stays in backlog untouched" \
  "$(echo "$out_a" | jq '[.task_board.backlog[] | select(.id=="FACTORY-GUARD-CI-REGRESSION-SPIKE")] | length')" "1"
check "CaseA: lower-ranked but eligible P3 row promoted instead" \
  "$(echo "$out_a" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-A"

echo "[test] -------- Case (b): children ONLY on the board row (inline) -> SKIPPED --------"
cat > "$TMP/orch-b.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-BOARD-ONLY-CHILDREN","status":"BACKLOG","priority":"P0","depends_on":[],"detail_ref":null,"supervised":false,"children":["CHILD-1","CHILD-2"]},
      {"id":"ELIGIBLE-FALLBACK-B","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
out_b=$(run_promote "$TMP/orch-b.json" "$EMPTY_DETAIL")
check "CaseB: board-only-children P0 row NOT promoted" \
  "$(echo "$out_b" | jq '[.task_board.ready[] | select(.id=="CAND-BOARD-ONLY-CHILDREN")] | length')" "0"
check "CaseB: board-only-children row stays in backlog untouched" \
  "$(echo "$out_b" | jq '[.task_board.backlog[] | select(.id=="CAND-BOARD-ONLY-CHILDREN")] | length')" "1"
check "CaseB: lower-ranked but eligible P1 row promoted instead" \
  "$(echo "$out_b" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-B"

echo "[test] -------- Case (c): AUDIT-FETCH-COMPLETE-shaped row — children present AND supervised:true (both gates would independently catch this one; confirms no regression on the already point-fixed row) -> SKIPPED --------"
cat > "$TMP/orch-c.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"AUDIT-FETCH-COMPLETE","status":"BACKLOG","priority":"P1","zone":"multi","detail_ref":"docs/data/orch/archive/backlog-detail.json#AUDIT-FETCH-COMPLETE","supervised":true},
      {"id":"ELIGIBLE-FALLBACK-C","status":"BACKLOG","priority":"P2","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-c.json" <<'JSON'
{"items": {"AUDIT-FETCH-COMPLETE": {"id":"AUDIT-FETCH-COMPLETE","mode":"audit-epic","children":["AUDIT-FC-FOREIGN-FLOW","AUDIT-FC-FRED-MACRO","AUDIT-FC-SBV-RATES","AUDIT-FC-NEWS-SENTIMENT"]}}}
JSON
out_c=$(run_promote "$TMP/orch-c.json" "$TMP/detail-c.json")
check "CaseC: AUDIT-FETCH-COMPLETE (children+supervised both true) NOT promoted" \
  "$(echo "$out_c" | jq '[.task_board.ready[] | select(.id=="AUDIT-FETCH-COMPLETE")] | length')" "0"
check "CaseC: eligible fallback row promoted instead" \
  "$(echo "$out_c" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-C"

echo "[test] -------- Case (d): children[] EMPTY ARRAY in both locations -> promoted (empty != epic wrapper) --------"
cat > "$TMP/orch-d.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-EMPTY-CHILDREN","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-EMPTY-CHILDREN","supervised":false,"children":[]}
    ]
  }
}
JSON
cat > "$TMP/detail-d.json" <<'JSON'
{"items": {"CAND-EMPTY-CHILDREN": {"id":"CAND-EMPTY-CHILDREN","children":[]}}}
JSON
out_d=$(run_promote "$TMP/orch-d.json" "$TMP/detail-d.json")
check "CaseD: empty children[] in both places -> promoted (not an epic wrapper)" \
  "$(echo "$out_d" | jq -r '.task_board.ready[0].id // "NONE"')" "CAND-EMPTY-CHILDREN"

echo "[test] -------- Case (e): children key absent entirely in both places -> promoted (conservative default, baseline no-regression) --------"
cat > "$TMP/orch-e.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-NO-CHILDREN-KEY","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
out_e=$(run_promote "$TMP/orch-e.json" "$EMPTY_DETAIL")
check "CaseE: children key missing everywhere -> promoted (conservative default = promotable)" \
  "$(echo "$out_e" | jq -r '.task_board.ready[0].id // "NONE"')" "CAND-NO-CHILDREN-KEY"

echo "[test] -------- Bonus: ARRAY-shaped detail .items (live-data shape, FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX) resolves children correctly, no crash --------"
cat > "$TMP/orch-f.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-ARRAYSHAPE-CHILDREN","status":"BACKLOG","priority":"P0","depends_on":[],"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-ARRAYSHAPE-CHILDREN"},
      {"id":"ELIGIBLE-FALLBACK-F","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-f.json" <<'JSON'
{"items": [
  {"id":"UNRELATED-ROW","children":[]},
  {"id":"CAND-ARRAYSHAPE-CHILDREN","children":["CHILD-X","CHILD-Y"]}
]}
JSON
out_f=$(run_promote "$TMP/orch-f.json" "$TMP/detail-f.json")
check "Bonus: ARRAY-shaped detail .items -> children row NOT promoted (no crash)" \
  "$(echo "$out_f" | jq '[.task_board.ready[] | select(.id=="CAND-ARRAYSHAPE-CHILDREN")] | length')" "0"
check "Bonus: eligible fallback row promoted instead" \
  "$(echo "$out_f" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK-F"

echo "[test] -------- $PASS passed, $FAIL failed --------"
[ "$FAIL" -eq 0 ] || exit 1
echo "[test] ALL CASES PASS — epic-wrapper gate blocks detail-only, board-only, and both-signal children[] candidates (independent of the supervised flag's value; never starves an eligible lower-ranked row), and does not regress the no-children/empty-children common case."
exit 0
