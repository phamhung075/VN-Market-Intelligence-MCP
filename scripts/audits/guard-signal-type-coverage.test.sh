#!/usr/bin/env bash
# scripts/audits/guard-signal-type-coverage.test.sh
#
# Test suite for scripts/audits/guard-signal-type-coverage.sh
# (FIX-SIGNAL-ROUTING-ROWS-COVERAGE-GAP-DEEPDIVE, 2026-08-22; extended
# TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY, 2026-08-23 — dual-pipeline parsing +
# self-filing mint via orch-apply.sh).
#
# Uses GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE / GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE
# to point the script at small, disposable fixture docs under mktemp instead
# of the real (ever-changing) production tables — so this suite never drifts
# out of sync with live doc edits and never touches a real file. The
# orch-state fixture is a full schema-valid skeleton (head/task_board/
# signal_queue all present) so the script's self-filing mint step — which
# pipes a real candidate through the REAL scripts/orch-apply.sh (Zod
# validation + conservation + prose-ceiling gates, unmocked) — can actually
# succeed against it; ORCH_APPLY_LIVE_FILE_OVERRIDE inside the script under
# test is set to $ORCH_FIXTURE itself, so every mint in this suite lands
# only in the disposable fixture, never the real docs/data/orch/orch-state.json.
#
# Usage: bash scripts/audits/guard-signal-type-coverage.test.sh

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT="$REPO_ROOT/scripts/audits/guard-signal-type-coverage.sh"

[ -f "$SCRIPT" ] || { echo "FATAL: $SCRIPT not found"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "FATAL: jq not found in PATH"; exit 1; }
command -v bun >/dev/null 2>&1 || { echo "FATAL: bun not found in PATH (needed by orch-apply.sh's validator)"; exit 1; }

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf 'PASS  %s\n' "$1"; }
fail() { FAIL=$((FAIL+1)); printf 'FAIL  %s\n' "$1"; }

FIXTURE_DIR=$(mktemp -d "/tmp/guard-signal-type-coverage-test-XXXXXX")
trap 'rm -rf "$FIXTURE_DIR"' EXIT

TRIAGE_FIXTURE="$FIXTURE_DIR/triage-signals.md"
LONGTAIL_FIXTURE="$FIXTURE_DIR/triage-signals-longtail.md"
ORCH_FIXTURE="$FIXTURE_DIR/orch-state.json"

