#!/usr/bin/env bash
# =============================================================================
# scripts/orch-cold-evict.sh
# =============================================================================
# ORCH-STATE-HOT-COLD-SPLIT — HSC-1 deliverable
#
# Evicts terminal records from docs/data/orch/orch-state.json (HOT) to the
# monthly cold archive at docs/data/orch/archive/YYYY-MM.json (COLD).
#
# FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT (2026-07-02): extended to also evict terminal
# .sprint_goal.entries[] (cold target: .closed_sprint_goals[]) — a SEPARATE array
# from task_board.active_sprints[], keyed by sprint_id not id, previously untouched
# by this script (root cause of sprint_goal.entries growing past its 15-entry cap).
#
# D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND (2026-07-10, sprint BACKLOG-HYGIENE-
# VERIFY-PRUNE-SWEEP): extended with a new Pass-1 category — scans the flat task
# lanes {backlog, review, qa, in_progress, ready} (NOT done/done_verified —
# already handled above) for rows whose .status is in TERMINAL_TASK_STATUSES
# (default = TERMINAL_SET, SSOT apps/mcp-server/src/infrastructure/
# orchStateSchema.ts — same set already used by TERMINAL_SPRINT_STATUSES above;
# not a new definition). Root cause: rows whose status gets flipped to a
# terminal value in-place without a lane move permanently strand in backlog[]
# (and siblings) because this script never read those lanes — see
# docs/architecture-briefs/2026-07-10-backlog-hygiene-verify-prune-sweep.md §1/§8
# (D4 row). Cold sink: the dormant `.backlog_detail[]` field in the monthly
# archive schema (already present since inception at the "create new cold
# file" branch below, previously wired to `[]` and never populated).
# Safety valve: `--exclude-ids <comma-list>` (repeatable) / `EXCLUDE_TASK_IDS`
# env — lets a one-time migration run skip D0-flagged false-positives (e.g.
# a row whose label is terminal but which is empirically still open).
#
# FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE (2026-07-29): extended with a new pass —
# .decision_journal[] entries (cold target: .decision_journal[] in the monthly
# archive), age-gated (not status-gated: this array has no status field, it is
# an append-only WHY-record audit trail with zero live readers — confirmed by
# grep, only 2 writers append to it and no flow reads it back). Same
# rank-then-cutoff shape as done[] (sort by parsed .ts desc, keep newest
# DECISION_JOURNAL_KEEP_RECENT, evict rank>=keep AND (ts null OR older than
# DECISION_JOURNAL_MAX_AGE_DAYS)). Unlike every other array here, entries have
# NO stable unique id (task_id/sprint_id repeat across multiple decisions) —
# selection + hot-removal is done by original array INDEX (safe: computed and
# applied against the same CAS-guarded hot-file snapshot within one attempt);
# idempotency on a partial-failure retry (cold written, hot write aborted) is
# guarded by CONTENT equality (tostring) against cold's existing
# .decision_journal[], not by id. Root cause + design: architect finding
# state-data-files-I7/P7, docs/architecture-briefs/2026-07-12-ultracode-
# workflow-improvement-audit.md — every other lane had an eviction/cap story,
# this one only grew (49 entries / ~70KB observed pre-fix). sprint_goal.entries[]
# and task_board.active_sprints[] were ALSO in scope for this task but verified
# EMPTY (0 evictable) at execution time — no code change was needed for those
# two, the existing FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT predicate already
# covers them correctly and simply had nothing terminal to find.
#
# FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE (2026-07-29): closes a latent
# conflict between the `--exclude-ids` safety valve above (D4) and Stage-1b
# checkLaneCoherence() in scripts/orch-validate.mjs (hard-fail since
# D5-BACKLOG-HYGIENE-VALIDATOR-HARDENING, commit ed01c5c1b). A row named in
# --exclude-ids keeps its TERMINAL status (DONE/CANCELLED/...) while remaining
# in a non-terminal lane (backlog/review/qa/in_progress/ready) by construction
# — that is exactly the shape LANE_ALLOWED_STATUSES (orchStateSchema.ts) hard-
# rejects, so the excluded row aborted the ENTIRE run via the SHG-3 write-gate
# below, not just its own eviction. FIX: build_hot_temp() now relabels an
# excluded-and-terminal row's `.status` to the lane's own coherent non-terminal
# status (EXCLUDE_RELABEL_STATUS map below) BEFORE the SHG-3 gate runs, so the
# hard-fail check itself is untouched (still zero exceptions, D5's intent
# preserved) — the DATA it validates is corrected instead. Chosen over the
# alternative (teach orch-validate.mjs an exemption list for excluded ids):
# that would touch the shared SSOT validator used by every orch-state.json
# writer, widening the blast radius of a bypass mechanism; this fix stays
# entirely inside the "sole SSOT eviction script" (R-HIGH-1) that already owns
# --exclude-ids. A `verify_note` audit trail records the original status +
# relabel timestamp so the correction is traceable, not silent. Reproduced +
# root-caused by router (git-stash-confirmed causal); rationale recorded in
# docs/agent-memory/decisions/ (decision-journal skill, task_id FIX-COLD-
# EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE).
#
# FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION (2026-08-23, Component 6
# of docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md §2):
# the done[] age/count eviction pass no longer evicts rows at status DONE — only
# DONE_VERIFIED rows parked in done[] remain evictable there. A DONE row in
# done[] is UNVERIFIED and is precisely what the Done-Lane Drain (this same
# task's widening of scripts/devteam-review-claim-qa-drain.jq and
# -secondary-drain.jq from review[] to review[] UNION done[]) exists to reach;
# cold-evicting it puts it out of reach of every hot-file-scoped mechanism
# forever and permanently starves the deps_satisfied() check of every live
# successor. Two real casualties already exist in cold at status DONE
# (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT, FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-
# LIVE-FETCH). Narrow, additive predicate change only — done_verified[], the
# flat task lanes, sprints, signals and decision_journal passes are untouched.
# Gate: scripts/test-devteam-donelane-drain.sh CASE 8.
#
# FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-EXECUTED-DATA-LOSS (2026-08-23):
# commit 38c013342e (2026-08-06) removed 10 terminal rows from the hot file
# while the corresponding archive/2026-08.json write silently never landed —
# the evictor's row SELECTION was correct, only the persistence step no-op'd,
# and nothing failed loud when it didn't. The "cold written before hot" claim
# below was true in NARRATION only at that time; it is now ENFORCED by
# verify_cold_archive_write() (called on the temp file pre-rename AND again
# on the real on-disk archive file post-rename — see that function's header)
# — any mismatch between what the ID maps say should be in cold and what is
# actually, durably on disk aborts the WHOLE run before the hot-side
# delete/write is ever reached. A partial hot-delete-only outcome is no
# longer reachable through this script's own control flow. Regression gate:
# scripts/test/orch-cold-evict-tests.sh TEST 12.
#
# CALLER-BASELINE MIGRATION (AC-1/AC-4, FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-
# AFTER-CALLER-JQ-READ, 2026-08-26): this is the first real (non-flow-doc,
# always-executing) caller migrated onto orch-apply.sh's caller-supplied CAS
# baseline. HASH_BEFORE is now captured at the very top of the retry loop
# (before compute_id_maps() reads the hot file) and threaded through as
# ORCH_APPLY_CALLER_BASELINE_HASH on the orch-apply.sh invocation below. This
# closes a residual staleness window this script's own pre-existing mtime-CAS
# loop (above) does NOT cover: a peer write landing after this loop's own
# mid-loop MTIME_BEFORE/MTIME_AFTER check but before orch-apply.sh's own CAS
# baseline is evaluated (i.e. during the cold-archive rename +
# verify_cold_archive_write() + process-spawn gap before orch-apply.sh
# starts) — pre-migration, orch-apply.sh self-captured its own baseline at
# its own (later) process startup, already downstream of such a write, so its
# check trivially matched and the peer's change was silently overwritten on
# rename. Regression + fault-injection gate: scripts/test/orch-cold-evict-
# tests.sh TEST 13 (proves the guard FIRES on an injected peer write in
# exactly this window, and still PASSES normally with none injected).
#
# Usage:
#   scripts/orch-cold-evict.sh [--dry-run] [--exclude-ids ID1,ID2 [--exclude-ids ID3]]
#
# Contract:
#   - MUST be called while commit-mutex:main is held by the caller (task_claim).
#   - Cold file is written, jq-verified, AND symmetry-verified (per-id
#     presence + exact row-count growth, re-read fresh from disk) BEFORE the
#     hot file is modified. A failed verification aborts before any hot write.
#   - Atomic temp-then-rename for both cold and hot files.
#   - mtime-CAS retry loop guards against concurrent writers.
#   - Idempotent: items already in cold are not re-added; they are still removed
#     from hot (handles cold-write-succeeded / hot-rename-failed recovery).
#   - --dry-run: reports eviction preview + projected hot-file size, no writes.
#
# Two-pass design avoids ARG_MAX limits:
#   Pass 1: compute_id_maps() → small JSON (IDs + counts only, ~60KB)
#   Pass 2: build cold temp + hot temp from hot file using those ID maps
#
# Owning brief:  docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §3
# Canonical ref: docs/policies/dev-standards.md §Script Persistence
# Called from:   HSC-2 (one-time migration); HSC-6 (pm/dev-team post-cycle hook)
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIG — all tunable; override via environment variables; NO inline magic
# =============================================================================
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# File paths
ORCH_STATE="${ORCH_STATE:-${REPO_ROOT}/docs/data/orch/orch-state.json}"
ARCHIVE_DIR="${ARCHIVE_DIR:-${REPO_ROOT}/docs/data/orch/archive}"

# Retention policy
KEEP_RECENT_DONE="${KEEP_RECENT_DONE:-10}"        # keep last N done[] items in hot
DONE_MAX_AGE_DAYS="${DONE_MAX_AGE_DAYS:-7}"       # evict done[] older than N days

# CAS: abort after this many concurrent-writer detections
MTIME_CAS_RETRIES="${MTIME_CAS_RETRIES:-3}"

