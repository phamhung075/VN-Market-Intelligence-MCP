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
#        (whole-board task_total/signal_total magnitude-ratio guard PLUS two
#        independent, never-bypassable row-identity guards: signal_queue.rows[]
#        — FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-TO-PEER-FULLDOC-WRITE
#        — and dev_team_idle_chain.pending_triage_inbox[] — FIX-ORCHAPPLY-
#        CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR, 2026-08-14,
#        which also REMOVED the inbox from the signal_total magnitude ratio
#        entirely: it is a drain-to-zero queue, not an accumulating log, so a
#        legitimate full clear must never trip a magnitude floor — see that
#        script's own header for the full rationale + the
#        ORCH_APPLY_DECLARED_INBOX_TRIAGED env var).
#        NEVER duplicated here — single SSOT. Closes the empirically live-exploitable
#        full-doc-collapse class (commit de595a44) — see
#        docs/architecture-briefs/2026-07-10-auditor-orchstate-conservation-guard.md
#     4.5. Row-level prose-ceiling guard (Stage 2.5) via bun
#        scripts/orch-row-prose-ceiling-check.mjs — GROWTH-ONLY: a row already
#        over ORCH_ROW_PROSE_CEILING_BYTES (default 12000) that is NOT growing
#        this write is a non-blocking WARN (grandfathered); only NET NEW
#        inline growth past the ceiling hard-rejects, pointing the caller at
#        detail_ref. NEVER duplicated here — single SSOT. Task:
#        FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT — see
#        docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md §2.4
#     5. Diff-based updated_at stamping via bun scripts/orch-stamp-updated-at.mjs
#        (task: FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH) — runs AFTER Stage 0/1
#        validation (so it never interferes with the raw-text dup-key scan)
#        and stamps task_board row updated_at ONLY on rows whose content
#        (excluding updated_at itself) differs from the live file. NEVER
#        duplicated here — single SSOT. NO backfill of existing null rows —
#        see the script's own header for the full diff-unit rationale.
#     6. CAS guard: baseline captured before stdin-read; re-checked before
#        ANY live-relative gate (FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1,
#        2026-08-29: runs before the Stage 2 conservation check — a stale
#        candidate is indistinguishable from a genuine conservation violation
#        against the fresher live file, so the CAS check must fire first with
#        its retryable exit 2 instead of letting the conservation check abort
#        exit 1 fatally on the same staleness). Mismatch → ABORT with exit 2
#        so caller can retry. TWO modes
#        (task: FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ):
#          - CALLER-SUPPLIED (preferred): ORCH_APPLY_CALLER_BASELINE_HASH or
#            ORCH_APPLY_CALLER_BASELINE_MTIME, captured by the CALLER
#            immediately before its own `jq` read — closes the gap where this
#            script's own start-of-process capture happens AFTER the caller
#            already read a (possibly minutes-stale) copy of the file.
#          - SELF-CAPTURED (fallback, unchanged from pre-fix behaviour): when
#            the caller supplies neither var, mtime is captured here at this
#            script's own startup, exactly as before — every caller that has
#            not yet migrated (AC-4) is byte-identical in behaviour.
#     7. Atomic rename: temp → live file
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
#        OR updated_at stamping failed (I/O error on an already-validated
#        candidate — should not occur in practice)
#        OR conservation check failed (candidate's task_total/signal_total
#        dropped below FLOOR_RATIO of the live value) — live file left UNTOUCHED
#        OR row prose-ceiling check failed (Stage 2.5 — a row's candidate
#        prose bytes exceed ORCH_ROW_PROSE_CEILING_BYTES AND its own live
#        prose bytes — net new inline growth past ceiling) — live file left
#        UNTOUCHED
#   2  = CAS mtime mismatch — concurrent writer detected; caller should retry
#   3  = usage error (empty stdin, live file missing, I/O error)
#
# HARD CONSTRAINTS:
#   - NEVER duplicate or reimplement validation logic — REUSE orch-validate.mjs,
#     orch-conservation-check.mjs, and orch-row-prose-ceiling-check.mjs
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

