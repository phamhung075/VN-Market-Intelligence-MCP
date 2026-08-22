#!/usr/bin/env bash
# scripts/agents-flow/decision-journal-archive.sh — UC-MDH-P4 (memory-docs-hygiene-P4)
#
# Implements the archival step promised (but never built) for pm's task-archive flow:
# moves sprint decision-journal files (docs/agent-memory/decisions/sprint-*.md) whose
# sprint has CLOSED into docs/archive/decisions/. File-ops-only — this script NEVER
# writes docs/data/orch/orch-state.json (jq reads only; no orch-apply.sh needed).
#
# Selection is STATUS-based (closed sprint id vs still-active), NOT mtime-based — an
# earlier backlog row (TE-T33) proposed a generic >30d mtime rotation for decisions/;
# that would incorrectly move journals of sprints that are still open past 30 days.
# This script is the superseding mechanism for the decisions/ leg of TE-T33.
#
# Two modes:
#   stdin mode (default): reads candidate sprint ids, one per line, from stdin.
#     Intended caller: docs/agents/pm/flow/task-archive.md Step 5.5 — pipes the
#     diff of active_sprints ids (before both eviction paths vs after) so only
#     sprints that JUST closed this cycle are considered.
#   --all mode: backfill — derives the full closed-id set from the cold archive
#     (docs/data/orch/archive/*.json: .closed_sprints[].id, .closed_sprint_goals
#     sprint ids, .done_tasks[].sprint) plus the hot file's
#     .task_board.closed_sprints[].id, and processes every eligible journal file
#     in one pass. Run this once for the historical backfill.
#
# LONGEST-MATCH derivation (mandatory — do not bare-prefix-glob):
#   A closed sprint id like "OHLCV-UNIT-CONTAM" is a literal string-prefix of the
#   ACTIVE sprint id "OHLCV-UNIT-CONTAM-WHOLEROW-LT1000" (both exist live in this
#   repo). For each candidate file, this script strips the "sprint-" prefix and
#   ".md" suffix, then finds the LONGEST id in the full known-id universe (closed
#   UNION active) such that the remainder equals the id exactly (bare
#   sprint-<id>.md form) or starts with "<id>-" (agent-suffixed
#   sprint-<id>-<agent>.md form, also covers legacy "-2" journal-cap-rollover
#   files). Only after the longest match is resolved do we check whether THAT id
#   is closed-and-in-scope. This is what correctly keeps
#   sprint-OHLCV-UNIT-CONTAM-WHOLEROW-LT1000-qa.md in place (matches the longer,
#   still-active id) while archiving sprint-OHLCV-UNIT-CONTAM-qa.md (matches the
#   shorter, closed id).
#
# Any candidate file whose derived id matches NOTHING in the known-id universe
# (no orch record at all) is left in place and counted in the SUMMARY line for a
# follow-up PO disposition — this script never guess-moves.
#
# --- §2.3 CLOSED-ID-DERIVATION CORRECTION (FIX-SPRINT-REGISTRY-DANGLING-IDS-
# BREAK-SIGNOFF-AND-JOURNAL-ARCHIVE, 2026-08-22, shared predicate w/ Stage 1h /
# orchStateSchema.ts §16 per po_review_note B3) ---
# ROOT CAUSE (design brief §2.3): `.done_tasks[].sprint` is a per-TASK provenance
# tag ("which sprint was this task filed under when it completed"), not a per-
# SPRINT closure record. Treating "this tag appears on ≥1 archived DONE task" as
# "this sprint is closed" is a category error — a multi-phase sprint where task 1
# of 10 completes and gets cold-evicted lands its own sprint id in the closed-id
# set while 9 tasks are still open. A live `--all` run would then `git mv` that
# sprint's decision journals out from under open work.
# CORRECTED PREDICATE — an id derived from `.done_tasks[].sprint` (or any other
# closed-id source) is only actually eligible to archive THIS run if, in
# addition to "not active": (a) zero HOT task rows reference it via `.sprint`
# with a NON-TERMINAL `.status` (TERMINAL_SET: DONE/DONE_VERIFIED/CANCELLED/
# DEFERRED/SKIPPED, mirrored from orchStateSchema.ts TERMINAL_SET — kept in
# lock-step, same convention as scripts/fix-sprint-goal-status-drift-evict-
# normalize.jq's terminal-alias map), AND (b) if a `.sprint_goal.entries[]`
# entry exists for the id, its `.status` canonicalizes to a terminal token
# (SPRINT_GOAL_TERMINAL_ALIASES mirrored the same way) — a live/PLANNING/OPEN/
# any-other-non-terminal goal status blocks archival even with zero task refs
# (live case: `sprint_goal` marks an id `active` with zero referencing rows —
# same shape the reconciliation classification calls LIVE on goal-status alone).
# `.done_tasks[].sprint` itself is NOT removed from CLOSED_IDS_FILE (still useful
# "have I heard of this id at all" signal) — it is demoted from "sole
# justification for archive-eligible" to "candidate, gated by (a)+(b)".
#
# --- AC-4 THIRD-STATE BRANCH (same task, 2026-08-22) ---
# An id with NO match anywhere in KNOWN_IDS_FILE ("no orch record at all") used
# to only increment `no_orch_record` and print a per-file NO-MATCH line — easy
# to miss in a long scan, no distinguishing exit code. Now: if `no_orch_record`
# > 0 at end of run, ONE aggregated docs/signals/ entry is written (payload =
# the deduped list of derived-but-unresolved ids) — deduped against an existing
# unprocessed signal carrying the SAME id set (dedup key = sha256 of the sorted,
# comma-joined id list, same discipline as scripts/agents-flow/context-bloat-
# backstop.sh) so repeated runs against an unchanged unresolved set never spam.
# Exit code `2` (reserving `1` for the pre-existing setup/config-error class +
# the AC-1 leg(a) gate-refusal path, unchanged) lets a caller (e.g. a future cron
# wrapper) distinguish "ran clean" (0) from "ran, found unresolvable ids, needs
# triage" (2) from "could not run at all" (1).
#
# Idempotent + re-runnable: files already present at the destination are skipped
# (SKIP-EXISTS), never overwritten; a second run with the same inputs finds
# nothing left to move and no-ops cleanly.
#
# Env overrides (all optional; used by the paired test script to sandbox a fixture
# tree without touching the live repo):
#   ORCH_STATE             default: $REPO_ROOT/docs/data/orch/orch-state.json
#   ORCH_ARCHIVE_DIR       default: $REPO_ROOT/docs/data/orch/archive
#   DECISIONS_DIR          default: $REPO_ROOT/docs/agent-memory/decisions
#   ARCHIVE_DECISIONS_DIR  default: $REPO_ROOT/docs/archive/decisions
#   DJA_GIT_MV             default: 1 — use `git mv` when inside a git work tree
#                           (preserves rename history); set 0 to force plain `mv`
#                           (required by the sandboxed test — fixture tree is not
#                           part of this repo's git index).
#   DJA_ALLOW_ALL_UNGATED  default: 0 — AC-1 leg(a) safety valve (see below).
#   DJA_SIGNALS_DIR        default: $REPO_ROOT/docs/signals — AC-4 third-state
#                           aggregated signal destination (see below).
#
# Usage:
#   printf '%s\n' SPRINT-ID-1 SPRINT-ID-2 | scripts/agents-flow/decision-journal-archive.sh
#   scripts/agents-flow/decision-journal-archive.sh --all
#   scripts/agents-flow/decision-journal-archive.sh --all --dry-run   # preview counts only, no mv
#
# --- AC-1 leg(a) safety valve (FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD, 2026-08-22) ---
# `--all` in LIVE (non-`--dry-run`) mode REFUSES by default: the closed-id derivation
# below (CLOSED_IDS_FILE unions .done_tasks[].sprint, a per-TASK provenance tag, as if
# it were a per-SPRINT closure record) can misclassify a sprint id as closed while it
# still has open, non-terminal task rows — a live `--all` run then `git mv`s that
# sprint's decision journals out from under active work with no undo path. Refuse
# unless EITHER unlock leg is satisfied (only leg (a) ships here; leg (b) wiring
# is a separate row's scope, FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD — see
# architecture brief §11.5):
#   (a) DJA_ALLOW_ALL_UNGATED=1 is set (explicit human/operator override), or
#   (b) scripts/audits/verify-sprint-registry-referential-integrity.mjs (this is
#       the READ-ONLY classification/replay tool — it now EXISTS and prints a
#       `violations=N` line; the doc-self-heal 2026-08-22 note here corrects an
#       earlier `.sh`-extension placeholder) reports `violations==0` — leg (b)
#       is NOT wired into this script yet (still only leg (a) can satisfy the
#       gate); wiring it is FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD's own scope,
#       not this task's.
# `--dry-run` and stdin mode are completely unaffected (AC-2) — the valve is scoped
# to the live `--all` mutation path ONLY.
#
# Exit: 0 = completed scan, zero no_orch_record ("ran clean, nothing to triage").
#   1 = setup/config errors (missing orch-state.json or decisions dir), or an
#       AC-1 leg(a) safety-valve refusal (ungated live `--all`) — unchanged,
#       takes precedence over 2 below.
#   2 = completed scan but no_orch_record > 0 this run (AC-4 third-state
#       branch — "ran, found unresolvable ids, needs triage"; one aggregated
#       docs/signals/ entry was written, or an identical one already existed).
# Per-file mv failures are logged (ERROR-MOVE-FAILED) but never abort the scan
# or change the exit code above.
#
# Owning flow: docs/agents/pm/flow/task-archive.md § Step 5.5
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence
# Detail ref:  docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#memory-docs-hygiene-P4
#
# Shell: bash 3.2+ (macOS system /bin/bash) — no mapfile, no associative arrays,
# no namerefs; longest-match resolved via a small per-file awk pass over the
# known-id file (comm/sort convention matches scripts/agents-flow/memory-prune-sweep.sh).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

