#!/usr/bin/env bash
# scripts/db-integrity-dedup-check.sh — DETERMINISTIC actuator for the
# DEDUP-ENFORCEMENT clause (.claude/commands/crons/cron-db-data-integrity.md
# "DEDUP-ENFORCEMENT" block), replacing pure prose with a real pre-write gate.
#
# Task: FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-ENFORCED (AC-1).
#
# ROOT CAUSE closed here: the DEDUP-ENFORCEMENT clause said an anomaly is
# ALREADY-OPEN (do not re-signal) if (a) a .task_board FIX-*/CLEAN-* task
# tracks its root, OR (b) a prior .signal_queue row for the same defect has
# a non-terminal status — but NOTHING ever evaluated that clause; it was read
# and then ignored three times (2026-08-05T07:06Z, 2026-08-05T08:18:46Z,
# 2026-08-06T07:21:27Z) for the identical 336 daily_ohlcv rows, twice under a
# DIFFERENT dedup_key/type string for the SAME underlying rows. That last
# fact is why this script keys on TABLE NAME (+ a length>=4 sub-token of it),
# never on the emitter's free-typed type/dedup_key/check_id string — a naive
# ledger-key match is exactly what the corroborating instance #3 disproved
# (po_ac_addendum_20260806T0728 on the task row).
#
# MATCH SEMANTICS (deliberately coarse, table-level — see AC-3 replay in
# docs/agent-memory/decisions/sprint-FIX-AUDITOR-DEDUP-TASKBOARD-PRECHECK-NOT-
# ENFORCED-developer.md for the false-suppression-risk analysis this traded
# off): a finding on table T is ALREADY-OPEN if EITHER
#   (a) any task in a NON-TERMINAL `.task_board` lane (backlog, ready,
#       in_progress, review, qa — the 5 real open flat lanes per the live
#       schema; terminal lanes done/done_verified/archive/closed_sprints are
#       NOT scanned, matching "all open lanes, not just backlog") has an
#       id/title containing a keyword derived from T, OR
#   (b) any `.signal_queue.rows[]` entry whose status (case-insensitively) is
#       one of new/read/triaged/acute-resolved-root-tracked has a type/summary
#       containing that same keyword.
# Lane ARRAY MEMBERSHIP is treated as the authoritative open/closed signal for
# task_board rows (CANONICAL:SSOT-STATUSFLIP-LANEMOVE) — no extra per-row
# `.status` filtering is applied there, only for signal_queue rows (which do
# not move lanes, only a fielded `.status`).
#
# KEYWORD DERIVATION (precision over recall — see AC-3 note below for why):
# lowercase the table name and build 3 separator-tolerant literal forms
# ("daily_ohlcv" / "daily-ohlcv" / "daily ohlcv"), PLUS table-specific curated
# synonyms from a small hardcoded map (only "daily_ohlcv" -> "ohlcv" today —
# see CURATED SYNONYMS below). An EARLIER version of this script split the
# table name into individual "_"-separated sub-tokens (>=4 chars) and matched
# on ANY of them independently — an AC-3 replay against the LIVE board caught
# this live, empirically, before it shipped: generic sub-tokens like "price",
# "reports", "index", "cache", "records", "fetch", "stats", "messages" recur
# constantly across unrelated task ids/signals in this repo, so that scheme
# scored already_open=true for EVERY one of 9 sample tables tested, almost
# always via a semantically unrelated task/signal (e.g. table "market_messages"
# matched task "FIX-DEPTHTHIN-A-PRICE-HISTORY-RETENTION-10D" — zero relation).
# That is the exact "TRUE positive lost to over-suppression" failure AC-3 asks
# to guard against, so the literal/curated-synonym scheme below replaced it.
#
# CURATED SYNONYMS (extend ONLY with the same kind of corroborating evidence
# used for daily_ohlcv/ohlcv — do not add a synonym "because it seems related"):
#   daily_ohlcv -> also matches "ohlcv" (evidence: the task_board rows tracking
#   this table's residue, CLEAN-OHLCV-INTEGRITY-RESIDUE-REPAIR and
#   FIX-OHLCV-WRITER-INTEGRITY-CONSTRAINT-SCALE-P0, both use "OHLCV" in their
#   id and never spell out the literal table name "daily_ohlcv").
#
# USAGE:
#   bash scripts/db-integrity-dedup-check.sh --table <table_name>
#
# OUTPUT (stdout, one JSON object, exit 0 always — this is a read-only
# classifier, never a fail-loud probe; a missing/malformed orch-state file
# degrades to already_open=false with an "error" field rather than aborting
# the caller's whole sweep):
#   { "already_open": true|false, "table": "...", "keywords": "tok1,tok2",
#     "matched_task_id": "..."|null, "matched_signal_id": "..."|null,
#     "matched_signal_status": "..."|null, "error": null|"<reason>" }
#
# TESTABILITY HOOK (mirrors scripts/emit-audit-signal.sh's env-override
# pattern): DB_INTEGRITY_DEDUP_ORCH_STATE_FILE overrides the orch-state.json
# path read (never written — this script is read-only).
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ORCH_STATE_FILE="${DB_INTEGRITY_DEDUP_ORCH_STATE_FILE:-$REPO_ROOT/docs/data/orch/orch-state.json}"

_emit_error() {
  # $1 = table (may be empty), $2 = reason
  jq -n --arg table "${1:-}" --arg err "$2" \
    '{already_open:false, table:$table, keywords:null, matched_task_id:null, matched_signal_id:null, matched_signal_status:null, error:$err}'
  exit 0
}

TABLE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --table) TABLE="${2:-}"; shift 2 ;;
    *) _emit_error "" "unknown-arg:$1" ;;
  esac
done

[ -z "$TABLE" ] && _emit_error "" "missing---table"

[ -f "$ORCH_STATE_FILE" ] && jq -e . "$ORCH_STATE_FILE" >/dev/null 2>&1 || _emit_error "$TABLE" "orch-state-missing-or-malformed"

jq --arg table "$TABLE" '
  ($table | ascii_downcase) as $t
  | [ $t, ($t | gsub("_"; "-")), ($t | gsub("_"; " ")) ] as $literal_forms
  | (if $t == "daily_ohlcv" then ["ohlcv"] else [] end) as $curated_synonyms
  | ($literal_forms + $curated_synonyms | unique) as $kws
  | ((.task_board.backlog // []) + (.task_board.ready // []) + (.task_board.in_progress // [])
     + (.task_board.review // []) + (.task_board.qa // [])) as $open_tasks
  | ($open_tasks
      | map(. + {_hay: (((.id // "") + " " + (.title // "")) | ascii_downcase)})
      | map(select(. as $row | $kws | any(. as $k | $row._hay | contains($k))))
    ) as $task_matches
  | ((.signal_queue.rows // [])
      | map(select((.status // "" | ascii_downcase) as $s
                   | (["new","read","triaged","acute-resolved-root-tracked"] | index($s)) != null))
      | map(. + {_hay: (((.type // "") + " " + (.summary // "")) | ascii_downcase)})
      | map(select(. as $row | $kws | any(. as $k | $row._hay | contains($k))))
    ) as $signal_matches
  | {
      already_open: (($task_matches | length) > 0 or ($signal_matches | length) > 0),
      table: $table,
      keywords: ($kws | join(",")),
      matched_task_id: ($task_matches[0].id // null),
      matched_signal_id: ($signal_matches[0].id // null),
      matched_signal_status: ($signal_matches[0].status // null),
      error: null
    }
' "$ORCH_STATE_FILE" 2>/dev/null || _emit_error "$TABLE" "jq-eval-failed"

exit 0
