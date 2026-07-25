#!/usr/bin/env bash
# scripts/agents-flow/coverage-stamp.sh
#
# Deterministic, surgical writer + reader for docs/data/coverage-state.json's
# per-ticker last_covered_<agent> stamps. Replaces the prose read-modify-write
# in news-scout (stage-log-notify.md Step 7, read at stage-sentiment.md
# Step 0-sweep) and market-watcher (cycle.md Step 5c, read at Step 0-sweep) —
# both flow docs said "for each ticker analyzed this cycle, set X = now" and
# an LLM re-executing that prose against a 57-entry JSON blob every cycle
# blanket-stamped ALL tickers instead of only the ones it actually analysed.
# That makes the 48h staleness trigger both flows read permanently
# unsatisfiable BY CONSTRUCTION (measured: distinct-stamp group counts went
# 3/4/7 -> 1 -> 5 -> 1/1 across 25 revisions with ZERO code changes between —
# the non-determinism itself is the root cause, not any single breaking
# commit). Owning task: FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER.
#
# CO-SHIPS FIX-COVERAGE-STATE-CROSS-AGENT-LOST-UPDATE (backlog/P2, minted
# 2026-07-16): that row's candidate direction (i) — "serialize the two
# writers behind a shared coverage-state write helper that does
# read-modify-merge, not full-doc overwrite" — is exactly this script. The
# task_claim("coverage-state:main") mutex below is the serialization; the jq
# `reduce ... .tickers[$t] = ((.tickers[$t] // {}) + {...})` merge (touching
# ONLY the named field of ONLY the named tickers, never the whole document)
# is the read-modify-merge.
#
# Also restores the top-level `sweep_config` key ({max_staleness_hours: 48,
# sweep_batch_size: 3}) if missing. It was present at commit 0866c35b6
# (2026-07-21), absent from 819fff993 (2026-07-23) onward, and absent live —
# nothing deleted it deliberately, a hand-rewrite of the blob (i.e. a
# full-document overwrite, not a merge) silently dropped it. That vanished
# key is independent proof the OLD write path was a full-doc overwrite; this
# script's repair-on-every-write behaviour makes that class of loss
# structurally impossible going forward (a merge cannot drop a key it never
# touches).
#
# OPEN QUESTION THE TASK LEFT TO THE IMPLEMENTER: does this script also own
# the STALE_TICKERS read-side computation, or only the write? DECIDED: BOTH
# (see --list-stale below). Two reasons: (1) symmetry — the read side is the
# exact same "LLM prose executed against a growing JSON blob every cycle"
# shape that caused the write defect, just lower-probability because it's a
# filter/sort/slice, not a merge; owning it here removes that class too, for
# both agents, from one tested place instead of two independently-maintained
# prose copies. (2) testability — AC 2 ("seed a stale ticker, run a cycle,
# assert it appears in STALE_TICKERS and is force-included") has no
# automatable meaning if the computation lives only as prose inside an
# agent's flow doc; there is no code to invoke in a regression test. Making
# this script the SSOT for STALE_TICKERS is what turns AC 2 into a real,
# repeatable test (see coverage-stamp.test.sh T3/T4) instead of a spec that
# can only be re-verified by hand.
#
# Usage:
#   coverage-stamp.sh --agent <news-scout|market-watcher> --tickers T1,T2 [--file PATH] [--session ID]
#       Surgical stamp: sets .tickers[T].last_covered_<agent> = now (UTC) for
#       ONLY the named tickers. Every other key, and every other ticker's
#       fields (including the SAME ticker's peer-agent last_covered_ field —
#       this is the lost-update row's AC 1/3), is preserved byte-for-byte.
#       --tickers may be "" / omitted — a config-repair-only write with zero
#       ticker stamps (used once, live, by this task to restore the deleted
#       sweep_config key without touching any per-ticker stamp value — see
#       task constraint: never hand-edit coverage-state.json's saturated
#       stamp VALUES, but a missing top-level config KEY is a structural
#       repair, not a stamp-value fix).
#       Wrapped in a task_claim("coverage-state:main") mutex, TTL 30s,
#       fail-CLOSED (peer holds it after retries -> exit non-zero, file is
#       NEVER written unprotected).
#
#   coverage-stamp.sh --agent <news-scout|market-watcher> --list-stale --watchlist T1,T2,... [--file PATH]
#       Read-only, no mutex. Computes STALE_TICKERS = tickers in --watchlist
#       whose last_covered_<agent> is null OR older than
#       sweep_config.max_staleness_hours (default 48 if sweep_config itself
#       is missing/absent), sorted oldest-first (null = oldest), sliced to
#       sweep_config.sweep_batch_size (default 3). Prints a JSON array of
#       ticker codes to stdout. Fail-silent if the file itself is missing
#       (matches the ORIGINAL read contract: treat every ticker as
#       last_covered=null) — deliberately asymmetric with the write path,
#       which fails LOUD on a missing file (a read tolerates a cold-start
#       gap; a write silently creating a fresh SSOT file risks masking a
#       wrong --file path and losing the real document).
#
# Env:
#   CLAUDE_CODE_SESSION_ID — owner_client_session for the mutex (required for
#                             the --tickers/write mode; --list-stale needs no
#                             mutex, so it is not required there). --session
#                             overrides this.
#   COVERAGE_STAMP_NOW     — override "now" (ISO-8601 UTC) for deterministic
#                             tests. Real invocations never set this.
#
# Deps: bash, jq (>=1.6 for fromdateiso8601). Sources mcp-call.sh for the
# mutex calls (task_claim/task_heartbeat/task_release) — see that file's own
# header for the transport contract.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEFAULT_FILE="$REPO_ROOT/docs/data/coverage-state.json"

