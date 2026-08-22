#!/usr/bin/env bash
# scripts/audits/guard-signal-type-coverage.test.sh
#
# Test suite for scripts/audits/guard-signal-type-coverage.sh
# (FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE, 2026-08-22).
#
# Uses GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE / GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE
# to point the script at small, disposable fixture docs under mktemp instead
# of the real (ever-changing) production tables — so this suite never drifts
# out of sync with live doc edits and never touches a real file.
#
# Usage: bash scripts/audits/guard-signal-type-coverage.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/audits/guard-signal-type-coverage.sh"

[ -f "$SCRIPT" ] || { echo "FATAL: $SCRIPT not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FATAL: jq not found in PATH"; exit 1; }

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$1"; }

FIXTURE_DIR=$(mktemp -d "/tmp/guard-signal-type-coverage-test-XXXXXX")
trap 'rm -rf "$FIXTURE_DIR"' EXIT

TRIAGE_FIXTURE="$FIXTURE_DIR/triage-signals.md"
LONGTAIL_FIXTURE="$FIXTURE_DIR/triage-signals-longtail.md"
ORCH_FIXTURE="$FIXTURE_DIR/orch-state.json"

# Minimal Pipeline-B table shaped exactly like the real doc: a Pipeline-A
# table ABOVE it (must be ignored — different pipeline, same backtick-first-
# column shape) then the real "## Live ... inbox" section the parser scopes
# to, terminated by "### Regression verifier".
write_triage_fixture() {
cat > "$TRIAGE_FIXTURE" <<'EOF'
# Fixture triage doc

For each signal in `pendingSignals[]` (Pipeline A):

| Signal `type` | From | Action | Routing |
|---|---|---|---|
| `pipeline_a_only_type` | `some-agent` | Pipeline-A row — must NOT count as Pipeline-B coverage | skip |

## Live `.signal_queue.rows[]` inbox (Pipeline B, `to==po`)

| `type` | From | Action | Routing |
|---|---|---|---|
| `alpha_type` | `agent-x` | test row | FIX |
| `beta_type` | `agent-y` | test row | FIX |

### Regression verifier — signal-type coverage guard

(guard section — parser must stop scoping here)
EOF
}

write_longtail_fixture() {
cat > "$LONGTAIL_FIXTURE" <<'EOF'
# Fixture longtail doc

| `type` | From | Action | Routing |
|---|---|---|---|
| `gamma_type` | `agent-z` | longtail test row | FIX |
EOF
}

run_guard() {
  GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE="$TRIAGE_FIXTURE" \
  GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE="$LONGTAIL_FIXTURE" \
  bash "$SCRIPT" --check "$ORCH_FIXTURE"
}

write_triage_fixture
write_longtail_fixture

echo "=== TEST 1: all live to=po types routed -> PASS, exit 0 ==="
jq -n '{signal_queue:{rows:[
  {to:"po", type:"alpha_type"},
  {to:"po", type:"beta_type"},
  {to:"po", type:"gamma_type"},
  {to:"other-agent", type:"unrelated_type"}
]}}' > "$ORCH_FIXTURE"

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST1 exit 0"; else fail "TEST1 expected exit 0, got $rc — output: $out"; fi
if echo "$out" | grep -q "PASS"; then pass "TEST1 output names PASS"; else fail "TEST1 output missing PASS marker — got: $out"; fi

echo ""
echo "=== TEST 2: one unrouted to=po type -> FAIL, exit 1, names the type ==="
jq -n '{signal_queue:{rows:[
  {to:"po", type:"alpha_type"},
  {to:"po", type:"zz-unrouted-fixture-type"}
]}}' > "$ORCH_FIXTURE"

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST2 exit 1"; else fail "TEST2 expected exit 1, got $rc — output: $out"; fi
if echo "$out" | grep -q "zz-unrouted-fixture-type"; then pass "TEST2 output names the offending type"; else fail "TEST2 output did not name offending type — got: $out"; fi
if echo "$out" | grep -q "alpha_type"; then fail "TEST2 output should NOT re-list the already-routed type as unrouted — got: $out"; else pass "TEST2 does not falsely flag the routed type"; fi

echo ""
echo "=== TEST 3: a Pipeline-A-only type must NOT satisfy Pipeline-B coverage ==="
jq -n '{signal_queue:{rows:[
  {to:"po", type:"pipeline_a_only_type"}
]}}' > "$ORCH_FIXTURE"

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST3 exit 1 — Pipeline-A row does not leak into Pipeline-B coverage"; else fail "TEST3 expected exit 1 (Pipeline-A row must not count), got $rc — output: $out"; fi

echo ""
echo "=== TEST 4: longtail-sibling row DOES count as coverage ==="
jq -n '{signal_queue:{rows:[
  {to:"po", type:"gamma_type"}
]}}' > "$ORCH_FIXTURE"

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST4 exit 0 — longtail-only type is routed"; else fail "TEST4 expected exit 0, got $rc — output: $out"; fi

echo ""
echo "=== TEST 5: to!=po rows are ignored entirely ==="
jq -n '{signal_queue:{rows:[
  {to:"someone-else", type:"totally_unrouted_but_not_po"}
]}}' > "$ORCH_FIXTURE"

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST5 exit 0 — non-po rows never trip the guard"; else fail "TEST5 expected exit 0, got $rc — output: $out"; fi

echo ""
echo "=== TEST 6: missing orch-state file -> FATAL, exit 1 ==="
out=$(GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE="$TRIAGE_FIXTURE" GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE="$LONGTAIL_FIXTURE" bash "$SCRIPT" --check "$FIXTURE_DIR/does-not-exist.json" 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST6 exit 1 on missing orch-state file"; else fail "TEST6 expected exit 1, got $rc — output: $out"; fi
if echo "$out" | grep -q "FATAL"; then pass "TEST6 output says FATAL"; else fail "TEST6 output missing FATAL — got: $out"; fi

echo ""
echo "=== TEST 7: real live docs + real live orch-state.json -> PASS (integration smoke test) ==="
out=$(bash "$SCRIPT" --check 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST7 real docs/orch-state.json PASS"; else fail "TEST7 expected exit 0 against the real live files, got $rc — output: $out (if this fails, the live docs regressed OR a new to=po type shipped with no table row — that is the guard doing its job, do not silence this test)"; fi

echo ""
TOTAL=$((PASS+FAIL))
printf '─── guard-signal-type-coverage.test.sh results ───\n'
printf 'PASS: %d / %d\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAIL: %d / %d\n' "$FAIL" "$TOTAL"
  exit 1
fi
exit 0
