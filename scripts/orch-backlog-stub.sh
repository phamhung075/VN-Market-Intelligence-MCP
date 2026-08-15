#!/usr/bin/env bash
# =============================================================================
# scripts/orch-backlog-stub.sh
# =============================================================================
# ORCH-STATE-HOT-COLD-SPLIT — HSC-4 deliverable
# Multi-lane extension (task: FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-
# TERMINAL-DRIFT, architect brief 2026-08-09 §2.2): the NAME stays
# "backlog-stub" for blast-radius reasons (10+ existing call sites reference
# it by name: pm/flow/main.md, dev-team/flow/post-cycle.md, po/flow/*, 2 test
# suites) even though it now covers `ready[]`/`review[]` too, not `backlog[]`
# only — this header comment is the "now covers 3 lanes" note that decision
# accepted in lieu of a rename.
#
# Strips prose from every item in the configured LANES (default: backlog[]
# only, 100% backward-compatible) of docs/data/orch/orch-state.json (HOT),
# keeping only the hot-stub fields, and writes the FULL original item to the
# SAME cold detail store at docs/data/orch/archive/backlog-detail.json, keyed
# by id (`items` is already a flat `id -> object` map, not lane-scoped —
# reusing it for ready[]/review[] rows matches the live convention
# po-detail-resync-review-lifecycle-routing.sh already depends on).
#
# Usage:
#   scripts/orch-backlog-stub.sh [--dry-run] [--lane=<comma-separated-lanes>]
#   # --lane overrides LANES for this invocation only (does not merge with the
#   # env default — e.g. --lane=review previews review[] ALONE, not
#   # backlog[]+review[]). Omit --lane to use the LANES env var (or its
#   # hardcoded default "backlog" if LANES is also unset).
#
# Contract:
#   - MUST be called while commit-mutex:main is held by the caller (task_claim).
#   - Cold detail file is written and jq-verified BEFORE the hot file is modified.
#   - Atomic temp-then-rename for BOTH cold detail and hot orch-state.
#   - mtime-CAS retry loop guards against concurrent writers.
#   - Idempotent: items already in cold (by id key) are per-field DEEP MERGED
#     with the current hot snapshot on every re-run (F-3 fix, see
#     build_detail_temp() below) — hot wins on any field present in both
#     sides, cold-exclusive prose survives, hot-exclusive fresh prose is
#     picked up. NOT "existing cold wins wholesale" (that was the pre-F-3 bug).
#   - Items lacking an `id` field are kept in hot with ALL their fields intact
#     (cannot be cold-stored without an addressable key).
#   - --dry-run: reports stub preview + projected hot-file size, no writes.
#
# Parameterisation:
#   LANES        — comma-separated list of task_board lane names to process.
#                  Default: backlog (byte-identical behavior to every existing
#                  caller that does not set this). Allowed values: backlog,
#                  ready, review (see brief §3 non-goals for why
#                  active_sprints[]/in_progress[]/qa[]/done[]/done_verified[]
#                  are deliberately out of scope for this mechanism).
#   STUB_FIELDS  — comma-separated list of field names to KEEP in the hot stub.
#                  Default: id,title,priority,size,type,zone,status,sprint,detail_ref
#                  `detail_ref` is always added by this script before the strip.
#   ORCH_STATE   — path to the hot orch-state file (default: auto-detected)
#   ARCHIVE_DIR  — path to the archive directory (default: auto-detected)
#   DETAIL_FILE  — path to the cold backlog-detail file (default: auto-detected)
#   MTIME_CAS_RETRIES — concurrent-writer retry limit (default: 3)
#
# Lazy-load pattern for readers (HSC-4 §cold reader contract):
#   # Load full detail for one item (any of the 3 lanes) by id:
#   jq '.items["<id>"]' docs/data/orch/archive/backlog-detail.json
#
# Owning brief:  docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §HSC-4
#   Multi-lane extension: docs/architecture-briefs/2026-08-09-fix-orchstate-hotfile-inline-prose-ceiling.md §2.2
# Canonical ref: docs/policies/dev-standards.md §Script Persistence
# Called from:   HSC-4 one-time migration; pm/flow/main.md on new backlog item write;
#   FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-NOT-TERMINAL-DRIFT one-time
#   LANES=backlog,ready,review migration (supervised, run separately)
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIG — all tunable; override via environment variables
# =============================================================================
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# File paths
ORCH_STATE="${ORCH_STATE:-${REPO_ROOT}/docs/data/orch/orch-state.json}"
ARCHIVE_DIR="${ARCHIVE_DIR:-${REPO_ROOT}/docs/data/orch/archive}"
DETAIL_FILE="${DETAIL_FILE:-${ARCHIVE_DIR}/backlog-detail.json}"

