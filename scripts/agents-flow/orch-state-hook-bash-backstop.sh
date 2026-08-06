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
# NON-BLOCKING: exit code never undoes the Bash call that already happened.
#   0 = clean pass OR legitimate no-op (unchanged from before this fix).
#   1 = FR-2 discriminator (UC-CRITIC-HOOKS-ENFORCEMENT) detected a
#       prerequisite crash — e.g. `git`/`jq` binary missing, stdin capture
#       failed, the canonical Zod validator itself is missing — a case that
#       used to collapse silently into the same exit 0 as "nothing to check"
#       (see `.claude/settings.local.json`'s invocation, which no longer
#       swallows this exit code behind `2>/dev/null || true`).
#   On a genuine SSOT validation failure (validator ran, found bad content):
#   still exits 0 — that case was never swallowed (the warning is printed to
#   stdout, which Claude Code already surfaces regardless of exit code).
#
# INPUT (stdin): PostToolUse JSON hook payload
#   { "tool_name": "Bash", "tool_input": { "command": "..." }, ... }

set -uo pipefail

# FR-2 (UC-CRITIC-HOOKS-ENFORCEMENT): shared crash-vs-clean-pass discriminator.
source "$(dirname "${BASH_SOURCE[0]}")/lib/hook-guard.sh"

if ! PROJECT_ROOT=$(hg_resolve_project_root); then
  exit 1   # git binary itself missing — real prerequisite crash, not "no project root"
fi
[ -z "$PROJECT_ROOT" ] && exit 0   # legitimately outside any project context — unchanged no-op

ORCHSTATE="$PROJECT_ROOT/docs/data/orch/orch-state.json"
[ -f "$ORCHSTATE" ] || exit 0

# NOTE: template ends in XXXXXX with NO trailing suffix — BSD/macOS mktemp
# (unlike GNU mktemp) only randomizes a trailing run of 'X's when it is the
# LAST thing in the template; a suffix like ".json" here would make BSD
# mktemp treat the whole string as a literal (non-randomized) path, so every
# invocation after the first would collide with "File exists" (latent
# pre-fix bug this FR-2 crash-discriminator newly surfaces — previously
# swallowed silently by the very `2>/dev/null || true` this task removes).
if ! STDIN_TMP=$(hg_run "mktemp:stdin-tmp" mktemp "${TMPDIR:-/tmp}/orch-backstop-stdin-XXXXXX"); then
  exit 1   # cannot even create the stdin capture file (e.g. read-only TMPDIR) — real crash
fi
trap 'rm -f "$STDIN_TMP" "$STDIN_TMP.stderr" 2>/dev/null || true' EXIT

# Read PostToolUse payload
if ! cat > "$STDIN_TMP" 2>"$STDIN_TMP.stderr"; then
  printf '[orch-state-backstop] PREREQUISITE-FAILURE: failed to capture hook stdin payload: %s\n' \
    "$(cat "$STDIN_TMP.stderr" 2>/dev/null)" >&2
  exit 1
fi

# Extract the bash command
if ! BASH_CMD=$(hg_run "jq:tool_input.command" jq -r '.tool_input.command // empty' "$STDIN_TMP"); then
  exit 1   # jq itself crashed — NOT the same as "no command field"
fi
[ -z "$BASH_CMD" ] && exit 0   # jq succeeded, field genuinely absent — unchanged no-op

# ── FILTER: skip if command cannot have touched orch-state.json ──────────────
# Matches: direct file writes, mv/cp operations, tee, sed -i targeting orch paths.
# This is a heuristic — catches the common server-internal write patterns.
if ! echo "$BASH_CMD" | grep -qE '(orch-state|docs/data/orch|orch_state)'; then
  exit 0
fi

# ── RUN CANONICAL VALIDATOR ───────────────────────────────────────────────────
VALIDATOR="$PROJECT_ROOT/scripts/orch-validate.mjs"
if [ ! -f "$VALIDATOR" ]; then
  # The validator disappearing is NOT "nothing to validate" — ORCHSTATE exists
  # (checked above) and always needs validating. A missing canonical validator
  # means this CRITICAL backstop is silently disabled — must be surfaced, not
  # swallowed the way "no matching orch path" legitimately is.
  printf '[orch-state-backstop] PREREQUISITE-FAILURE: canonical validator missing: %s\n' "$VALIDATOR" >&2
  exit 1
fi

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