# ─── Portable sha256 (macOS shasum / Linux sha256sum) ────────────────────────
get_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# ─── Guard: live file must exist ─────────────────────────────────────────────
if [[ ! -f "${LIVE_FILE}" ]]; then
  printf '[orch-apply] ERROR: live file not found: %s\n' "${LIVE_FILE}" >&2
  exit 3
fi

# ─── CAS baseline: caller-supplied (preferred) or self-captured (fallback) ───
# AC-1 (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ):
# Capturing mtime HERE — at this script's own startup — is provably too late:
# in the mandated `jq '<filter>' orch-state.json | bash scripts/orch-apply.sh`
# pipeline, the caller's `jq` has ALREADY read the live file (possibly minutes
# earlier, under load) by the time this process even starts. A candidate built
# from that stale read sails through a before/after check measured entirely
# AFTER the staleness already happened — "before" here was never "before the
# caller's read", only "before this process's own (much later) start".
#
# Fix: let the CALLER pass what it observed, captured immediately before its
# own `jq` invocation — this is the actual moment that must not have moved:
#   ORCH_APPLY_CALLER_BASELINE_HASH   sha256 of the live file (preferred —
#                                      exact regardless of write cadence)
#   ORCH_APPLY_CALLER_BASELINE_MTIME  mtime (epoch seconds) of the live file
#                                      (1s resolution — fine for callers that
#                                      cannot cheaply hash a large file)
# HASH takes precedence when both are set. Canonical migrated call pattern:
#   BASELINE=$(sha256sum docs/data/orch/orch-state.json | awk '{print $1}')
#   jq '<filter>' docs/data/orch/orch-state.json \
#     | ORCH_APPLY_CALLER_BASELINE_HASH="$BASELINE" bash scripts/orch-apply.sh
#
# FALLBACK (AC-1's explicit clause — "falling back to today's behaviour only
# when the caller supplies nothing"): neither var set → mtime is self-captured
# HERE at this script's own startup, exactly as before this fix. Every
# not-yet-migrated caller (AC-4 tracked follow-up) is byte-identical in
# behaviour to pre-fix — still catches any writer landing DURING this script's
# own short lifetime; blind only to staleness predating this process, same
# blind spot as before.
if [[ -n "${ORCH_APPLY_CALLER_BASELINE_HASH:-}" ]]; then
  BASELINE_MODE="hash"
  BASELINE_BEFORE="${ORCH_APPLY_CALLER_BASELINE_HASH}"
elif [[ -n "${ORCH_APPLY_CALLER_BASELINE_MTIME:-}" ]]; then
  BASELINE_MODE="mtime"
  BASELINE_BEFORE="${ORCH_APPLY_CALLER_BASELINE_MTIME}"
else
  BASELINE_MODE="mtime"
  BASELINE_BEFORE=$(get_mtime "${LIVE_FILE}")
fi

# ─── Write stdin to a temp file in the SAME directory ────────────────────────
# MUST be in the same directory as LIVE_FILE (same filesystem mountpoint) so
# that the final mv(2) is a POSIX-atomic rename, not a copy-then-delete.
#
# PORTABILITY (task: FIX-ORCHAPPLY-MKTEMP-SUFFIX-DEFEATS-RANDOMIZATION-BSD-
# CONCURRENT-WRITER-COLLISION): the X-run MUST be the trailing component of
# the mktemp template on BOTH BSD/macOS and GNU/Linux. GNU mktemp tolerates
# (and correctly substitutes through) a literal suffix placed after the X's;
# BSD/macOS mktemp does NOT — it silently treats the whole string, suffix
# included, as ONE literal filename and never substitutes the X's at all.
# That was the defect: `.orch-apply-XXXXXXXX.json` created the literal file
# `.orch-apply-XXXXXXXX.json` every single call on macOS, so every concurrent
# writer raced for one fixed path instead of unique ones (`mkstemp failed:
# File exists` on the 2nd caller). Reproduced live 2026-08-25 with this exact
# template before applying this fix — see notebook.
#
# FIX: mktemp a template with the X-run at the very end and NO suffix
# (portable identically on both platforms), THEN rename to append the
# `.json` suffix as a separate step. `.json` carries no functional weight —
# every downstream reader (orch-validate.mjs, orch-stamp-updated-at.mjs,
# orch-conservation-check.mjs, orch-row-prose-ceiling-check.mjs) takes the
# temp path as an explicit CLI arg and calls readFileSync(path, 'utf-8') +
# JSON.parse — none of them switch on file extension. The suffix IS relied
# on by scripts/test/orch-apply-wrapper-tests.sh's leftover-temp-file check
# (`find "$FIXTURE_DIR" -name ".orch-apply-*.json"`), so this fix preserves
# the exact same final filename SHAPE (`.orch-apply-<random>.json`) rather
# than dropping the suffix — no test-side change needed.
TMP=$(mktemp "$(dirname "${LIVE_FILE}")/.orch-apply-XXXXXXXX")

