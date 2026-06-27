#!/usr/bin/env bash
# scripts/agents-flow/orch-state-hook-bash-backstop.sh
# PostToolUse Bash backstop — re-validates orch-state.json after Bash calls.
#
# Sprint:    SSOT-INTEGRITY-PERIMETER
# Task:      SSOT-W1-HOOK-ENFORCE
# Directive: docs/architecture-briefs/SSOT-zod-validation-directive-2026-06-27.md
# Authority: docs/policies/dev-standards.md § Script Persistence (CANONICAL pointer added)
#
# ROLE (Point-2 enforcement — PostToolUse backstop):
#   The PreToolUse Write|Edit hook (orch-state-hook-prewrite.mjs) is blind to shell
#   writes that bypass the Write/Edit tools — e.g. direct file writes via:
#     jq ... > docs/data/orch/orch-state.json
#     mv /tmp/candidate.json docs/data/orch/orch-state.json
#     tee docs/data/orch/orch-state.json
#   This backstop catches those patterns AFTER the Bash call completes.
#
# FILTER (performance):
#   Checks the Bash command for patterns that could write to orch-state.json.
#   Exits 0 immediately if command doesn't mention relevant orch paths.
#   Only runs the full Zod validator when a likely mutation is detected.
#
# VALIDATOR: bun scripts/orch-validate.mjs (SSOT-W1-ZOD-VALIDATOR-CLI canonical)
#   Same binary as the PreToolUse hook — single SSOT schema, no duplication.
#
# NON-BLOCKING: always exits 0 (the action already happened).
#   On failure: outputs a structured warning to stdout which Claude Code surfaces
#   as feedback, prompting corrective action (rollback / fix).
#
# INPUT (stdin): PostToolUse JSON hook payload
#   { "tool_name": "Bash", "tool_input": { "command": "..." }, ... }

set -uo pipefail

PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
[ -z "$PROJECT_ROOT" ] && exit 0

ORCHSTATE="$PROJECT_ROOT/docs/data/orch/orch-state.json"
[ -f "$ORCHSTATE" ] || exit 0

STDIN_TMP=$(mktemp "${TMPDIR:-/tmp}/orch-backstop-stdin-XXXXXX.json")
trap 'rm -f "$STDIN_TMP" 2>/dev/null || true' EXIT

# Read PostToolUse payload
cat > "$STDIN_TMP" 2>/dev/null || exit 0

# Extract the bash command
BASH_CMD=$(jq -r '.tool_input.command // empty' "$STDIN_TMP" 2>/dev/null || true)
[ -z "$BASH_CMD" ] && exit 0

# ── FILTER: skip if command cannot have touched orch-state.json ──────────────
# Matches: direct file writes, mv/cp operations, tee, sed -i targeting orch paths.
# This is a heuristic — catches the common server-internal write patterns.
if ! echo "$BASH_CMD" | grep -qE '(orch-state|docs/data/orch|orch_state)'; then
  exit 0
fi

# ── RUN CANONICAL VALIDATOR ───────────────────────────────────────────────────
VALIDATOR="$PROJECT_ROOT/scripts/orch-validate.mjs"
[ -f "$VALIDATOR" ] || exit 0

VALIDATE_OUT=""
VALIDATE_EXIT=0
VALIDATE_OUT=$(bun "$VALIDATOR" "$ORCHSTATE" 2>&1) || VALIDATE_EXIT=$?

if [ "$VALIDATE_EXIT" -ne 0 ]; then
  # Surface the failure as Claude Code feedback (stdout is captured as feedback)
  printf '\n[orch-state-backstop] WARNING: orch-state.json is INVALID after Bash call.\n'
  printf '[orch-state-backstop] Validator exit: %d\n' "$VALIDATE_EXIT"
  printf '[orch-state-backstop] Details:\n%s\n' "$(echo "$VALIDATE_OUT" | head -15)"
  printf '[orch-state-backstop] Bash command that may have mutated it:\n  %s\n' "$(echo "$BASH_CMD" | head -5)"
  printf '[orch-state-backstop] ACTION REQUIRED: rollback with:\n'
  printf '  git checkout docs/data/orch/orch-state.json\n'
  printf '  (or repair and re-validate with: bun scripts/orch-validate.mjs)\n\n'
  # Non-blocking: always exit 0 (action already happened; Claude sees the feedback above)
  exit 0
fi

# Validation passed — no output needed (silence is the passing signal)
exit 0
