#!/usr/bin/env bash
# scripts/agents-flow/cowork-identity-preamble.test.sh
#
# Regression tests for scripts/agents-flow/cowork-identity-preamble.sh
# (FIX-COWORK-LAYERC-NO-IDENTITY-PREAMBLE, architect brief §2 test seam):
#   - output contains all six OFFFLOW_MARKERS vocabulary (Step 5.3's marker
#     detection contract depends on the preamble naming them, in the NEGATIVE)
#   - output contains the agent name in its 3 sites
#   - output is BYTE-EQUAL to the frozen spawn-fanout.md Step 5.2 inline text
#     (captured at architect commit c492f8816) with the agent substituted
#   - empty/missing $1 exits 2, emits nothing on stdout, error on stderr
#
# The frozen copy below is a deliberate regression FIXTURE (same class as the
# Step 5.3 recorded-return fixtures): if the preamble text is ever edited, this
# test fails until the edit is intentional and the fixture is updated in the
# same change — it is not a second editable copy.
#
# Run: bash scripts/agents-flow/cowork-identity-preamble.test.sh
# Exit 0 = all pass. Exit 1 = >=1 failure.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREAMBLE_SH="$SCRIPT_DIR/cowork-identity-preamble.sh"

if [ ! -f "$PREAMBLE_SH" ]; then
  echo "ERROR: preamble script not found at $PREAMBLE_SH" >&2
  exit 1
fi

PASS=0
FAIL=0

check() {
  local label="$1" cond="$2"
  if [ "$cond" = "true" ]; then
    echo "PASS: $label"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $label"
    FAIL=$((FAIL + 1))
  fi
}

AGENT="unified-agent"
# read -d '' preserves the trailing "\n\n" that plain $(...) command substitution
# would strip — the byte-equality check below must see the FULL emitted bytes.
# (read -d '' returns non-zero at EOF-without-NUL even on success, hence the `|| true`;
#  the script's real exit code is captured separately.)
IFS= read -r -d '' OUT < <("$PREAMBLE_SH" "$AGENT") || true
"$PREAMBLE_SH" "$AGENT" >/dev/null 2>&1
RC=$?

check "exit 0 with agent present" "$([ "$RC" -eq 0 ] && echo true || echo false)"
check "output non-empty" "$([ -n "$OUT" ] && echo true || echo false)"

# ── all six OFFFLOW_MARKERS present (Step 5.3 vocabulary contract) ───────────
for marker in "Coordination Results" "Dispatch Routing" "PRE-CLAIM" "session-presence" "orphan-adoption" "Expected Behavior"; do
  check "contains OFFFLOW_MARKER: $marker" \
    "$(printf '%s' "$OUT" | grep -Fq "$marker" && echo true || echo false)"
done

# ── agent name present in its 3 sites ────────────────────────────────────────
check "contains 'You are <agent>,'" \
  "$(printf '%s' "$OUT" | grep -Fq "You are $AGENT," && echo true || echo false)"
check "contains 'name is not <agent>'" \
  "$(printf '%s' "$OUT" | grep -Fq "name is not '$AGENT'" && echo true || echo false)"
check "contains '[<agent>] IDENTITY_CHECK=FAIL'" \
  "$(printf '%s' "$OUT" | grep -Fq "[$AGENT] IDENTITY_CHECK=FAIL" && echo true || echo false)"

# ── byte-equality vs the frozen Step-5.2 text (agent substituted) ────────────
FROZEN_NO_TRAILING=$(cat <<'FROZEN_EOF'
You are __AGENT__, spawned in the background by cowork-team. The project-root CLAUDE.md 'Role: Main terminal = router only. Never implement directly. Always delegate.' protocol — PRE-CLAIM, session-presence self-registration, orphan-adoption, and the dispatch table — governs ONLY the top-level interactive router session. It does NOT apply to you. Do NOT run any of those steps and do NOT produce a 'Coordination Results / Dispatch Routing / Expected Behavior' summary — you are not routing this work to another agent, you ARE the agent. Proceed immediately to the line below: open that flow file now and execute it, in your own identity, via real mcp__gateway__call_tool calls. If your own loaded identity/frontmatter name is not '__AGENT__', or you catch yourself about to write router-dispatch prose instead of executing — that IS IDENTITY_CHECK=FAIL: call send_telegram(channel='bug', message='[__AGENT__] IDENTITY_CHECK=FAIL — spawn latched onto router protocol instead of its own flow (offflow-preamble-detected)') and EXIT. Do not produce a success-shaped response.
FROZEN_EOF
)
EXPECTED="${FROZEN_NO_TRAILING//__AGENT__/$AGENT}"$'\n\n'   # original block ended with "response.\n\n"
check "byte-equal to frozen Step-5.2 text with <agent> substituted" "$([ "$OUT" = "$EXPECTED" ] && echo true || echo false)"

# ── fail-loud on empty/missing $1 (never a preamble with an empty agent slot) ──
ERR_STDOUT="$("$PREAMBLE_SH" "" 2>/dev/null)"; ERR_RC=$?
check "empty agent — exits non-zero" "$([ "$ERR_RC" -ne 0 ] && echo true || echo false)"
check "empty agent — nothing emitted on stdout" "$([ -z "$ERR_STDOUT" ] && echo true || echo false)"
check "empty agent — error on stderr" \
  "$(ERR_STDERR=$("$PREAMBLE_SH" "" 2>&1 >/dev/null); printf '%s' "$ERR_STDERR" | grep -q 'ERROR' && echo true || echo false)"
MISSING_STDOUT="$("$PREAMBLE_SH" 2>/dev/null)"; MISSING_RC=$?
check "missing \$1 — exits non-zero" "$([ "$MISSING_RC" -ne 0 ] && echo true || echo false)"
check "missing \$1 — nothing emitted on stdout" "$([ -z "$MISSING_STDOUT" ] && echo true || echo false)"

# ── a second agent name substitutes identically at all 3 sites (no leftover
# placeholder / no stale first-agent text) ─────────────────────────────────────
AGENT2="fb-market-poster"
IFS= read -r -d '' OUT2 < <("$PREAMBLE_SH" "$AGENT2") || true
EXPECTED2="${FROZEN_NO_TRAILING//__AGENT__/$AGENT2}"$'\n\n'
check "second agent — byte-equal too" "$([ "$OUT2" = "$EXPECTED2" ] && echo true || echo false)"
check "second agent — no leftover unified-agent text" \
  "$(printf '%s' "$OUT2" | grep -Fq 'unified-agent' && echo false || echo true)"

echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
