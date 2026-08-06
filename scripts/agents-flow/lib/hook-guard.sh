#!/usr/bin/env bash
# scripts/agents-flow/lib/hook-guard.sh
#
# FR-2 (UC-CRITIC-HOOKS-ENFORCEMENT): shared crash-vs-clean-pass discriminator,
# sourced by the 4 load-bearing PostToolUse/Stop hook scripts (orch-state-hook-
# bash-backstop.sh, context-bloat-backstop.sh, notebook-auto-prune.sh,
# branch-hygiene-stop.sh). Closes the gap where these scripts' own early
# `exit 0` guards treated "legitimately nothing to do" (empty/absent input
# field, non-governed path) identically to "a prerequisite command itself
# failed" (missing `jq`/`git`/`bun` binary, permission error, malformed
# input) — see docs/handoffs/UC-CRITIC-HOOKS-ENFORCEMENT-BA-spec.md FR-2.
#
# Spec: docs/handoffs/UC-CRITIC-HOOKS-ENFORCEMENT-BA-spec.md
#       § [Architect] Brownfield Findings — FR-2 design decision (canonical
#       pattern, orch-state-hook-bash-backstop.sh:48-49).
#
# --- hg_run <label> <cmd> [args...] ---------------------------------------
# Runs <cmd> with its stdout AND stderr merged into ONE captured stream
# (`"$@" 2>&1`) — deliberately NOT using a temp file or fd-juggling to
# separate the two streams, so this adds ZERO new subprocess forks versus
# the pre-existing call site (NFR-3: the crash-discriminator must not add
# subprocess calls on the already-passing/no-op hot path). This is safe for
# every call site this helper is applied to (jq/git/cat/mktemp single-shot
# reads) because none of them print anything to stderr on a clean exit 0 —
# on success the merged stream IS the clean stdout; on failure stdout is
# empty so the merged stream IS the error text.
#
#   - Success (exit 0): prints the command's stdout, returns 0.
#   - Failure (exit != 0): prints nothing to stdout; writes
#     "[<label>] PREREQUISITE-FAILURE: exited <n>: <captured output>" to
#     stderr; returns 1.
#
# Usage (canonical — mirrors the "no command field" vs "jq itself crashed"
# split the FR-2 discriminator exists to make):
#   if ! OUT=$(hg_run "jq:tool_input.command" jq -r '.tool_input.command // empty' "$FILE"); then
#     exit 1   # jq itself crashed — NOT the same as "field genuinely absent"
#   fi
#   [ -z "$OUT" ] && exit 0   # jq succeeded, field genuinely absent — unchanged no-op
set -u

hg_run() {
  local label="$1"
  shift
  local out status
  out="$("$@" 2>&1)"
  status=$?
  if [ "$status" -eq 0 ]; then
    printf '%s' "$out"
    return 0
  fi
  printf '[%s] PREREQUISITE-FAILURE: exited %d: %s\n' "$label" "$status" "$out" >&2
  return 1
}

# --- hg_resolve_project_root ------------------------------------------------
# Discriminator for the PROJECT_ROOT resolution guard shared by 3 of the 4
# scripts:
#   PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
#   [ -z "$PROJECT_ROOT" ] && exit 0
#
# `git rev-parse --show-toplevel` failing has TWO distinct causes that must
# NOT be treated the same:
#   (a) git is installed and ran fine, but the hook's cwd genuinely is not
#       inside a git working tree ("fatal: not a git repository") — a
#       legitimate, expected fallback to $CLAUDE_PROJECT_DIR, unchanged from
#       today's behavior;
#   (b) the `git` binary itself is missing (BA §5's named dependency-removal
#       edge case — `.claude/settings.local.json` whitelists
#       `rm -rf ~/Library/Caches/Homebrew/*`, a plausible in-repo-sanctioned
#       path to removing it mid-session) — a real prerequisite crash that
#       must NOT silently collapse to the same "outside any project" no-op.
#
# `command -v git` is a bash BUILTIN path lookup — zero new subprocess forks
# on either branch (NFR-3). Only when git is missing entirely does this
# helper deviate from the original one-liner's behavior.
#
# Echoes the resolved root (possibly empty — "legitimately outside any
# project context" is still a valid, unchanged outcome) and returns 0, OR
# prints a PREREQUISITE-FAILURE line to stderr and returns 1 when git itself
# is unusable.
hg_resolve_project_root() {
  if ! command -v git >/dev/null 2>&1; then
    printf '[hook-guard] PREREQUISITE-FAILURE: git binary not found\n' >&2
    return 1
  fi
  printf '%s' "$(git rev-parse --show-toplevel 2>/dev/null || echo "${CLAUDE_PROJECT_DIR:-}")"
  return 0
}
