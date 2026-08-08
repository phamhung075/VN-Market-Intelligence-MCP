#!/usr/bin/env bash
# scripts/auditor-notebook-commit.sh
#
# FIX-AUDITOR-COMMIT-MUTEX-SKIP — ONE blessed commit script for the
# system-auditor notebook (and any other explicit-pathspec doc) commit step.
#
# Root cause fixed: the previous LLM-narrated flow pseudocode
# (docs/agents/system-auditor/flow/main.md) non-deterministically SKIPPED
# the commit-mutex claim step — 2 observed skips (22:44Z 07-02, commit
# 11be6d74d at 00:14Z 07-03) vs paired counterexamples that DID claim
# (23:00Z/23:30Z, commit 0b4f49e88). Flow-step drift on a narrated sequence
# cannot be trusted for a hard invariant — the mutex claim/release must be
# executed code, not prose the model may skip. This script IS that code.
#
# Also folds in the DEFERRED sibling FIX-AUDITOR-COMMIT-NONEXPLICIT-PATHSPEC:
# non-explicit `git add` previously swept an in-flight peer's working-tree
# edits into a notebook-only commit (f05795c3, 7 files, benign that time but
# a latent concurrent-commit-race / wrong-attribution bug). This script
# NEVER accepts -A/-u/. — only the exact paths passed as arguments, enforced
# in bash, not narrated.
#
# CONTRACT
#   scripts/auditor-notebook-commit.sh "<commit message>" <path1> [path2 ...]
#
#   Env:
#     CLAUDE_CODE_SESSION_ID      REQUIRED — owner_client_session for the
#                                 commit-mutex claim/release (coordination
#                                 parameter only, never logged as a credential).
#     AUDITOR_COMMIT_OWNER_AGENT  optional, default "system-auditor" —
#                                 owner_agent recorded on the commit-mutex lock.
#     AUDITOR_COMMIT_MUTEX_TTL    optional, default 90 (matches
#                                 .claude/skills/commit-mutex/SKILL.md TTL).
#     MCP_HTTP_URL / MCP_CALL_TIMEOUT_S — forwarded to mcp-call.sh.
#
#   Refuses to run (exit 2) if no paths are given, or if
#   CLAUDE_CODE_SESSION_ID is unset — hard guards against an accidental
#   bare/-A-shaped call site. This script NEVER stages anything the caller
#   did not name explicitly.
#
# PROTOCOL (mirrors .claude/skills/commit-mutex/SKILL.md Steps 1/3/4 — no
# push step: system-auditor's notebook commit has never pushed; push is a
# separate concern owned by scripts/fleet-worktree-push.sh):
#   1. task_claim("commit-mutex:main", task_kind="commit-mutex") BEFORE any
#      git index operation. Claim failure (transport error, contended, or
#      mechanism-broken/schema-drift) is NOT fatal to the caller: this script
#      exits non-zero with a distinct SKIP marker — the caller (auditor flow)
#      skips the commit and retries next tick. Claim is NEVER skipped by
#      construction — there is no code path from script-start to `git commit`
#      that does not pass through the claim call.
#   2. Release is unconditional via `trap ... EXIT` armed the instant the
#      claim succeeds — fires on every exit path (success, foreign-path
#      abort, no-staged-changes, mid-script error) so the mutex can never be
#      stranded by this script.
#   3. `git add -- <explicit paths>` (never -A/-u/.) -> foreign-path verify +
#      restore (own paths are NEVER restored) -> `git commit -m "<msg>" --
#      <paths>` (double-safety: the pathspec filter on commit itself commits
#      only the named paths' current content regardless of what else may be
#      sitting in the index).
#   4. RAW-verifiable one-line markers on stdout (grep for "[auditor-commit]"):
#        success              -> "[auditor-commit] mutex-paired commit <sha> paths=<n>"
#        no staged changes    -> "[auditor-commit] SKIP no-staged-changes paths=<n>"
#        mutex claim failed   -> "[auditor-commit] SKIP mutex-claim-failed <reason> — retry next tick"
#        foreign-path abort   -> "[auditor-commit] ABORT foreign-path-after-restore <paths>"
#        contract violation   -> "[auditor-commit] ABORT contract-arithmetic-violation path=<p> line=\"<line>\"" (AC-4)
#        git commit failed    -> "[auditor-commit] ABORT git-commit-failed rc=<n>"
#        bad usage / no paths -> "[auditor-commit] ERROR no paths given — refusing to run"
#        no session id        -> "[auditor-commit] ERROR CLAUDE_CODE_SESSION_ID not set — refusing to run"
#
# Precedents: scripts/orch-apply.sh (gate-wrapper + trap-cleanup style),
# scripts/agents-flow/mcp-call.sh (gateway-from-bash transport — sourced,
# not reinvented), scripts/agents-flow/dev-team-tick-preflight.sh
# (task_claim/task_release call shape).
#
# Injection-safety: every task_claim/task_release JSON body is built via
# `jq -n --arg`/`--argjson`/`jq -R` bound params ONLY — no dynamic field
# (paths, commit message, session id) is ever interpolated into a shell
# string or the JSON body as raw text.
#
# AC-4 PRE-COMMIT CONTRACT BACKSTOP (FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-
# VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE): before the "nothing to commit"
# check, any staged path matching docs/agent-memory/notebooks/*.md is
# scanned for a newly-ADDED `[OUTPUT-CONTRACT] ...` line (git diff --cached,
# shared extraction/arithmetic with scripts/audits/detect-analysis-only-
# exit.sh's own AC-1/AC-2 check — scripts/lib/output-contract-invariant.sh,
# ONE implementation). If found and it violates the structural invariant
# (`signals_posted >= signal_queue_rows_written` AND `signals_posted >=
# dedup_skipped` — provable from scripts/audit-output-contract.sh's own
# parser, see that lib's header), the ENTIRE staged set for this call is
# unstaged and the commit refused (exit 1) — a hand-composed/fabricated
# contract line never reaches git HEAD in the first place, rather than only
# being caught after the fact by a downstream detector. No-op for every
# other caller (non-notebook paths, or a notebook path with no
# `[OUTPUT-CONTRACT]` line at all — e.g. non-auditor notebook commits).
#
# Owning flow: docs/agents/system-auditor/flow/main.md (notebook commit step).
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays, NO `local -r`. Only plain indexed arrays + `while read` loops.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# shellcheck source=./agents-flow/mcp-call.sh
source "$SCRIPT_DIR/agents-flow/mcp-call.sh"