ORCH_STATE="${ORCH_STATE:-$REPO_ROOT/docs/data/orch/orch-state.json}"
ORCH_ARCHIVE_DIR="${ORCH_ARCHIVE_DIR:-$REPO_ROOT/docs/data/orch/archive}"
DECISIONS_DIR="${DECISIONS_DIR:-$REPO_ROOT/docs/agent-memory/decisions}"
ARCHIVE_DECISIONS_DIR="${ARCHIVE_DECISIONS_DIR:-$REPO_ROOT/docs/archive/decisions}"
DJA_GIT_MV="${DJA_GIT_MV:-1}"
DJA_ALLOW_ALL_UNGATED="${DJA_ALLOW_ALL_UNGATED:-0}"
# AC-4 third-state signal destination — overridable so tests never touch the
# live docs/signals/ directory (same sandboxing discipline as the other 4 vars).
DJA_SIGNALS_DIR="${DJA_SIGNALS_DIR:-$REPO_ROOT/docs/signals}"

MODE="stdin"
DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --all) MODE="all" ;;
    --dry-run) DRY_RUN=1 ;;
  esac
done

# AC-1 leg(a) safety valve — refuse an UNGATED live (non-dry-run) --all run.
# Leg (b) (corpus-replay violations==0) is not wired yet (§11.5, not shipped this
# pass); only leg (a) can satisfy the gate today. Force an internal dry-run pass
# so the exact same scan/counting logic below computes the would-move count with
# a hard mutation guarantee of zero — never duplicate the counting logic.
GATE_REFUSED=0
if [ "$MODE" = "all" ] && [ "$DRY_RUN" != "1" ] && [ "$DJA_ALLOW_ALL_UNGATED" != "1" ]; then
  GATE_REFUSED=1
  DRY_RUN=1
