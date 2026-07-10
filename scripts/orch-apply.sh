#!/usr/bin/env bash
# =============================================================================
# scripts/orch-apply.sh — Single gated write path for the hot orch-state file
# =============================================================================
# Sprint: SSOT-INTEGRITY-PERIMETER
# Task:   SSOT-W1-ORCH-APPLY-WRAPPER (rank 5, wave-1)
# Canonical ref: docs/policies/dev-standards.md § Script Persistence
#
# PURPOSE:
#   Every write to docs/data/orch/orch-state.json MUST flow through this
#   script. It provides:
#     1. Candidate reception from stdin (pipe idiom — minimal call-site churn)
#     2. Temp file written to the same directory as the live file (same
#        filesystem → mv(2) is POSIX-atomic)
#     3. Validation via bun scripts/orch-validate.mjs (Zod schema + dup-key
#        + coherence + ref integrity). NEVER duplicated here — single SSOT.
#     4. Conservation circuit-breaker via bun scripts/orch-conservation-check.mjs
#        (whole-board task_total/signal_total magnitude-ratio guard). NEVER
#        duplicated here — single SSOT. Closes the empirically live-exploitable
#        full-doc-collapse class (commit de595a44) — see
#        docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md
#     5. CAS-mtime guard: mtime captured before stdin-read; re-checked before
#        rename. Mismatch → ABORT with exit 2 so caller can retry.
#     6. Atomic rename: temp → live file
#
# CALL PATTERN (canonical — minimal churn over existing jq idiom):
#   jq '<filter>' docs/data/orch/orch-state.json | scripts/orch-apply.sh
#
#   Scripts using $PROJECT_ROOT:
#   jq '<filter>' "$PROJECT_ROOT/docs/data/orch/orch-state.json" \
#     | bash "$PROJECT_ROOT/scripts/orch-apply.sh"
#
# EXIT CODES:
#   0  = success (candidate atomically applied to live file)
#   1  = validation failed (dup-key / schema violation / dangling refs)
#        OR conservation check failed (candidate's task_total/signal_total
#        dropped below FLOOR_RATIO of the live value) — live file left UNTOUCHED
#   2  = CAS mtime mismatch — concurrent writer detected; caller should retry
#   3  = usage error (empty stdin, live file missing, I/O error)
#
# HARD CONSTRAINTS:
#   - NEVER duplicate or reimplement validation logic — REUSE orch-validate.mjs
#     and orch-conservation-check.mjs
#   - Live file is SACRED — on any failure, leave it untouched
#   - Coherence WARNINGS from validator (exit 0 with stderr lines) are
#     non-blocking: they do NOT abort the write
#   - Temp file MUST live in docs/data/orch/ (same filesystem as live file)
#
# CONSERVATION BYPASS (ORCH_APPLY_ALLOW_SHRINK):
#   NARROW NAMED BYPASS, mirrors ORCH_APPLY_LIVE_FILE_OVERRIDE below. Set to a
#   non-empty reason string to allow a candidate that legitimately shrinks
#   task_total/signal_total (bulk eviction/archival). Wired ONLY into
#   scripts/orch-cold-evict.sh and docs/agents/pm/flow/task-archive.md — the
#   2 already-shipped legitimate bulk-eviction writers. NEVER set this from
#   any other caller (in particular, never from system-auditor).
# =============================================================================

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Production: LIVE_FILE defaults to the canonical hot-file path.
# Testing: override via ORCH_APPLY_LIVE_FILE_OVERRIDE to point at a throwaway fixture —
#   this keeps the real orch-state.json untouched during negative-path tests.
LIVE_FILE="${ORCH_APPLY_LIVE_FILE_OVERRIDE:-${REPO_ROOT}/docs/data/orch/orch-state.json}"

# ─── Portable mtime (macOS stat -f / Linux stat -c) ─────────────────────────
get_mtime() {
  if stat -f "%m" "$1" 2>/dev/null; then
    return
  fi
  stat -c "%Y" "$1"
}

# ─── Guard: live file must exist ─────────────────────────────────────────────
if [[ ! -f "${LIVE_FILE}" ]]; then
  printf '[orch-apply] ERROR: live file not found: %s\n' "${LIVE_FILE}" >&2
  exit 3
fi

# ─── CAS: capture live file mtime BEFORE reading stdin ───────────────────────
# The jq caller already read the live file before this script started.
# Capturing mtime here — at the earliest point in the script, before reading
# stdin — gives us a snapshot as close to the caller's read as possible.
# Any concurrent write that lands between the caller's read and our startup
# will be caught by the final mtime re-check before rename.
MTIME_BEFORE=$(get_mtime "${LIVE_FILE}")

