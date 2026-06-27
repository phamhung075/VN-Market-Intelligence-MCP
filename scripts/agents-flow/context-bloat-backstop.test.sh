#!/usr/bin/env bash
# scripts/agents-flow/context-bloat-backstop.test.sh
#
# Regression test for FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH
#
# Coverage:
#   T1  docs/agent-memory/notebooks/archive/*.md >200L → EXEMPT (0 signals)
#   T2  docs/agent-memory/notebooks/*.md         >200L → BREACH (≥1 signal)
#
# Run:
#   bash scripts/agents-flow/context-bloat-backstop.test.sh
#
# Exit 0 = all pass. Exit 1 = ≥1 failure.
# Owning task: FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKSTOP_SH="$SCRIPT_DIR/context-bloat-backstop.sh"

if [ ! -f "$BACKSTOP_SH" ]; then
  echo "ERROR: backstop script not found at $BACKSTOP_SH" >&2
  exit 1
fi

# ── Isolated test environment ─────────────────────────────────────────────────
TMPDIR_TEST=$(mktemp -d /private/tmp/backstop-test-XXXXXX)
cleanup() { rm -rf "$TMPDIR_TEST"; }
trap cleanup EXIT

# Minimal git repo so git rev-parse --show-toplevel resolves to TMPDIR_TEST
(cd "$TMPDIR_TEST" && git init -q .)

mkdir -p "$TMPDIR_TEST/docs/data"
mkdir -p "$TMPDIR_TEST/docs/signals"
mkdir -p "$TMPDIR_TEST/docs/agent-memory/notebooks/archive"

# Caps file: archive entry MUST be first (first-match-wins in bash case)
cat > "$TMPDIR_TEST/docs/data/file-size-caps.json" <<'JSON'
{
  "_ssot": "test-fixture",
  "caps": [
    {
      "pattern": "docs/agent-memory/notebooks/archive/*.md",
      "cap": 9999,
      "class": "agent-notebook-archive",
      "exempt": true
    },
    {
      "pattern": "docs/agent-memory/notebooks/*.md",
      "cap": 200,
      "class": "agent-notebook"
    }
  ]
}
JSON

# 300-line archive file (by-design large, > 200L cap)
awk 'BEGIN{for(i=1;i<=300;i++) print "archive entry " i}' \
  > "$TMPDIR_TEST/docs/agent-memory/notebooks/archive/big-archive.md"

# 210-line top-level notebook (> 200L cap, should breach)
awk 'BEGIN{for(i=1;i<=210;i++) print "## entry " i}' \
  > "$TMPDIR_TEST/docs/agent-memory/notebooks/top-level.md"

PASS=0
FAIL=0

run_backstop() {
  local file_path="$1"
  local json="{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$file_path\"}}"
  # cd into test root so git rev-parse resolves to TMPDIR_TEST
  (cd "$TMPDIR_TEST" && echo "$json" | bash "$BACKSTOP_SH")
}

count_signals() {
  find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "context-bloat-*.json" 2>/dev/null | wc -l | tr -d ' '
}

# ── T1: archive/*.md >200L → EXEMPT (no signal emitted) ──────────────────────
run_backstop "$TMPDIR_TEST/docs/agent-memory/notebooks/archive/big-archive.md"

SIG1=$(count_signals)
if [ "$SIG1" = "0" ]; then
  echo "PASS T1: archive/*.md >200L → EXEMPT (0 signals)"
  PASS=$((PASS + 1))
else
  echo "FAIL T1: archive/*.md >200L → $SIG1 signal(s) emitted (expected 0)"
  FAIL=$((FAIL + 1))
fi

# ── T2: top-level notebooks/*.md >200L → BREACH (signal emitted) ─────────────
run_backstop "$TMPDIR_TEST/docs/agent-memory/notebooks/top-level.md"

SIG2=$(count_signals)
if [ "$SIG2" -ge 1 ]; then
  echo "PASS T2: top-level notebooks/*.md >200L → BREACH ($SIG2 signal(s) emitted)"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: top-level notebooks/*.md >200L → 0 signals (expected ≥1)"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
