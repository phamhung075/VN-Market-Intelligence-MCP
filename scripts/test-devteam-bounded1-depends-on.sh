#!/usr/bin/env bash
# test-devteam-bounded1-depends-on.sh — hermetic gate for the depends_on
# eligibility filter in scripts/devteam-backlog-promote-bounded1.jq.
#
# OWNING TASK: FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE
# OWNING FLOW: docs/agents/dev-team/flow/main.md § Idle-capacity backlog
#   pickup (BOUNDED-1)
#
# ROOT CAUSE UNDER TEST: on 2026-07-08 the promote script auto-promoted+
# claimed FACTORY-TECHANALYSIS-delete-orphaned-ts-service (P1) while its OWN
# declared depends_on ([FACTORY-TECHANALYSIS-go-livepath-tests,
# FACTORY-TECHANALYSIS-reconcile-ta-contract]) were both still plain BACKLOG.
# There was no depends_on eligibility check at all. dev-team caught it
# pre-dispatch and reverted by hand. This test proves the shipped gate now
# blocks that class structurally, in BOTH shapes depends_on can live in
# (inline on the board row, or only inside backlog-detail.json for
# detail_ref'd rows), and that it does NOT regress the common no-deps case.
#
# USAGE: bash scripts/test-devteam-bounded1-depends-on.sh
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

TMP="$(mktemp -d -t devteam-bounded1-depends-on-XXXXXX)"
# shellcheck disable=SC2329  # invoked via `trap cleanup EXIT INT TERM` below
cleanup() { rm -rf "$TMP" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

NOW="2026-07-08T00:00:00Z"

# run_promote <orch-state-fixture.json> <backlog-detail-fixture.json>
# -> prints the promote script's output document on stdout.
run_promote() {
  local orch="$1" detail="$2"
  jq --arg now "$NOW" --slurpfile detail "$detail" -f "$SHIPPED" "$orch"
}

EMPTY_DETAIL="$TMP/detail-empty.json"
echo '{"items": {}}' > "$EMPTY_DETAIL"

# ── STATIC PROOF: shipped script + flow call site both thread --slurpfile ──
check "shipped script Usage comment requires --slurpfile detail" \
  "$(grep -c -- '--slurpfile detail' "$SHIPPED")" "2"
check "shipped script defines effective_depends_on (detail-lookup path)" \
  "$(grep -c 'def effective_depends_on' "$SHIPPED")" "1"
flow_slurp_count="$(grep -c -- '--slurpfile detail' "$FLOW_DOC")"
check "dev-team flow doc threads --slurpfile detail (BOUNDED-1 call site + description)" \
  "$([ "$flow_slurp_count" -ge 1 ] && echo present || echo absent)" "present"

echo "[test] -------- Case 1: inline depends_on ALL DONE_VERIFIED -> promoted (baseline) --------"
cat > "$TMP/orch-1.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-INLINE-SAT","status":"BACKLOG","priority":"P1","depends_on":["DEP-A"],"detail_ref":null,"supervised":false}
    ],
    "done_verified": [
      {"id":"DEP-A","status":"DONE_VERIFIED"}
    ]
  }
}
JSON
out1=$(run_promote "$TMP/orch-1.json" "$EMPTY_DETAIL")
check "Case1: satisfied inline depends_on -> row promoted to ready" \
  "$(echo "$out1" | jq -r '.task_board.ready[0].id // "NONE"')" "CAND-INLINE-SAT"
check "Case1: promoted row removed from backlog" \
  "$(echo "$out1" | jq '[.task_board.backlog[] | select(.id=="CAND-INLINE-SAT")] | length')" "0"