# ─── Write stdin to a temp file in the SAME directory ────────────────────────
# MUST be in the same directory as LIVE_FILE (same filesystem mountpoint) so
# that the final mv(2) is a POSIX-atomic rename, not a copy-then-delete.
TMP=$(mktemp "$(dirname "${LIVE_FILE}")/.orch-apply-XXXXXXXX.json")

# Cleanup trap: remove temp on any exit (including early exits on failure).
# If the mv succeeds, TMP is set to "" to make this a no-op.
cleanup() {
  set +e
  [[ -n "${TMP:-}" && -f "${TMP}" ]] && rm -f "${TMP}"
}
trap cleanup EXIT

# Read stdin into temp file
if ! cat > "${TMP}"; then
  printf '[orch-apply] ERROR: failed to read stdin into temp file\n' >&2
  exit 3
fi

# Guard: temp file must be non-empty.
# Empty stdin = broken pipe, upstream filter produced nothing, or filter error.
if [[ ! -s "${TMP}" ]]; then
  printf '[orch-apply] ERROR: stdin produced empty candidate — aborting (no write)\n' >&2
  exit 3
fi

# ─── Validate candidate via canonical Zod validator ──────────────────────────
# REUSE bun scripts/orch-validate.mjs — do NOT duplicate validation logic.
#
# Validator exit codes (from orch-validate.mjs):
#   0 = Stage 0 + Stage 1 PASS (zero lane-coherence issues, zero dangling refs)
#   1 = Stage 0 fail: duplicate JSON keys detected in raw text
#   2 = Stage 1 fail: schema violation (OrchStateSchema.safeParse) OR
#       Stage 1b fail: lane-coherence violation (hard-fail as of
#       D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING — SHG migration complete) OR
#       Stage 1c fail: dangling detail_ref / payload_ref
#   3 = file not found / unreadable (should not occur — we created TMP above)
#
# All non-zero exits → ABORT. Live file remains untouched.
validation_output=$(bun "${REPO_ROOT}/scripts/orch-validate.mjs" "${TMP}" 2>&1) || {
  validator_exit=$?
  printf '%s\n' "${validation_output}" >&2
  printf '[orch-apply] ABORTED: validator exit %s — live file untouched\n' "${validator_exit}" >&2
  exit 1
}
# Print any pass-message or coherence warnings (non-blocking; informational)
[[ -n "${validation_output}" ]] && printf '%s\n' "${validation_output}" >&2

# ─── Stage 2: Conservation circuit-breaker ───────────────────────────────────
# REUSE bun scripts/orch-conservation-check.mjs — do NOT duplicate this logic.
# Compares the candidate's whole-board task_total/signal_total against the
# live file's current totals; aborts if either drops below FLOOR_RATIO
# (default 0.5) of its live value once live >= MIN_BASELINE (default 10).
# Closes the empirically live-exploitable full-doc-collapse class (commit
# de595a44, docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md §3/§4).
#
# NARROW NAMED BYPASS: ORCH_APPLY_ALLOW_SHRINK=<reason> — see header comment.
# Read directly by orch-conservation-check.mjs from its inherited process env;
# no special plumbing needed here beyond the normal env-inheritance a
# subprocess already gets.
conservation_output=$(bun "${REPO_ROOT}/scripts/orch-conservation-check.mjs" "${LIVE_FILE}" "${TMP}" 2>&1) || {
  conservation_exit=$?
  printf '%s\n' "${conservation_output}" >&2
  printf '[orch-apply] ABORTED: conservation check exit %s — live file untouched\n' "${conservation_exit}" >&2
  exit 1
}
[[ -n "${conservation_output}" ]] && printf '%s\n' "${conservation_output}" >&2

# ─── CAS-mtime guard: re-check before rename ─────────────────────────────────
# If the live file was modified between the caller's read and our rename,
# our candidate is stale — it may have overwritten interleaved changes.
# ABORT with a DISTINCT exit code (2) so the caller can retry:
#   re-read the live file → re-apply the filter → pipe into orch-apply.sh again.
MTIME_AFTER=$(get_mtime "${LIVE_FILE}")
if [[ "${MTIME_BEFORE}" != "${MTIME_AFTER}" ]]; then
  printf '[orch-apply] ABORTED: CAS mtime mismatch (before=%s after=%s) — concurrent write detected; caller should retry\n' \
    "${MTIME_BEFORE}" "${MTIME_AFTER}" >&2
  exit 2
fi

# ─── Atomic rename: temp → live file ─────────────────────────────────────────
# TMP and LIVE_FILE are on the same filesystem (both under docs/data/orch/).
# POSIX rename(2) is atomic: readers always see either the old or new content,
# never a partial write.
mv "${TMP}" "${LIVE_FILE}"
TMP=""  # Prevent cleanup trap from trying to rm a file that no longer exists

printf '[orch-apply] OK — candidate applied → %s\n' "${LIVE_FILE}" >&2
exit 0
