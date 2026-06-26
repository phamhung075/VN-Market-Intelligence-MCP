#!/usr/bin/env bash
# =============================================================================
# scripts/orch-backlog-stub.sh
# =============================================================================
# ORCH-STATE-HOT-COLD-SPLIT — HSC-4 deliverable
#
# Strips prose from every backlog[] item in docs/data/orch/orch-state.json (HOT),
# keeping only the hot-stub fields, and writes the FULL original item to the cold
# detail store at docs/data/orch/archive/backlog-detail.json, keyed by id.
#
# Usage:
#   scripts/orch-backlog-stub.sh [--dry-run]
#
# Contract:
#   - MUST be called while commit-mutex:main is held by the caller (task_claim).
#   - Cold detail file is written and jq-verified BEFORE the hot file is modified.
#   - Atomic temp-then-rename for BOTH cold detail and hot orch-state.
#   - mtime-CAS retry loop guards against concurrent writers.
#   - Idempotent: items already in cold (by id key) are preserved at their FULL
#     version even if the hot file only has a stub on re-run (existing cold wins).
#   - Items lacking an `id` field are kept in hot with ALL their fields intact
#     (cannot be cold-stored without an addressable key).
#   - --dry-run: reports stub preview + projected hot-file size, no writes.
#
# Parameterisation:
#   STUB_FIELDS  — comma-separated list of field names to KEEP in the hot stub.
#                  Default: id,title,priority,size,type,zone,status,sprint,detail_ref
#                  `detail_ref` is always added by this script before the strip.
#   ORCH_STATE   — path to the hot orch-state file (default: auto-detected)
#   ARCHIVE_DIR  — path to the archive directory (default: auto-detected)
#   DETAIL_FILE  — path to the cold backlog-detail file (default: auto-detected)
#   MTIME_CAS_RETRIES — concurrent-writer retry limit (default: 3)
#
# Lazy-load pattern for readers (HSC-4 §cold reader contract):
#   # Load full detail for one backlog item by id:
#   jq '.items["<id>"]' docs/data/orch/archive/backlog-detail.json
#
# Owning brief:  docs/architecture-briefs/2026-06-26-orch-state-hot-cold-split.md §HSC-4
# Canonical ref: docs/policies/dev-standards.md §Script Persistence
# Called from:   HSC-4 one-time migration; pm/flow/main.md on new backlog item write
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
STUB_FIELDS="${STUB_FIELDS:-id,title,priority,size,type,zone,status,sprint,detail_ref}"

# CAS: abort after this many concurrent-writer detections
MTIME_CAS_RETRIES="${MTIME_CAS_RETRIES:-3}"

# Cold detail sentinel — used to validate cold file structure
DETAIL_SENTINEL="backlog-detail-v1"

# Base path embedded in each stub's detail_ref (relative from repo root, for readability)
DETAIL_REF_BASE="docs/data/orch/archive/backlog-detail.json"
# =============================================================================

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

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

log() { echo "[orch-backlog-stub] $*" >&2; }

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
# build_detail_temp
#
# Reads the CURRENT hot backlog and merges full items into the cold detail file.
#
# Merge strategy: $new_items + $existing_cold_items
#   - Right-side (existing cold) WINS for duplicate ids.
#   - This preserves the FULL version of items already in cold even when hot
#     only has a stub (idempotent re-run safety).
#   - New items (not yet in cold) come from the left side ($new_items from hot).
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
      --slurpfile hot    "${ORCH_STATE}" \
      '
        ($hot[0].task_board.backlog // []) as $backlog |

        # Build new_items: id -> full item (strip detail_ref — script-added field)
        ([$backlog[]
          | select(.id != null)
          | del(.detail_ref)
          | {key: .id, value: .}
        ] | from_entries) as $new_items |

        # Merge: $new_items + .items → existing cold keys WIN (right side in jq + wins)
        .items   = ($new_items + .items) |
        .count   = (.items | length) |
        .updated_at = $now
      ' "${DETAIL_FILE}" > "${output}"
  else
    # Create new cold detail file.
    jq \
      --arg sentinel        "${DETAIL_SENTINEL}" \
      --arg now             "${now}" \
      --arg detail_ref_base "${DETAIL_REF_BASE}" \
      '
        (.task_board.backlog // []) as $backlog |

        ([$backlog[]
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
# Strips each backlog item to the hot-stub field set, adding detail_ref first.
# Items without 'id' are left untouched (kept with all fields — cannot key cold).
#
# The jq `with_entries(select(...))` approach is fully parameterised:
# STUB_FIELDS is passed as a comma-separated string and converted to a lookup set.
# =============================================================================
build_hot_temp() {
  local output="$1"

  jq \
    --arg stub_fields     "${STUB_FIELDS}" \
    --arg detail_ref_base "${DETAIL_REF_BASE}" \
    '
      # Build stub field lookup set from comma-separated config string
      ($stub_fields | split(",") | map({key: ., value: true}) | from_entries) as $sf |

      .task_board.backlog |= [
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
    ' "${ORCH_STATE}" > "${output}"
}

# =============================================================================
# DRY-RUN path — report preview + projected size, exit 0, no writes
# =============================================================================
if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: computing stub preview — no writes"

  CURRENT_SIZE=$(wc -c < "${ORCH_STATE}" | tr -d ' ')
  N_BACKLOG=$(jq '.task_board.backlog | length' "${ORCH_STATE}")
  N_WITH_ID=$(jq '[.task_board.backlog[] | select(.id != null)] | length' "${ORCH_STATE}")
  N_WITHOUT_ID=$((N_BACKLOG - N_WITH_ID))

  # Count items that carry fields beyond the stub set (have prose to move)
  N_HAS_PROSE=$(jq --arg sf "${STUB_FIELDS}" '
    ($sf | split(",") | map({key: ., value: true}) | from_entries) as $sf_set |
    [.task_board.backlog[] |
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
  log "  Stub field set:            ${STUB_FIELDS}"
  log "  Cold detail file:          ${DETAIL_FILE}"
  log "  Total backlog items:       ${N_BACKLOG}"
  log "  Items with id (moveable):  ${N_WITH_ID}"
  log "  Items without id (kept):   ${N_WITHOUT_ID}"
  log "  Items with prose to move:  ${N_HAS_PROSE}"
  log "  Existing cold items:       ${EXISTING_COLD_N}"
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

  # Validate hot temp sentinel
  jq -e '.head and .task_board and .signal_queue' "${HOT_TEMP}" >/dev/null \
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

  # Cold is confirmed written — now safely strip hot
  log "Writing hot file (atomic rename): ${ORCH_STATE}"
  mv "${HOT_TEMP}" "${ORCH_STATE}"
  HOT_TEMP=""

  SUCCESS=true
  break
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

HOT_N=$(jq '.task_board.backlog | length' "${ORCH_STATE}")
COLD_N=$(jq '.count' "${DETAIL_FILE}")

# Reconciliation: every hot-stub id must exist as a key in cold detail items.
# Items without id (kept in hot) are excluded from this check.
RECONCILE_RESULT=$(jq -n \
  --slurpfile hot    "${ORCH_STATE}" \
  --slurpfile cold   "${DETAIL_FILE}" \
  '
    ($hot[0].task_board.backlog | [.[] | select(.id != null) | .id]) as $hot_ids |
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