# Hot-stub field set: comma-separated. Always includes 'detail_ref' (added by script).
# These are the ONLY fields kept in the hot orch-state.json backlog[] items.
# depends_on/depends/blocked_by ADDED (task: FIX-ORCHSTATE-BLOCKS-FIELD-WRITE-ONLY-DECORATIVE,
# AC-4, po_stubfields_scoping_20260725T1715): without them, a re-run of this
# migration strips an inline dep from a hot row while a stale cold-file null
# in backlog-detail.json survives (this script's own documented "existing
# cold wins" merge above) — a dependency that was set correctly gets silently
# unset. scripts/lib/devteam-eligibility.jq's effective_depends_on() reads
# these 3 field names inline-first; they must never be strippable.
STUB_FIELDS="${STUB_FIELDS:-id,title,priority,size,type,zone,status,sprint,detail_ref,depends_on,depends,blocked_by}"

# Lanes to process (comma-separated). Default: backlog only — byte-identical
# behavior for every existing caller that does not set this (see header
# "Multi-lane extension" note). --lane=<...> on the CLI overrides this for a
# single invocation (see arg parsing below).
LANES="${LANES:-backlog}"

# Allow-list — deliberately excludes active_sprints[]/in_progress[]/qa[]/
# done[]/done_verified[] (see owning brief §3 non-goals).
LANE_ALLOWED="backlog ready review"

# CAS: abort after this many concurrent-writer detections
MTIME_CAS_RETRIES="${MTIME_CAS_RETRIES:-3}"

# Cold detail sentinel — used to validate cold file structure
DETAIL_SENTINEL="backlog-detail-v1"

# Base path embedded in each stub's detail_ref (relative from repo root, for readability)
DETAIL_REF_BASE="docs/data/orch/archive/backlog-detail.json"
# =============================================================================

log() { echo "[orch-backlog-stub] $*" >&2; }

# ─── arg parsing: --dry-run / --lane=<x> (repeatable-equivalent via comma) ───
DRY_RUN=false
CLI_LANE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --lane=*)
      CLI_LANE="${1#--lane=}"
      shift
      ;;
    --lane)
      CLI_LANE="${2:-}"
      shift 2
      ;;
    *)
      log "ABORT: unrecognized argument: $1 (usage: scripts/orch-backlog-stub.sh [--dry-run] [--lane=<comma-separated-lanes>])"
      exit 1
      ;;
  esac
done
[[ -n "${CLI_LANE}" ]] && LANES="${CLI_LANE}"

# ─── validate LANES against the allow-list, build LANES_JSON for jq ─────────
IFS=',' read -r -a LANE_ARR <<< "${LANES}"
for l in "${LANE_ARR[@]}"; do
  case " ${LANE_ALLOWED} " in
    *" ${l} "*) ;;
    *) log "ABORT: unsupported lane '${l}' (allowed: ${LANE_ALLOWED})"; exit 1 ;;
  esac
done
LANES_JSON=$(printf '%s\n' "${LANE_ARR[@]}" | jq -R -s 'split("\n") | map(select(length > 0))')

# Temp file handles — populated dynamically; cleaned up on EXIT
DETAIL_TEMP=""
HOT_TEMP=""

# ─── cleanup temp files on any exit ──────────────────────────────────────────
cleanup() {
  set +e
  [[ -n "${DETAIL_TEMP:-}" && -f "${DETAIL_TEMP}" ]] && rm -f "${DETAIL_TEMP}"
  [[ -n "${HOT_TEMP:-}"    && -f "${HOT_TEMP}"    ]] && rm -f "${HOT_TEMP}"
}
trap cleanup EXIT