# shellcheck source=./lib/output-contract-invariant.sh
source "$SCRIPT_DIR/lib/output-contract-invariant.sh"

MUTEX_TASK_ID="commit-mutex:main"
MUTEX_HELD=false

# ── Release trap — fires on EVERY exit path once (and only if) the claim succeeded ──
# shellcheck disable=SC2329  # invoked indirectly via `trap ... EXIT` below, not a dead function
_release_mutex() {
  if [ "$MUTEX_HELD" = "true" ]; then
    local rel_args
    rel_args=$(jq -n --arg tid "$MUTEX_TASK_ID" --arg sess "${CLAUDE_CODE_SESSION_ID:-}" \
      '{task_id:$tid, owner_client_session:$sess}')
    mcp_call "task_release" "$rel_args" >/dev/null 2>&1
    MUTEX_HELD=false
  fi
}
trap _release_mutex EXIT

# ── 0. Usage guard — refuse to run without explicit paths (no mutex touched) ──
COMMIT_MSG="${1:-}"
shift || true
PATHS=("$@")

if [ -z "$COMMIT_MSG" ] || [ ${#PATHS[@]} -eq 0 ]; then
  echo "[auditor-commit] ERROR no paths given — refusing to run"
  exit 2
fi

if [ -z "${CLAUDE_CODE_SESSION_ID:-}" ]; then
  echo "[auditor-commit] ERROR CLAUDE_CODE_SESSION_ID not set — refusing to run"
  exit 2
fi

OWNER_AGENT="${AUDITOR_COMMIT_OWNER_AGENT:-system-auditor}"
MUTEX_TTL="${AUDITOR_COMMIT_MUTEX_TTL:-90}"

# ── 1. Claim commit-mutex:main BEFORE any git index operation ────────────────
paths_json=$(printf '%s\n' "${PATHS[@]}" | jq -R . | jq -s .)
payload_str=$(jq -cn --argjson paths "$paths_json" --arg intent "$COMMIT_MSG" \
  '{paths:$paths, intent:$intent}')
claim_args=$(jq -n --arg tid "$MUTEX_TASK_ID" --arg kind "commit-mutex" \
  --arg agent "$OWNER_AGENT" --arg sess "$CLAUDE_CODE_SESSION_ID" \
  --argjson ttl "$MUTEX_TTL" --arg payload "$payload_str" \
  '{task_id:$tid, task_kind:$kind, owner_agent:$agent, owner_client_session:$sess, ttl_seconds:$ttl, payload:$payload}')

claim_result=$(mcp_call "task_claim" "$claim_args" 2>&1)
claim_rc=$?

if [ $claim_rc -ne 0 ]; then
  echo "[auditor-commit] SKIP mutex-claim-failed transport-error: $(printf '%s' "$claim_result" | tr '\n' ' ' | cut -c1-200) — retry next tick"
  exit 1
fi

if ! printf '%s' "$claim_result" | jq -e . >/dev/null 2>&1; then
  echo "[auditor-commit] SKIP mutex-claim-failed malformed-response: $(printf '%s' "$claim_result" | tr '\n' ' ' | cut -c1-200) — retry next tick"
  exit 1
fi

claimed=$(printf '%s' "$claim_result" | jq -r '.claimed // false')
if [ "$claimed" != "true" ]; then
  holder=$(printf '%s' "$claim_result" | jq -c '.current_holder // empty' 2>/dev/null)
  if [ -z "$holder" ]; then
    echo "[auditor-commit] SKIP mutex-claim-failed mechanism-broken (claimed=false, no current_holder — schema/enum drift?) — retry next tick"
  else
    echo "[auditor-commit] SKIP mutex-claim-failed contended holder=$(printf '%s' "$holder" | tr '\n' ' ' | cut -c1-150) — retry next tick"
  fi
  exit 1
fi

# Claimed — arm release for every remaining exit path.
MUTEX_HELD=true

# ── 2. Critical section — explicit pathspec ONLY, never -A/-u/. ─────────────
git add -- "${PATHS[@]}"

# Foreign-path verify — anything staged beyond our own explicit paths gets
# restored (staged-only; NEVER touches the foreign agent's working tree, and
# NEVER restores our own paths).
# NOTE: `while read` loop (not `mapfile`) — portable to bash 3.2 (macOS system
# bash has no `mapfile` builtin; this script must run without bash4+).
foreign=()
while IFS= read -r f; do
  [ -z "$f" ] && continue
  is_own=false
  for p in "${PATHS[@]}"; do
    [ "$f" = "$p" ] && is_own=true && break
  done
  $is_own || foreign+=("$f")
done < <(git diff --cached --name-only)

if [ ${#foreign[@]} -gt 0 ]; then
  git restore --staged -- "${foreign[@]}"
  still_foreign=()
  while IFS= read -r f; do
    [ -z "$f" ] && continue
    is_own=false
    for p in "${PATHS[@]}"; do
      [ "$f" = "$p" ] && is_own=true && break
    done
    $is_own || still_foreign+=("$f")
  done < <(git diff --cached --name-only)
  if [ ${#still_foreign[@]} -gt 0 ]; then
    echo "[auditor-commit] ABORT foreign-path-after-restore ${still_foreign[*]}"
    exit 1
  fi
fi

# ── 2a. AC-4 pre-commit contract backstop — see header comment ──────────────
# Only evaluates paths that LOOK like a governed agent notebook AND actually
# carry ≥1 newly-staged [OUTPUT-CONTRACT] line; no-op for every other call
# site (e.g. orch-sentinel's scorecard commit, DASHBOARD.md-only commits).
# Checks EVERY added line, not just one — a single staged diff can bundle
# more than one cycle's own section (e.g. a prior cycle's write that never
# got its own commit, folded into this one alongside the current cycle's —
# confirmed live, commit 569f79108) — see scripts/lib/output-contract-
# invariant.sh header for the full rationale.
for _p in "${PATHS[@]}"; do
  case "$_p" in
    docs/agent-memory/notebooks/*.md)
      _claim_lines=$(git diff --cached -- "$_p" | oc_extract_all_added_contract_lines_from_text)
      if [ -n "$_claim_lines" ]; then
        while IFS= read -r _claim_line; do
          [ -z "$_claim_line" ] && continue
          _sp=$(oc_parse_counter "$_claim_line" "signals_posted")
          _sqr=$(oc_parse_counter "$_claim_line" "signal_queue_rows_written")
          _ds=$(oc_parse_counter "$_claim_line" "dedup_skipped")
          if ! oc_check_arithmetic_invariant "$_sp" "$_sqr" "$_ds"; then
            git restore --staged -- "${PATHS[@]}"
            echo "[auditor-commit] ABORT contract-arithmetic-violation path=${_p} line=\"${_claim_line}\""
            exit 1
          fi
        done <<< "$_claim_lines"
      fi
      ;;
  esac
done

# Nothing to commit for the named paths → skip cleanly (not an error).
if git diff --cached --quiet -- "${PATHS[@]}"; then
  echo "[auditor-commit] SKIP no-staged-changes paths=${#PATHS[@]}"
  exit 0
fi

# ── 3. Commit — pathspec-filtered even if something else got staged mid-race ──
git commit -m "$COMMIT_MSG" -- "${PATHS[@]}" >/dev/null 2>&1
commit_rc=$?
if [ $commit_rc -ne 0 ]; then
  echo "[auditor-commit] ABORT git-commit-failed rc=${commit_rc}"
  exit 1
fi

# Post-commit sanity (informational only — never flips the exit code).
residual=$(git diff --cached --name-only)
if [ -n "$residual" ]; then
  echo "[auditor-commit] WARN residual staged files post-commit: $(printf '%s' "$residual" | tr '\n' ' ')" >&2
fi

sha=$(git rev-parse --short HEAD)
echo "[auditor-commit] mutex-paired commit ${sha} paths=${#PATHS[@]}"
exit 0
