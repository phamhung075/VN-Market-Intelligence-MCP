#!/usr/bin/env bash
# scripts/audits/task-claim-owner-session-lint.test.sh
# Smoke test for scripts/audits/task-claim-owner-session-lint.sh
# (FIX-TASKCLAIM-OWNER-CLIENT-SESSION-MISSING-FLEET-FLOW-DOCS).
#
# Every synthetic fixture lives under a disposable, UNTRACKED subdir
# (docs/agents/__task_claim_lint_fixtures__/flow/), scoped via
# TASKCLAIM_LINT_INCLUDE_OVERRIDE so each case only ever scans its own
# fixture file — never the live repo tree. Fixture dir removed on exit (trap).
#
# Usage: bash scripts/audits/task-claim-owner-session-lint.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/task-claim-owner-session-lint.sh"
FIXTURE_DIR="$PROJECT_ROOT/docs/agents/__task_claim_lint_fixtures__/flow"

# shellcheck disable=SC2329 # invoked indirectly via `trap ... EXIT` below
cleanup() { rm -rf "$PROJECT_ROOT/docs/agents/__task_claim_lint_fixtures__"; }
trap cleanup EXIT

mkdir -p "$FIXTURE_DIR"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# ---------------------------------------------------------------------------
# DoD-1: --check exits 0 on the current live repo (post-fix + baseline state).
# No override — exercises the real script against the real repo tree.
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod1.txt 2>&1
RC1=$?
if [ "$RC1" -eq 0 ]; then
  ok "DoD-1-live-repo-check-passes-post-fix (rc=0)"
else
  bad "DoD-1-live-repo-check-passes-post-fix (rc=${RC1}, expected 0)"
  cat /tmp/task-claim-lint-test-dod1.txt
fi

# ---------------------------------------------------------------------------
# DoD-2: synthetic task_claim call missing owner_client_session fails.
# ---------------------------------------------------------------------------
F2="$FIXTURE_DIR/tc2_missing.md"
cat > "$F2" <<'EOF'
# Fixture — missing owner_client_session

```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:demo",
  task_kind:   "sprint-task",
  owner_agent: "demo-agent",
  ttl_seconds: 3600
})
```
EOF
REL2="docs/agents/__task_claim_lint_fixtures__/flow/tc2_missing.md"
TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL2" bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 1 ] && grep -q "tc2_missing.md" /tmp/task-claim-lint-test-dod2.txt; then
  ok "DoD-2-synthetic-missing-owner-client-session-fails-check (rc=${RC2})"
else
  bad "DoD-2-synthetic-missing-owner-client-session-fails-check (rc=${RC2})"
  cat /tmp/task-claim-lint-test-dod2.txt
fi

# ---------------------------------------------------------------------------
# DoD-3: synthetic task_claim call WITH owner_client_session passes.
# ---------------------------------------------------------------------------
F3="$FIXTURE_DIR/tc3_present.md"
cat > "$F3" <<'EOF'
# Fixture — owner_client_session present

```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:               "task:demo",
  task_kind:              "sprint-task",
  owner_agent:            "demo-agent",
  owner_client_session:   "<resolved CLAUDE_CODE_SESSION_ID>",
  ttl_seconds:            3600
})
```
EOF
REL3="docs/agents/__task_claim_lint_fixtures__/flow/tc3_present.md"
TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL3" bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 0 ]; then
  ok "DoD-3-owner-client-session-present-passes-check (rc=${RC3})"
else
  bad "DoD-3-owner-client-session-present-passes-check (rc=${RC3})"
  cat /tmp/task-claim-lint-test-dod3.txt
fi

# ---------------------------------------------------------------------------
# DoD-4: a task-claim-lint-allow: annotated line passes despite missing field
# (escape hatch for genuine non-call-site prose mentions).
# ---------------------------------------------------------------------------
F4="$FIXTURE_DIR/tc4_annotated.md"
cat > "$F4" <<'EOF'
# Fixture — annotated prose mention

Internally wrapped in a task-claim-lint-allow: prose-only tool-name mention, not a real call site
task_claim("demo:main") mutex — described only, no argument list to check.
EOF
REL4="docs/agents/__task_claim_lint_fixtures__/flow/tc4_annotated.md"
TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL4" bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod4.txt 2>&1
RC4=$?
if [ "$RC4" -eq 0 ]; then
  ok "DoD-4-annotated-task-claim-lint-allow-line-passes-check (rc=${RC4})"