# shellcheck source=./mcp-call.sh
source "$SCRIPT_DIR/mcp-call.sh"

_usage() {
  cat >&2 <<'USAGE'
usage:
  coverage-stamp.sh --agent <news-scout|market-watcher> --tickers T1,T2 [--file PATH] [--session ID]
  coverage-stamp.sh --agent <news-scout|market-watcher> --list-stale --watchlist T1,T2,... [--file PATH]
USAGE
}

_validate_agent() {
  case "$1" in
    news-scout|market-watcher) return 0 ;;
    *) return 1 ;;
  esac
}

# news-scout -> last_covered_news_scout | market-watcher -> last_covered_market_watcher
_field_for_agent() {
  printf 'last_covered_%s' "${1//-/_}"
}

_now_iso() {
  if [ -n "${COVERAGE_STAMP_NOW:-}" ]; then
    printf '%s' "$COVERAGE_STAMP_NOW"
  else
    date -u +%Y-%m-%dT%H:%M:%SZ
  fi
}

# comma-separated -> JSON array of trimmed, non-empty strings. "" -> [].
_csv_to_json_array() {
  local csv="$1"
  if [ -z "$csv" ]; then
    printf '[]'
    return 0
  fi
  printf '%s' "$csv" \
    | tr ',' '\n' \
    | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' \
    | sed '/^$/d' \
    | jq -R . \
    | jq -s .
}

# ── mutex: task_claim("coverage-state:main") with SF-1-style re-entrant
# self-hold handling (mirrors dev-team-tick-preflight.sh _step_sf1_claim) —
# same session already holding the lock heartbeat-renews and proceeds rather
# than phantom-blocking on itself. TTL kept short (30s) because the critical
# section is a single jq transform + mv, not a whole agent cycle. ───────────
_acquire_mutex() {
  local session_id="$1" agent="$2"
  local task_id="coverage-state:main"
  local max_attempts=5 attempt=0
  local backoff_base="${COVERAGE_STAMP_MUTEX_BACKOFF_S:-2}"
  local args result rc claimed holder_session

  while [ $attempt -lt $max_attempts ]; do
    attempt=$((attempt + 1))
    args=$(jq -n --arg tid "$task_id" --arg sess "$session_id" --arg agent "$agent" \
      '{task_id:$tid, task_kind:"sprint-task", owner_agent:$agent, owner_client_session:$sess, ttl_seconds:30, payload:({site:"coverage-stamp"}|tojson)}')
    result=$(mcp_call "task_claim" "$args" 2>&1); rc=$?

    if [ $rc -ne 0 ]; then
      echo "[coverage-stamp] WARN: task_claim transport error (attempt $attempt/$max_attempts): $(printf '%s' "$result" | head -c 200)" >&2
      sleep "$((attempt * backoff_base))"
      continue
    fi
    if ! printf '%s' "$result" | jq -e . >/dev/null 2>&1; then
      echo "[coverage-stamp] WARN: task_claim malformed response (attempt $attempt/$max_attempts): $(printf '%s' "$result" | head -c 200)" >&2
      sleep "$((attempt * backoff_base))"
      continue
    fi

    claimed=$(printf '%s' "$result" | jq -r '.claimed // false')
    if [ "$claimed" = "true" ]; then
      return 0
    fi

    holder_session=$(printf '%s' "$result" | jq -r '.current_holder.owner_client_session // empty')
    if [ "$holder_session" = "$session_id" ]; then
      # Re-entrant: this session already holds the lock — renew, proceed.
      mcp_call "task_heartbeat" "$(jq -n --arg tid "$task_id" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
      return 0
    fi

    echo "[coverage-stamp] mutex held by peer session (attempt $attempt/$max_attempts) — backing off" >&2
    sleep "$((attempt * backoff_base))"
  done

  echo "[coverage-stamp] ERROR: could not acquire coverage-state:main mutex after $max_attempts attempts — fail-CLOSED, no write performed" >&2
  return 1
}

_release_mutex() {
  local session_id="$1"
  mcp_call "task_release" "$(jq -n --arg tid "coverage-state:main" --arg sess "$session_id" '{task_id:$tid, owner_client_session:$sess}')" >/dev/null 2>&1
  return 0
}

