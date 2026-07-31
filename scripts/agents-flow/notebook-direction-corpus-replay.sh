#!/usr/bin/env bash
# notebook-direction-corpus-replay.sh — AC-1 verification tool for
# FIX-NOTEBOOK-AUTOPRUNE-DIRECTION-UNRESOLVABLE-ZERO-TS-NOTEBOOKS.
#
# Replays notebook-auto-prune.sh's drop-oldest/direction-derivation logic over the
# WHOLE live docs/agent-memory/notebooks/*.md corpus (not one file), in an isolated
# sandbox (own git repo + own docs/data/{file-size-caps,notebook-section-order}.json +
# own docs/signals dir — never touches the real repo's notebooks or signal state).
#
# Forces LINE_CAP=1 (BYTE_CAP=60) via a synthetic caps file so every copied notebook is
# fully drained section-by-section in ONE invocation, exercising the direction/tie-break
# logic at every section-count depth the file can reach (not just its current over/under-
# cap state) — this is what makes the replay a genuine corpus-wide proof, not a spot check.
#
# PASS criterion (AC-1): zero files ever emit the OLD blocking
# notebook_tiebreak_direction_unresolved_breach signal type. Every other terminal state
# (single-section safe-fail, unparseable, fully converged, or the NEW non-blocking
# notebook_tiebreak_direction_defaulted informational signal) is a PASS for this file.
#
# Usage:
#   bash scripts/agents-flow/notebook-direction-corpus-replay.sh
#   PRUNE_SH=/path/to/alternate/notebook-auto-prune.sh bash scripts/agents-flow/notebook-direction-corpus-replay.sh
#     (point at a DIFFERENT copy of the script — e.g. `git show HEAD~1:...` piped to a temp
#     file — to A/B a pre-fix baseline against the current working copy without touching
#     the working tree.)
#
# Exit 0 = 0 files hit the blocking unresolved type. Exit 1 = >=1 file still deadlocks.
set -u

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && { echo "FAIL: cannot determine PROJECT_ROOT"; exit 1; }

PRUNE_SH="${PRUNE_SH:-$PROJECT_ROOT/scripts/agents-flow/notebook-auto-prune.sh}"
[ -f "$PRUNE_SH" ] || { echo "FAIL: prune script not found at $PRUNE_SH"; exit 1; }

REAL_NOTEBOOKS_DIR="$PROJECT_ROOT/docs/agent-memory/notebooks"
REAL_ORDER_FILE="$PROJECT_ROOT/docs/data/notebook-section-order.json"

TMPDIR_REPLAY=$(mktemp -d /private/tmp/notebook-direction-corpus-replay-XXXXXX)
cleanup() { rm -rf "$TMPDIR_REPLAY"; }
trap cleanup EXIT

(cd "$TMPDIR_REPLAY" && git init -q .)
mkdir -p "$TMPDIR_REPLAY/docs/data" "$TMPDIR_REPLAY/docs/signals" "$TMPDIR_REPLAY/docs/agent-memory/notebooks"

# Force EVERY file into the over-cap branch regardless of its real current size, so the
# full drop-oldest loop drains it section-by-section — maximal exercise of the tie-break.
cat > "$TMPDIR_REPLAY/docs/data/file-size-caps.json" <<'JSON'
{
  "_ssot": "test-fixture (notebook-direction-corpus-replay.sh)",
  "caps": [
    { "pattern": "docs/agent-memory/notebooks/*.md", "cap": 1, "class": "agent-notebook" }
  ]
}
JSON

# Real deployed override table — the replay proves the ACTUAL derivation+override combo
# resolves the whole corpus, not a synthetic stand-in.
cp "$REAL_ORDER_FILE" "$TMPDIR_REPLAY/docs/data/notebook-section-order.json"

cp "$REAL_NOTEBOOKS_DIR"/*.md "$TMPDIR_REPLAY/docs/agent-memory/notebooks/" 2>/dev/null

TOTAL=0
BLOCKED=0
DEFAULTED=0
CONVERGED_OR_SAFEFAIL=0
BLOCKED_FILES=""

for f in "$TMPDIR_REPLAY/docs/agent-memory/notebooks"/*.md; do
  base="$(basename "$f")"
  TOTAL=$((TOTAL + 1))
  hook_input="{\"tool_input\":{\"file_path\":\"$f\"}}"
  (cd "$TMPDIR_REPLAY" && echo "$hook_input" | bash "$PRUNE_SH" >/dev/null 2>&1)

  rel_key="docs-agent-memory-notebooks-$(echo "$base" | tr '.' '-')"
  blocked_sig=$(find "$TMPDIR_REPLAY/docs/signals" -maxdepth 1 -name "notebook-tiebreak-unresolved-${rel_key}-*.json" 2>/dev/null | head -1 || true)
  defaulted_sig=$(find "$TMPDIR_REPLAY/docs/signals" -maxdepth 1 -name "notebook-direction-defaulted-${rel_key}-*.json" 2>/dev/null | head -1 || true)

  if [ -n "$blocked_sig" ]; then
    BLOCKED=$((BLOCKED + 1))
    BLOCKED_FILES="$BLOCKED_FILES $base"
    echo "DEADLOCK  $base — notebook_tiebreak_direction_unresolved_breach still fired"
  elif [ -n "$defaulted_sig" ]; then
    DEFAULTED=$((DEFAULTED + 1))
    echo "DEFAULTED $base — resolved via documented default (informational signal only)"
  else
    CONVERGED_OR_SAFEFAIL=$((CONVERGED_OR_SAFEFAIL + 1))
    echo "OK        $base — resolved without needing a default (real votes/override) or safe-failed on single-section/unparseable"
  fi
done

echo ""
echo "========================================"
echo "Corpus replay: $TOTAL files (docs/agent-memory/notebooks/*.md)"
echo "  resolved via real votes/override : $CONVERGED_OR_SAFEFAIL"
echo "  resolved via documented default  : $DEFAULTED"
echo "  STILL DEADLOCKED (unresolved)    : $BLOCKED"
[ -n "$BLOCKED_FILES" ] && echo "  deadlocked files:$BLOCKED_FILES"
echo "========================================"

if [ "$BLOCKED" -gt 0 ]; then
  echo "FAIL (AC-1): $BLOCKED/$TOTAL files still land in the UNRESOLVED+TIE_COUNT>=2 bucket"
  exit 1
fi
echo "PASS (AC-1): 0/$TOTAL files unresolved"
exit 0