fi

if [ ! -f "$ORCH_STATE" ]; then
  echo "[decision-journal-archive] ERROR: orch-state not found at $ORCH_STATE" >&2
  exit 1
fi
if [ ! -d "$DECISIONS_DIR" ]; then
  echo "[decision-journal-archive] ERROR: decisions dir not found at $DECISIONS_DIR" >&2
  exit 1
fi
if [ "$MODE" = "stdin" ] && [ -t 0 ]; then
  echo "[decision-journal-archive] USAGE: pipe sprint ids on stdin (one per line), or pass --all for backfill" >&2
  exit 1
fi

ACTIVE_IDS_FILE="$(mktemp)"
CLOSED_IDS_FILE="$(mktemp)"
STDIN_IDS_FILE="$(mktemp)"
KNOWN_IDS_FILE="$(mktemp)"
PROCESS_IDS_FILE="$(mktemp)"
NONTERMINAL_REF_IDS_FILE="$(mktemp)"
GOAL_NONTERMINAL_IDS_FILE="$(mktemp)"
NO_ORCH_IDS_FILE="$(mktemp)"
trap 'rm -f "$ACTIVE_IDS_FILE" "$CLOSED_IDS_FILE" "$STDIN_IDS_FILE" "$KNOWN_IDS_FILE" "$PROCESS_IDS_FILE" "$NONTERMINAL_REF_IDS_FILE" "$GOAL_NONTERMINAL_IDS_FILE" "$NO_ORCH_IDS_FILE"' EXIT

