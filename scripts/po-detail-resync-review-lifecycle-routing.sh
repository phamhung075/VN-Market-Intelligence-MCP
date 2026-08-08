#!/usr/bin/env bash
# =============================================================================
# scripts/po-detail-resync-review-lifecycle-routing.sh
# =============================================================================
# PO data repair, 2026-08-08. Class: STALE-COLD-DETAIL-ROUTING-OVERRIDES-
# LIFECYCLE-FLIPPED-BOARD-ROW.
#
# WHAT IS BROKEN
# --------------
# `docs/data/orch/archive/backlog-detail.json` is a COLD, MINT-TIME store. Its
# only writer is scripts/orch-backlog-stub.sh, which (a) runs on NEW backlog
# item write and (b) has documented "existing cold wins" merge semantics. So a
# cold entry is NEVER re-synced when the hot row is later lifecycle-flipped by
# the implementing agent. Meanwhile scripts/lib/devteam-eligibility.jq's
# `effective_next_agent()` is DETAIL-FIRST / board-FALLBACK — it prefers the
# cold mint-time value over the live hot board row. Result, for any review[]
# row whose cold entry carries a non-empty `next_agent`:
#
#   1. FALSE-NEGATIVE (the bigger harm): scripts/devteam-review-claim-qa-drain.jq
#      (PRIMARY lane) selects `effective_next_agent == "qa"`. The stale cold
#      value resolves to something else, so the row is PERMANENTLY invisible to
#      QA-Drain and can never be signed off — it accretes in review[] forever.
#   2. FALSE-POSITIVE: scripts/devteam-review-claim-secondary-drain.jq
#      (SECONDARY lane) selects `effective_next_agent != "qa"` and dispatches to
#      `resolved_secondary_dispatch_target()` == that same stale value. It never
#      moves the row out of review[] (by design), so it re-picks the row and
#      re-dispatches the wrong agent every tick it becomes the oldest candidate.
#      Already materialised live twice: FIX-NOTEBOOK-AUTOPRUNE-REGEX-HEADING-
#      MISMATCH -> "developer" (2026-08-05T08:15:09Z) and FIX-COWORK-SPAWN-
#      IDENTITY-PREAMBLE-OFFFLOW -> "agent-father" (2026-08-08T17:26:17Z, the
#      dispatch that surfaced this).
#
# WHAT THIS SCRIPT DOES (data repair only — NOT the root-cause fix)
# ----------------------------------------------------------------
# The resolver-precedence root cause is tracked separately as
# FIX-DEVTEAM-ELIGIBILITY-DETAIL-FIRST-OVERRIDES-LIFECYCLE-FLIPPED-BOARD
# (architect design -> dev-mcp-server implementation). This script only
# neutralises the stale COLD data for the demonstrated-harm class so the 6
# stranded rows reach QA today.
#
# For every hot `.task_board.review[]` row that is:
#     status == "REVIEW"                       (lifecycle-flipped, not a mint stub)
#   AND board `.next_agent` present-non-empty  (an agent explicitly wrote it)
#   AND cold `.next_agent` present-non-empty AND != board `.next_agent`
# it rewrites that ONE cold item:
#   - `next_agent`  DELETED  -> effective_next_agent() falls through to the board
#                               value, which is what the 83 other review[] rows
#                               (cold entry carries no next_agent) already do
#                               correctly. Self-maintaining: no future re-sync
#                               needed when QA flips the row again. Setting it
#                               to "qa" instead would just mint the NEXT stale
#                               value.
#   - `status`      := board status  (informational only — the sole machine
#                                     reader is is_detail_deferred(), which only
#                                     tests a "deferred" prefix; unaffected)
#   - `route_to`    := board next_agent, ONLY if the key already exists (never
#                      machine-read anywhere — grep-verified; synced so human
#                      readers are not misled)
#   - `po_detail_resync_20260808` := provenance, preserving the prior values so
#                      no mint-time information is destroyed. Key deliberately
#                      does NOT match `^po_sequencing` (the one key-pattern
#                      predicate in devteam-eligibility.jq — has_unbacked_
#                      sequencing_prose), so it cannot trip a dispatch gate.
#
# DELIBERATELY OUT OF SCOPE
#   - backlog[] rows with the same board/cold `next_agent` conflict (10 live).
#     Those are NOT lifecycle flips (status still BACKLOG) — which side is newer
#     is genuinely ambiguous per row, and changing them changes real dispatch
#     targets. Evidence for the architect task; not blind-repaired here.
#   - `.count` (437) vs `.items | length` (442) drift. Pre-existing, cosmetic
#     (count is log-only in orch-backlog-stub.sh, never gated on equality).
#     Explicitly PRESERVED, not silently "fixed" inside a routing-scoped commit.
#   - `plan_only` / `mode` on the cold entries: the hot board rows carry their
#     own `plan_only`, so clearing cold would not change effective_plan_only().
#
# SAFETY
#   - Predicate-driven: NO hardcoded task-id literals.
#   - Idempotent: after a run the predicate no longer matches (cold next_agent
#     is gone), so re-running is a clean no-op.
#   - Read-only against the hot orch-state.json — never writes it, so the
#     scripts/orch-apply.sh hot-file write contract is not in play.
#   - Atomic temp-then-rename; post-build assertions on _sentinel, count, item
#     count, id set, and "no unintended item mutated" before the rename.
#
# Usage:
#   bash scripts/po-detail-resync-review-lifecycle-routing.sh --dry-run
#   bash scripts/po-detail-resync-review-lifecycle-routing.sh
#
# Canonical ref: docs/policies/dev-standards.md § Script Persistence
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ORCH_STATE="${ORCH_STATE:-${REPO_ROOT}/docs/data/orch/orch-state.json}"
DETAIL_FILE="${DETAIL_FILE:-${REPO_ROOT}/docs/data/orch/archive/backlog-detail.json}"
RESYNC_KEY="${RESYNC_KEY:-po_detail_resync_20260808}"

DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

log() { printf '%s\n' "$*" >&2; }

[[ -f "${ORCH_STATE}"  ]] || { log "ABORT: missing ${ORCH_STATE}";  exit 1; }
[[ -f "${DETAIL_FILE}" ]] || { log "ABORT: missing ${DETAIL_FILE}"; exit 1; }
jq empty "${ORCH_STATE}"  || { log "ABORT: hot file is not valid JSON";    exit 1; }
jq empty "${DETAIL_FILE}" || { log "ABORT: detail file is not valid JSON"; exit 1; }

NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# ---- the target set: board truth for every matching review[] row -----------
TARGETS=$(jq -n \
  --slurpfile hot  "${ORCH_STATE}" \
  --slurpfile cold "${DETAIL_FILE}" '
    ($cold[0].items | map(select(.id != null) | {key: .id, value: .}) | from_entries) as $ci
    | [ ($hot[0].task_board.review // [])[]
        | select(.id != null)
        | select(.status == "REVIEW")
        | select(((.next_agent // "") | tostring) != "")
        | . as $r
        | ($ci[$r.id]) as $d
        | select($d != null)
        | select((($d.next_agent // "") | tostring) != "")
        | select($d.next_agent != $r.next_agent)
        | { id: $r.id,
            board_next_agent: $r.next_agent,
            board_status: $r.status,
            prior_next_agent: $d.next_agent,
            prior_status: ($d.status // null),
            prior_route_to: ($d.route_to // null) }
      ]')

N_TARGETS=$(jq 'length' <<<"${TARGETS}")

log "──────────────────────────────────────────────────────────────"
log "PO cold-detail lifecycle-routing resync"
log "  Hot:    ${ORCH_STATE}"
log "  Cold:   ${DETAIL_FILE}"
log "  Matched review[] rows: ${N_TARGETS}"
jq -r '.[] | "    \(.id)\n      cold next_agent=\(.prior_next_agent) status=\(.prior_status) route_to=\(.prior_route_to // "ABSENT")\n      board next_agent=\(.board_next_agent) status=\(.board_status)"' <<<"${TARGETS}" >&2
log "──────────────────────────────────────────────────────────────"

if [[ "${N_TARGETS}" == "0" ]]; then
  log "No matching rows — no-op. Cold file untouched."
  exit 0
fi

if [[ "${DRY_RUN}" == "true" ]]; then
  log "DRY-RUN: cold file NOT modified."
  exit 0
fi

DETAIL_DIR="$(dirname "${DETAIL_FILE}")"
DETAIL_TEMP="$(mktemp "${DETAIL_DIR}/.backlog-detail-resync-XXXXXXXX.tmp")"
trap 'rm -f "${DETAIL_TEMP}"' EXIT

jq --argjson targets "${TARGETS}" --arg now "${NOW}" --arg rkey "${RESYNC_KEY}" '
  ($targets | map({key: .id, value: .}) | from_entries) as $t
  | .items = ( .items | map(
      . as $item
      | if ($item.id != null) and ($t[$item.id] != null) then
          ($t[$item.id]) as $tt
          | ($item | del(.next_agent))
            | .status = $tt.board_status
            | (if ($item | has("route_to")) then .route_to = $tt.board_next_agent else . end)
            | .[$rkey] = {
                at: $now,
                by: "po",
                reason: "cold mint-time routing overrode a lifecycle-flipped hot board row via effective_next_agent() detail-first precedence; stranded the row out of PRIMARY QA-Drain and into repeated SECONDARY-Drain misdispatch",
                prior_next_agent: $tt.prior_next_agent,
                prior_status: $tt.prior_status,
                prior_route_to: $tt.prior_route_to,
                board_next_agent_at_resync: $tt.board_next_agent,
                root_cause_task: "FIX-DEVTEAM-ELIGIBILITY-DETAIL-FIRST-OVERRIDES-LIFECYCLE-FLIPPED-BOARD"
              }
        else $item end
    ))
  | .updated_at = $now
' "${DETAIL_FILE}" > "${DETAIL_TEMP}"

# ---- HARD GATES before the rename -----------------------------------------
jq empty "${DETAIL_TEMP}" >/dev/null \
  || { log "ABORT: rebuilt detail is not valid JSON — cold file NOT modified"; exit 1; }

jq -e '._sentinel and .items and (.count | type == "number")' "${DETAIL_TEMP}" >/dev/null \
  || { log "ABORT: rebuilt detail fails the orch-backlog-stub.sh sentinel — cold file NOT modified"; exit 1; }

VERDICT=$(jq -n \
  --slurpfile before "${DETAIL_FILE}" \
  --slurpfile after  "${DETAIL_TEMP}" \
  --argjson targets  "${TARGETS}" \
  --arg rkey "${RESYNC_KEY}" '
    ($before[0]) as $b | ($after[0]) as $a
    | ($targets | map(.id)) as $ids
    | ($ids | map({key: ., value: true}) | from_entries) as $idset
    | {
        sentinel_preserved: ($a._sentinel == $b._sentinel),
        count_preserved:    ($a.count == $b.count),
        created_at_preserved: ($a.created_at == $b.created_at),
        item_count_preserved: (($a.items | length) == ($b.items | length)),
        id_set_preserved:   (($a.items | map(.id)) == ($b.items | map(.id))),
        untouched_items_identical:
          ( [ range(0; ($b.items | length))
              | select( ($b.items[.].id == null) or ($idset[$b.items[.].id] != true) )
              | ($b.items[.] == $a.items[.]) ] | all ),
        all_targets_cleared:
          ( [ $a.items[] | select(.id != null) | select($idset[.id] == true)
              | (has("next_agent") | not) and (has($rkey)) ] | (length == ($ids | length)) and all ),
        updated_at_advanced: ($a.updated_at != $b.updated_at)
      }
    | . + { ok: ([.[]] | all) }')

log "  Gate verdict: $(jq -c . <<<"${VERDICT}")"
[[ "$(jq -r '.ok' <<<"${VERDICT}")" == "true" ]] \
  || { log "ABORT: gate FAILED — cold file NOT modified"; exit 1; }

mv "${DETAIL_TEMP}" "${DETAIL_FILE}"
trap - EXIT
log "  WROTE ${DETAIL_FILE} (${N_TARGETS} item(s) resynced)"