# Cleanup trap: remove temp on any exit (including early exits on failure).
# If the mv succeeds, TMP is set to "" to make this a no-op.
# Registered BEFORE the suffix-rename below so a failure in that rename step
# (pre-suffix TMP path) is still cleaned up.
cleanup() {
  set +e
  [[ -n "${TMP:-}" && -f "${TMP}" ]] && rm -f "${TMP}"
}
trap cleanup EXIT

# Append the `.json` suffix now that the randomised name already exists and
# is guaranteed unique (mktemp created it with O_EXCL) — the rename itself
# cannot collide.
mv "${TMP}" "${TMP}.json"
TMP="${TMP}.json"

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

# ─── Stage 1.5: Diff-based updated_at stamping ───────────────────────────────
# REUSE bun scripts/orch-stamp-updated-at.mjs — do NOT duplicate this logic.
# Runs AFTER Stage 0/1 (the raw-text dup-key scan MUST see the untouched
# candidate bytes — stamping here would silently collapse a duplicate key
# via JSON.parse before Stage 0 ever saw it).
# Stamps task_board row `updated_at` ONLY on rows whose content changed
# versus the live file (id-keyed, updated_at itself excluded from the diff —
# see the script header for the full rationale, including the deliberate
# lane-agnostic diff-unit choice). Rewrites TMP in place; never touches
# LIVE_FILE. TaskSchema is .passthrough() so an added/updated `updated_at`
# string can never fail the schema that already passed above — no
# re-validation needed.
# Task: FIX-ORCHSTATE-UPDATED-AT-WRITE-PATH.
NOW_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
stamp_output=$(bun "${REPO_ROOT}/scripts/orch-stamp-updated-at.mjs" "${LIVE_FILE}" "${TMP}" "${NOW_TS}" 2>&1) || {
  stamp_exit=$?
  printf '%s\n' "${stamp_output}" >&2
  printf '[orch-apply] ABORTED: updated_at stamping exit %s — live file untouched\n' "${stamp_exit}" >&2
  exit 1
}
[[ -n "${stamp_output}" ]] && printf '%s\n' "${stamp_output}" >&2

# ─── CAS guard: re-check BEFORE any live-relative gate ───────────────────────
# FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1 (2026-08-29): this check MUST run before
# the conservation check (Stage 2) below, not after it. The conservation check
# compares the candidate against the LIVE file read fresh at ITS OWN
# invocation — a candidate built from a stale snapshot (the exact condition
# this CAS guard exists to detect; orch-cold-evict.sh's multi-second
# computation window is a standing example) is indistinguishable from a
# genuine violation there, so pre-reorder it aborted with a FATAL exit 1
# (conservation violation) instead of the retryable exit 2 this guard
# returns. orch-cold-evict.sh hit this live (telegram 5209, 2026-08-26): a
# peer's forward lane-moves landing in the residual window between the
# caller's own mid-loop mtime check and this script's baseline scored as
# "backward moves" against the newer live file and the whole eviction aborted
# exit 1 every tick ("cold eviction skipped, retry next tick"). With the CAS
# check first, the same staleness exits 2 and the caller retries against a
# fresh read — where the conservation check legitimately passes. A genuinely
# violating candidate built from a CURRENT read still reaches the conservation
# check unchanged (CAS passes, conservation exits 1).
# If the live file's baseline (hash or mtime, matching BASELINE_MODE above)
# differs now from what was captured/supplied as BASELINE_BEFORE, our
# candidate is stale relative to that baseline — it may have overwritten
# interleaved changes, whether they landed during THIS script's own lifetime
# (self-captured fallback mode) or any time after the caller's own read
# (caller-supplied mode — this is the gap AC-1 closes). ABORT with a DISTINCT
# exit code (2) so the caller can retry: re-read the live file → re-apply the
# filter → pipe into orch-apply.sh again (with a freshly captured baseline).
if [[ "${BASELINE_MODE}" == "hash" ]]; then
  BASELINE_AFTER=$(get_hash "${LIVE_FILE}")
