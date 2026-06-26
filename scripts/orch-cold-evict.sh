#!/usr/bin/env bash
# =============================================================================
# scripts/orch-cold-evict.sh
# =============================================================================
# ORCH-STATE-HOT-COLD-SPLIT — HSC-1 deliverable
#
# Evicts terminal records from docs/data/orch/orch-state.json (HOT) to the
# monthly cold archive at docs/data/orch/archive/YYYY-MM.json (COLD).
#
# Usage:
#   scripts/orch-cold-evict.sh [--dry-run]
#
# Contract:
#   - MUST be called while commit-mutex:main is held by the caller (task_claim).
#   - Cold file is written and jq-verified BEFORE the hot file is modified.
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
# Sprints whose status field matches any of these are evicted from active_sprints[].
# Sprints whose status field starts with "BCTC-" are also evicted (handled separately).
TERMINAL_SPRINT_STATUSES="${TERMINAL_SPRINT_STATUSES:-DONE,done,DONE-WITH-CAVEATS,completed,SIGNED-OFF-PARTIAL}"

# Terminal signal statuses: comma-separated list.
# Rows whose status field matches any of these are evicted from signal_queue.rows[].
# signal_queue.archive[] is always fully evicted (inline archive = RC-1 root cause).
TERMINAL_SIGNAL_STATUSES="${TERMINAL_SIGNAL_STATUSES:-READ,RESOLVED,SUPERSEDED,ACUTE-RESOLVED-ROOT-TRACKED}"
# =============================================================================

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

MONTH="$(date -u +%Y-%m)"
COLD_FILE="${ARCHIVE_DIR}/${MONTH}.json"

# Temp file handles — populated dynamically; cleaned up on EXIT
COLD_TEMP=""
HOT_TEMP=""

# ─── cleanup temp files on any exit ──────────────────────────────────────────
cleanup() {
  # Disable errexit inside trap so false [[ ]] conditions don't alter exit code
  set +e
  if [[ -n "${COLD_TEMP:-}" && -f "${COLD_TEMP}" ]]; then rm -f "${COLD_TEMP}"; fi
  if [[ -n "${HOT_TEMP:-}"  && -f "${HOT_TEMP}"  ]]; then rm -f "${HOT_TEMP}"; fi
}
trap cleanup EXIT

