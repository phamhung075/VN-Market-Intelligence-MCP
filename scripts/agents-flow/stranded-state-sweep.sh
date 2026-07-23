#!/usr/bin/env bash
# scripts/agents-flow/stranded-state-sweep.sh — UC-GCP-P8 (git-ci-publish-P8, RESCOPE)
#
# Classifier-only. Emits a JSON commit-plan to stdout; makes NO git or
# orch-state.json writes itself (git add/commit + signal_queue append are the
# FLOW's responsibility — docs/agents/dev-team/flow/post-cycle.md Step 4.3 —
# matching the memory-prune-sweep.sh convention: classification in the script,
# mutating writes in the flow).
#
# Usage: scripts/agents-flow/stranded-state-sweep.sh --plan
#
# Env overrides:
#   SSS_REPO_ROOT   default: repo root via BASH_SOURCE
#   SSS_ORCH_STATE  default: $REPO_ROOT/docs/data/orch/orch-state.json (READ-ONLY dedup probe)
#   SSS_CAP         default: 20 (max paths acted on per tick, across AUTO-COMMIT + UNKNOWN combined)
#   SSS_AGE_HOURS   default: 24 (AUTO-COMMIT mtime gate; `D` deletions exempt — no on-disk mtime)
#
# Buckets (spec: docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md#git-ci-publish-P8):
#   A. AUTO-COMMIT — docs/agent-memory/notebooks/* + docs/agent-memory/decisions/* -> category "memory";
#      docs/agent-memory/sessions/*.md -> category "sessions"; scripts/* -> category "scripts".
#      Only mtime > SSS_AGE_HOURS old (deletions exempt). NOTE: docs/agent-memory/modules/*.json is
#      EXCLUDED from AUTO-COMMIT — owned by queued SYSREMAKE-P2-STRUCTURAL-REMAKE-ROUTE RC-GITSTATE
#      (gitignore pure-derived counters); it is caught by the OWNED-ELSEWHERE check below instead.
#   B. OWNED-ELSEWHERE (silent skip — no signal, no commit): docs/signals/** (drain Step 0a owns the
#      commit, per drain-signals.md:9 MANDATORY-PERSIST-GUARD), docs/data/orch/orch-state.json
#      (orch-apply.sh flows only), docs/data/cowork-schedule.json, docs/data/coverage-state.json,
#      docs/agent-memory/modules/** and docs/data/auditor-*-last-healthy.json (RC-GITSTATE candidates).
#   C. UNKNOWN — everything else. Never auto-committed. Aggregated into ONE signal per tick (dedup
#      probed read-only against orch-state.json .signal_queue.rows[] — an existing OPEN row from
#      "dev-team" whose summary starts with the same prefix suppresses re-emission this tick).
#      scripts/* auto-commits ALSO get one dedup-checked "verify Script Persistence pointer" signal.
#
# Execution cap: paths ACTED ON (AUTO-COMMIT + UNKNOWN) are capped at SSS_CAP per run, taken in
# `git status` order (deterministic/alphabetical). OWNED-ELSEWHERE and AGE-too-young paths never
# count against the cap — they are simply left dirty for a future tick.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — no mapfile, no associative arrays, no namerefs.
# `git status --porcelain=v1 -z` for NUL-safe path parsing (repo has live paths containing spaces,
# e.g. docs/raw-input/expert-discussion/*). Empty-array-under-`set -u` is guarded via the
# `"${arr[@]+"${arr[@]}"}"` idiom (precedent: scripts/audits/commit-convention-audit.sh).
# AUTO-COMMIT path patterns are conventional kebab-case filenames only (notebooks/decisions/
# sessions/scripts) — a stray space in a matched path would break the flow's `git add`; out of
# bounded scope. UNKNOWN/OWNED-ELSEWHERE paths are never shell-executed, only carried in JSON.
#
# Test: scripts/agents-flow/stranded-state-sweep.test.sh
# Owning flow: docs/agents/dev-team/flow/post-cycle.md § Step 4.3
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
REPO_ROOT="${SSS_REPO_ROOT:-$DEFAULT_REPO_ROOT}"
ORCH_STATE="${SSS_ORCH_STATE:-$REPO_ROOT/docs/data/orch/orch-state.json}"
CAP="${SSS_CAP:-20}"
AGE_HOURS="${SSS_AGE_HOURS:-24}"