# Terminal sprint statuses: comma-separated list.
# Sprints whose status field matches any of these are evicted from active_sprints[]
# AND from sprint_goal.entries[] (FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT — same predicate,
# two independent arrays; sprint_goal.entries[] is keyed by sprint_id not id).
# Sprints whose status field starts with "BCTC-" are also evicted (handled separately;
# active_sprints[] only — sprint_goal.entries[] has no BCTC-* status convention).
# SSOT: apps/mcp-server/src/infrastructure/orchStateSchema.ts TERMINAL_SET
# {DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED} — must match exactly; no ad-hoc aliases.
# Callers MUST canonicalize sprint_goal.entries[].status BEFORE this predicate can match —
# see scripts/fix-sprint-goal-status-drift-evict-normalize.jq (one-time) and
# scripts/orch-validate.mjs Stage 1d (write-time guard, prevents recurrence).
TERMINAL_SPRINT_STATUSES="${TERMINAL_SPRINT_STATUSES:-DONE,DONE_VERIFIED,CANCELLED,DEFERRED,SKIPPED}"

# Terminal signal statuses: comma-separated list.
# Rows whose status field matches any of these are evicted from signal_queue.rows[].
# signal_queue.archive[] is always fully evicted (inline archive = RC-1 root cause).
# FIX-COLDEVICT-TERMINAL-SIGNAL-STATUSES-OMITS-TRIAGED-RETRACTED (2026-08-08): the
# matching predicate below (compute_id_maps, `.status | IN($tsig_arr[])`) is EXACT-
# STRING, no case fold — so the po-terminal disposition "triaged" (lowercase, the
# live-written form per .claude/skills/signal-dashboard/SKILL.md § ACK/CLOSE
# "Extended statuses") required its own literal entry; the pre-existing uppercase
# "TRIAGED" alone (added 2026-08-01 for a different, ad-hoc-cased writer) never
# matched it. "RETRACTED" (verified false positive, same doc section) was omitted
# entirely. Live measured 2026-08-08: 226/248 signal_queue.rows[] (91%) were
# unevictable by construction — triaged=220, READ=21, RETRACTED=4, TRIAGED=3 — against
# the 200-row cap (SKILL.md § PRUNE). Both "triaged"/"TRIAGED" are added (not a
# case-fold of the comparison) to keep this fix minimal and match every other
# existing entry's exact-string convention; a case-fold would also silently admit
# any future accidentally-cased status this list has not explicitly ratified.
# SIGNAL_MAX_AGE_HOURS below is UNCHANGED by this fix (still gates all of these) —
# "triaged" is a PO-terminal disposition, not an unread escalation, so this only
# widens WHICH terminal statuses are eligible, never bypasses the age gate itself
# (see FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS above for why that
# gate must never be removed).
TERMINAL_SIGNAL_STATUSES="${TERMINAL_SIGNAL_STATUSES:-READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED,triaged,TRIAGED,RETRACTED}"

# FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS (2026-08-01): the
# signal_queue.rows[] eviction pass below previously selected on TERMINAL_SIGNAL_STATUSES
# alone with ZERO age check — unlike done[]/sprint eviction (which gate on rank AND
# cutoff), a row could get cold-evicted the SAME tick it was flipped to a terminal
# status, before a reader (e.g. po triage) ever saw it. 3/3 confirmed live incidents
# silently orphaned po-addressed escalations (most recently 2026-08-01T02:36Z, evicted
# ~18min after being marked READ) — see docs/agent-memory (memory
# feedback_coldevict_no_age_gate_orphans_unread_po_escalation.md) for the confirmation
# trail. SSOT for the cutoff value: .claude/skills/signal-dashboard/SKILL.md § PRUNE
# ("status IN (READ, RESOLVED, SUPERSEDED) AND row ts older than 24h" — set at HSC-7,
# commit bff0362c2, 2026-06-26, when PRUNE was switched from inline signal_queue.archive[]
# writes to this script; verified live/current 2026-08-01, NOT the pre-HSC-7 48h figure
# still floating in some stale prose (docs/agents/dev-team/flow/drain-signals.md
# §0a-D-PRUNE was never updated at HSC-7 and both over-states the window AND still
# references the now-removed archive[] lane — separate drift, flagged not fixed here,
# out of this task's file scope). HOURS (not days) because the doc's own unit is hours;
# a SEPARATE tunable from DONE_MAX_AGE_DAYS above by design — different lane, different
# retention story, do not conflate the two (this is NOT the unrelated 7-day/604800s
# file-plane drain window in drain-signals.md §0a-2 either).
SIGNAL_MAX_AGE_HOURS="${SIGNAL_MAX_AGE_HOURS:-24}"

# Terminal task statuses: comma-separated list (D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND).
# Rows in the flat task lanes below whose .status matches any of these are evicted.
# SAME definition as TERMINAL_SPRINT_STATUSES above — both mirror TERMINAL_SET,
# SSOT apps/mcp-server/src/infrastructure/orchStateSchema.ts:58-64. Kept as a
# separate env var (not a shared alias) only to match this script's existing
# one-tunable-per-category convention (TERMINAL_SPRINT_STATUSES / TERMINAL_SIGNAL_STATUSES);
# the DEFAULT VALUE is intentionally byte-identical — do not drift it.
TERMINAL_TASK_STATUSES="${TERMINAL_TASK_STATUSES:-DONE,DONE_VERIFIED,CANCELLED,DEFERRED,SKIPPED}"

# Flat task-board lanes scanned by the terminal-task-status pass. done[] and
# done_verified[] are deliberately EXCLUDED — they already have their own
# dedicated eviction logic above (age/keep_n policy for done[], all-terminal
# for done_verified[]); re-scanning them here would double-process the same
# rows. Matches LANE_ALLOWED_STATUSES keys minus {done, done_verified}.
TASK_LANES="${TASK_LANES:-backlog,review,qa,in_progress,ready}"

# decision_journal[] retention (FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE / P7):
# rank by parsed .ts desc, keep the newest N, evict the rest if older than
# max-age-days OR ts is null (unstamped — treated as unknown-age, same
# convention as done[]'s null created_at handling above).
DECISION_JOURNAL_KEEP_RECENT="${DECISION_JOURNAL_KEEP_RECENT:-10}"
DECISION_JOURNAL_MAX_AGE_DAYS="${DECISION_JOURNAL_MAX_AGE_DAYS:-14}"

# Safety-valve: comma-separated task IDs to NEVER evict via the terminal-task-
# status pass, regardless of status. One-time migration use case: skip a
# D0-flagged false-positive (label says terminal, reality says still open).
# Settable via env directly, or appended to via repeatable `--exclude-ids` flag.
EXCLUDE_TASK_IDS="${EXCLUDE_TASK_IDS:-}"

# FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE (2026-07-29): the coherent,
# non-terminal status a --exclude-ids row is relabeled to (build_hot_temp,
# Pass 2b) so it never sits in a lane with a status LANE_ALLOWED_STATUSES
# (apps/mcp-server/src/infrastructure/orchStateSchema.ts) rejects. One
# lane=STATUS pair per TASK_LANES member. BLOCKED where the schema admits it
# (backlog/review/in_progress — D2.5 PO-ratified sub-state); qa/ready have no
# BLOCKED entry in LANE_ALLOWED_STATUSES so they fall back to the lane's own
# sole/primary status. MUST stay in lockstep with LANE_ALLOWED_STATUSES if
# that map ever changes (mirrors the TERMINAL_TASK_STATUSES/TERMINAL_SET
# byte-identical convention above).
EXCLUDE_RELABEL_STATUS="${EXCLUDE_RELABEL_STATUS:-backlog=BLOCKED,review=BLOCKED,qa=QA,in_progress=BLOCKED,ready=READY}"

# FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING (2026-07-28):
# referential-integrity eviction guard — a candidate row (done[]/
# done_verified[]/flat-task-lane terminal) is NEVER evicted this pass if its
# own `.id` is still named in ANY LIVE row's effective_depends_on (scanned
# across TASK_LANES — the same non-terminal lane set above; done/
# done_verified rows don't need active dispatch so their own depends_on is
# irrelevant here). Independent, preventative defense-in-depth alongside
# scripts/lib/devteam-eligibility.jq dep_status_map($archive)'s cold-archive
# fallback (that fix HEALS existing dep_status_map lookups against already-
# evicted rows; this guard PREVENTS new instances of the same class from
# ever being created by eviction in the first place — see that file's
# dep_status_map($archive) header for the shared root-cause). Always reads
# the REAL repo backlog-detail.json (read-only reference lookup for
# detail_ref'd depends_on, not the per-run cold-write target) — never
# overridden by ARCHIVE_DIR, mirrors every other caller's DETAIL constant.
DETAIL_FILE="${REPO_ROOT}/docs/data/orch/archive/backlog-detail.json"
# =============================================================================

DRY_RUN=false

# ─── argument parsing ────────────────────────────────────────────────────────
# Supports (any order, repeatable --exclude-ids):
#   --dry-run
#   --exclude-ids ID1,ID2
#   --exclude-ids=ID1,ID2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --exclude-ids)
      if [[ $# -lt 2 ]]; then
        echo "[orch-cold-evict] ABORT: --exclude-ids requires a value" >&2
        exit 1
      fi
      EXCLUDE_TASK_IDS="${EXCLUDE_TASK_IDS:+${EXCLUDE_TASK_IDS},}$2"
      shift 2
      ;;
    --exclude-ids=*)
      EXCLUDE_TASK_IDS="${EXCLUDE_TASK_IDS:+${EXCLUDE_TASK_IDS},}${1#--exclude-ids=}"
      shift
      ;;
    *)
      echo "[orch-cold-evict] ABORT: unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

MONTH="$(date -u +%Y-%m)"
COLD_FILE="${ARCHIVE_DIR}/${MONTH}.json"

# Temp file handles — populated dynamically; cleaned up on EXIT
COLD_TEMP=""
HOT_TEMP=""
PROJECT_TEMP=""