else
  bad "DoD-4-annotated-task-claim-lint-allow-line-passes-check (rc=${RC4})"
  cat /tmp/task-claim-lint-test-dod4.txt
fi

# ---------------------------------------------------------------------------
# Bonus: same fixture WITHOUT the annotation fails (negative control proving
# DoD-4's PASS is caused by the annotation, not by the shape being unmatched).
# ---------------------------------------------------------------------------
F4B="$FIXTURE_DIR/tc4b_unannotated.md"
cat > "$F4B" <<'EOF'
# Fixture — unannotated prose mention

Internally wrapped in a
task_claim("demo:main") mutex — described only, no argument list to check.
EOF
REL4B="docs/agents/__task_claim_lint_fixtures__/flow/tc4b_unannotated.md"
TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL4B" bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod4b.txt 2>&1
RC4B=$?
if [ "$RC4B" -eq 1 ]; then
  ok "bonus-positive-control-same-shape-without-annotation-fails-check (rc=${RC4B})"
else
  bad "bonus-positive-control-same-shape-without-annotation-fails-check (rc=${RC4B})"
  cat /tmp/task-claim-lint-test-dod4b.txt
fi

# ---------------------------------------------------------------------------
# DoD-5 (ratchet): a baseline entry keyed on an EXACT (file, line, snippet)
# triple does NOT grandfather the same file/line once its text changes —
# proves the gate cannot be silently defeated by editing a grandfathered
# line without adding owner_client_session.
# ---------------------------------------------------------------------------
BASELINE_TMP="$FIXTURE_DIR/../tc5-baseline.json"
F5="$FIXTURE_DIR/tc5_ratchet.md"
cat > "$F5" <<'EOF'
# Fixture — ratchet check

```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:demo-v1" })
```
EOF
REL5="docs/agents/__task_claim_lint_fixtures__/flow/tc5_ratchet.md"
# --update ALWAYS scoped via BASELINE_OVERRIDE — never touches the real baseline file.
TASKCLAIM_LINT_BASELINE_OVERRIDE="$BASELINE_TMP" TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL5" bash "$SCRIPT" --update > /dev/null 2>&1
# baseline now grandfathers tc5_ratchet.md:5 exactly as-written (task:demo-v1)
sed -i.bak 's/task:demo-v1/task:demo-v2/' "$F5" && rm -f "$F5.bak"
TASKCLAIM_LINT_BASELINE_OVERRIDE="$BASELINE_TMP" TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL5" bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod5.txt 2>&1
RC5=$?
rm -f "$BASELINE_TMP"
if [ "$RC5" -eq 1 ] && grep -q "tc5_ratchet.md" /tmp/task-claim-lint-test-dod5.txt; then
  ok "DoD-5-ratchet-baseline-does-not-grandfather-edited-line (rc=${RC5})"
else
  bad "DoD-5-ratchet-baseline-does-not-grandfather-edited-line (rc=${RC5})"
  cat /tmp/task-claim-lint-test-dod5.txt
fi

# ---------------------------------------------------------------------------
# Bonus: bare task_heartbeat( shorthand form (no call_tool wrapper) is also
# detected when owner_client_session is absent.
# ---------------------------------------------------------------------------
F6="$FIXTURE_DIR/tc6_shorthand.md"
cat > "$F6" <<'EOF'
# Fixture — bare shorthand form

Heartbeat: `task_heartbeat(task_id: "task:demo")`
EOF
REL6="docs/agents/__task_claim_lint_fixtures__/flow/tc6_shorthand.md"
TASKCLAIM_LINT_INCLUDE_OVERRIDE="$REL6" bash "$SCRIPT" --check > /tmp/task-claim-lint-test-dod6.txt 2>&1
RC6=$?
if [ "$RC6" -eq 1 ] && grep -q "tc6_shorthand.md" /tmp/task-claim-lint-test-dod6.txt; then
  ok "bonus-bare-shorthand-form-detected (rc=${RC6})"
else
  bad "bonus-bare-shorthand-form-detected (rc=${RC6})"
  cat /tmp/task-claim-lint-test-dod6.txt
fi

echo "========================================"
echo "Test Results: PASS=${PASS_COUNT} FAIL=${FAIL_COUNT}"
echo "========================================"

[ "$FAIL_COUNT" -gt 0 ] && exit 1
exit 0