# ─── portable mtime (macOS stat -f / Linux stat -c) ─────────────────────────
get_mtime() {
  if stat -f "%m" "$1" 2>/dev/null; then
    return
  fi
  stat -c "%Y" "$1"
}

# =============================================================================
# Step 1: Structural sentinel — abort early if hot file is malformed
# =============================================================================
log "Validating hot file: ${ORCH_STATE}"
jq -e '.head and .task_board and .signal_queue and ._meta' "${ORCH_STATE}" >/dev/null \
  || { log "ABORT: hot file fails sentinel (.head/.task_board/.signal_queue/._meta missing)"; exit 1; }

# =============================================================================
# Step 2: Ensure archive directory exists
# =============================================================================
mkdir -p "${ARCHIVE_DIR}"

# =============================================================================
# build_detail_temp
#
# Reads the CURRENT hot backlog and merges full items into the cold detail file.
#
# Merge strategy (FIXED — F-3, task: FIX-ORCHSTATE-HOTFILE-BLOAT-INLINE-PROSE-
# NOT-TERMINAL-DRIFT, architect brief 2026-08-09 §2.1): PER-FIELD DEEP MERGE,
# `.items = (.items * $new_items)` — jq's `*` on two objects recurses into
# matching keys; for a duplicate id, the result is the UNION of both sides'
# fields, with the HOT side ($new_items, right operand) winning on any field
# present in both (a genuinely re-editable field, e.g. `title`/`status`) while
# a field that exists ONLY in cold (prose already stripped from hot by a prior
# stub run, e.g. `note`) survives untouched, AND a field that exists ONLY in
# the current hot snapshot (fresh prose added since the last stub run, e.g. a
# new `review_note`) is picked up rather than discarded.
#
# BUG THIS FIXES (reproduced in isolation, scripts/orch-backlog-stub.test.sh
# T3/T4): the PRIOR shallow merge -- `.items = ($new_items + .items)`, plain jq
# `+` -- is id-keyed but NOT field-keyed: for any id present on both sides, the
# EXISTING COLD VALUE WINS WHOLESALE (jq plus operator right-hand-object-wins-
# whole-key semantics, no recursion). Any field added to the hot row since the
# last stub (e.g. a fresh `review_note`) was silently discarded -- not in cold
# (never captured), about to be stripped from hot by build_hot_temp own
# unconditional field filter -- data loss with zero error, zero trace.
#
# detail_ref is stripped from items before writing to cold (the field is added
# by this script and is not part of the original source record).
# Items without 'id' are excluded (cannot be keyed; they stay in hot).
# =============================================================================
build_detail_temp() {
  local output="$1"
  local now
  now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  if [[ -f "${DETAIL_FILE}" ]]; then
    # Append / merge: existing cold items win for known ids.
    jq \
      --arg now          "${now}" \
      --argjson lanes    "${LANES_JSON}" \
      --slurpfile hot    "${ORCH_STATE}" \
      '
        ($hot[0].task_board) as $tb |

        # Flatten EVERY configured lane into ONE new_items map (id -> full
        # item). Multi-lane extension (LANES config var, default unchanged =
        # ["backlog"]) — id -> object across backlog/ready/review is exactly
        # the live "items" convention already assumed by
        # po-detail-resync-review-lifecycle-routing.sh.
        # Build new_items: id -> full item (strip detail_ref — script-added field)
        ([ $lanes[] as $lane
           | (($tb[$lane] // [])[])
           | select(.id != null)
           | del(.detail_ref)
           | {key: .id, value: .}
         ] | from_entries) as $new_items |

        # Merge: .items * $new_items -> PER-FIELD deep merge (jq star operator
        # recurses on objects); hot ($new_items, right operand) wins per-field
        # on any key present in both sides, cold-exclusive fields survive
        # untouched, hot-exclusive (freshly-added-since-last-stub) fields are
        # picked up. FIXED -- was ($new_items + .items) (shallow,
        # existing-cold-wins-wholesale), see F-3 in the function header
        # comment above.
        .items   = (.items * $new_items) |
        .count   = (.items | length) |
        .updated_at = $now
      ' "${DETAIL_FILE}" > "${output}"
  else
    # Create new cold detail file.
    jq \
      --arg sentinel        "${DETAIL_SENTINEL}" \
      --arg now             "${now}" \
      --arg detail_ref_base "${DETAIL_REF_BASE}" \
      --argjson lanes       "${LANES_JSON}" \
      '
        (.task_board) as $tb |

        ([ $lanes[] as $lane
           | (($tb[$lane] // [])[])
           | select(.id != null)
           | del(.detail_ref)
           | {key: .id, value: .}
         ] | from_entries) as $items |

        {
          _sentinel:  $sentinel,
          created_at: $now,
          updated_at: $now,
          count:      ($items | length),
          items:      $items
        }
      ' "${ORCH_STATE}" > "${output}"
  fi
}

# =============================================================================
# build_hot_temp
#
# Strips each item in every configured LANE to the hot-stub field set, adding
# detail_ref first. Items without 'id' are left untouched (kept with all
# fields — cannot key cold). Lanes NOT in LANES are left completely untouched
# (multi-lane extension, default LANES=["backlog"] — zero behavior change for
# ready[]/review[] on every existing backlog-only caller).
#
# The jq `with_entries(select(...))` approach is fully parameterised:
# STUB_FIELDS is passed as a comma-separated string and converted to a lookup set.
# =============================================================================
build_hot_temp() {
  local output="$1"

  jq \
    --arg stub_fields     "${STUB_FIELDS}" \
    --arg detail_ref_base "${DETAIL_REF_BASE}" \
    --argjson lanes       "${LANES_JSON}" \
    '
      # Build stub field lookup set from comma-separated config string
      ($stub_fields | split(",") | map({key: ., value: true}) | from_entries) as $sf |

      reduce $lanes[] as $lane (
        .;
        if (.task_board[$lane] == null) then . else
          .task_board[$lane] |= [
            .[] |
            if .id != null then
              # 1. Add detail_ref pointer before strip (so it survives the field filter)
              . + {detail_ref: ($detail_ref_base + "#" + .id)} |
              # 2. Strip to stub fields only
              with_entries(select(.key as $k | $sf[$k] == true))
            else
              # No id → cannot move to cold → keep all fields in hot
              .
            end
          ]
        end
      )
    ' "${ORCH_STATE}" > "${output}"
}

# =============================================================================
# DRY-RUN path — report preview + projected size, exit 0, no writes
# =============================================================================
if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: computing stub preview — no writes"

  CURRENT_SIZE=$(wc -c < "${ORCH_STATE}" | tr -d ' ')
  N_TOTAL=$(jq --argjson lanes "${LANES_JSON}" '[ $lanes[] as $l | (.task_board[$l] // [])[] ] | length' "${ORCH_STATE}")
  N_WITH_ID=$(jq --argjson lanes "${LANES_JSON}" '[ $lanes[] as $l | (.task_board[$l] // [])[] | select(.id != null) ] | length' "${ORCH_STATE}")
  N_WITHOUT_ID=$((N_TOTAL - N_WITH_ID))

  # Count items that carry fields beyond the stub set (have prose to move)
  N_HAS_PROSE=$(jq --arg sf "${STUB_FIELDS}" --argjson lanes "${LANES_JSON}" '
    ($sf | split(",") | map({key: ., value: true}) | from_entries) as $sf_set |
    [ $lanes[] as $l | (.task_board[$l] // [])[] |
      select(.id != null) |
      select(
        keys | map(select($sf_set[.] != true and . != "detail_ref")) | length > 0
      )
    ] | length
  ' "${ORCH_STATE}")

  # Projected hot-file size (pipe through jq, no disk write)
  PROJECTED_HOT_SIZE=$(build_hot_temp /dev/stdout | wc -c | tr -d ' ')

  EXISTING_COLD_N=0
  if [[ -f "${DETAIL_FILE}" ]]; then
    EXISTING_COLD_N=$(jq '.count // (.items | length)' "${DETAIL_FILE}" 2>/dev/null || echo 0)
  fi

  REDUCTION=$((CURRENT_SIZE - PROJECTED_HOT_SIZE))

  log "──────────────────────────────────────────────────────────────"
  log "Backlog stub preview"
  log "  Lanes:                     ${LANES}"
  log "  Stub field set:            ${STUB_FIELDS}"
  log "  Cold detail file:          ${DETAIL_FILE}"
  log "  Total items (all lanes):   ${N_TOTAL}"
  log "  Items with id (moveable):  ${N_WITH_ID}"
  log "  Items without id (kept):   ${N_WITHOUT_ID}"
  log "  Items with prose to move:  ${N_HAS_PROSE}"
  log "  Existing cold items:       ${EXISTING_COLD_N}"
  for l in "${LANE_ARR[@]}"; do
    lane_n=$(jq --arg l "${l}" '(.task_board[$l] // []) | length' "${ORCH_STATE}")
    log "    ${l}: ${lane_n} items"
  done
  log "  Current hot-file size:     ${CURRENT_SIZE} bytes"
  log "  Projected hot-file size:   ${PROJECTED_HOT_SIZE} bytes"
  log "  Byte reduction:            ${REDUCTION} bytes"
  log "──────────────────────────────────────────────────────────────"
  log "DRY-RUN complete. Hot file NOT modified (byte-identical)."
  exit 0
fi

# =============================================================================
# LIVE path — mtime-CAS loop → cold detail temp → hot temp → atomic rename
# =============================================================================
ATTEMPT=0
SUCCESS=false

while [[ ${ATTEMPT} -lt ${MTIME_CAS_RETRIES} ]]; do
  # ── capture hot file mtime before any computation ─────────────────────────
  MTIME_BEFORE=$(get_mtime "${ORCH_STATE}")

  # ── Build cold detail temp ────────────────────────────────────────────────
  DETAIL_TEMP=$(mktemp "${ARCHIVE_DIR}/.backlog-detail-XXXXXXXX.tmp")
  build_detail_temp "${DETAIL_TEMP}"

  # Validate cold detail sentinel — ABORT before touching hot if detail is invalid
  jq -e '._sentinel and .items and (.count | type == "number")' "${DETAIL_TEMP}" >/dev/null \
    || { log "ABORT: detail temp fails sentinel — hot file NOT modified"; exit 1; }
  jq empty "${DETAIL_TEMP}" >/dev/null \
    || { log "ABORT: detail temp invalid JSON — hot file NOT modified"; exit 1; }

  # ── Build hot temp ────────────────────────────────────────────────────────
  HOT_TEMP=$(mktemp "${REPO_ROOT}/docs/data/orch/.hot-stub-XXXXXXXX.tmp")
  build_hot_temp "${HOT_TEMP}"

  # Validate hot temp sentinel (HSC-5: ._meta required after schema v4)
  jq -e '.head and .task_board and .signal_queue and ._meta' "${HOT_TEMP}" >/dev/null \
    || { log "ABORT: hot temp sentinel failed — hot file NOT modified"; exit 1; }
  jq empty "${HOT_TEMP}" >/dev/null \
    || { log "ABORT: hot temp invalid JSON — hot file NOT modified"; exit 1; }

  # ── CAS check: abort if hot file was modified during computation ──────────
  MTIME_AFTER=$(get_mtime "${ORCH_STATE}")
  if [[ "${MTIME_BEFORE}" != "${MTIME_AFTER}" ]]; then
    ATTEMPT=$((ATTEMPT + 1))
    log "CAS: hot file mtime changed (attempt ${ATTEMPT}/${MTIME_CAS_RETRIES}) — retrying"
    rm -f "${DETAIL_TEMP}" "${HOT_TEMP}"
    DETAIL_TEMP=""
    HOT_TEMP=""
    sleep 1
    continue
  fi

  # ── Atomic rename: COLD FIRST, HOT SECOND ────────────────────────────────
  # If cold rename fails → EXIT before touching hot (data-safe ordering)
  log "Writing cold detail (atomic rename): ${DETAIL_FILE}"
  mv "${DETAIL_TEMP}" "${DETAIL_FILE}"
  DETAIL_TEMP=""

  # Cold is confirmed written — now safely write hot via gated wrapper.
  # ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}": explicitly propagates this
  # script's own ORCH_STATE override into orch-apply.sh's LIVE_FILE
  # resolution. No-op in production (both default to the identical canonical
  # path) — REQUIRED for safety whenever ORCH_STATE is overridden (e.g. a
  # throwaway test fixture); see scripts/orch-cold-evict.sh for the same fix
  # + the incident that motivated it (FIX-ORCHSTATE-CONSERVATION-GUARD-
  # CIRCUIT-BREAKER verification). This script does not need
  # ORCH_APPLY_ALLOW_SHRINK — it strips fields, it does not remove items
  # (task_board.backlog length is unchanged by this script).
  log "Writing hot file (via orch-apply.sh gated write): ${ORCH_STATE}"
  set +e
  cat "${HOT_TEMP}" | ORCH_APPLY_LIVE_FILE_OVERRIDE="${ORCH_STATE}" bash "${REPO_ROOT}/scripts/orch-apply.sh"
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
  log "ABORT: CAS retry limit (${MTIME_CAS_RETRIES}) exceeded — concurrent writer detected; hot file unchanged"
  exit 1
fi

# =============================================================================
# Post-write validation + reconciliation (HARD GATE)
# =============================================================================
jq empty "${ORCH_STATE}" >/dev/null \
  || { log "ERROR: post-write hot file failed jq validation!"; exit 1; }
jq empty "${DETAIL_FILE}" >/dev/null \
  || { log "ERROR: post-write detail file failed jq validation!"; exit 1; }

HOT_N=$(jq --argjson lanes "${LANES_JSON}" '[ $lanes[] as $l | (.task_board[$l] // [])[] ] | length' "${ORCH_STATE}")
COLD_N=$(jq '.count' "${DETAIL_FILE}")

# Reconciliation: every hot-stub id (across ALL configured lanes) must exist
# as a key in cold detail items. Items without id (kept in hot) are excluded
# from this check.
RECONCILE_RESULT=$(jq -n \
  --slurpfile hot    "${ORCH_STATE}" \
  --slurpfile cold   "${DETAIL_FILE}" \
  --argjson lanes    "${LANES_JSON}" \
  '
    ($hot[0].task_board) as $tb |
    ([ $lanes[] as $lane | (($tb[$lane] // [])[]) | select(.id != null) | .id ]) as $hot_ids |
    ($cold[0].items | keys) as $cold_keys |
    ([$cold_keys[]] | map({key: ., value: true}) | from_entries) as $cold_set |

    {
      hot_stub_count:    ($hot_ids | length),
      cold_detail_count: ($cold_keys | length),
      missing_from_cold: [$hot_ids[] | select($cold_set[.] != true)],
      ok: ([$hot_ids[] | select($cold_set[.] != true)] | length == 0)
    }
  ')

RECON_OK=$(echo "${RECONCILE_RESULT}" | jq '.ok')
MISSING_COUNT=$(echo "${RECONCILE_RESULT}" | jq '.missing_from_cold | length')

HOT_SIZE=$(wc -c < "${ORCH_STATE}" | tr -d ' ')
COLD_SIZE=$(wc -c < "${DETAIL_FILE}" | tr -d ' ')

log "──────────────────────────────────────────────────────────────"
log "Backlog stub complete."
log "  Hot backlog items (stubs): ${HOT_N}"
log "  Cold detail items (keyed): ${COLD_N}"
log "  Hot file size:             ${HOT_SIZE} bytes"
log "  Cold detail file:          ${DETAIL_FILE} (${COLD_SIZE} bytes)"
log "  Reconciliation:"
log "    hot_stub_ids_with_id:    $(echo "${RECONCILE_RESULT}" | jq '.hot_stub_count')"
log "    cold_detail_count:       $(echo "${RECONCILE_RESULT}" | jq '.cold_detail_count')"
log "    missing_from_cold:       ${MISSING_COUNT}"
log "    ok:                      ${RECON_OK}"
log "──────────────────────────────────────────────────────────────"

if [[ "${RECON_OK}" != "true" ]]; then
  log "RECONCILIATION FAIL: ${MISSING_COUNT} hot stub id(s) have no cold entry."
  log "Missing ids: $(echo "${RECONCILE_RESULT}" | jq '.missing_from_cold')"
  log "CRITICAL: cold detail write may be incomplete. DO NOT commit. Investigate."
  exit 1
fi

log "Reconciliation PASS — all hot stub ids confirmed in cold detail."
