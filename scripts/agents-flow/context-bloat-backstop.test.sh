#!/usr/bin/env bash
# scripts/agents-flow/context-bloat-backstop.test.sh
#
# Regression test for FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH + TE-T24 (byte-cap predicate)
#
# Coverage:
#   T1  docs/agent-memory/notebooks/archive/*.md >200L                    → EXEMPT (0 signals)
#   T2  docs/agent-memory/notebooks/*.md         >200L                    → BREACH (≥1 signal, reason=line-cap)
#   T3  docs/agent-memory/notebooks/*.md  5L / >12000B (mega-line)        → BREACH (≥1 signal, reason=byte-cap)
#       — passes the line cap (5L ≤ 200L) but trips the new byte cap (200L x 60B/L = 12000B);
#         proves the line-count-only evasion (dense mega-lines) is now caught (TE-T24).
#   T4  docs/agent-memory/notebooks/*.md 150L, normal width                → CLEAN (0 signals)
#       — confirms no false-positive on an ordinary multi-line file within both caps.
#
# Run:
#   bash scripts/agents-flow/context-bloat-backstop.test.sh
#
# Exit 0 = all pass. Exit 1 = ≥1 failure.
# Owning tasks: FIX-CTXBLOAT-ARCHIVE-CAP-OVERMATCH (T1/T2), TE-T24 (T3/T4)
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

# 210-line top-level notebook (> 200L cap, should breach on line-cap)
awk 'BEGIN{for(i=1;i<=210;i++) print "## entry " i}' \
  > "$TMPDIR_TEST/docs/agent-memory/notebooks/top-level.md"

# Mega-line fixture (TE-T24): 5 lines (well under 200L cap) but ~12.5KB total
# (well over the 200L x 60B/L = 12000B byte cap) — the exact evasion shape the
# byte predicate exists to catch (few dense lines, e.g. a JSON-ish blob per line).
awk 'BEGIN{
  line = "";
  for (c = 1; c <= 2500; c++) line = line "x";
  for (n = 1; n <= 5; n++) print line;
}' > "$TMPDIR_TEST/docs/agent-memory/notebooks/mega-line.md"

# 150-line normal-width notebook (well within both the 200L and 12000B caps) —
# false-positive guard for the new byte predicate.
awk 'BEGIN{for(i=1;i<=150;i++) print "## normal entry " i " — short line"}' \
  > "$TMPDIR_TEST/docs/agent-memory/notebooks/normal.md"

PASS=0
FAIL=0

run_backstop() {
  local file_path="$1"
  local json="{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$file_path\"}}"
  # cd into test root so git rev-parse resolves to TMPDIR_TEST
  # CONTEXT_BLOAT_SETTLE_SECONDS=0 — disable the settle sleep for a fast test harness
  # (settle/debounce timing itself is not under test here; only end classification is).
  (cd "$TMPDIR_TEST" && echo "$json" | CONTEXT_BLOAT_SETTLE_SECONDS=0 bash "$BACKSTOP_SH")
}

count_signals() {
  find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "context-bloat-*.json" 2>/dev/null | wc -l | tr -d ' '
}

# Signals scoped to one file (matches SIGNAL_STEM_PREFIX in the backstop script:
# REL_PATH with '/' and '.' replaced by '-'). Needed because signals from earlier
# tests accumulate in the same $TMPDIR_TEST/docs/signals dir.
count_signals_for() {
  local rel_dashed="$1"
  find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "context-bloat-${rel_dashed}-*.json" 2>/dev/null | wc -l | tr -d ' '
}

signal_reason_for() {
  local rel_dashed="$1"
  local f
  f=$(find "$TMPDIR_TEST/docs/signals" -maxdepth 1 -name "context-bloat-${rel_dashed}-*.json" 2>/dev/null | head -1 || true)
  [ -z "$f" ] && return 0
  jq -r '.payload.reason // empty' "$f" 2>/dev/null || true
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

# ── T2: top-level notebooks/*.md >200L → BREACH (line-cap) ───────────────────
run_backstop "$TMPDIR_TEST/docs/agent-memory/notebooks/top-level.md"

SIG2=$(count_signals_for "docs-agent-memory-notebooks-top-level-md")
REASON2=$(signal_reason_for "docs-agent-memory-notebooks-top-level-md")
if [ "$SIG2" -ge 1 ] && [ "$REASON2" = "line-cap" ]; then
  echo "PASS T2: top-level notebooks/*.md 210L/small-bytes → BREACH reason=$REASON2 ($SIG2 signal(s))"
  PASS=$((PASS + 1))
else
  echo "FAIL T2: top-level notebooks/*.md >200L → $SIG2 signal(s), reason='$REASON2' (expected ≥1, reason=line-cap)"
  FAIL=$((FAIL + 1))
fi

# ── T3 (TE-T24): mega-line notebook 5L/>12000B → BREACH (byte-cap) ───────────
# Proves the evasion: passes the 200L line cap outright, but the byte predicate
# (200L x 60B/L = 12000B) still catches it.
run_backstop "$TMPDIR_TEST/docs/agent-memory/notebooks/mega-line.md"

SIG3=$(count_signals_for "docs-agent-memory-notebooks-mega-line-md")
REASON3=$(signal_reason_for "docs-agent-memory-notebooks-mega-line-md")
if [ "$SIG3" -ge 1 ] && [ "$REASON3" = "byte-cap" ]; then
  echo "PASS T3: mega-line.md 5L/~12.5KB → BREACH reason=$REASON3 ($SIG3 signal(s)) — evasion caught"
  PASS=$((PASS + 1))
else
  echo "FAIL T3: mega-line.md 5L/~12.5KB → $SIG3 signal(s), reason='$REASON3' (expected ≥1, reason=byte-cap)"
  FAIL=$((FAIL + 1))
fi

# ── T4 (TE-T24): normal.md 150L, ordinary width → CLEAN (no false positive) ──
run_backstop "$TMPDIR_TEST/docs/agent-memory/notebooks/normal.md"

SIG4=$(count_signals_for "docs-agent-memory-notebooks-normal-md")
if [ "$SIG4" = "0" ]; then
  echo "PASS T4: normal.md 150L, ordinary width → CLEAN (0 signals, no byte-cap false positive)"
  PASS=$((PASS + 1))
else
  echo "FAIL T4: normal.md 150L, ordinary width → $SIG4 signal(s) emitted (expected 0)"
  FAIL=$((FAIL + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "Results: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] && exit 0 || exit 1