# ─── cleanup temp files on any exit ──────────────────────────────────────────
cleanup() {
  # Disable errexit inside trap so false [[ ]] conditions don't alter exit code
  set +e
  if [[ -n "${COLD_TEMP:-}" && -f "${COLD_TEMP}" ]]; then rm -f "${COLD_TEMP}"; fi
  if [[ -n "${HOT_TEMP:-}"  && -f "${HOT_TEMP}"  ]]; then rm -f "${HOT_TEMP}"; fi
  if [[ -n "${PROJECT_TEMP:-}" && -f "${PROJECT_TEMP}" ]]; then rm -f "${PROJECT_TEMP}"; fi
}
trap cleanup EXIT

# ─── portable mtime (macOS stat -f / Linux stat -c) ─────────────────────────
get_mtime() {
  if stat -f "%m" "$1" 2>/dev/null; then
    return
  fi
  stat -c "%Y" "$1"
}

# ─── portable sha256 (macOS shasum / Linux sha256sum) ───────────────────────
# AC-4 (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ): mirrors
# scripts/orch-apply.sh's own get_hash() exactly — used to capture a
# caller-observed baseline (see HASH_BEFORE below) that this script threads
# into orch-apply.sh via ORCH_APPLY_CALLER_BASELINE_HASH.
get_hash() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

log() { echo "[orch-cold-evict] $*" >&2; }

# =============================================================================
# Step 1: Structural sentinel — abort early if hot file is malformed
# =============================================================================
log "Validating hot file: ${ORCH_STATE}"
jq -e '.head and .task_board and .signal_queue' "${ORCH_STATE}" >/dev/null \
  || { log "ABORT: hot file fails sentinel (.head/.task_board/.signal_queue missing)"; exit 1; }

# =============================================================================
# Step 2: Ensure archive directory exists
# =============================================================================
mkdir -p "${ARCHIVE_DIR}"

