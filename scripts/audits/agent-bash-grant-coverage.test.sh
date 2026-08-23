#!/usr/bin/env bash
# scripts/audits/agent-bash-grant-coverage.test.sh
# Smoke test for scripts/audits/agent-bash-grant-coverage.sh
# (FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER).
#
# Every fixture case runs the real script against a disposable, isolated
# fixture tree via the AGENT_BASH_GATE_*_OVERRIDE env vars — never against
# the live repo's own .claude/agents/ or docs/agents/ (except DoD-0, which
# deliberately exercises the real script with no overrides at all).
#
# Covers:
#   0. --check exits 0 on the CURRENT LIVE repo, no overrides (baseline_pass
#      DoD for FIX-AGENT-BASH-GRANT-COVERAGE-GATE-FLOW-DEMANDS-VS-FRONTMATTER:
#      "scripts/audits/agent-bash-grant-coverage.sh exits 0 across all
#      agents").
#   1. CHECK-1 missing-grant: flow demands Bash (commit-mutex `git add`/
#      `git commit`), tools: line has no Bash -> FAIL.
#   2. CHECK-1 correct-grant: same flow demand, tools: line HAS Bash -> PASS.
#   3. CHECK-1 correctly-Bash-free: no Bash-demanding step anywhere in the
#      flow corpus, no Bash grant -> PASS (AC-2: opt-in, never widened
#      without derived evidence).
#   4. CHECK-1 skill-routed demand: the flow doc itself has no literal git
#      command, but it points at a `.claude/skills/<x>/SKILL.md` that does
#      -> counts as demand (AC-1: "flow corpus ... and any
#      .claude/skills/*/SKILL.md it routes to").
#   5. CHECK-2 description/tools self-contradiction: description claims "No
#      other filesystem writes permitted" while tools: grants Bash -> FAIL.
#   6. CHECK-2 no-contradiction: same claim, but NO Bash grant -> PASS (the
#      claim is actually true).
#   7. Baseline grandfather WITH owning_task: a CHECK-1 mismatch listed in
#      the baseline file with a non-null owning_task -> GRANDFATHERED, exits
#      0 overall.
#   8. Baseline grandfather WITHOUT owning_task (freshly --update-minted
#      placeholder): same mismatch, owning_task=null -> still FAILS (proves
#      the baseline is not a silent-launder allowlist).
#   9. --update round-trip: generates a baseline entry for a live mismatch
#      fixture, with owning_task/reason=null placeholders.
#
# Usage: bash scripts/audits/agent-bash-grant-coverage.test.sh

set -u
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }
cd "$PROJECT_ROOT" || { echo "FAIL: cannot cd to PROJECT_ROOT"; exit 1; }

SCRIPT="$PROJECT_ROOT/scripts/audits/agent-bash-grant-coverage.sh"
FIXTURE_ROOT="$PROJECT_ROOT/scripts/audits/__agent_bash_grant_coverage_fixtures__"

cleanup() { rm -rf "$FIXTURE_ROOT"; }
trap cleanup EXIT
rm -rf "$FIXTURE_ROOT"