if [ "${1:-}" != "--plan" ]; then
  echo "[stranded-state-sweep] ABORT usage: stranded-state-sweep.sh --plan" >&2
  exit 2
fi

git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || {
  echo "[stranded-state-sweep] ABORT not-a-git-repo root=$REPO_ROOT" >&2
  exit 1
}

NOW_EPOCH=$(date -u +%s)
TODAY="$(date -u +%Y-%m-%d)"
GEN_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

_age_hours() {
  local mtime
  mtime=$(stat -f "%m" "$1" 2>/dev/null || stat -c "%Y" "$1" 2>/dev/null)
  [ -z "$mtime" ] && { echo 999999; return; } # missing file (e.g. race) -> treat as ancient/exempt
  echo $(( (NOW_EPOCH - mtime) / 3600 ))
}

_is_owned_elsewhere() {
  case "$1" in
    docs/signals/*|docs/data/orch/orch-state.json|docs/data/cowork-schedule.json|docs/data/coverage-state.json|docs/agent-memory/modules/*|docs/data/auditor-*-last-healthy.json)
      return 0 ;;
    *) return 1 ;;
  esac
}

memory_paths=()
sessions_paths=()
scripts_paths=()
unknown_paths=()
owned_elsewhere_n=0
young_skipped_n=0
total_dirty_n=0
considered_n=0

while IFS= read -r -d '' entry; do
  [ -z "$entry" ] && continue
  total_dirty_n=$((total_dirty_n + 1))
  x="${entry:0:1}"
  y="${entry:1:1}"
  path="${entry:3}"
  if [ "$x" = "R" ] || [ "$x" = "C" ]; then
    IFS= read -r -d '' _orig || true # consume the extra orig-path token git -z emits for rename/copy
  fi
  is_delete=0
  { [ "$x" = "D" ] || [ "$y" = "D" ]; } && is_delete=1

  if _is_owned_elsewhere "$path"; then
    owned_elsewhere_n=$((owned_elsewhere_n + 1))
    echo "[stranded-state-sweep] OWNED-ELSEWHERE path=$path" >&2
    continue
  fi

  category=""
  case "$path" in
    docs/agent-memory/notebooks/*|docs/agent-memory/decisions/*) category="memory" ;;
    docs/agent-memory/sessions/*.md) category="sessions" ;;
    scripts/*) category="scripts" ;;
  esac

  if [ -n "$category" ]; then
    if [ "$is_delete" -eq 0 ]; then
      age=$(_age_hours "$REPO_ROOT/$path")
      if [ "$age" -lt "$AGE_HOURS" ]; then
        young_skipped_n=$((young_skipped_n + 1))
        echo "[stranded-state-sweep] YOUNG-SKIP path=$path age_h=$age" >&2
        continue
      fi
    fi
    if [ "$considered_n" -ge "$CAP" ]; then
      echo "[stranded-state-sweep] CAP-DEFERRED path=$path category=$category" >&2
      continue
    fi
    considered_n=$((considered_n + 1))
    case "$category" in
      memory) memory_paths+=("$path") ;;
      sessions) sessions_paths+=("$path") ;;
      scripts) scripts_paths+=("$path") ;;
    esac
    continue
  fi

  if [ "$considered_n" -ge "$CAP" ]; then
    echo "[stranded-state-sweep] CAP-DEFERRED path=$path category=unknown" >&2
    continue
  fi
  considered_n=$((considered_n + 1))
  unknown_paths+=("$path")
done < <(git -C "$REPO_ROOT" status --porcelain=v1 -z)

echo "[stranded-state-sweep] SCAN total_dirty=$total_dirty_n owned_elsewhere=$owned_elsewhere_n young_skipped=$young_skipped_n considered=$considered_n cap=$CAP memory=${#memory_paths[@]} sessions=${#sessions_paths[@]} scripts=${#scripts_paths[@]} unknown=${#unknown_paths[@]}" >&2

_json_str_array() {
  if [ "$#" -eq 0 ]; then printf '[]'; return; fi
  printf '%s\n' "$@" | jq -R . | jq -s .
}

_dedup_open() {
  # read-only probe: OPEN (status != RESOLVED) signal_queue row from=dev-team whose
  # summary starts with $1 already exists this cycle -> caller should skip re-emitting.
  [ -f "$ORCH_STATE" ] || { echo "false"; return; }
  jq --arg pfx "$1" '[(.signal_queue.rows // [])[] | select(.from=="dev-team" and .status!="RESOLVED" and ((.summary // "") | startswith($pfx)))] | length > 0' \
    "$ORCH_STATE" 2>/dev/null || echo "false"
}

AUTO_COMMIT_JSON="[]"
_append_category() {
  local cat="$1" count="$2" msg
  shift 2
  [ "$count" -eq 0 ] && return
  local paths_json
  paths_json=$(_json_str_array "$@")
  case "$cat" in
    memory) msg="chore(memory/sweep): stranded-state sweep ${TODAY} — ${count} file(s)" ;;
    sessions) msg="chore(sessions): stranded-state sweep ${TODAY} — ${count} file(s)" ;;
    scripts) msg="chore(scripts): stranded-state sweep ${TODAY} — ${count} file(s)" ;;
  esac
  AUTO_COMMIT_JSON=$(echo "$AUTO_COMMIT_JSON" | jq --arg cat "$cat" --arg msg "$msg" --argjson paths "$paths_json" \
    '. + [{category:$cat, commit_message:$msg, paths:$paths}]')
}
_append_category "memory" "${#memory_paths[@]}" "${memory_paths[@]+"${memory_paths[@]}"}"
_append_category "sessions" "${#sessions_paths[@]}" "${sessions_paths[@]+"${sessions_paths[@]}"}"
_append_category "scripts" "${#scripts_paths[@]}" "${scripts_paths[@]+"${scripts_paths[@]}"}"

SIGNALS_JSON="[]"
_append_signal() {
  # $1=dedup_key $2=stable dedup-probe prefix (count-free — see header note) $3=full summary (count included)
  local dkey="$1" prefix="$2" summary="$3"; shift 3
  local paths_json dedup
  paths_json=$(_json_str_array "$@")
  dedup=$(_dedup_open "$prefix" | tail -1)
  SIGNALS_JSON=$(echo "$SIGNALS_JSON" | jq --arg type "system-issue" --arg to "po" --arg summary "$summary" \
    --arg dkey "$dkey" --argjson paths "$paths_json" --argjson dedup "$dedup" \
    '. + [{type:$type, to:$to, summary:$summary, dedup_key:$dkey, dedup_skip:$dedup, payload:{paths:$paths}}]')
}
# NOTE: dedup prefix is COUNT-FREE (stable across ticks) — the visible summary embeds the
# count as a trailing "(N)" so startswith($prefix) still matches tick-to-tick as N changes.
if [ "${#unknown_paths[@]}" -gt 0 ]; then
  n="${#unknown_paths[@]}"
  _append_signal "stranded-state-sweep-unknown" "stranded-state sweep: unknown paths need owner" \
    "stranded-state sweep: unknown paths need owner (${n})" "${unknown_paths[@]+"${unknown_paths[@]}"}"
fi
if [ "${#scripts_paths[@]}" -gt 0 ]; then
  n="${#scripts_paths[@]}"
  _append_signal "stranded-state-sweep-scripts-pointer" "stranded-state sweep: scripts auto-committed — verify Script Persistence pointer" \
    "stranded-state sweep: scripts auto-committed — verify Script Persistence pointer (${n})" "${scripts_paths[@]+"${scripts_paths[@]}"}"
fi

jq -n \
  --arg generated_at "$GEN_AT" \
  --argjson cap "$CAP" \
  --argjson total_dirty "$total_dirty_n" \
  --argjson considered "$considered_n" \
  --argjson owned_elsewhere_count "$owned_elsewhere_n" \
  --argjson young_skipped_count "$young_skipped_n" \
  --argjson auto_commit "$AUTO_COMMIT_JSON" \
  --argjson unknown_paths "$(_json_str_array "${unknown_paths[@]+"${unknown_paths[@]}"}")" \
  --argjson signals "$SIGNALS_JSON" \
  '{generated_at:$generated_at, cap:$cap, total_dirty:$total_dirty, considered:$considered, owned_elsewhere_count:$owned_elsewhere_count, young_skipped_count:$young_skipped_count, auto_commit:$auto_commit, unknown_paths:$unknown_paths, signals:$signals}'

exit 0