# --- Known-id universe: active (hot) ---
jq -r '.task_board.active_sprints[]? | select(.id != null) | .id' "$ORCH_STATE" 2>/dev/null \
  | sed '/^$/d' | sort -u > "$ACTIVE_IDS_FILE"

# --- Known-id universe: closed (hot stub + cold archive) ---
jq -r '.task_board.closed_sprints[]? | select(.id != null) | .id' "$ORCH_STATE" 2>/dev/null \
  | sed '/^$/d' > "$CLOSED_IDS_FILE"

if [ -d "$ORCH_ARCHIVE_DIR" ]; then
  while IFS= read -r -d '' f; do
    jq -r '.closed_sprints[]? | select(.id != null) | .id' "$f" 2>/dev/null >> "$CLOSED_IDS_FILE"
    jq -r '(.closed_sprint_goals // []) | if type == "array" then (.[] | .sprint_id // empty) else (keys[]?) end' "$f" 2>/dev/null >> "$CLOSED_IDS_FILE"
    jq -r '[.done_tasks[]? | .sprint] | unique[]? // empty' "$f" 2>/dev/null >> "$CLOSED_IDS_FILE"
  done < <(find "$ORCH_ARCHIVE_DIR" -maxdepth 1 -type f -name "*.json" -print0 2>/dev/null)
fi
sed -i.bak '/^$/d;/^null$/d' "$CLOSED_IDS_FILE" 2>/dev/null; rm -f "${CLOSED_IDS_FILE}.bak"
sort -u -o "$CLOSED_IDS_FILE" "$CLOSED_IDS_FILE"