PASS_COUNT=0
FAIL_COUNT=0
ok()  { echo "PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
bad() { echo "FAIL: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

# reset_fixture — wipe + recreate the 3 fixture roots for one case.
reset_fixture() {
  rm -rf "$FIXTURE_ROOT"
  mkdir -p "$FIXTURE_ROOT/agents" "$FIXTURE_ROOT/flow" "$FIXTURE_ROOT/skills"
}

# run_gate — invoke the real script scoped to the fixture roots.
run_gate() {
  AGENT_BASH_GATE_AGENTS_DIR_OVERRIDE="$FIXTURE_ROOT/agents" \
  AGENT_BASH_GATE_FLOW_ROOT_OVERRIDE="$FIXTURE_ROOT/flow" \
  AGENT_BASH_GATE_SKILLS_ROOT_OVERRIDE="$FIXTURE_ROOT/skills" \
  AGENT_BASH_GATE_BASELINE_OVERRIDE="$FIXTURE_ROOT/baseline.json" \
  bash "$SCRIPT" "$1"
}

# ---------------------------------------------------------------------------
# DoD-0: --check exits 0 on the current live repo (no overrides).
# ---------------------------------------------------------------------------
bash "$SCRIPT" --check > /tmp/agent-bash-grant-coverage-test-dod0.txt 2>&1
RC0=$?
if [ "$RC0" -eq 0 ]; then
  ok "DoD-0: --check exits 0 on live repo (baseline_pass DoD)"
else
  bad "DoD-0: --check exited $RC0 on live repo — see /tmp/agent-bash-grant-coverage-test-dod0.txt"
fi

# ---------------------------------------------------------------------------
# Case 1: missing grant -> FAIL
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-nogrant.md" <<'EOF'
---
name: fixture-nogrant
tools: Read, Write, Edit, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-nogrant/flow"
cat > "$FIXTURE_ROOT/flow/fixture-nogrant/flow/main.md" <<'EOF'
**Commit (mutex-guarded)**
```bash
git add docs/agent-memory/notebooks/fixture-nogrant.md
git commit -m "chore(memory/fixture-nogrant): notebook"
```
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c1.txt 2>&1
if grep -q "fixture-nogrant: flow demands Bash" /tmp/agent-bash-grant-coverage-test-c1.txt; then
  ok "Case 1: missing-grant mismatch detected and printed"
else
  bad "Case 1: missing-grant mismatch NOT detected — see /tmp/agent-bash-grant-coverage-test-c1.txt"
fi

# ---------------------------------------------------------------------------
# Case 2: correct grant -> PASS
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-grant.md" <<'EOF'
---
name: fixture-grant
tools: Read, Write, Edit, Bash, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-grant/flow"
cat > "$FIXTURE_ROOT/flow/fixture-grant/flow/main.md" <<'EOF'
**Commit (mutex-guarded)**
```bash
git add docs/agent-memory/notebooks/fixture-grant.md
git commit -m "chore(memory/fixture-grant): notebook"
```
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c2.txt 2>&1
RC2=$?
if [ "$RC2" -eq 0 ]; then
  ok "Case 2: correct grant -> --check exits 0"
else
  bad "Case 2: correct grant should PASS, exited $RC2 — see /tmp/agent-bash-grant-coverage-test-c2.txt"
fi

# ---------------------------------------------------------------------------
# Case 3: correctly Bash-free -> PASS (no demand, no grant)
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-readonly.md" <<'EOF'
---
name: fixture-readonly
tools: Read, Glob, Grep
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-readonly/flow"
cat > "$FIXTURE_ROOT/flow/fixture-readonly/flow/main.md" <<'EOF'
Pure analysis flow. No persistence step at all.
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c3.txt 2>&1
RC3=$?
if [ "$RC3" -eq 0 ]; then
  ok "Case 3: correctly Bash-free agent -> --check exits 0 (AC-2 opt-in, not widened)"
else
  bad "Case 3: correctly Bash-free agent should PASS, exited $RC3 — see /tmp/agent-bash-grant-coverage-test-c3.txt"
fi

# ---------------------------------------------------------------------------
# Case 4: skill-routed demand (AC-1 corpus includes referenced SKILL.md)
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-skillroute.md" <<'EOF'
---
name: fixture-skillroute
tools: Read, Write, Edit, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-skillroute/flow" "$FIXTURE_ROOT/skills/commit-mutex"
cat > "$FIXTURE_ROOT/flow/fixture-skillroute/flow/main.md" <<'EOF'
**Commit (mutex-guarded)** -> skill: `.claude/skills/commit-mutex/SKILL.md`
EOF
cat > "$FIXTURE_ROOT/skills/commit-mutex/SKILL.md" <<'EOF'
# Skill: commit-mutex
git add <own_paths>
git commit -m "..."
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c4.txt 2>&1
if grep -q "fixture-skillroute: flow demands Bash" /tmp/agent-bash-grant-coverage-test-c4.txt; then
  ok "Case 4: skill-routed Bash demand detected via referenced SKILL.md"
else
  bad "Case 4: skill-routed Bash demand NOT detected — see /tmp/agent-bash-grant-coverage-test-c4.txt"
fi

# ---------------------------------------------------------------------------
# Case 5: description/tools self-contradiction (AC-8) -> FAIL
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-contradict.md" <<'EOF'
---
name: fixture-contradict
description: Fixture agent. Writes only to its notebook. No other filesystem writes permitted.
tools: Read, Write, Edit, Bash, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c5.txt 2>&1
if grep -q "fixture-contradict: description claims" /tmp/agent-bash-grant-coverage-test-c5.txt; then
  ok "Case 5: description/tools self-contradiction (AC-8) detected"
else
  bad "Case 5: AC-8 contradiction NOT detected — see /tmp/agent-bash-grant-coverage-test-c5.txt"
fi

# ---------------------------------------------------------------------------
# Case 6: same claim, no Bash grant -> PASS (claim is actually true)
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-nocontradict.md" <<'EOF'
---
name: fixture-nocontradict
description: Fixture agent. Writes only to its notebook. No other filesystem writes permitted.
tools: Read, Write, Edit, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c6.txt 2>&1
RC6=$?
if [ "$RC6" -eq 0 ]; then
  ok "Case 6: claim true (no Bash grant) -> --check exits 0"
else
  bad "Case 6: should PASS, exited $RC6 — see /tmp/agent-bash-grant-coverage-test-c6.txt"
fi

# ---------------------------------------------------------------------------
# Case 7: baseline grandfather WITH owning_task -> GRANDFATHERED, exits 0
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-grandfathered.md" <<'EOF'
---
name: fixture-grandfathered
tools: Read, Write, Edit, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-grandfathered/flow"
cat > "$FIXTURE_ROOT/flow/fixture-grandfathered/flow/main.md" <<'EOF'
```bash
git add docs/agent-memory/notebooks/fixture-grandfathered.md
git commit -m "chore(memory/fixture-grandfathered): notebook"
```
EOF
cat > "$FIXTURE_ROOT/baseline.json" <<'EOF'
{"entries":[{"agent":"fixture-grandfathered","check":"bash_grant_mismatch","owning_task":"FIX-SOME-OTHER-ROW","reason":"test fixture"}]}
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c7.txt 2>&1
RC7=$?
if [ "$RC7" -eq 0 ] && grep -q "GRANDFATHERED" /tmp/agent-bash-grant-coverage-test-c7.txt; then
  ok "Case 7: baseline entry with owning_task grandfathers -> --check exits 0"
else
  bad "Case 7: expected exit 0 + GRANDFATHERED in table, got exit $RC7 — see /tmp/agent-bash-grant-coverage-test-c7.txt"
fi

# ---------------------------------------------------------------------------
# Case 8: baseline entry with owning_task=null -> still FAILS (not a launder)
# ---------------------------------------------------------------------------
cat > "$FIXTURE_ROOT/baseline.json" <<'EOF'
{"entries":[{"agent":"fixture-grandfathered","check":"bash_grant_mismatch","owning_task":null,"reason":null}]}
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c8.txt 2>&1
RC8=$?
if [ "$RC8" -ne 0 ]; then
  ok "Case 8: uncurated (owning_task=null) baseline entry does NOT grandfather -> FAILs"
else
  bad "Case 8: uncurated baseline entry incorrectly grandfathered (exit 0) — allowlist-laundering regression"
fi

# ---------------------------------------------------------------------------
# Case 9: --update round-trip mints a null-placeholder entry for a live mismatch
# ---------------------------------------------------------------------------
rm -f "$FIXTURE_ROOT/baseline.json"
run_gate --update > /tmp/agent-bash-grant-coverage-test-c9.txt 2>&1
if [ -f "$FIXTURE_ROOT/baseline.json" ] && \
   jq -e '.entries | any(.agent == "fixture-grandfathered" and .check == "bash_grant_mismatch" and .owning_task == null)' \
     "$FIXTURE_ROOT/baseline.json" > /dev/null 2>&1; then
  ok "Case 9: --update mints owning_task=null placeholder for a fresh mismatch"
else
  bad "Case 9: --update did not mint the expected placeholder entry — see $FIXTURE_ROOT/baseline.json"
fi

# ---------------------------------------------------------------------------
# Case 10: negation guard — a NEGATED demand phrase ("no per-line git commit")
# with NO other demand anywhere in the corpus, no Bash grant -> PASS (not a
# mismatch). Regression fixture for FIX-BASHGRANT-GATE-NEGATED-GIT-COMMIT-
# PHRASE-FALSE-POSITIVE (root-caused on refine_bctc_md: fleet-wide debug-
# logger-protocol boilerplate landed by baa91292c).
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-negated-only.md" <<'EOF'
---
name: fixture-negated-only
tools: Read, Write, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-negated-only/flow"
cat > "$FIXTURE_ROOT/flow/fixture-negated-only/init.md" <<'EOF'
note: "Per-agent debug logger convention. Append one line to docs/agent-memory/debug/fixture-negated-only.log per notable step/error (Read-then-Write append, no MCP tool, no per-line git commit)."
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c10.txt 2>&1
RC10=$?
if [ "$RC10" -eq 0 ] && ! grep -q "fixture-negated-only: flow demands Bash" /tmp/agent-bash-grant-coverage-test-c10.txt; then
  ok "Case 10: negated-only demand phrase ('no per-line git commit') -> no mismatch, --check exits 0"
else
  bad "Case 10: negated-only phrase incorrectly counted as a Bash demand — see /tmp/agent-bash-grant-coverage-test-c10.txt"
fi

# ---------------------------------------------------------------------------
# Case 11: negation guard does NOT mask a REAL demand elsewhere in the same
# corpus (a negated line + a genuine, un-negated git-commit step) -> still
# FAIL (missing grant). Proves the guard is per-occurrence, not per-agent.
# ---------------------------------------------------------------------------
reset_fixture
cat > "$FIXTURE_ROOT/agents/fixture-negated-plus-real.md" <<'EOF'
---
name: fixture-negated-plus-real
tools: Read, Write, mcp__gateway__call_tool
model: haiku
---
fixture
EOF
mkdir -p "$FIXTURE_ROOT/flow/fixture-negated-plus-real/flow"
cat > "$FIXTURE_ROOT/flow/fixture-negated-plus-real/init.md" <<'EOF'
note: "Bash printf, no MCP tool, no per-line git commit."
EOF
cat > "$FIXTURE_ROOT/flow/fixture-negated-plus-real/flow/main.md" <<'EOF'
**Commit (mutex-guarded)**
```bash
git add docs/agent-memory/notebooks/fixture-negated-plus-real.md
git commit -m "chore(memory/fixture-negated-plus-real): notebook"
```
EOF
run_gate --check > /tmp/agent-bash-grant-coverage-test-c11.txt 2>&1
if grep -q "fixture-negated-plus-real: flow demands Bash" /tmp/agent-bash-grant-coverage-test-c11.txt; then
  ok "Case 11: real demand elsewhere in corpus still detected despite a negated line"
else
  bad "Case 11: negation guard over-suppressed a real demand — see /tmp/agent-bash-grant-coverage-test-c11.txt"
fi

echo
echo "agent-bash-grant-coverage.test.sh: ${PASS_COUNT} passed, ${FAIL_COUNT} failed"
[ "$FAIL_COUNT" -eq 0 ]