else
  BASELINE_AFTER=$(get_mtime "${LIVE_FILE}")
fi
if [[ "${BASELINE_BEFORE}" != "${BASELINE_AFTER}" ]]; then
  printf '[orch-apply] ABORTED: CAS %s mismatch (before=%s after=%s) — concurrent write detected (or caller-supplied baseline was already stale relative to live); caller should retry\n' \
    "${BASELINE_MODE}" "${BASELINE_BEFORE}" "${BASELINE_AFTER}" >&2
  exit 2
fi

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
#
# ROW-IDENTITY DIMENSIONS (never bypassable by ORCH_APPLY_ALLOW_SHRINK above —
# orthogonal claims): signal_queue.rows[] via ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS
# (wired ONLY into scripts/orch-cold-evict.sh) and
# dev_team_idle_chain.pending_triage_inbox[] via ORCH_APPLY_DECLARED_INBOX_TRIAGED
# (wired ONLY into docs/agents/dev-team/flow/main.md § Step 1 "Durable-inbox
# CLEAR", FIX-ORCHAPPLY-CONSERVATION-FLOOR-BLOCKS-SANCTIONED-PO-INBOX-DRAIN-CLEAR,
# 2026-08-14) — both also just inherited env vars, no plumbing needed here either.
conservation_output=$(bun "${REPO_ROOT}/scripts/orch-conservation-check.mjs" "${LIVE_FILE}" "${TMP}" 2>&1) || {
  conservation_exit=$?
  printf '%s\n' "${conservation_output}" >&2
  printf '[orch-apply] ABORTED: conservation check exit %s — live file untouched\n' "${conservation_exit}" >&2
  exit 1
}
[[ -n "${conservation_output}" ]] && printf '%s\n' "${conservation_output}" >&2

# ─── Stage 2.5: Row-level prose-ceiling guard ────────────────────────────────
# REUSE bun scripts/orch-row-prose-ceiling-check.mjs — do NOT duplicate this
# logic. GROWTH-ONLY: a row already over ORCH_ROW_PROSE_CEILING_BYTES that is
# NOT growing this write is a non-blocking WARN (grandfathered, printed but
# does not abort); only NET NEW inline growth past the ceiling hard-rejects.
# Task: FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT — see
# docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md §2.4
# NO BYPASS ENV VAR by design (detail_ref is already the sanctioned escape
# hatch — see that script's own header for why a bypass would be a foot-gun
# with no legitimate use case, unlike ORCH_APPLY_ALLOW_SHRINK above).
ceiling_output=$(bun "${REPO_ROOT}/scripts/orch-row-prose-ceiling-check.mjs" "${LIVE_FILE}" "${TMP}" 2>&1) || {
  ceiling_exit=$?
  printf '%s\n' "${ceiling_output}" >&2
  printf '[orch-apply] ABORTED: row prose ceiling check exit %s — live file untouched\n' "${ceiling_exit}" >&2
  exit 1
}
[[ -n "${ceiling_output}" ]] && printf '%s\n' "${ceiling_output}" >&2

# ─── Atomic rename: temp → live file ─────────────────────────────────────────
# TMP and LIVE_FILE are on the same filesystem (both under docs/data/orch/).
# POSIX rename(2) is atomic: readers always see either the old or new content,
# never a partial write.
mv "${TMP}" "${LIVE_FILE}"
TMP=""  # Prevent cleanup trap from trying to rm a file that no longer exists

printf '[orch-apply] OK — candidate applied → %s\n' "${LIVE_FILE}" >&2
exit 0