# ── write path ────────────────────────────────────────────────────────────
_do_stamp() {
  local file="$1" agent="$2" tickers_csv="$3" session_id="$4"
  local field now tickers_json had_sweep_config repaired

  if [ -z "$session_id" ]; then
    echo "[coverage-stamp] ERROR: CLAUDE_CODE_SESSION_ID (or --session) is required to acquire the write mutex" >&2
    return 2
  fi
  if [ ! -f "$file" ]; then
    echo "[coverage-stamp] ERROR: coverage-state file not found: $file — write path fails LOUD (read path is fail-silent; a write must never silently fabricate a fresh SSOT file over a possibly-wrong path)" >&2
    return 1
  fi

  field=$(_field_for_agent "$agent")
  now=$(_now_iso)
  tickers_json=$(_csv_to_json_array "$tickers_csv") || return 1

  _acquire_mutex "$session_id" "$agent" || return 1

  had_sweep_config="false"
  jq -e 'has("sweep_config")' "$file" >/dev/null 2>&1 && had_sweep_config="true"

  if ! jq --arg field "$field" --arg now "$now" --arg agent "$agent" --argjson tickers "$tickers_json" '
        (if has("sweep_config") then . else .sweep_config = {max_staleness_hours: 48, sweep_batch_size: 3} end)
        | ._updated_by = $agent
        | ._updated_at = $now
        | reduce $tickers[] as $t (.;
            .tickers[$t] = ((.tickers[$t] // {}) + {($field): $now})
          )
      ' "$file" > "${file}.tmp" 2>"${file}.tmp.err"; then
    echo "[coverage-stamp] ERROR: jq transform failed — aborting, mutex released, file untouched: $(cat "${file}.tmp.err" 2>/dev/null)" >&2
    rm -f "${file}.tmp" "${file}.tmp.err"
    _release_mutex "$session_id"
    return 1
  fi
  rm -f "${file}.tmp.err"
  mv "${file}.tmp" "$file"

  _release_mutex "$session_id"

  repaired="false"
  [ "$had_sweep_config" = "false" ] && repaired="true"

  jq -n --argjson tickers "$tickers_json" --arg agent "$agent" --arg now "$now" --argjson repaired "$repaired" \
    '{stamped: $tickers, count: ($tickers | length), agent: $agent, stamped_at: $now, sweep_config_repaired: $repaired}'
  return 0
}

# ── read path (STALE_TICKERS) ────────────────────────────────────────────
_do_list_stale() {
  local file="$1" agent="$2" watchlist_csv="$3"
  local field watchlist_json now_iso data

  field=$(_field_for_agent "$agent")
  watchlist_json=$(_csv_to_json_array "$watchlist_csv") || return 1
  now_iso=$(_now_iso)

  if [ -f "$file" ]; then
    data=$(cat "$file")
  else
    data='{}'
  fi

  printf '%s' "$data" | jq -c --arg field "$field" --argjson watchlist "$watchlist_json" --arg now_iso "$now_iso" '
      (.sweep_config.max_staleness_hours // 48) as $maxh
    | (.sweep_config.sweep_batch_size // 3) as $batch
    | ($now_iso | fromdateiso8601) as $now
    | [ $watchlist[] as $t
        | (.tickers[$t][$field] // null) as $last
        | { ticker: $t, last: $last,
            age_h: (if $last == null then null else (($now - ($last | fromdateiso8601)) / 3600) end) }
        | select(.last == null or .age_h > $maxh)
      ]
    | sort_by(if .last == null then -1 else (.last | fromdateiso8601) end)
    | .[0:$batch]
    | map(.ticker)
  '
}

main() {
  local mode="stamp" agent="" tickers_csv="" watchlist_csv=""
  local file="$DEFAULT_FILE" session_id="${CLAUDE_CODE_SESSION_ID:-}"

  while [ $# -gt 0 ]; do
    case "$1" in
      --agent) agent="${2:-}"; shift 2 ;;
      --tickers) tickers_csv="${2:-}"; shift 2 ;;
      --watchlist) watchlist_csv="${2:-}"; shift 2 ;;
      --file) file="${2:-}"; shift 2 ;;
      --session) session_id="${2:-}"; shift 2 ;;
      --list-stale) mode="list-stale"; shift ;;
      -h|--help) _usage; return 0 ;;
      *) echo "[coverage-stamp] ERROR: unknown arg: $1" >&2; _usage; return 2 ;;
    esac
  done

  if [ -z "$agent" ] || ! _validate_agent "$agent"; then
    echo "[coverage-stamp] ERROR: --agent must be one of: news-scout, market-watcher (got: '${agent}')" >&2
    return 2
  fi

  if [ "$mode" = "list-stale" ]; then
    _do_list_stale "$file" "$agent" "$watchlist_csv"
    return $?
  fi

  _do_stamp "$file" "$agent" "$tickers_csv" "$session_id"
  return $?
}

# ── Standalone CLI mode (only when executed directly, not sourced) ──────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
  exit $?
fi