# --- §2.3 correction: ids blocked from archiving THIS run regardless of what
# closed-id source resolved them (hot closed_sprints[]/cold closed_sprints[]/
# closed_sprint_goals/the demoted done_tasks[].sprint signal alike) ---
#
# (a) any HOT task row (all 8 flat lanes + both nested sprint-task locations,
# mirrors § 15/AC-3's own plane-1 walk) whose own `.sprint` names the id AND
# whose own `.status` is NOT in TERMINAL_SET (orchStateSchema.ts TERMINAL_SET:
# DONE | DONE_VERIFIED | CANCELLED | DEFERRED | SKIPPED — mirrored here in
# lock-step, same convention as scripts/fix-sprint-goal-status-drift-evict-
# normalize.jq's terminal-alias map).
jq -r '
  (.task_board // {}) as $tb
  | ( ($tb.backlog // [])
    + ($tb.ready // [])
    + ($tb.in_progress // [])
    + ($tb.qa // [])
    + ($tb.review // [])
    + ($tb.done // [])
    + ($tb.done_verified // [])
    + ($tb.archive // [])
    + ([($tb.active_sprints // [])[]? | (.tasks // [])[]?])
    + ([($tb.closed_sprints // [])[]? | (.tasks // [])[]?])
    )[]?
  | select(.sprint? != null and .sprint != "")
  | select(((.status // "") as $s | (["DONE","DONE_VERIFIED","CANCELLED","DEFERRED","SKIPPED"] | index($s))) == null)
  | .sprint
' "$ORCH_STATE" 2>/dev/null | sed '/^$/d' | sort -u > "$NONTERMINAL_REF_IDS_FILE"

# (b) any `.sprint_goal.entries[]` entry for the id whose `.status` does NOT
# canonicalize to a terminal token (SPRINT_GOAL_TERMINAL_ALIASES mirrored the
# same way — a live/PLANNING/OPEN/any-other-non-terminal goal status blocks
# archival even with zero task refs).
jq -r '
  (.sprint_goal.entries // [])[]?
  | select(.sprint_id? != null and .sprint_id != "")
  | select((((.status // "") | ascii_upcase) as $su
      | (["DONE","CLOSED","COMPLETE","COMPLETED","DONE_VERIFIED","CANCELLED","CANCELED","DEFERRED","SKIPPED"] | index($su))) == null)
  | .sprint_id
' "$ORCH_STATE" 2>/dev/null | sed '/^$/d' | sort -u > "$GOAL_NONTERMINAL_IDS_FILE"

# --- Determine PROCESS_IDS (what we're actually allowed to move this run) ---
if [ "$MODE" = "all" ]; then
  comm -23 "$CLOSED_IDS_FILE" "$ACTIVE_IDS_FILE" \
    | comm -23 - "$NONTERMINAL_REF_IDS_FILE" \
    | comm -23 - "$GOAL_NONTERMINAL_IDS_FILE" > "$PROCESS_IDS_FILE"
  sort -u "$CLOSED_IDS_FILE" "$ACTIVE_IDS_FILE" -o "$KNOWN_IDS_FILE"
else
  while IFS= read -r line; do
    trimmed="$(printf '%s' "$line" | tr -d '[:space:]')"
    [ -n "$trimmed" ] && printf '%s\n' "$trimmed"
  done < /dev/stdin | sort -u > "$STDIN_IDS_FILE"
  comm -23 "$STDIN_IDS_FILE" "$ACTIVE_IDS_FILE" \
    | comm -23 - "$NONTERMINAL_REF_IDS_FILE" \
    | comm -23 - "$GOAL_NONTERMINAL_IDS_FILE" > "$PROCESS_IDS_FILE"
  sort -u "$CLOSED_IDS_FILE" "$ACTIVE_IDS_FILE" "$STDIN_IDS_FILE" -o "$KNOWN_IDS_FILE"
fi

echo "[decision-journal-archive] START mode=$MODE known_ids=$(wc -l < "$KNOWN_IDS_FILE" | tr -d ' ') process_ids=$(wc -l < "$PROCESS_IDS_FILE" | tr -d ' ') decisions_dir=$DECISIONS_DIR"

scanned=0
archived=0
active_stay=0
closed_not_in_scope=0
no_orch_record=0
already_archived=0

while IFS= read -r -d '' f; do
  scanned=$((scanned + 1))
  base="$(basename "$f")"
  # strip "sprint-" prefix and ".md" suffix -> candidate remainder
  rest="${base#sprint-}"
  rest="${rest%.md}"

  match_id=$(awk -v rest="$rest" '
    {
      id=$0
      if (id == rest) {
        if (length(id) > best_len) { best_len = length(id); best_id = id }
      } else if (length(rest) > length(id)) {
        prefix = substr(rest, 1, length(id) + 1)
        if (prefix == id "-") {
          if (length(id) > best_len) { best_len = length(id); best_id = id }
        }
      }
    }
    END { if (best_id != "") print best_id }
  ' "$KNOWN_IDS_FILE")

  if [ -z "$match_id" ]; then
    no_orch_record=$((no_orch_record + 1))
    printf '%s\n' "$rest" >> "$NO_ORCH_IDS_FILE"
    echo "[decision-journal-archive] NO-MATCH file=$base reason=no-orch-record-for-derived-id"
    continue
  fi

  if grep -Fxq "$match_id" "$ACTIVE_IDS_FILE" 2>/dev/null; then
    active_stay=$((active_stay + 1))
    echo "[decision-journal-archive] SKIP file=$base reason=active-sprint id=$match_id"
    continue
  fi

  if ! grep -Fxq "$match_id" "$PROCESS_IDS_FILE" 2>/dev/null; then
    closed_not_in_scope=$((closed_not_in_scope + 1))
    echo "[decision-journal-archive] SKIP file=$base reason=closed-not-in-scope-this-run id=$match_id"
    continue
  fi

  dest="$ARCHIVE_DECISIONS_DIR/$base"
  if [ -e "$dest" ]; then
    already_archived=$((already_archived + 1))
    echo "[decision-journal-archive] SKIP-EXISTS file=$base reason=already-archived"
    continue
  fi

  if [ "$DRY_RUN" = "1" ]; then
    archived=$((archived + 1))
    echo "[decision-journal-archive] WOULD-ARCHIVE file=$base id=$match_id -> docs/archive/decisions/$base"
    continue
  fi

  mkdir -p "$ARCHIVE_DECISIONS_DIR" 2>/dev/null
  moved=0
  if [ "$DJA_GIT_MV" = "1" ] && git -C "$REPO_ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git -C "$REPO_ROOT" mv -k -- "$f" "$dest" 2>/dev/null; then
      moved=1
    fi
  fi
  if [ "$moved" -eq 0 ]; then
    if mv "$f" "$dest" 2>/dev/null; then
      moved=1
    fi
  fi
  if [ "$moved" -eq 1 ]; then
    archived=$((archived + 1))
    echo "[decision-journal-archive] ARCHIVED file=$base id=$match_id -> docs/archive/decisions/$base"
  else
    echo "[decision-journal-archive] ERROR-MOVE-FAILED file=$base id=$match_id" >&2
  fi
done < <(find "$DECISIONS_DIR" -maxdepth 1 -type f -name "sprint-*.md" -print0 2>/dev/null)

echo "[decision-journal-archive] SUMMARY mode=$MODE scanned=$scanned archived=$archived active_stay=$active_stay closed_not_in_scope=$closed_not_in_scope no_orch_record=$no_orch_record already_archived=$already_archived"

# --- AC-4 third-state branch: aggregated signal, deduped by the unresolved-id
# set's hash — same discipline as scripts/agents-flow/context-bloat-backstop.sh.
if [ "$no_orch_record" -gt 0 ]; then
  sort -u -o "$NO_ORCH_IDS_FILE" "$NO_ORCH_IDS_FILE" 2>/dev/null
  DEDUP_HASH="$(tr '\n' ',' < "$NO_ORCH_IDS_FILE" 2>/dev/null | (shasum -a 256 2>/dev/null || sha256sum 2>/dev/null) | awk '{print $1}' | cut -c1-16)"
  if [ -n "$DEDUP_HASH" ]; then
    SIGNAL_STEM_PREFIX="sprint-registry-unresolved-ids-${DEDUP_HASH}"
    EXISTING_SIGNAL=""
    if [ -d "$DJA_SIGNALS_DIR" ]; then
      EXISTING_SIGNAL="$(find "$DJA_SIGNALS_DIR" -maxdepth 1 -name "${SIGNAL_STEM_PREFIX}*.json" 2>/dev/null | head -1)"
    fi
    if [ -z "$EXISTING_SIGNAL" ]; then
      TIMESTAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"
      TIMESTAMP_FS="$(printf '%s' "$TIMESTAMP" | tr -d ':')"
      IDS_JSON="$(jq -R -s -c 'split("\n") | map(select(length > 0))' "$NO_ORCH_IDS_FILE" 2>/dev/null)"
      [ -z "$IDS_JSON" ] && IDS_JSON="[]"
      mkdir -p "$DJA_SIGNALS_DIR" 2>/dev/null
      SIGNAL_FILE="$DJA_SIGNALS_DIR/${SIGNAL_STEM_PREFIX}-${TIMESTAMP_FS}.json"
      cat > "$SIGNAL_FILE" <<SIGNALEOF
{
  "from": "decision-journal-archive",
  "to": "po",
  "type": "sprint_registry_unresolved_journal_ids",
  "priority": "medium",
  "createdAt": "$TIMESTAMP",
  "payload": {
    "unresolved_count": $no_orch_record,
    "ids": $IDS_JSON,
    "action_required": "triage_derived_ids_with_no_orch_record"
  }
}
SIGNALEOF
      echo "[decision-journal-archive] AC4-SIGNAL wrote $(basename "$SIGNAL_FILE") ($no_orch_record unresolved id(s))"
    else
      echo "[decision-journal-archive] AC4-SIGNAL dedup-skip (existing $(basename "$EXISTING_SIGNAL") already covers this unresolved id set)"
    fi
  fi
fi

if [ "$GATE_REFUSED" = "1" ]; then
  echo "[decision-journal-archive] REFUSED: --all in LIVE (non-dry-run) mode is gated (AC-1 leg(a) safety valve, FIX-DJA-ALL-SAFETY-VALVE-ARMED-HAZARD) — $archived journal(s) would be archived this run, and some may belong to sprint ids with OPEN, non-terminal work (root cause: closed-id derivation unions per-task provenance, see script header). Set DJA_ALLOW_ALL_UNGATED=1 to override, or run with --dry-run to preview only. No files were moved." >&2
  exit 1
fi

if [ "$no_orch_record" -gt 0 ]; then
  exit 2
fi

exit 0