# ─── portable mtime (macOS stat -f / Linux stat -c) ─────────────────────────
get_mtime() {
  if stat -f "%m" "$1" 2>/dev/null; then
    return
  fi
  stat -c "%Y" "$1"
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
#   rm_done, rm_dv, rm_sprint, rm_sig_rows  — {id:true} removal maps for hot
#   new_cold_done_set, new_cold_sprint_set, new_cold_signal_set — {id:true} for cold select
#   n_evict_* counts
# =============================================================================
compute_id_maps() {
  local src="$1"
  local cold_done="$2"
  local cold_sprint="$3"
  local cold_signal="$4"

  jq \
    --argjson keep_n      "${KEEP_RECENT_DONE}" \
    --argjson max_days    "${DONE_MAX_AGE_DAYS}" \
    --arg     term_sprint "${TERMINAL_SPRINT_STATUSES}" \
    --arg     term_signal "${TERMINAL_SIGNAL_STATUSES}" \
    --argjson cold_done   "${cold_done}" \
    --argjson cold_sprint "${cold_sprint}" \
    --argjson cold_signal "${cold_signal}" \
    '
      # ── parse config ─────────────────────────────────────────────────────
      ($term_sprint | split(",")) as $ts_arr |
      ($term_signal | split(",")) as $tsig_arr |
      (now - ($max_days * 86400)) as $cutoff |

      # cold-known ID sets (for idempotency + partial-failure recovery)
      ($cold_done   | map({key: (. // ""), value: true}) | from_entries) as $cd_set   |
      ($cold_sprint | map({key: (. // ""), value: true}) | from_entries) as $cs_set   |
      ($cold_signal | map({key: (. // ""), value: true}) | from_entries) as $csig_set |

      # ── done[]: sort DESC; evict beyond keep_n AND older than cutoff ─────
      (.task_board.done // []
        | sort_by(.created_at // "0000-00-00T00:00:00Z")
        | reverse
        | to_entries
      ) as $done_ranked |

      # ALL terminal done IDs (remove from hot regardless of cold status)
      [$done_ranked[] | select(
          .key >= $keep_n and
          (.value.created_at == null or
           (try (.value.created_at | fromdateiso8601) catch 0) < $cutoff)
        ) | (.value.id // "")
      ] as $all_terminal_done_ids |

      # done[] IDs that are new to cold (not already there)
      [$all_terminal_done_ids[] | select(
          . != "" and ($cd_set[.] != true)
        )
      ] as $new_done_ids |

      # ── done_verified[]: all items are terminal ──────────────────────────
      [.task_board.done_verified // [] | .[].id // ""] as $all_terminal_dv_ids |

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

      # ── signal_queue.rows[]: terminal statuses ───────────────────────────
      [.signal_queue.rows // [] | .[] | select(
          .id != null and (.status | IN($tsig_arr[]))
        ) | .id
      ] as $all_terminal_sig_row_ids |

      [$all_terminal_sig_row_ids[] | select($csig_set[.] != true)] as $new_sig_row_ids |

      # ── signal_queue.archive[]: ALL items evicted (inline archive = RC-1) ─
      [.signal_queue.archive // [] | .[].id // ""] as $all_sig_archive_ids |

      [$all_sig_archive_ids[] | select(. != "" and ($csig_set[.] != true))] as $new_sig_arch_ids |

      # ── output: IDs and lookup maps only (NOT full objects) ──────────────
      {
        # {id: true} removal maps for hot file transformation
        rm_done:     ($all_terminal_done_ids | map({key: ., value: true}) | from_entries),
        rm_dv:       ($all_terminal_dv_ids   | map({key: ., value: true}) | from_entries),
        rm_sprint:   ($all_terminal_sprint_ids | map({key: ., value: true}) | from_entries),
        rm_sig_rows: ($all_terminal_sig_row_ids | map({key: ., value: true}) | from_entries),

        # {id: true} sets for selecting new items to cold
        # done + done_verified share the same cold target (done_tasks[])
        new_cold_done_set:   (($new_done_ids + $new_dv_ids) | map({key: ., value: true}) | from_entries),
        new_cold_sprint_set: ($new_sprint_ids | map({key: ., value: true}) | from_entries),
        # rows + archive share the same cold target (signal_rows[])
        new_cold_signal_set: (($new_sig_row_ids + $new_sig_arch_ids) | map({key: ., value: true}) | from_entries),

        # Counts for reporting
        n_evict_done:     ($all_terminal_done_ids | length),
        n_evict_dv:       ($all_terminal_dv_ids | length),
        n_evict_sprints:  ($all_terminal_sprint_ids | length),
        n_evict_sig_rows: ($all_terminal_sig_row_ids | length),
        n_evict_sig_arch: ($all_sig_archive_ids | length),
        n_new_cold: (
          ($new_done_ids | length) + ($new_dv_ids | length) +
          ($new_sprint_ids | length) +
          ($new_sig_row_ids | length) + ($new_sig_arch_ids | length)
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
      --slurpfile hot "${ORCH_STATE}" \
      '
        ($maps.new_cold_done_set)   as $cd_set   |
        ($maps.new_cold_sprint_set) as $cs_set   |
        ($maps.new_cold_signal_set) as $csig_set |

        (
          (($hot[0].task_board.done // []) + ($hot[0].task_board.done_verified // [])) |
          [.[] | select((.id // "") as $id | $cd_set[$id] == true)]
        ) as $new_done |
        (
          $hot[0].task_board.active_sprints // [] |
          [.[] | select((.id // "") as $id | $cs_set[$id] == true)]
        ) as $new_sprints |
        (
          (($hot[0].signal_queue.rows // []) + ($hot[0].signal_queue.archive // [])) |
          [.[] | select((.id // "") as $id | $csig_set[$id] == true)]
        ) as $new_signals |

        .done_tasks     += $new_done    |
        .closed_sprints += $new_sprints |
        .signal_rows    += $new_signals
      ' "${COLD_FILE}" > "${output}"
  else
    # Create new cold file with schema from §3.2 of brief.
    jq \
      --argjson maps "${maps}" \
      --arg     month "${MONTH}" \
      --arg     now   "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      '
        ($maps.new_cold_done_set)   as $cd_set   |
        ($maps.new_cold_sprint_set) as $cs_set   |
        ($maps.new_cold_signal_set) as $csig_set |
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
          signal_rows: [
            ((.signal_queue.rows // []) + (.signal_queue.archive // [])) |
            .[] | select((.id // "") as $id | $csig_set[$id] == true)
          ],
          backlog_detail: []
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
    '
      .task_board.done           |= [.[] | select((.id // "") as $id | $maps.rm_done[$id]     != true)] |
      .task_board.done_verified  |= [.[] | select((.id // "") as $id | $maps.rm_dv[$id]       != true)] |
      .task_board.active_sprints |= [.[] | select((.id // "") as $id | $maps.rm_sprint[$id]   != true)] |
      .signal_queue.rows         |= [.[] | select((.id // "") as $id | $maps.rm_sig_rows[$id] != true)] |
      .signal_queue.archive       = []
    ' "${ORCH_STATE}" > "${output}"
}

# =============================================================================
# Helper: read cold-known IDs from existing cold file (for idempotency)
# Sets globals: COLD_DONE_IDS, COLD_SPRINT_IDS, COLD_SIGNAL_IDS
# =============================================================================
read_cold_ids() {
  if [[ -f "${COLD_FILE}" ]]; then
    jq -e '.month and .done_tasks and .closed_sprints and .signal_rows' "${COLD_FILE}" >/dev/null \
      || { log "ABORT: existing cold file structure invalid: ${COLD_FILE}"; exit 1; }
    COLD_DONE_IDS=$(jq '[.done_tasks[].id // ""]' "${COLD_FILE}")
    COLD_SPRINT_IDS=$(jq '[.closed_sprints[].id // ""]' "${COLD_FILE}")
    COLD_SIGNAL_IDS=$(jq '[.signal_rows[].id // ""]' "${COLD_FILE}")
  else
    COLD_DONE_IDS='[]'
    COLD_SPRINT_IDS='[]'
    COLD_SIGNAL_IDS='[]'
  fi
}

# =============================================================================
# DRY-RUN path — report preview + projected size, exit 0, no writes
# =============================================================================
if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: computing eviction preview — no writes"

  CURRENT_SIZE=$(wc -c < "${ORCH_STATE}" | tr -d ' ')

  read_cold_ids
  MAPS=$(compute_id_maps "${ORCH_STATE}" "${COLD_DONE_IDS}" "${COLD_SPRINT_IDS}" "${COLD_SIGNAL_IDS}")

  N_DONE=$(echo "${MAPS}"    | jq '.n_evict_done')
  N_DV=$(echo "${MAPS}"      | jq '.n_evict_dv')
  N_SPRINTS=$(echo "${MAPS}" | jq '.n_evict_sprints')
  N_SIG_R=$(echo "${MAPS}"   | jq '.n_evict_sig_rows')
  N_SIG_A=$(echo "${MAPS}"   | jq '.n_evict_sig_arch')
  N_NEW=$(echo "${MAPS}"     | jq '.n_new_cold')

  # Project hot-file size without writing (pipe jq output to wc -c)
  PROJECTED_SIZE=$(build_hot_temp "${MAPS}" /dev/stdout | wc -c | tr -d ' ')

  REDUCTION=$((CURRENT_SIZE - PROJECTED_SIZE))

  log "──────────────────────────────────────────────────────────────"
  log "Eviction preview (cold target: ${COLD_FILE})"
  log "  done[]              would evict: ${N_DONE} items from hot"
  log "  done_verified[]     would evict: ${N_DV} items from hot"
  log "  active_sprints[]    would evict: ${N_SPRINTS} items from hot"
  log "  signal_queue.rows[] would evict: ${N_SIG_R} items from hot"
  log "  signal_queue.archive[] evict:   ${N_SIG_A} items from hot"
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

  # ── re-read cold IDs each iteration (handles partial-failure recovery) ─────
  # If a previous run wrote cold but failed before hot rename, items appear in
  # both files. Re-reading cold IDs here prevents re-adding them to cold while
  # still removing them from hot.
  read_cold_ids

  # ── Pass 1: compute ID maps (small output, safe for --argjson) ────────────
  MAPS=$(compute_id_maps "${ORCH_STATE}" "${COLD_DONE_IDS}" "${COLD_SPRINT_IDS}" "${COLD_SIGNAL_IDS}")

  log "Attempt $((ATTEMPT + 1))/${MTIME_CAS_RETRIES}: ID maps computed"
  log "  done[]:            $(echo "${MAPS}" | jq '.n_evict_done') to evict from hot"
  log "  done_verified[]:   $(echo "${MAPS}" | jq '.n_evict_dv') to evict from hot"
  log "  active_sprints[]:  $(echo "${MAPS}" | jq '.n_evict_sprints') to evict from hot"
  log "  signal rows[]:     $(echo "${MAPS}" | jq '.n_evict_sig_rows') to evict from hot"
  log "  signal archive[]:  $(echo "${MAPS}" | jq '.n_evict_sig_arch') to evict from hot"
  log "  New items to cold: $(echo "${MAPS}" | jq '.n_new_cold')"

  # ── Pass 2a: Build cold temp ─────────────────────────────────────────────
  COLD_TEMP=$(mktemp "${ARCHIVE_DIR}/.cold-evict-XXXXXXXX.tmp")
  build_cold_temp "${MAPS}" "${COLD_TEMP}"

  # Validate cold temp — ABORT before touching hot if cold is invalid
  jq -e '.month and .done_tasks and .closed_sprints and .signal_rows' "${COLD_TEMP}" >/dev/null \
    || { log "ABORT: cold temp sentinel failed — hot file NOT modified"; exit 1; }
  jq '.' "${COLD_TEMP}" >/dev/null \
    || { log "ABORT: cold temp invalid JSON — hot file NOT modified"; exit 1; }

  # ── Pass 2b: Build hot temp ───────────────────────────────────────────────
  HOT_TEMP=$(mktemp "${REPO_ROOT}/docs/data/orch/.hot-evict-XXXXXXXX.tmp")
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

  # Cold is confirmed written — now safely update hot
  log "Writing hot file (atomic rename): ${ORCH_STATE}"
  mv "${HOT_TEMP}" "${ORCH_STATE}"
  HOT_TEMP=""

  SUCCESS=true
  break
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