# =============================================================================
# PASS 1: compute_id_maps
# Outputs small JSON containing only IDs and counts — NOT full task objects.
# This keeps the output well under ARG_MAX so it can be passed via --argjson.
#
# Output fields:
#   rm_done, rm_dv, rm_sprint, rm_sprint_goal, rm_sig_rows, rm_task_by_lane
#     — {id:true} removal maps for hot (rm_task_by_lane is {lane: {id:true}})
#   new_cold_done_set, new_cold_sprint_set, new_cold_sprint_goal_set,
#   new_cold_signal_set, new_cold_backlog_detail_set — {id:true} for cold select
#   rm_decision_journal_idx — {"<original-array-index>":true} removal map (INDEX
#     keyed, not id-keyed — decision_journal entries have no stable unique id)
#   new_cold_decision_journal — FULL objects (small array, safe for --argjson;
#     content-deduped against cold, unlike every other new_cold_* which is an
#     {id:true} set resolved to full objects later in build_cold_temp)
#   n_evict_* counts
# =============================================================================
compute_id_maps() {
  local src="$1"
  local cold_done="$2"
  local cold_sprint="$3"
  local cold_signal="$4"
  local cold_sprint_goal="$5"
  local cold_backlog_detail="$6"
  local detail_file="$7"
  local cold_decision_journal="$8"

  jq \
    -L "${REPO_ROOT}" \
    --argjson keep_n      "${KEEP_RECENT_DONE}" \
    --argjson max_days    "${DONE_MAX_AGE_DAYS}" \
    --argjson max_hours_sig "${SIGNAL_MAX_AGE_HOURS}" \
    --arg     term_sprint "${TERMINAL_SPRINT_STATUSES}" \
    --arg     term_signal "${TERMINAL_SIGNAL_STATUSES}" \
    --arg     term_task   "${TERMINAL_TASK_STATUSES}" \
    --arg     task_lanes  "${TASK_LANES}" \
    --arg     exclude_ids "${EXCLUDE_TASK_IDS}" \
    --arg     exclude_relabel_status "${EXCLUDE_RELABEL_STATUS}" \
    --argjson cold_done   "${cold_done}" \
    --argjson cold_sprint "${cold_sprint}" \
    --argjson cold_signal "${cold_signal}" \
    --argjson cold_sprint_goal "${cold_sprint_goal}" \
    --argjson cold_backlog_detail "${cold_backlog_detail}" \
    --argjson keep_dj      "${DECISION_JOURNAL_KEEP_RECENT}" \
    --argjson max_days_dj  "${DECISION_JOURNAL_MAX_AGE_DAYS}" \
    --argjson cold_dj      "${cold_decision_journal}" \
    --slurpfile task_detail "${detail_file}" \
    '
      include "scripts/lib/devteam-eligibility";

      # FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS (2026-08-01):
      # jq fromdateiso8601 accepts ONLY the exact %Y-%m-%dT%H:%M:%SZ form. A
      # well-formed-but-non-canonical timestamp — minute precision
      # ("...T03:59Z", no seconds) or fractional-second ("...T23:00:01.546Z")
      # — THROWS. The pre-existing `try (.ts|fromdateiso8601) catch 0` at every
      # cutoff comparison in this script swallowed that throw into epoch 0
      # (== 1970-01-01), and `0 < $cutoff` is unconditionally true, so a row
      # with a genuinely well-known, recent instant was treated as infinitely
      # old and evicted regardless of real age (live incident: signal row
      # dev-20260801T035943, ts "2026-08-01T03:59Z", evicted ~22min after
      # being marked READ against a 24h gate). These two helpers normalize the
      # two known near-miss variants to canonical form BEFORE the parse
      # attempt, so the row TRUE instant is used. A value that still fails
      # after normalization (genuinely malformed, or null) falls through to
      # epoch 0 (== oldest == evictable) — the SAME poison-row-must-never-be-
      # permanently-resident convention the done[]/decision_journal[] cutoffs
      # below already use, NOT a polarity flip to "newest" (a naked flip would
      # make an unparseable ts immortal, defeating the age gate the opposite
      # way).
      def coldevict_normalize_ts_variant:
        if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]+Z$") then
          sub("\\.[0-9]+Z$"; "Z")                      # strip fractional seconds
        elif test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$") then
          sub("Z$"; ":00Z")                            # pad missing :SS
        else
          null
        end;

      def coldevict_ts_epoch_or_oldest:
        if . == null then 0
        else
          ( . as $raw
            | (try ($raw | fromdateiso8601) catch null) as $exact
            | if $exact != null then $exact
              else
                ($raw | coldevict_normalize_ts_variant) as $norm
                | if $norm != null then (try ($norm | fromdateiso8601) catch null) else null end
              end
          ) // 0
        end;

      . as $root |

      # ── parse config ─────────────────────────────────────────────────────
      ($term_sprint | split(",")) as $ts_arr |
      ($term_signal | split(",")) as $tsig_arr |
      ($term_task   | split(",")) as $tt_arr |
      ($task_lanes  | split(",")) as $lane_arr |
      ($exclude_ids | split(",") | map(select(. != ""))
        | map({key: ., value: true}) | from_entries) as $excl_set |
      # FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE: lane -> relabel-target
      # status map, parsed from "lane=STATUS,lane=STATUS,...".
      ($exclude_relabel_status | split(",") | map(select(. != ""))
        | map(split("=")) | map({key: .[0], value: .[1]}) | from_entries)
        as $relabel_status_by_lane |
      (now - ($max_days * 86400)) as $cutoff |
      (now - ($max_days_dj * 86400)) as $dj_cutoff |
      # FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS: hours-granularity
      # cutoff, distinct from $cutoff (days-granularity, done[] lane) above.
      (now - ($max_hours_sig * 3600)) as $sig_cutoff |

      # ── FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING referential
      # eviction guard: union of effective_depends_on across every row in
      # every LIVE lane ($lane_arr == TASK_LANES, the same non-terminal set
      # scanned by the terminal-task-status pass below — done[]/
      # done_verified[] rows need no active dispatch so their own
      # depends_on is irrelevant here). A terminal-status candidate named
      # in ANY live rows effective_depends_on/depends/blocked_by is held
      # OUT of eviction this pass — see DETAIL_FILE header comment above
      # for why this is independent, preventative defense-in-depth
      # alongside scripts/lib/devteam-eligibility.jq dep_status_map($archive).
      (detail_items_from($task_detail)) as $detail_items |
      ( [ $lane_arr[] as $lane
          | ($root.task_board[$lane] // [])[]
          | effective_depends_on($detail_items)[]
        ] | map({key: ., value: true}) | from_entries
      ) as $referenced_dep_ids |

      # cold-known ID sets (for idempotency + partial-failure recovery)
      ($cold_done   | map({key: (. // ""), value: true}) | from_entries) as $cd_set   |
      ($cold_sprint | map({key: (. // ""), value: true}) | from_entries) as $cs_set   |
      ($cold_signal | map({key: (. // ""), value: true}) | from_entries) as $csig_set |
      ($cold_sprint_goal | map({key: (. // ""), value: true}) | from_entries) as $csg_set |
      ($cold_backlog_detail | map({key: (. // ""), value: true}) | from_entries) as $cbd_set |

      # ── done[]: sort DESC; evict beyond keep_n AND older than cutoff ─────
      # FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP defect (A): this was
      # a plain STRING sort on the raw created_at value. A poison non-ISO
      # string (e.g. "unknown") string-sorts ABOVE every real ISO-8601 date
      # (char u > any digit), so after sort_by|reverse a malformed row ranked as
      # the NEWEST item — permanently un-evictable, and consuming the entire
      # keep_n window. Sort on the PARSED epoch instead, with any unparseable
      # value mapped to 0 (== 1970-01-01, i.e. OLDEST) — this is the SAME
      # sentinel the age-gate below already uses (`try fromdateiso8601 catch
      # 0`), so a malformed value can never rank ahead of a genuinely recent
      # row again.
      (.task_board.done // []
        | sort_by(try (.created_at | fromdateiso8601) catch 0)
        | reverse
        | to_entries
      ) as $done_ranked |

      # ALL terminal done IDs (remove from hot regardless of cold status)
      #
      # FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION Component 6
      # (architect brief docs/architecture-briefs/2026-08-08-donelane-
      # doneverified-producer.md §2): `.status == "DONE"` rows in done[] are
      # UNVERIFIED — they are exactly the rows the Done-Lane Drain
      # (scripts/devteam-review-claim-qa-drain.jq /
      # -secondary-drain.jq, widened to review[] UNION done[] by this same
      # task) exists to reach. Evicting one on age/rank alone puts it out of
      # reach of every hot-file-scoped mechanism forever: two real casualties
      # (FIX-BCTC-TABLE-COLUMN-FPT-OVERFIT, FIX-CYCLEJOB-1294-MACRO-TEST-
      # UNMOCKED-LIVE-FETCH) are already cold-archived at status DONE and
      # permanently starve the deps_satisfied() check of every live successor.
      # The pre-existing referential-integrity guard below only protects a
      # DONE row that still has a LIVE dependent naming it; this guard closes
      # the general case. Only a DONE_VERIFIED row parked in done[] (a legacy
      # lane placement — already verified, nothing left to produce) stays
      # eligible for age/count eviction here. done_verified[] is unaffected.
      [$done_ranked[] | select(
          .key >= $keep_n and
          (.value.status != "DONE") and
          (.value.created_at == null or
           (try (.value.created_at | fromdateiso8601) catch 0) < $cutoff)
        ) | (.value.id // "")
      ] as $all_terminal_done_ids_raw |

      # FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING referential
      # guard: drop any still-referenced id (see guard comment above).
      # downstream new_done_ids/rm_done/counts all derive from the guarded
      # set, not the raw one — the raw set is kept only so the report below
      # can show an exact "held back by guard" count.
      [$all_terminal_done_ids_raw[] | select($referenced_dep_ids[.] != true)]
        as $all_terminal_done_ids |

      # done[] IDs that are new to cold (not already there)
      [$all_terminal_done_ids[] | select(
          . != "" and ($cd_set[.] != true)
        )
      ] as $new_done_ids |

      # ── done_verified[]: all items are terminal ──────────────────────────
      # FIX-COLDEVICT-DONE-LANE-TRIGGER-ACTION-AXIS-NOOP defect (C): the old
      # shape `[array // [] | .[].id // ""]` puts the `[]` element-iterator
      # INSIDE the same pipeline as the `// ""` alternative. The jq `//` operator fires
      # whenever its LHS produces ZERO outputs (not just null/false) — and
      # `.[]` over a genuinely empty array produces zero outputs — so on an
      # EMPTY array this yielded `[""]` (length 1), not `[]`. Moving the `[]`
      # iterator OUTSIDE the `// []` (so it only ever iterates a real array)
      # and applying `// ""` per-element (a per-id null-id fallback, not an
      # empty-array fallback) fixes both: empty array -> [], and a real
      # element with a null id -> "".
      [(.task_board.done_verified // [])[] | (.id // "")] as $all_terminal_dv_ids_raw |

      # FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING referential
      # guard — same raw/guarded split as done[] above.
      [$all_terminal_dv_ids_raw[] | select($referenced_dep_ids[.] != true)]
        as $all_terminal_dv_ids |

      [$all_terminal_dv_ids[] | select(
          . != "" and ($cd_set[.] != true)
        )
      ] as $new_dv_ids |

      # ── active_sprints[]: terminal status or BCTC-* status prefix ────────
      # Skip sprints with null id (cannot be tracked)
      [.task_board.active_sprints // [] | .[] | select(
          .id != null and
          (((.status // "") | IN($ts_arr[])) or ((.status // "") | startswith("BCTC-")))
        ) | .id
      ] as $all_terminal_sprint_ids |

      [$all_terminal_sprint_ids[] | select($cs_set[.] != true)] as $new_sprint_ids |

      # ── sprint_goal.entries[]: terminal status (FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT) ─
      # Distinct array from active_sprints[] above (same predicate, keyed by sprint_id
      # not id). Caller MUST have already canonicalized status tokens (see
      # scripts/fix-sprint-goal-status-drift-evict-normalize.jq) — this predicate does
      # ONLY exact TERMINAL_SET matching, no alias/case-insensitive fallback.
      [.sprint_goal.entries // [] | .[] | select(
          .sprint_id != null and ((.status // "") | IN($ts_arr[]))
        ) | .sprint_id
      ] as $all_terminal_sprint_goal_ids |

      [$all_terminal_sprint_goal_ids[] | select($csg_set[.] != true)] as $new_sprint_goal_ids |

      # ── signal_queue.rows[]: terminal statuses AND age cutoff ────────────
      # FIX-COLDEVICT-SIGNALQUEUE-NO-AGE-GATE-ORPHANS-READ-ROWS: previously status-only
      # (no .ts term at all) — a row could be evicted the same tick it was flipped to a
      # terminal status. Now ANDed with $sig_cutoff, mirroring the done[]/decision_journal[]
      # null-ts convention above (null/unparseable ts == unknown-age == treated as oldest,
      # so a poison row is never permanently un-evictable).
      # FIX-COLDEVICT-MALFORMED-TS-CATCH0-EVICTS-FRESH-SIGNAL-ROWS: the age term now goes
      # through coldevict_ts_epoch_or_oldest (normalizes minute-precision / fractional-
      # second variants to their TRUE instant before comparing against $sig_cutoff) instead
      # of a bare `try fromdateiso8601 catch 0` — the raw form silently mapped ANY
      # non-canonical-but-well-formed .ts to epoch 0, defeating this very age gate for
      # every writer that omits seconds or emits milliseconds.
      [.signal_queue.rows // [] | .[] | select(
          .id != null and (.status | IN($tsig_arr[])) and
          ((.ts | coldevict_ts_epoch_or_oldest) < $sig_cutoff)
        ) | .id
      ] as $all_terminal_sig_row_ids |

      [$all_terminal_sig_row_ids[] | select($csig_set[.] != true)] as $new_sig_row_ids |

      # ── signal_queue.archive[]: ALL items evicted (inline archive = RC-1) ─
      # Same defect (C) fix as done_verified[] above — `[]` moved outside `// []`.
      [(.signal_queue.archive // [])[] | (.id // "")] as $all_sig_archive_ids |

      [$all_sig_archive_ids[] | select(. != "" and ($csig_set[.] != true))] as $new_sig_arch_ids |

      # ── flat task lanes (backlog/review/qa/in_progress/ready): terminal
      # status (D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND) ──────────────────
      # done[]/done_verified[] are excluded from $lane_arr by config (own logic
      # above). --exclude-ids safety valve applied here (per-lane, per-row).
      # Referential guard (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-
      # MISSING) applied inline the same way as $excl_set — a row still
      # named in $referenced_dep_ids is never terminal-evicted this pass.
      # $terminal_ids_by_lane_raw (no referential guard) is kept ONLY so the
      # report below can show an exact "held back by guard" count.
      (reduce $lane_arr[] as $lane (
        {};
        . + { ($lane): [
          ($root.task_board[$lane] // [])[] | select(
            (.id != null) and
            ((.status // "") | IN($tt_arr[])) and
            ($excl_set[(.id // "")] != true)
          ) | .id
        ] }
      )) as $terminal_ids_by_lane_raw |

      ($terminal_ids_by_lane_raw
        | map_values([.[] | select($referenced_dep_ids[.] != true)])
      ) as $terminal_ids_by_lane |

      [$lane_arr[] as $lane | $terminal_ids_by_lane[$lane][]] as $all_terminal_task_ids |

      [$all_terminal_task_ids[] | select($cbd_set[.] != true)] as $new_task_ids |

      ($lane_arr | map({
          key: .,
          value: ($terminal_ids_by_lane[.] | map({key: ., value: true}) | from_entries)
        }) | from_entries) as $rm_task_by_lane |

      # FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE: rows that WOULD have
      # been terminal-evicted this pass but are held back by $excl_set (the
      # --exclude-ids safety valve, D4) — the INVERSE selector of
      # $terminal_ids_by_lane_raw above. These are relabeled (not evicted) in
      # build_hot_temp so a terminal status never sits in a non-terminal lane
      # (the exact shape Stage-1b checkLaneCoherence() hard-rejects).
      (reduce $lane_arr[] as $lane (
        {};
        . + { ($lane): [
          ($root.task_board[$lane] // [])[] | select(
            (.id != null) and
            ((.status // "") | IN($tt_arr[])) and
            ($excl_set[(.id // "")] == true)
          ) | .id
        ] }
      )) as $excluded_terminal_ids_by_lane |

      ($lane_arr | map({
          key: .,
          value: (
            ($relabel_status_by_lane[.] // "BLOCKED") as $target |
            $excluded_terminal_ids_by_lane[.]
              | map({key: ., value: $target}) | from_entries
          )
        }) | from_entries) as $relabel_excluded_by_lane |

      # ── decision_journal[]: age-gated, INDEX-keyed (no stable unique id —
      # task_id/sprint_id repeat across multiple decisions) (FU-ORCH-HOT-
      # SUB150-SPRINT-LIFECYCLE / P7) ───────────────────────────────────────
      ($cold_dj | map(tostring)) as $cold_dj_strs |
      (
        (.decision_journal // [])
        | to_entries
        | map(.value + {_src_idx: .key})
      ) as $dj_indexed |
      (
        $dj_indexed
        | sort_by(try (.ts | fromdateiso8601) catch 0)
        | reverse
        | to_entries
      ) as $dj_ranked |
      [
        $dj_ranked[] | select(
            .key >= $keep_dj and
            (.value.ts == null or (try (.value.ts | fromdateiso8601) catch 0) < $dj_cutoff)
        ) | .value
      ] as $dj_evict_candidates |
      ($dj_evict_candidates | map({key: (._src_idx | tostring), value: true}) | from_entries)
        as $rm_decision_journal_idx |
      ([$dj_evict_candidates[] | del(._src_idx)]) as $dj_evict_clean |
      # FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-EXECUTED-DATA-LOSS
      # (2026-08-23): `$cold_dj_strs | index(tostring)` is a jq gotcha —
      # for `index(f)`, the argument filter `f` runs with `.` bound to the
      # input of index() itself (here `$cold_dj_strs`, the whole array), NOT
      # to the element being tested by the outer `select`. `tostring`
      # therefore stringifies the ARRAY, then searches for that array-string
      # inside itself — always null, so this dedup check was a silent
      # permanent no-op (every candidate always looked "new"). Harmless in
      # every path exercised by the pre-existing test suite (a retry only
      # ever re-evaluates this once the source rows are already gone from
      # hot, so there was nothing left to re-add) but a genuine latent bug on
      # the documented cold-write-succeeded/hot-rename-failed retry path this
      # script exists to support: a retry would have silently DUPLICATED
      # decision_journal entries in cold instead of skipping already-archived
      # ones. Fixed by binding the candidate stringified form to a variable
      # BEFORE piping into index(), so `.` inside the index() argument is
      # never reached at all.
      ([$dj_evict_clean[] | . as $dj_item | ($dj_item | tostring) as $dj_str
        | select(($cold_dj_strs | index($dj_str)) == null)])
        as $new_dj_entries |

      # ── output: IDs and lookup maps only (NOT full objects) ──────────────
      {
        # {id: true} removal maps for hot file transformation
        rm_done:        ($all_terminal_done_ids | map({key: ., value: true}) | from_entries),
        rm_dv:          ($all_terminal_dv_ids   | map({key: ., value: true}) | from_entries),
        rm_sprint:      ($all_terminal_sprint_ids | map({key: ., value: true}) | from_entries),
        rm_sprint_goal: ($all_terminal_sprint_goal_ids | map({key: ., value: true}) | from_entries),
        rm_sig_rows:    ($all_terminal_sig_row_ids | map({key: ., value: true}) | from_entries),
        # {lane: {id: true}} removal map — one sub-map per flat task lane
        rm_task_by_lane: $rm_task_by_lane,
        # {"<original-index>": true} removal map — decision_journal has no
        # stable unique id, so removal from hot is by array position.
        rm_decision_journal_idx: $rm_decision_journal_idx,
        # {lane: {id: target_status}} — FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-
        # COHERENCE: excluded rows relabeled (not removed) in build_hot_temp.
        relabel_excluded_by_lane: $relabel_excluded_by_lane,

        # {id: true} sets for selecting new items to cold
        # done + done_verified share the same cold target (done_tasks[])
        new_cold_done_set:        (($new_done_ids + $new_dv_ids) | map({key: ., value: true}) | from_entries),
        new_cold_sprint_set:      ($new_sprint_ids | map({key: ., value: true}) | from_entries),
        new_cold_sprint_goal_set: ($new_sprint_goal_ids | map({key: ., value: true}) | from_entries),
        # rows + archive share the same cold target (signal_rows[])
        new_cold_signal_set: (($new_sig_row_ids + $new_sig_arch_ids) | map({key: ., value: true}) | from_entries),
        # flat-task-lane terminal rows share the cold target (backlog_detail[])
        new_cold_backlog_detail_set: ($new_task_ids | map({key: ., value: true}) | from_entries),
        # FULL objects (content-deduped against cold), not an {id:true} set —
        # decision_journal entries have no stable unique id to key a set by.
        new_cold_decision_journal: $new_dj_entries,

        # Counts for reporting
        n_evict_done:        ($all_terminal_done_ids | length),
        n_evict_dv:          ($all_terminal_dv_ids | length),
        n_evict_sprints:     ($all_terminal_sprint_ids | length),
        n_evict_sprint_goal: ($all_terminal_sprint_goal_ids | length),
        n_evict_sig_rows:    ($all_terminal_sig_row_ids | length),
        n_evict_sig_arch:    ($all_sig_archive_ids | length),
        n_evict_task_total:  ($all_terminal_task_ids | length),
        n_evict_task_by_lane: ($lane_arr | map({key: ., value: ($terminal_ids_by_lane[.] | length)}) | from_entries),
        n_evict_decision_journal: ($dj_evict_candidates | length),
        # FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE: rows relabeled (kept,
        # not evicted) this pass because they are both terminal-status AND
        # named in --exclude-ids. Non-zero is expected/healthy whenever the
        # safety valve is actually in use.
        n_relabel_excluded: (
          [$lane_arr[] as $lane | $excluded_terminal_ids_by_lane[$lane][]] | length
        ),
        n_new_cold: (
          ($new_done_ids | length) + ($new_dv_ids | length) +
          ($new_sprint_ids | length) + ($new_sprint_goal_ids | length) +
          ($new_sig_row_ids | length) + ($new_sig_arch_ids | length) +
          ($new_task_ids | length) + ($new_dj_entries | length)
        ),

        # FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING referential
        # eviction guard — ids that WOULD have been evicted this pass but
        # were held back because a live rows effective_depends_on still
        # names them. Empty in the normal case; non-empty is expected and
        # healthy (not an error) whenever a dependent has not drained yet.
        guard_ref_held_ids: (
          [$all_terminal_done_ids_raw[] | select($referenced_dep_ids[.] == true)]
          + [$all_terminal_dv_ids_raw[] | select($referenced_dep_ids[.] == true)]
          + [$lane_arr[] as $lane | $terminal_ids_by_lane_raw[$lane][] | select($referenced_dep_ids[.] == true)]
        ) | unique,
        n_guard_ref_held: (
          ([$all_terminal_done_ids_raw[] | select($referenced_dep_ids[.] == true)]
          + [$all_terminal_dv_ids_raw[] | select($referenced_dep_ids[.] == true)]
          + [$lane_arr[] as $lane | $terminal_ids_by_lane_raw[$lane][] | select($referenced_dep_ids[.] == true)]
          ) | unique | length
        )
      }
    ' "${src}"
}

# =============================================================================
# PASS 2a: build_cold_temp
# Reads hot file directly to select full objects by ID (avoids passing large data
# through shell vars). Uses --slurpfile for hot file in the append case.
# =============================================================================
build_cold_temp() {
  local maps="$1"   # small JSON from compute_id_maps
  local output="$2" # destination temp file

  if [[ -f "${COLD_FILE}" ]]; then
    # Append new items to existing cold file.
    # --slurpfile hot wraps orch-state.json as array; access via $hot[0].
    jq \
      --argjson maps  "${maps}" \
      --arg     task_lanes "${TASK_LANES}" \
      --slurpfile hot "${ORCH_STATE}" \
      '
        ($maps.new_cold_done_set)        as $cd_set   |
        ($maps.new_cold_sprint_set)      as $cs_set   |
        ($maps.new_cold_sprint_goal_set) as $csg_set  |
        ($maps.new_cold_signal_set)      as $csig_set |
        ($maps.new_cold_backlog_detail_set) as $nbd_set |
        ($task_lanes | split(",")) as $lane_arr |

        (
          (($hot[0].task_board.done // []) + ($hot[0].task_board.done_verified // [])) |
          [.[] | select((.id // "") as $id | $cd_set[$id] == true)]
        ) as $new_done |
        (
          $hot[0].task_board.active_sprints // [] |
          [.[] | select((.id // "") as $id | $cs_set[$id] == true)]
        ) as $new_sprints |
        (
          $hot[0].sprint_goal.entries // [] |
          [.[] | select((.sprint_id // "") as $id | $csg_set[$id] == true)]
        ) as $new_sprint_goals |
        (
          (($hot[0].signal_queue.rows // []) + ($hot[0].signal_queue.archive // [])) |
          [.[] | select((.id // "") as $id | $csig_set[$id] == true)]
        ) as $new_signals |
        (
          [ $lane_arr[] as $lane | ($hot[0].task_board[$lane] // [])[] |
            select((.id // "") as $id | $nbd_set[$id] == true)
          ]
        ) as $new_backlog_detail |

        .done_tasks          += $new_done          |
        .closed_sprints      += $new_sprints       |
        .closed_sprint_goals  = ((.closed_sprint_goals // []) + $new_sprint_goals) |
        .signal_rows         += $new_signals       |
        .backlog_detail       = ((.backlog_detail // []) + $new_backlog_detail) |
        .decision_journal     = ((.decision_journal // []) + $maps.new_cold_decision_journal)
      ' "${COLD_FILE}" > "${output}"
  else
    # Create new cold file with schema from §3.2 of brief.
    jq \
      --argjson maps "${maps}" \
      --arg     month "${MONTH}" \
      --arg     now   "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --arg     task_lanes "${TASK_LANES}" \
      '
        ($maps.new_cold_done_set)        as $cd_set   |
        ($maps.new_cold_sprint_set)      as $cs_set   |
        ($maps.new_cold_sprint_goal_set) as $csg_set  |
        ($maps.new_cold_signal_set)      as $csig_set |
        ($maps.new_cold_backlog_detail_set) as $nbd_set |
        ($task_lanes | split(",")) as $lane_arr |
        {
          month:      $month,
          created_at: $now,
          done_tasks: [
            ((.task_board.done // []) + (.task_board.done_verified // [])) |
            .[] | select((.id // "") as $id | $cd_set[$id] == true)
          ],
          closed_sprints: [
            .task_board.active_sprints // [] | .[] |
            select((.id // "") as $id | $cs_set[$id] == true)
          ],
          closed_sprint_goals: [
            .sprint_goal.entries // [] | .[] |
            select((.sprint_id // "") as $id | $csg_set[$id] == true)
          ],
          signal_rows: [
            ((.signal_queue.rows // []) + (.signal_queue.archive // [])) |
            .[] | select((.id // "") as $id | $csig_set[$id] == true)
          ],
          # D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND: previously always [] —
          # now the cold sink for terminal-status rows evicted from the flat
          # task lanes (backlog/review/qa/in_progress/ready).
          backlog_detail: [
            $lane_arr[] as $lane | (.task_board[$lane] // [])[] |
            select((.id // "") as $id | $nbd_set[$id] == true)
          ],
          # FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE / P7: age-evicted decision_journal
          # entries (full objects, already computed + content-deduped upstream).
          decision_journal: $maps.new_cold_decision_journal
        }
      ' "${ORCH_STATE}" > "${output}"
  fi
}

# =============================================================================
# PASS 2b: build_hot_temp
# Filters out all terminal items from hot file; empties signal_queue.archive.
# =============================================================================
build_hot_temp() {
  local maps="$1"   # small JSON from compute_id_maps
  local output="$2" # destination temp file

  jq \
    --argjson maps "${maps}" \
    --arg     task_lanes "${TASK_LANES}" \
    --arg     now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '
      .task_board.done           |= [.[] | select((.id // "") as $id | $maps.rm_done[$id]     != true)] |
      .task_board.done_verified  |= [.[] | select((.id // "") as $id | $maps.rm_dv[$id]       != true)] |
      .task_board.active_sprints |= [.[] | select((.id // "") as $id | $maps.rm_sprint[$id]   != true)] |
      .sprint_goal.entries       |= [.[] | select((.sprint_id // "") as $id | $maps.rm_sprint_goal[$id] != true)] |
      .signal_queue.rows         |= [.[] | select((.id // "") as $id | $maps.rm_sig_rows[$id] != true)] |
      .signal_queue.archive       = [] |
      # D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND: remove terminal-status rows
      # from each flat task lane (backlog/review/qa/in_progress/ready).
      # FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE: rows kept because they
      # are --exclude-ids-excluded are then RELABELED (not removed) to the
      # lane-coherent status computed in compute_id_maps
      # ($relabel_excluded_by_lane) — closes the Stage-1b checkLaneCoherence()
      # hard-fail this safety valve used to trigger. verify_note records the
      # original status + timestamp so the correction is auditable.
      reduce ($task_lanes | split(","))[] as $lane (
        .;
        .task_board[$lane] = ((.task_board[$lane] // []) |
          [.[] | select((.id // "") as $id | ($maps.rm_task_by_lane[$lane][$id] // false) != true)]
          | map(
              (.id // "") as $id |
              ($maps.relabel_excluded_by_lane[$lane][$id] // null) as $target |
              if $target != null then
                . + {
                  status: $target,
                  verify_note: (
                    "FIX-COLD-EVICT-EXCLUDE-IDS-VS-HARD-COHERENCE: --exclude-ids safety valve relabeled "
                    + (.status // "?") + " -> " + $target + " at " + $now + " for lane coherence"
                    + (if ((.verify_note // "") | length) > 0
                       then " | prior verify_note: " + .verify_note
                       else "" end)
                  )
                }
              else . end
            ))
      ) |
      # FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE / P7: remove age-evicted
      # decision_journal[] entries by original array INDEX (no stable id).
      .decision_journal = ((.decision_journal // [])
        | to_entries
        | [.[] | select(($maps.rm_decision_journal_idx[(.key | tostring)] // false) != true) | .value])
    ' "${ORCH_STATE}" > "${output}"
}

# =============================================================================
# Helper: read cold-known IDs from existing cold file (for idempotency)
# Sets globals: COLD_DONE_IDS, COLD_SPRINT_IDS, COLD_SPRINT_GOAL_IDS,
#               COLD_SIGNAL_IDS, COLD_BACKLOG_DETAIL_IDS, COLD_DECISION_JOURNAL
# =============================================================================
read_cold_ids() {
  if [[ -f "${COLD_FILE}" ]]; then
    jq -e '.month and .done_tasks and .closed_sprints and .signal_rows' "${COLD_FILE}" >/dev/null \
      || { log "ABORT: existing cold file structure invalid: ${COLD_FILE}"; exit 1; }
    COLD_DONE_IDS=$(jq '[.done_tasks[].id // ""]' "${COLD_FILE}")
    COLD_SPRINT_IDS=$(jq '[.closed_sprints[].id // ""]' "${COLD_FILE}")
    # closed_sprint_goals is new-additive (FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT) —
    # `// []` default so pre-existing cold files without this key still parse.
    COLD_SPRINT_GOAL_IDS=$(jq '[(.closed_sprint_goals // [])[].sprint_id // ""]' "${COLD_FILE}")
    COLD_SIGNAL_IDS=$(jq '[.signal_rows[].id // ""]' "${COLD_FILE}")
    # backlog_detail is the D4-BACKLOG-HYGIENE-ORCH-COLD-EVICT-EXTEND cold sink —
    # `// []` default so pre-existing cold files (field always present but empty
    # since inception) and any legacy file missing the key still parse.
    COLD_BACKLOG_DETAIL_IDS=$(jq '[(.backlog_detail // [])[].id // ""]' "${COLD_FILE}")
    # decision_journal is new-additive (FU-ORCH-HOT-SUB150-SPRINT-LIFECYCLE / P7) —
    # FULL objects (not ids — content-deduped, see compute_id_maps).
    COLD_DECISION_JOURNAL=$(jq '(.decision_journal // [])' "${COLD_FILE}")
  else
    COLD_DONE_IDS='[]'
    COLD_SPRINT_IDS='[]'
    COLD_SPRINT_GOAL_IDS='[]'
    COLD_SIGNAL_IDS='[]'
    COLD_BACKLOG_DETAIL_IDS='[]'
    COLD_DECISION_JOURNAL='[]'
  fi
}

# =============================================================================
# Helper: total row count across every cold-target array in a given cold file.
# Missing file == 0 (never errors — used as both a "before" and "after"
# snapshot around the atomic cold-file rename in the LIVE path below).
# =============================================================================
count_cold_rows() {
  local f="$1"
  if [[ ! -f "${f}" ]]; then echo 0; return; fi
  jq '
    ((.done_tasks // [])          | length) +
    ((.closed_sprints // [])      | length) +
    ((.closed_sprint_goals // []) | length) +
    ((.signal_rows // [])         | length) +
    ((.backlog_detail // [])      | length) +
    ((.decision_journal // [])    | length)
  ' "${f}"
}

# =============================================================================
# Hot/cold symmetry self-check (FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-
# EXECUTED-DATA-LOSS): verifies a candidate cold-archive file genuinely
# contains every row this pass's ID maps say it is adding — both by per-id
# presence (done_tasks/closed_sprints/closed_sprint_goals/signal_rows/
# backlog_detail matched by id; decision_journal matched by content-equality,
# it has no stable id) AND by an independent row-COUNT-growth check (the
# archive's total row count across all six cold arrays must have grown by
# EXACTLY n_new_cold — the maps' own count of rows genuinely new to cold this
# pass, relative to the $before_total snapshot the caller took immediately
# before this pass began writing).
#
# Root-cause context: commit 38c013342e (2026-08-06) removed 10 terminal rows
# from the hot file with ZERO corresponding write ever landing in
# archive/2026-08.json, despite this script's own header comment and the
# commit message narrating an atomic hot-delete+cold-write pair — the
# evictor's SELECTION was correct, only the persistence step silently no-op'd
# (see docs/data/orch/orch-state.json row FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-
# WRITE-NEVER-EXECUTED-DATA-LOSS for the full forensic trail). This check
# makes that outcome structurally unreachable: called BOTH on the temp file
# (before the hot file is ever touched) and again on the REAL on-disk archive
# path immediately after the rename — a temp-only check cannot detect the
# rename silently not landing, or a concurrent writer racing it; only a fresh
# re-read of the real target path after the fact can. Either call site
# failing aborts the WHOLE run before the hot-side delete/rename ever
# executes (see call sites below) — a partial hot-delete-only outcome is no
# longer reachable through this script's own control flow.
#
# NOTE on the growth invariant: this deliberately checks growth against
# n_new_cold, NOT against "rows removed from hot" — those two counts are
# identical for a normal (first-time) eviction pass, which is exactly the
# shape 38c013342e was, but they intentionally DIVERGE during the idempotent
# partial-failure-recovery path this script's own header already documents
# ("items already in cold are not re-added; they are still removed from
# hot"). Asserting growth == removed-from-hot unconditionally would make that
# documented recovery path permanently unable to complete (TEST 4 in
# scripts/test/orch-cold-evict-tests.sh exercises exactly this — a second,
# idempotent run correctly produces ZERO cold growth while still removing
# from hot). n_new_cold is the correct invariant in both cases.
#
# Returns 0 (ok, silent) on success. Returns 1 + logs a diagnostic on any
# mismatch. Never mutates anything itself.
# =============================================================================
verify_cold_archive_write() {
  local maps="$1"
  local target="$2"
  local before_total="$3"
  local label="$4"

  if [[ ! -f "${target}" ]]; then
    log "SYMMETRY-CHECK FAILED (${label}): target file does not exist: ${target}"
    return 1
  fi

  local result ok
  result=$(jq --argjson maps "${maps}" '
    ($maps.new_cold_done_set // {})            as $cd   |
    ($maps.new_cold_sprint_set // {})          as $cs   |
    ($maps.new_cold_sprint_goal_set // {})     as $csg  |
    ($maps.new_cold_signal_set // {})          as $csig |
    ($maps.new_cold_backlog_detail_set // {})  as $cbd  |
    ($maps.new_cold_decision_journal // [])    as $cdj  |

    ((.done_tasks // [])          | map(.id // ""))          as $have_done |
    ((.closed_sprints // [])      | map(.id // ""))          as $have_sprint |
    ((.closed_sprint_goals // []) | map(.sprint_id // ""))   as $have_sprint_goal |
    ((.signal_rows // [])         | map(.id // ""))          as $have_signal |
    ((.backlog_detail // [])      | map(.id // ""))          as $have_backlog |
    ((.decision_journal // [])    | map(tostring))           as $have_dj_strs |

    (($cd | keys)  - $have_done)          as $missing_done |
    (($cs | keys)  - $have_sprint)        as $missing_sprint |
    (($csg | keys) - $have_sprint_goal)   as $missing_sprint_goal |
    (($csig | keys) - $have_signal)       as $missing_signal |
    (($cbd | keys) - $have_backlog)       as $missing_backlog |
    # NOTE: bind the candidate tostring BEFORE piping into index() — see the
    # jq `index(f)` dot-binding gotcha explained at compute_id_maps
    # $new_dj_entries above (piping straight into index(tostring) stringifies
    # the ARRAY being searched, not the element — always null, false-negative
    # "missing").
    ([$cdj[] | . as $dj_item | ($dj_item | tostring) as $dj_str
      | select(($have_dj_strs | index($dj_str)) == null)]) as $missing_dj |

    ($missing_done + $missing_sprint + $missing_sprint_goal + $missing_signal + $missing_backlog)
      as $missing_ids |

    {
      ok: (($missing_ids | length) == 0 and ($missing_dj | length) == 0),
      missing_ids: $missing_ids,
      missing_decision_journal_count: ($missing_dj | length)
    }
  ' "${target}")
  ok=$(echo "${result}" | jq -r '.ok')

  if [[ "${ok}" != "true" ]]; then
    log "SYMMETRY-CHECK FAILED (${label}): rows expected in cold archive but missing:"
    log "  missing ids: $(echo "${result}" | jq -c '.missing_ids')"
    log "  missing decision_journal entries: $(echo "${result}" | jq -r '.missing_decision_journal_count')"
    return 1
  fi

  local expected_growth actual_total actual_growth
  expected_growth=$(echo "${maps}" | jq -r '.n_new_cold')
  actual_total=$(count_cold_rows "${target}")
  actual_growth=$((actual_total - before_total))

  if [[ "${actual_growth}" -ne "${expected_growth}" ]]; then
    log "SYMMETRY-CHECK FAILED (${label}): archive row count grew by ${actual_growth}, expected exactly ${expected_growth} (n_new_cold)"
    return 1
  fi

  log "SYMMETRY-CHECK OK (${label}): archive grew by ${actual_growth} row(s) (before=${before_total}), all expected ids present"
  return 0
}

# =============================================================================
# DRY-RUN path — report preview + projected size, exit 0, no writes
# =============================================================================
if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: computing eviction preview — no writes"

  CURRENT_SIZE=$(wc -c < "${ORCH_STATE}" | tr -d ' ')

  read_cold_ids
  MAPS=$(compute_id_maps "${ORCH_STATE}" "${COLD_DONE_IDS}" "${COLD_SPRINT_IDS}" "${COLD_SIGNAL_IDS}" "${COLD_SPRINT_GOAL_IDS}" "${COLD_BACKLOG_DETAIL_IDS}" "${DETAIL_FILE}" "${COLD_DECISION_JOURNAL}")

  N_DONE=$(echo "${MAPS}"    | jq '.n_evict_done')
  N_DV=$(echo "${MAPS}"      | jq '.n_evict_dv')
  N_SPRINTS=$(echo "${MAPS}" | jq '.n_evict_sprints')
  N_SPRINT_GOAL=$(echo "${MAPS}" | jq '.n_evict_sprint_goal')
  N_SIG_R=$(echo "${MAPS}"   | jq '.n_evict_sig_rows')
  N_SIG_A=$(echo "${MAPS}"   | jq '.n_evict_sig_arch')
  N_TASK=$(echo "${MAPS}"    | jq '.n_evict_task_total')
  N_TASK_BY_LANE=$(echo "${MAPS}" | jq -c '.n_evict_task_by_lane')
  N_DJ=$(echo "${MAPS}"      | jq '.n_evict_decision_journal')
  N_NEW=$(echo "${MAPS}"     | jq '.n_new_cold')
  N_RELABEL=$(echo "${MAPS}" | jq '.n_relabel_excluded')

  # Project hot-file size without writing — build to a REAL temp file, count
  # its bytes, then remove it (FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1,
  # 2026-08-29: the previous `> /dev/stdout` pattern re-opens /dev/stdout for
  # write, which fails hard ("Operation not permitted") in restricted/
  # containerized environments — turning EVERY --dry-run, and therefore the
  # whole dev-team-tick-preflight.sh Step 5.5 board-hygiene trigger, into
  # exit 1 "cold eviction skipped" instead of a clean preview).
  PROJECT_TEMP=$(mktemp "${REPO_ROOT}/docs/data/orch/.dryrun-proj-XXXXXXXX")
  build_hot_temp "${MAPS}" "${PROJECT_TEMP}"
  PROJECTED_SIZE=$(wc -c < "${PROJECT_TEMP}" | tr -d ' ')
  rm -f "${PROJECT_TEMP}"
  PROJECT_TEMP=""

  REDUCTION=$((CURRENT_SIZE - PROJECTED_SIZE))

  log "──────────────────────────────────────────────────────────────"
  log "Eviction preview (cold target: ${COLD_FILE})"
  log "  done[]              would evict: ${N_DONE} items from hot"
  log "  done_verified[]     would evict: ${N_DV} items from hot"
  log "  active_sprints[]    would evict: ${N_SPRINTS} items from hot"
  log "  sprint_goal.entries[] would evict: ${N_SPRINT_GOAL} items from hot"
  log "  signal_queue.rows[] would evict: ${N_SIG_R} items from hot"
  log "  signal_queue.archive[] evict:   ${N_SIG_A} items from hot"
  log "  flat task lanes (${TASK_LANES}) would evict: ${N_TASK} items from hot -> backlog_detail[] (${N_TASK_BY_LANE})"
  log "  decision_journal[]  would evict: ${N_DJ} items from hot"
  log "  --exclude-ids rows  would relabel (kept, lane-coherence fix): ${N_RELABEL}"
  log "  New items to append to cold:    ${N_NEW}"
  log "  Current hot-file size:          ${CURRENT_SIZE} bytes"
  log "  Projected hot-file size:        ${PROJECTED_SIZE} bytes"
  log "  Byte reduction:                 ${REDUCTION} bytes"
  log "──────────────────────────────────────────────────────────────"
  log "DRY-RUN complete. Hot file NOT modified (byte-identical)."
  exit 0
fi

# =============================================================================
# LIVE path — mtime-CAS loop → cold temp → hot temp → atomic rename
# =============================================================================
ATTEMPT=0
SUCCESS=false

while [[ ${ATTEMPT} -lt ${MTIME_CAS_RETRIES} ]]; do
  # ── capture hot file mtime before any computation ─────────────────────────
  MTIME_BEFORE=$(get_mtime "${ORCH_STATE}")

  # AC-4 (FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-AFTER-CALLER-JQ-READ) — capture
  # a content hash at this SAME instant (before any of this script's own
  # reads below) and thread it through to orch-apply.sh's own CAS check as
  # ORCH_APPLY_CALLER_BASELINE_HASH (see the invocation near "Writing hot
  # file" below). This closes a residual window that this loop's own
  # MTIME_BEFORE/MTIME_AFTER pair (checked further down, right before the
  # cold-archive rename) does NOT cover: a peer write landing AFTER that
  # mid-loop check but BEFORE orch-apply.sh's own CAS baseline is evaluated
  # (i.e. during the cold-archive rename + verify_cold_archive_write +
  # process-spawn gap before orch-apply.sh starts). Pre-migration, that
  # window was invisible: orch-apply.sh (unmigrated) self-captured its own
  # baseline at its OWN later process startup, which is already downstream
  # of any such peer write, so its BASELINE_BEFORE==BASELINE_AFTER check
  # trivially matched and the peer's change was silently overwritten on
  # rename. Capturing HASH_BEFORE this early and passing it through means
  # orch-apply.sh's baseline is fixed at the true observation instant (this
  # line), not its own start — any write landing anywhere after this line,
  # for the remainder of this whole pass, is now caught. See
  # scripts/test/orch-cold-evict-tests.sh TEST 13 for the failing-then-
  # passing proof (fault-injected peer write in exactly this window).
  HASH_BEFORE=$(get_hash "${ORCH_STATE}")

  # ── re-read cold IDs each iteration (handles partial-failure recovery) ─────
  # If a previous run wrote cold but failed before hot rename, items appear in
  # both files. Re-reading cold IDs here prevents re-adding them to cold while
  # still removing them from hot.
  read_cold_ids

  # ── Snapshot cold row-count BEFORE this pass writes anything (FIX-ORCH-
  # COLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-EXECUTED-DATA-LOSS) — baseline for
  # verify_cold_archive_write()'s growth-delta assertion below.
  COLD_TOTAL_BEFORE=$(count_cold_rows "${COLD_FILE}")

  # ── Pass 1: compute ID maps (small output, safe for --argjson) ────────────
  MAPS=$(compute_id_maps "${ORCH_STATE}" "${COLD_DONE_IDS}" "${COLD_SPRINT_IDS}" "${COLD_SIGNAL_IDS}" "${COLD_SPRINT_GOAL_IDS}" "${COLD_BACKLOG_DETAIL_IDS}" "${DETAIL_FILE}" "${COLD_DECISION_JOURNAL}")

  log "Attempt $((ATTEMPT + 1))/${MTIME_CAS_RETRIES}: ID maps computed"
  log "  done[]:              $(echo "${MAPS}" | jq '.n_evict_done') to evict from hot"
  log "  done_verified[]:     $(echo "${MAPS}" | jq '.n_evict_dv') to evict from hot"
  log "  active_sprints[]:    $(echo "${MAPS}" | jq '.n_evict_sprints') to evict from hot"
  log "  sprint_goal.entries[]: $(echo "${MAPS}" | jq '.n_evict_sprint_goal') to evict from hot"
  log "  signal rows[]:       $(echo "${MAPS}" | jq '.n_evict_sig_rows') to evict from hot"
  log "  signal archive[]:    $(echo "${MAPS}" | jq '.n_evict_sig_arch') to evict from hot"
  log "  flat task lanes (${TASK_LANES}): $(echo "${MAPS}" | jq '.n_evict_task_total') to evict from hot -> backlog_detail[] ($(echo "${MAPS}" | jq -c '.n_evict_task_by_lane'))"
  log "  decision_journal[]:  $(echo "${MAPS}" | jq '.n_evict_decision_journal') to evict from hot"
  log "  --exclude-ids rows relabeled (kept, lane-coherence fix): $(echo "${MAPS}" | jq '.n_relabel_excluded')"
  log "  New items to cold:   $(echo "${MAPS}" | jq '.n_new_cold')"

  # ── Pass 2a: Build cold temp ─────────────────────────────────────────────
  COLD_TEMP=$(mktemp "${ARCHIVE_DIR}/.cold-evict-XXXXXXXX.tmp")
  build_cold_temp "${MAPS}" "${COLD_TEMP}"

  # Validate cold temp — ABORT before touching hot if cold is invalid
  jq -e '.month and .done_tasks and .closed_sprints and .signal_rows' "${COLD_TEMP}" >/dev/null \
    || { log "ABORT: cold temp sentinel failed — hot file NOT modified"; exit 1; }
  jq '.' "${COLD_TEMP}" >/dev/null \
    || { log "ABORT: cold temp invalid JSON — hot file NOT modified"; exit 1; }

  # Symmetry self-check (pre-rename, temp file) — catches a build_cold_temp()
  # selection bug (wrong/missing rows in the candidate) before it ever gets
  # anywhere near the real archive path or the hot file.
  verify_cold_archive_write "${MAPS}" "${COLD_TEMP}" "${COLD_TOTAL_BEFORE}" "pre-rename cold temp" \
    || { log "ABORT: cold temp failed symmetry self-check — hot file NOT modified"; exit 1; }

  # ── Pass 2b: Build hot temp ───────────────────────────────────────────────
  # FIX-ORCH-COLD-EVICT-VALIDATION-EXIT1 (2026-08-29): X-run MUST be the
  # trailing component — BSD/macOS mktemp does NOT substitute X's when a
  # literal suffix follows them (creates the literal `.hot-evict-XXXXXXXX.tmp`
  # name every call; single-run masking via the EXIT trap, but a leftover or
  # concurrent invocation collides with "mkstemp failed: File exists").
  # Same defect + fix shape as orch-apply.sh's own FIX-ORCHAPPLY-MKTEMP-SUFFIX-
  # DEFEATS-RANDOMIZATION-BSD-CONCURRENT-WRITER-COLLISION (5a18d8726).
  HOT_TEMP=$(mktemp "${REPO_ROOT}/docs/data/orch/.hot-evict-XXXXXXXX")
  build_hot_temp "${MAPS}" "${HOT_TEMP}"

  # Validate hot temp sentinel (HSC-5: ._meta required after schema v4)
  jq -e '.head and .task_board and .signal_queue and ._meta' "${HOT_TEMP}" >/dev/null \
    || { log "ABORT: hot temp sentinel failed — hot file NOT modified"; exit 1; }
  jq '.' "${HOT_TEMP}" >/dev/null \
    || { log "ABORT: hot temp invalid JSON — hot file NOT modified"; exit 1; }

  # SHG-3 write-gate: run orch-state-validate.sh before hot rename
  bash "${REPO_ROOT}/scripts/orch-state-validate.sh" "${HOT_TEMP}" \
    || { log "ABORT: orch-state-validate.sh failed — hot file NOT modified"; exit 1; }

  # ── CAS check: abort if hot file was modified during computation ──────────
  MTIME_AFTER=$(get_mtime "${ORCH_STATE}")
  if [[ "${MTIME_BEFORE}" != "${MTIME_AFTER}" ]]; then
    ATTEMPT=$((ATTEMPT + 1))
    log "CAS: hot file mtime changed (attempt ${ATTEMPT}/${MTIME_CAS_RETRIES}) — retrying"
    rm -f "${COLD_TEMP}" "${HOT_TEMP}"
    COLD_TEMP=""
    HOT_TEMP=""
    sleep 1
    continue
  fi

  # ── Atomic rename: COLD first, HOT second ────────────────────────────────
  # If cold rename fails → EXIT before touching hot (data-safe ordering)
  log "Writing cold archive (atomic rename): ${COLD_FILE}"
  mv "${COLD_TEMP}" "${COLD_FILE}"
  COLD_TEMP=""

  # ── Post-rename readback (FIX-ORCHCOLDEVICT-NARRATED-ARCHIVE-WRITE-NEVER-
  # EXECUTED-DATA-LOSS) — re-read the REAL on-disk archive file fresh (never
  # trust the temp we already validated pre-rename; only a fresh read of the
  # actual target path proves the write durably landed) and re-run the same
  # symmetry assertion. THIS is the check that would have caught 38c013342e:
  # a partial/failed/raced archive write is now impossible to follow with the
  # hot-side delete below — any mismatch here aborts the ENTIRE run before
  # orch-apply.sh (the hot write) is ever invoked, so the two files can never
  # again diverge the way they did on 2026-08-06.
  verify_cold_archive_write "${MAPS}" "${COLD_FILE}" "${COLD_TOTAL_BEFORE}" "post-rename real archive file" \
    || { log "ABORT: FATAL — cold archive write did not durably land on disk; hot file NOT modified. Manual investigation required: ${COLD_FILE}"; exit 1; }

  # Cold is confirmed written AND verified on disk — now safely write hot via gated wrapper.
  #
  # ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}": explicitly propagates this
  # script's own ORCH_STATE override into orch-apply.sh's LIVE_FILE
  # resolution. No-op in production (both default to the identical canonical
  # path) — REQUIRED for safety whenever ORCH_STATE is overridden (e.g. a
  # throwaway test fixture): without this, orch-apply.sh would silently fall
  # back to its OWN default (the REAL production orch-state.json) even though
  # every preceding step in this script operated on the override path —
  # i.e. it would compute an eviction against a test fixture and then apply
  # the resulting (drastically smaller) candidate to the REAL live file.
  # Discovered empirically during FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-
  # BREAKER verification (recovered via `git checkout` — see brief §incident
  # note); this propagation gap pre-dates and is independent of the
  # conservation-guard bypass below.
  #
  # NARROW NAMED BYPASS: this eviction run intentionally shrinks task_board/
  # signal_queue counts (that is this script's entire purpose) — honor
  # orch-apply.sh's ORCH_APPLY_ALLOW_SHRINK conservation-guard bypass
  # (FIX-ORCHSTATE-CONSERVATION-GUARD-CIRCUIT-BREAKER; mirrors the
  # ORCH_APPLY_LIVE_FILE_OVERRIDE test-only precedent). This is one of only 2
  # call sites in the repo permitted to set ORCH_APPLY_ALLOW_SHRINK — do not
  # copy this pattern elsewhere without architect sign-off.
  #
  # ROW-IDENTITY DECLARATION (FIX-ORCHSTATE-SIGNALQUEUE-UNCOMMITTED-ROWS-LOST-
  # TO-PEER-FULLDOC-WRITE): ORCH_APPLY_ALLOW_SHRINK above only covers the
  # whole-board MAGNITUDE guard — it does NOT bypass the separate, non-
  # bypassable row-identity check in orch-conservation-check.mjs. This script
  # is the sole legitimate remover of signal_queue.rows[] entries (pm/task-
  # archive.md delegates its own signal-row eviction to this same script —
  # see that flow doc §Step 4), so it declares exactly which ids THIS pass
  # removed, sourced from the SAME rm_sig_rows map already computed above
  # (not re-derived) — keeps the declaration and the actual removal
  # mechanically in lockstep, never hand-maintained.
  # CALLER-BASELINE MIGRATION (AC-1/AC-4, FIX-ORCHAPPLY-CAS-BASELINE-CAPTURED-
  # AFTER-CALLER-JQ-READ): pass HASH_BEFORE (captured at loop-top, above,
  # before this pass's own reads/computation/cold-archive-write) through as
  # ORCH_APPLY_CALLER_BASELINE_HASH so orch-apply.sh's CAS check compares
  # against the true pre-read observation instant instead of its own
  # (later) self-captured process-start mtime. HASH takes precedence over
  # mtime in orch-apply.sh, so this also strictly tightens precision versus
  # the 1s-resolution mtime this script already checks internally above.
  SIGNAL_EVICTION_IDS=$(echo "${MAPS}" | jq -r '.rm_sig_rows | keys | join(",")')
  log "Writing hot file (via orch-apply.sh gated write): ${ORCH_STATE}"
  set +e
  cat "${HOT_TEMP}" \
    | ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}" \
      ORCH_APPLY_ALLOW_SHRINK="orch-cold-evict.sh:scheduled-eviction" \
      ORCH_APPLY_DECLARED_SIGNAL_EVICTIONS="${SIGNAL_EVICTION_IDS}" \
      ORCH_APPLY_CALLER_BASELINE_HASH="${HASH_BEFORE}" \
      bash "${REPO_ROOT}/scripts/orch-apply.sh"
  apply_exit=${PIPESTATUS[1]}
  set -e
  if [[ ${apply_exit} -eq 0 ]]; then
    rm -f "${HOT_TEMP}"
    HOT_TEMP=""
    SUCCESS=true
    break
  elif [[ ${apply_exit} -eq 2 ]]; then
    # CAS mismatch in orch-apply.sh — retry outer loop
    ATTEMPT=$((ATTEMPT + 1))
    log "orch-apply.sh CAS mismatch (attempt ${ATTEMPT}/${MTIME_CAS_RETRIES}) — retrying"
    rm -f "${HOT_TEMP}"
    HOT_TEMP=""
    sleep 1
    continue
  else
    log "ABORT: orch-apply.sh validation failed (exit ${apply_exit}) — hot file NOT modified (cold was written)"
    exit 1
  fi
done

if [[ "${SUCCESS}" != "true" ]]; then
  log "ABORT: CAS retry limit (${MTIME_CAS_RETRIES}) exceeded — concurrent writer; hot file unchanged"
  exit 1
fi

# =============================================================================
# Final validation + report
# =============================================================================
jq '.' "${ORCH_STATE}" >/dev/null \
  || { log "ERROR: post-write hot file failed jq validation!"; exit 1; }
jq '.' "${COLD_FILE}" >/dev/null \
  || { log "ERROR: post-write cold file failed jq validation!"; exit 1; }

HOT_SIZE=$(wc -c < "${ORCH_STATE}" | tr -d ' ')
COLD_SIZE=$(wc -c < "${COLD_FILE}" | tr -d ' ')

log "──────────────────────────────────────────────────────────────"
log "Eviction complete. Both files jq-validated."
log "  Hot file:  ${ORCH_STATE} (${HOT_SIZE} bytes)"
log "  Cold file: ${COLD_FILE} (${COLD_SIZE} bytes)"
log "──────────────────────────────────────────────────────────────"