# Pipeline-A table (with a genuine multi-alias cell, matching the real doc's
# `brief_complete` / `architecture_brief` shape) ABOVE Pipeline-B's "## Live
# ... inbox" heading — the real doc's own layout, no heading of its own.
# Also carries a "**CORRECTION" stats sub-block inside the Pipeline-B
# section (real-doc shape: a `| \`stat_underscore_form\` (note) | ... |`
# measurement table that is NOT a routing table) to prove the parser does
# not mistake it for one.
write_triage_fixture() {
cat > "$TRIAGE_FIXTURE" <<'EOF'
# Fixture triage doc

For each signal in `pendingSignals[]` (Pipeline A):

| Signal `type` | From | Action | Routing |
|---|---|---|---|
| `pipeline_a_only_type` | `some-agent` | Pipeline-A row — must NOT count as Pipeline-B coverage | skip |
| `alias_one` / `alias_two` | `some-agent` | multi-alias cell — both tokens must be extracted | skip |

## Live `.signal_queue.rows[]` inbox (Pipeline B, `to==po`)

| `type` | From | Action | Routing |
|---|---|---|---|
| `alpha_type` | `agent-x` | test row | FIX |
| `beta_type` | `agent-y` | test row | FIX |

**CORRECTION (fixture stats sub-block — NOT a routing table, must be excluded):**

| stat form | count |
|---|---|
| `stat_underscore_form` (note) | 5 |

**Dedup discipline for every row below:** unrelated prose.

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

# Full schema-valid skeleton (head + task_board{backlog,active_sprints} +
# signal_queue{_updated_at,_updated_by,rows} all present — matches the
# minimal-valid shape proven in scripts/test/orch-apply-wrapper-tests.sh)
# so the mint step's real orch-apply.sh call can actually succeed. $1 =
# signal_queue.rows JSON array, $2 = pending_triage_inbox JSON array.
write_orch_fixture() {
  # Auto-fills SignalRowSchema's required id/summary/severity/status fields
  # from minimal caller-supplied {to,type} rows — keeps every test call site
  # below readable while still producing a candidate that can pass the REAL
  # Zod validator when the mint path pipes it through orch-apply.sh.
  jq -n --argjson rows "$1" --argjson inbox "$2" '
    ($rows | map(. + {
      id: (.id // ("sig-" + (.type // "x"))),
      summary: (.summary // "fixture row"),
      severity: (.severity // "INFO"),
      status: (.status // "NEW")
    })) as $rows2 |
    {
      _meta: {schema: "v4", ssot: true, updated_at: "2026-01-01T00:00:00Z", updated_by: "fixture"},
      head: {status: "idle", active_task_id: null, next_agent: null},
      task_board: {backlog: [], active_sprints: []},
      signal_queue: {_updated_at: "2026-01-01T00:00:00Z", _updated_by: "fixture", rows: $rows2},
      dev_team_idle_chain: {pending_triage_inbox: $inbox}
    }' > "$ORCH_FIXTURE"
}

run_guard() {
  GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE="$TRIAGE_FIXTURE" \
  GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE="$LONGTAIL_FIXTURE" \
  bash "$SCRIPT" --check "$ORCH_FIXTURE"
}

write_triage_fixture
write_longtail_fixture

echo "=== TEST 1: all live Pipeline-B to=po types routed -> PASS, exit 0 ==="
write_orch_fixture \
  '[{"to":"po","type":"alpha_type"},{"to":"po","type":"beta_type"},{"to":"po","type":"gamma_type"},{"to":"other-agent","type":"unrelated_type"}]' \
  '[]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST1 exit 0"; else fail "TEST1 expected exit 0, got $rc — output: $out"; fi
if echo "$out" | grep -q "PASS"; then pass "TEST1 output names PASS"; else fail "TEST1 output missing PASS marker — got: $out"; fi

echo ""
echo "=== TEST 2: one unrouted Pipeline-B type -> FAIL, exit 1, names the type, mints a backlog row ==="
write_orch_fixture \
  '[{"to":"po","type":"alpha_type"},{"to":"po","type":"zz-unrouted-fixture-type"}]' \
  '[]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST2 exit 1"; else fail "TEST2 expected exit 1, got $rc — output: $out"; fi
if echo "$out" | grep -q "zz-unrouted-fixture-type"; then pass "TEST2 output names the offending type"; else fail "TEST2 output did not name offending type — got: $out"; fi
if echo "$out" | grep -q "alpha_type"; then fail "TEST2 output should NOT re-list the already-routed type as unrouted — got: $out"; else pass "TEST2 does not falsely flag the routed type"; fi
minted=$(jq -c '[.task_board.backlog[]? | select(.dedup_key=="signal-type-registry-gap:zz-unrouted-fixture-type")]' "$ORCH_FIXTURE")
if [ "$(echo "$minted" | jq 'length')" -eq 1 ]; then pass "TEST2 mint — exactly 1 backlog row dedup-keyed on the unrouted type"; else fail "TEST2 mint — expected 1 matching backlog row, got: $minted"; fi
if [ "$(echo "$minted" | jq -r '.[0].type')" = "routing-gap" ]; then pass "TEST2 mint — row uses the routing-gap type slot"; else fail "TEST2 mint — row.type wrong: $minted"; fi
if [ "$(echo "$minted" | jq -r '.[0].status')" = "BACKLOG" ]; then pass "TEST2 mint — row status is BACKLOG (lane-coherent)"; else fail "TEST2 mint — row.status wrong: $minted"; fi

echo ""
echo "=== TEST 2b: SAME unrouted type re-detected on a second run -> dedup, no duplicate row minted ==="
out2=$(run_guard 2>&1); rc2=$?
if [ "$rc2" -eq 1 ]; then pass "TEST2b exit 1 (still unrouted)"; else fail "TEST2b expected exit 1, got $rc2 — output: $out2"; fi
if echo "$out2" | grep -q "already tracks type=zz-unrouted-fixture-type"; then pass "TEST2b dedup-skip logged"; else fail "TEST2b missing dedup-skip log line — got: $out2"; fi
count_after=$(jq '[.task_board.backlog[]? | select(.dedup_key=="signal-type-registry-gap:zz-unrouted-fixture-type")] | length' "$ORCH_FIXTURE")
if [ "$count_after" -eq 1 ]; then pass "TEST2b — still exactly 1 backlog row (not duplicated)"; else fail "TEST2b — expected 1 row, got $count_after"; fi

echo ""
echo "=== TEST 3: a Pipeline-A-only type must NOT satisfy Pipeline-B coverage (cross-pipeline blind spot) ==="
write_orch_fixture \
  '[{"to":"po","type":"pipeline_a_only_type"}]' \
  '[]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST3 exit 1 — Pipeline-A row does not leak into Pipeline-B coverage"; else fail "TEST3 expected exit 1 (Pipeline-A row must not count), got $rc — output: $out"; fi

echo ""
echo "=== TEST 4: longtail-sibling row DOES count as Pipeline-B coverage ==="
write_orch_fixture '[{"to":"po","type":"gamma_type"}]' '[]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST4 exit 0 — longtail-only type is routed"; else fail "TEST4 expected exit 0, got $rc — output: $out"; fi

echo ""
echo "=== TEST 5: to!=po Pipeline-B rows are ignored entirely ==="
write_orch_fixture '[{"to":"someone-else","type":"totally_unrouted_but_not_po"}]' '[]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST5 exit 0 — non-po rows never trip the guard"; else fail "TEST5 expected exit 0, got $rc — output: $out"; fi

echo ""
echo "=== TEST 6: missing orch-state file -> FATAL, exit 1 ==="
out=$(GUARD_SIGNAL_TRIAGE_DOC_OVERRIDE="$TRIAGE_FIXTURE" GUARD_SIGNAL_LONGTAIL_DOC_OVERRIDE="$LONGTAIL_FIXTURE" bash "$SCRIPT" --check "$FIXTURE_DIR/does-not-exist.json" 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST6 exit 1 on missing orch-state file"; else fail "TEST6 expected exit 1, got $rc — output: $out"; fi
if echo "$out" | grep -q "FATAL"; then pass "TEST6 output says FATAL"; else fail "TEST6 output missing FATAL — got: $out"; fi

echo ""
echo "=== TEST 7: Pipeline-A pending_triage_inbox[] fully routed -> PASS, exit 0 ==="
write_orch_fixture '[]' \
  '[{"envelope_id":"e1","from":"x","to":"po","type":"pipeline_a_only_type","createdAt":"2026-01-01T00:00:00Z"},{"envelope_id":"e2","from":"x","to":"po","type":"alias_one","createdAt":"2026-01-01T00:00:00Z"},{"envelope_id":"e3","from":"x","to":"po","type":"alias_two","createdAt":"2026-01-01T00:00:00Z"}]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST7 exit 0 — Pipeline-A multi-alias cell resolves both tokens as routed"; else fail "TEST7 expected exit 0, got $rc — output: $out"; fi

echo ""
echo "=== TEST 8: unrouted Pipeline-A type -> FAIL, exit 1, names the type, mints a backlog row tagged Pipeline A ==="
write_orch_fixture '[]' \
  '[{"envelope_id":"e1","from":"x","to":"po","type":"zz-synthetic-pipeline-a-unrouted","createdAt":"2026-01-01T00:00:00Z"}]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST8 exit 1"; else fail "TEST8 expected exit 1, got $rc — output: $out"; fi
if echo "$out" | grep -q "unrouted Pipeline-A types"; then pass "TEST8 output names the Pipeline-A failure class"; else fail "TEST8 missing Pipeline-A FAIL line — got: $out"; fi
if echo "$out" | grep -q "zz-synthetic-pipeline-a-unrouted"; then pass "TEST8 output names the offending type"; else fail "TEST8 output did not name offending type — got: $out"; fi
minted=$(jq -c '[.task_board.backlog[]? | select(.dedup_key=="signal-type-registry-gap:zz-synthetic-pipeline-a-unrouted")]' "$ORCH_FIXTURE")
if [ "$(echo "$minted" | jq 'length')" -eq 1 ]; then pass "TEST8 mint — 1 backlog row minted for the Pipeline-A gap"; else fail "TEST8 mint — expected 1 matching row, got: $minted"; fi
if echo "$minted" | jq -r '.[0].title' | grep -q "Pipeline A"; then pass "TEST8 mint — row title tags Pipeline A"; else fail "TEST8 mint — row not tagged Pipeline A: $minted"; fi

echo ""
echo "=== TEST 9: Pipeline-A routed type must NOT satisfy Pipeline-B coverage (reverse of TEST3) ==="
write_orch_fixture '[{"to":"po","type":"alias_one"}]' '[]'

out=$(run_guard 2>&1); rc=$?
if [ "$rc" -eq 1 ]; then pass "TEST9 exit 1 — Pipeline-A-only alias does not leak into Pipeline-B coverage"; else fail "TEST9 expected exit 1, got $rc — output: $out"; fi

echo ""
echo "=== TEST 10: real live docs + real live orch-state.json -> PASS (integration smoke test) ==="
out=$(bash "$SCRIPT" --check 2>&1); rc=$?
if [ "$rc" -eq 0 ]; then pass "TEST10 real docs/orch-state.json PASS"; else fail "TEST10 expected exit 0 against the real live files, got $rc — output: $out (if this fails, the live docs regressed OR a new Pipeline-A/Pipeline-B type shipped with no table row — that is the guard doing its job, do not silence this test)"; fi

echo ""
TOTAL=$((PASS+FAIL))
printf '─── guard-signal-type-coverage.test.sh results ───\n'
printf 'PASS: %d / %d\n' "$PASS" "$TOTAL"
if [ "$FAIL" -gt 0 ]; then
  printf 'FAIL: %d / %d\n' "$FAIL" "$TOTAL"
  exit 1
fi
exit 0