echo "[test] -------- Case 1b: detail_ref-resolved depends_on ALL DONE_VERIFIED -> promoted --------"
cat > "$TMP/orch-1b.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"CAND-DETAILREF-SAT","status":"BACKLOG","priority":"P1","depends_on":null,"detail_ref":"docs/data/orch/archive/backlog-detail.json#CAND-DETAILREF-SAT","supervised":false}
    ],
    "done_verified": [
      {"id":"DEP-B","status":"DONE_VERIFIED"}
    ]
  }
}
JSON
cat > "$TMP/detail-1b.json" <<'JSON'
{"items": {"CAND-DETAILREF-SAT": {"id":"CAND-DETAILREF-SAT","depends_on":["DEP-B"]}}}
JSON
out1b=$(run_promote "$TMP/orch-1b.json" "$TMP/detail-1b.json")
check "Case1b: satisfied detail_ref-resolved depends_on -> row promoted" \
  "$(echo "$out1b" | jq -r '.task_board.ready[0].id // "NONE"')" "CAND-DETAILREF-SAT"

echo "[test] -------- Case 2: unsatisfied inline depends_on -> skipped, next-eligible promoted --------"
cat > "$TMP/orch-2.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"BLOCKED-TOP-P0","status":"BACKLOG","priority":"P0","depends_on":["DEP-UNSTARTED"],"detail_ref":null,"supervised":false},
      {"id":"DEP-UNSTARTED","status":"BACKLOG","priority":"P2","depends_on":[],"detail_ref":null,"supervised":false},
      {"id":"ELIGIBLE-NEXT-P1","status":"BACKLOG","priority":"P1","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
out2=$(run_promote "$TMP/orch-2.json" "$EMPTY_DETAIL")
check "Case2: blocked P0 top pick NOT promoted" \
  "$(echo "$out2" | jq '[.task_board.ready[] | select(.id=="BLOCKED-TOP-P0")] | length')" "0"
check "Case2: blocked P0 row stays in backlog untouched" \
  "$(echo "$out2" | jq '[.task_board.backlog[] | select(.id=="BLOCKED-TOP-P0")] | length')" "1"
check "Case2: lower-ranked but eligible P1 row promoted instead" \
  "$(echo "$out2" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-NEXT-P1"

echo "[test] -------- Case 2b: unsatisfied detail_ref depends_on -> skipped (production-bug shape) --------"
cat > "$TMP/orch-2b.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"BLOCKED-DETAILREF","status":"BACKLOG","priority":"P0","depends_on":null,"detail_ref":"docs/data/orch/archive/backlog-detail.json#BLOCKED-DETAILREF","supervised":false},
      {"id":"PREREQ-STILL-BACKLOG","status":"BACKLOG","priority":"P3","depends_on":[],"detail_ref":null,"supervised":false},
      {"id":"ELIGIBLE-FALLBACK","status":"BACKLOG","priority":"P2","depends_on":[],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-2b.json" <<'JSON'
{"items": {"BLOCKED-DETAILREF": {"depends_on":["PREREQ-STILL-BACKLOG"]}}}
JSON
out2b=$(run_promote "$TMP/orch-2b.json" "$TMP/detail-2b.json")
check "Case2b: detail_ref-blocked P0 row NOT promoted (mirrors the live 2026-07-08 incident)" \
  "$(echo "$out2b" | jq '[.task_board.ready[] | select(.id=="BLOCKED-DETAILREF")] | length')" "0"
check "Case2b: eligible fallback row promoted instead" \
  "$(echo "$out2b" | jq -r '.task_board.ready[0].id // "NONE"')" "ELIGIBLE-FALLBACK"

echo "[test] -------- Case 3a: no depends_on at all (inline null, no detail_ref) -> promoted --------"
cat > "$TMP/orch-3a.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"NO-DEPS-PLAIN","status":"BACKLOG","priority":"P1","depends_on":null,"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
out3a=$(run_promote "$TMP/orch-3a.json" "$EMPTY_DETAIL")
check "Case3a: no depends_on inline + no detail_ref -> promoted (no regression)" \
  "$(echo "$out3a" | jq -r '.task_board.ready[0].id // "NONE"')" "NO-DEPS-PLAIN"

echo "[test] -------- Case 3b: detail_ref present but no depends_on key -> promoted --------"
cat > "$TMP/orch-3b.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"DETAILREF-NO-DEPKEY","status":"BACKLOG","priority":"P1","depends_on":null,"detail_ref":"docs/data/orch/archive/backlog-detail.json#DETAILREF-NO-DEPKEY","supervised":false}
    ]
  }
}
JSON
cat > "$TMP/detail-3b.json" <<'JSON'
{"items": {"DETAILREF-NO-DEPKEY": {"id":"DETAILREF-NO-DEPKEY","note":"no depends_on key at all"}}}
JSON
out3b=$(run_promote "$TMP/orch-3b.json" "$TMP/detail-3b.json")
check "Case3b: detail_ref row with no depends_on key -> promoted (no regression)" \
  "$(echo "$out3b" | jq -r '.task_board.ready[0].id // "NONE"')" "DETAILREF-NO-DEPKEY"

echo "[test] -------- Case 4: dep id resolves in NO task_board lane -> conservative-skip --------"
cat > "$TMP/orch-4.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"GHOST-DEP-CANDIDATE","status":"BACKLOG","priority":"P1","depends_on":["NONEXISTENT-NOWHERE-ID"],"detail_ref":null,"supervised":false}
    ]
  }
}
JSON
out4=$(run_promote "$TMP/orch-4.json" "$EMPTY_DETAIL")
check "Case4: dep resolves nowhere -> NOT promoted (conservative-skip)" \
  "$(echo "$out4" | jq '.task_board.ready | length')" "0"
check "Case4: candidate stays in backlog untouched" \
  "$(echo "$out4" | jq '[.task_board.backlog[] | select(.id=="GHOST-DEP-CANDIDATE")] | length')" "1"

echo "[test] -------- Bonus: dep status DONE (not DONE_VERIFIED) is INSUFFICIENT --------"
cat > "$TMP/orch-5.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"DONE-ONLY-DEP-CANDIDATE","status":"BACKLOG","priority":"P1","depends_on":["DEP-ONLY-DONE"],"detail_ref":null,"supervised":false}
    ],
    "done": [
      {"id":"DEP-ONLY-DONE","status":"DONE"}
    ]
  }
}
JSON
out5=$(run_promote "$TMP/orch-5.json" "$EMPTY_DETAIL")
check "Bonus: plain DONE dep does NOT satisfy the gate -> NOT promoted" \
  "$(echo "$out5" | jq '.task_board.ready | length')" "0"

echo "[test] -------- Bonus: dep status is a bare STRING in backlog-detail.json (real drift) --------"
# 7/321 rows in the live backlog-detail.json carry depends_on as a plain string,
# not a 1-element array. Prove the normalizer handles it without a jq type error.
cat > "$TMP/orch-6.json" <<'JSON'
{
  "task_board": {
    "backlog": [
      {"id":"STRING-DEP-CANDIDATE","status":"BACKLOG","priority":"P1","depends_on":null,"detail_ref":"docs/data/orch/archive/backlog-detail.json#STRING-DEP-CANDIDATE","supervised":false}
    ],
    "done_verified": [
      {"id":"DEP-STRING-FORM","status":"DONE_VERIFIED"}
    ]
  }
}
JSON
cat > "$TMP/detail-6.json" <<'JSON'
{"items": {"STRING-DEP-CANDIDATE": {"depends_on":"DEP-STRING-FORM"}}}
JSON
out6=$(run_promote "$TMP/orch-6.json" "$TMP/detail-6.json")
check "Bonus: string-form depends_on (real-data drift) resolves correctly -> promoted" \
  "$(echo "$out6" | jq -r '.task_board.ready[0].id // "NONE"')" "STRING-DEP-CANDIDATE"

echo "[test] -------- $PASS passed, $FAIL failed --------"
[ "$FAIL" -eq 0 ] || exit 1
echo "[test] ALL CASES PASS — depends_on gate blocks unsatisfied candidates (inline + detail_ref shapes), never starves an eligible lower-ranked row, and does not regress the no-deps common case."
exit 0
