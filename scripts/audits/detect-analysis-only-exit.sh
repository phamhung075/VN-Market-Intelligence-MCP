#!/usr/bin/env bash
# scripts/audits/detect-analysis-only-exit.sh
#
# FIX-LEAF-AGENT-ANALYSIS-ONLY-EXIT-NARRATES-INSTEAD-OF-EXECUTING
#
# ROOT-CAUSE FIX (AC-1): a generic, agent-agnostic EXOGENOUS detector for the
# "leaf agent completes real analysis, narrates the write/emit/commit steps
# it 'would' perform, and exits having written nothing" failure class.
# Confirmed on 5 distinct agent types over ~7 weeks (unified-agent
# chef-morning 2026-06-18; market-watcher-offhours 2026-06-28/07-12/07-29;
# tran-ngoc-bau c122 2026-08-04; refine_bctc_md 2026-08-06; system-auditor
# Tier-1 x4 2026-08-06/07) — 5 confirmed-defective + 2 confirmed-clean across
# 7 spawns is the narrowest, most-recently-instrumented sample (system-auditor
# Tier-1 same-day cluster); the wider history above is the true, larger
# floor (AC-6) — see docs/agent-memory/feedback_leaf_agent_analysis_only_exit_
# recurring_pattern_20260806.md (kept in ~/.claude memory, not this repo) and
# the design note attached to board row
# FIX-COWORK-DELIVERY-PROOF-GATE-ONLY-CATCHES-ROUTERLATCH-NARRATION.
#
# AC-2 — adopts docs/agents/po/flow/main.md AC-3's rule VERBATIM, generalized
# from "PO's own board write" to "any leaf agent's mandated write loop":
#   "any step that writes an artifact AND asserts its own persistence must
#    re-read the persistence layer before claiming it, never trust the
#    write call's own exit code."
# This script IS that re-read, made mechanical and reusable (this is the
# rule's SECOND adopter — PO's own main.md AC-3 was the first).
#
# AC-3 — keys ONLY on the PERSISTENCE PLANE, never on the agent's own RETURN
# text: this script takes no "did you write it" flag from the caller at all.
# It independently re-reads 5 real artifacts:
#   PLANE 1 NOTEBOOK      — git commits touching the agent's notebook file
#                            since --since-ts
#   PLANE 2 COMMIT        — any git commit since --since-ts whose message
#                            matches the agent's own commit-convention
#                            prefix (docs/policies/commit-convention.md),
#                            independent of path (catches DASHBOARD.md/
#                            orch-state.json-only commits the notebook path
#                            alone would miss)
#   PLANE 3 SIGNAL_QUEUE  — orch-state.json .signal_queue.rows[] with
#                            from==--agent-id and ts>=--since-ts
#   PLANE 4 LEDGER        — docs/data/auditor-dedup-ledger.json flat-map
#                            entries with .ts>=--since-ts (OPTIONAL — pass
#                            --dedup-ledger-file "" to skip for agents that
#                            never call emit-audit-signal.sh)
#   PLANE 5 EXTRA         — 0..N caller-supplied extra artifact paths
#                            (DASHBOARD.md, a heartbeat/last-healthy file,
#                            etc.), each checked via git log since
#                            --since-ts (OPTIONAL — additive, skipped when
#                            no --extra-artifact given)
#
# VERDICT: every CHECKED plane (mandatory: notebook/commit/signal_queue;
# optional: ledger/extra, only when supplied) reads exactly 0 -> DETECTED
# (analysis-only exit, the 5-plane — or fewer, if some are legitimately
# skipped — zero-diff signature). Any checked plane > 0 -> PASS (the agent
# wrote SOMETHING real this window; a partial write is not this defect)
# UNLESS the PARTIAL-WRITE CONTRACT CHECK below fires (added
# FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE —
# confirmed live on system-auditor c80, 2026-08-08T01:08:04Z: notebook=1
# commit=1 signal_queue=0 ledger=0, i.e. a genuine partial write, while the
# agent's OWN `[OUTPUT-CONTRACT]` line inside that same notebook commit
# claimed `signal_queue_rows_written=1`. The zero-diff-only OR verdict is
# blind to a cycle that writes SOME real planes and fabricates the rest of
# its own contract line — this fixes that without narrowing the original
# zero-diff signature it still catches unchanged).
#
# PARTIAL-WRITE CONTRACT CHECK (AC-1 + AC-2 of the owning row): independent
# of the zero-diff OR-verdict above, this script now also extracts the
# `[OUTPUT-CONTRACT] ...` line the agent itself published inside the
# notebook commit(s) landed in [since,until] (scripts/lib/output-contract-
# invariant.sh, shared with scripts/auditor-notebook-commit.sh's AC-4
# pre-commit backstop — one extraction/arithmetic implementation, not two)
# and runs TWO checks against it, either of which forces DETECTED
# regardless of how many planes are non-zero:
#   AC-2 structural arithmetic invariant (zero-false-positive, no plane
#     lookup needed): `signals_posted >= signal_queue_rows_written` AND
#     `signals_posted >= dedup_skipped` are invariants of
#     scripts/audit-output-contract.sh's own parser (proof: that script's
#     header + scripts/lib/output-contract-invariant.sh). A published line
#     violating either is provably not that script's own output.
#   AC-1 claim-vs-plane reconciliation: published `signal_queue_rows_written
#     > 0` while the independently re-read Plane 3 (signal_queue) count for
#     this exact window is 0 — the claim asserts a write that provably never
#     landed, regardless of Plane 1/Plane 2 (notebook/commit) being non-zero.
# No `[OUTPUT-CONTRACT]` line found in the window (most non-auditor leaf
# agents never publish one) -> both checks are skipped (never manufacture a
# false DETECTED on an agent that doesn't carry this contract at all) and
# the original zero-diff OR-verdict is the sole discriminator, unchanged.
#
# CONTRACT (named args, mirrors scripts/emit-audit-signal.sh discipline):
#   scripts/audits/detect-analysis-only-exit.sh \
#     --agent-id <id>                    # REQUIRED. Bare agent id, e.g. "system-auditor".
#     --since-ts <ISO-8601>               # REQUIRED. Window start (spawn/cron FIRE_TICK
#                                          # or task_claim time) — accepts bare-minute
#                                          # ("...T15:00Z") or full-second forms, same
#                                          # to_epoch idiom as audit-output-contract.sh.
#     [--notebook-path <path>             default: docs/agent-memory/notebooks/<agent-id>.md]
#     [--orch-state-file <path>           default: $REPO_ROOT/docs/data/orch/orch-state.json]
#     [--dedup-ledger-file <path>         default: $REPO_ROOT/docs/data/auditor-dedup-ledger.json
#                                          pass "" explicitly to SKIP Plane 4]
#     [--commit-prefix <str>              default: "memory/<agent-id>" — substring match
#                                          against `git log --grep` on the commit subject]
#     [--extra-artifact <path>]           repeatable — Plane 5, additive
#     [--cycle-tag <value>                default: none. When supplied, Plane 3
#                                          (signal_queue) switches from the
#                                          ts-window to an EXACT audit_cycle_tag
#                                          match (pass the tier's own FIRE_TASK_ID
#                                          — same value already threaded through
#                                          every emit-audit-signal.sh call site).
#                                          Immune to same-agent cross-cycle
#                                          collision that a loose ts-window can't
#                                          resolve (two Tier-1 spawns 8 minutes
#                                          apart both read from="system-auditor").]
#     [--until-ts <ISO-8601>              default: unbounded (checks up through "now" —
#                                          the correct default for a live immediate-
#                                          post-spawn check). Set explicitly when
#                                          reconstructing a SPECIFIC past cycle window
#                                          (AC-6 historical scan) — otherwise later,
#                                          unrelated activity between the window and
#                                          the moment this script runs will mask a
#                                          real historical zero-diff as a false PASS.]
#     [--repo-root <path>                 default: git -C $SCRIPT_DIR rev-parse --show-toplevel]
#
# STDOUT (mechanically parseable, grep-friendly):
#   [detect-analysis-only-exit] PASS agent=<id> since=<ts> notebook=<n> commit=<n> signal_queue=<n> ledger=<n|skip> extra=<n|skip> contract=<ok|absent>
#   [detect-analysis-only-exit] DETECTED agent=<id> since=<ts> notebook=<n> commit=<n> signal_queue=<n> ledger=<n|skip> extra=<n|skip> contract=<ok|absent|arithmetic-violation|plane-mismatch>
# `contract=` (trailing field, added by this fix): `absent` = no
# `[OUTPUT-CONTRACT]` line found in-window (partial-write contract check not
# applicable, verdict is the zero-diff OR alone); `ok` = a claim line was
# found and passed both checks; `arithmetic-violation` / `plane-mismatch` =
# the specific PARTIAL-WRITE CONTRACT CHECK that forced DETECTED (see above)
# — DETECTED can fire with every one of notebook/commit/signal_queue > 0
# when `contract` is one of these two, which is exactly the case the
# original zero-diff-only OR verdict missed on c80.
#
# EXIT CODE: 0 = PASS. 1 = DETECTED (analysis-only exit, incl. the
# partial-write contract-violation variant). 2 = usage error.
#
# Regression fixture (AC-5): scripts/audits/detect-analysis-only-exit.test.sh
# — POSITIVE control (synthetic spawn that wrote nothing -> DETECTED, exit 1)
# and NEGATIVE control (synthetic spawn that wrote one real signal_queue row
# -> PASS, exit 0), both against a disposable scratch git repo, never the
# live repo. Also carries the FIX-ANALYSIS-ONLY-EXIT-DETECTOR-OR-VERDICT-
# BLIND-TO-PARTIAL-WRITE-CYCLE fixtures: the RED case replays c80's real
# published line verbatim (arithmetic-violation, still DETECTED despite
# notebook=1/commit=1) and the GREEN case replays c79's real published line
# verbatim (a legitimately quiet cycle, must stay PASS) — see that suite's
# T8-T11.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain indexed arrays / case statements / jq.
#
# Precedents: scripts/audit-output-contract.sh (marker-parsed, trustworthy-
# operand cross-check pattern + the to_epoch minute-vs-second idiom, ported
# verbatim below — "Bug A" in that script's own header), scripts/emit-audit-
# signal.sh (named-arg discipline, ledger flat-map shape), docs/agents/po/
# flow/main.md AC-3 (the generic rule this script mechanizes).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=../lib/output-contract-invariant.sh
source "$SCRIPT_DIR/../lib/output-contract-invariant.sh"

# =============================================================================
# INFRASTRUCTURE — shared jq date idiom (ported verbatim from
# scripts/audit-output-contract.sh's V1 check — Bug A: cycle_start_ts is
# often minute-precision, .ts fields are second-precision; a raw string
# comparison silently drops same-minute rows)
# =============================================================================
_TO_EPOCH_JQ_DEF='def to_epoch:
  if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
  then (sub("Z$"; ":00Z") | fromdateiso8601)
  else fromdateiso8601
  end;'

# =============================================================================
# APPLICATION — one function per persistence plane
# =============================================================================

# Plane 1 — NOTEBOOK: commits touching the agent's notebook file in [since,until].
_plane_notebook() {
  local repo_root="$1" notebook_path="$2" since_ts="$3" until_ts="$4"
  if [ ! -f "$repo_root/$notebook_path" ]; then
    echo "0"
    return 0
  fi
  if [ -n "$until_ts" ]; then
    git -C "$repo_root" log --since="$since_ts" --until="$until_ts" --oneline -- "$notebook_path" 2>/dev/null | grep -c '.'
  else
    git -C "$repo_root" log --since="$since_ts" --oneline -- "$notebook_path" 2>/dev/null | grep -c '.'
  fi
}

# Plane 2 — COMMIT: any commit in [since,until] whose subject matches the
# agent's commit-convention prefix, independent of path (catches a commit
# that touched DASHBOARD.md/orch-state.json but never the notebook itself).
_plane_commit() {
  local repo_root="$1" commit_prefix="$2" since_ts="$3" until_ts="$4"
  if [ -n "$until_ts" ]; then
    git -C "$repo_root" log --since="$since_ts" --until="$until_ts" --oneline --grep="$commit_prefix" 2>/dev/null | grep -c '.'
  else
    git -C "$repo_root" log --since="$since_ts" --oneline --grep="$commit_prefix" 2>/dev/null | grep -c '.'
  fi
}

# Plane 3 — SIGNAL_QUEUE: orch-state.json .signal_queue.rows[] with
# from==agent and since<=ts[<until] (to_epoch-safe comparison). When
# $cycle_tag is non-empty, switches to EXACT audit_cycle_tag matching
# instead of the ts-window (ported from audit-output-contract.sh's V1
# check) — immune to cross-tier/cross-session identity collision (multiple
# system-auditor Tier-1 spawns within the same loose ts-window otherwise
# alias onto each other, since every tier/session shares from="system-
# auditor"). Callers that pass emit-audit-signal.sh's own --cycle-tag
# (the tier's FIRE_TASK_ID) get this precision for free; callers with no
# cycle-tag concept (most non-auditor agents) fall back to the ts-window.
_plane_signal_queue() {
  local orch_state_file="$1" agent_id="$2" since_ts="$3" until_ts="$4" cycle_tag="$5"
  if [ ! -f "$orch_state_file" ]; then
    echo "0"
    return 0
  fi
  if [ -n "$cycle_tag" ]; then
    jq --arg agent "$agent_id" --arg tag "$cycle_tag" \
      '[.signal_queue.rows[]? | select(.from == $agent and .audit_cycle_tag == $tag)] | length' \
      "$orch_state_file" 2>/dev/null || echo "0"
    return 0
  fi
  if [ -n "$until_ts" ]; then
    jq --arg agent "$agent_id" --arg ts "$since_ts" --arg uts "$until_ts" "
      $_TO_EPOCH_JQ_DEF
      (\$ts | to_epoch) as \$cutoff | (\$uts | to_epoch) as \$upper
      | [.signal_queue.rows[]? | select(.from == \$agent and ((.ts // \"1970-01-01T00:00:00Z\") | to_epoch) >= \$cutoff and ((.ts // \"1970-01-01T00:00:00Z\") | to_epoch) <= \$upper)] | length
    " "$orch_state_file" 2>/dev/null || echo "0"
  else
    jq --arg agent "$agent_id" --arg ts "$since_ts" "
      $_TO_EPOCH_JQ_DEF
      (\$ts | to_epoch) as \$cutoff
      | [.signal_queue.rows[]? | select(.from == \$agent and ((.ts // \"1970-01-01T00:00:00Z\") | to_epoch) >= \$cutoff)] | length
    " "$orch_state_file" 2>/dev/null || echo "0"
  fi
}

# Plane 4 — LEDGER (optional): docs/data/auditor-dedup-ledger.json flat-map
# entries with since<=ts[<until]. Returns literal string "skip" when
# ledger_file is empty (caller opted out) — "skip" is never counted toward
# the zero-diff verdict in either direction.
_plane_ledger() {
  local ledger_file="$1" since_ts="$2" until_ts="$3"
  if [ -z "$ledger_file" ]; then
    echo "skip"
    return 0
  fi
  if [ ! -f "$ledger_file" ]; then
    echo "0"
    return 0
  fi
  if [ -n "$until_ts" ]; then
    jq --arg ts "$since_ts" --arg uts "$until_ts" "
      $_TO_EPOCH_JQ_DEF
      (\$ts | to_epoch) as \$cutoff | (\$uts | to_epoch) as \$upper
      | [to_entries[] | select(.value.ts != null and ((.value.ts | to_epoch) >= \$cutoff) and ((.value.ts | to_epoch) <= \$upper))] | length
    " "$ledger_file" 2>/dev/null || echo "0"
  else
    jq --arg ts "$since_ts" "
      $_TO_EPOCH_JQ_DEF
      (\$ts | to_epoch) as \$cutoff
      | [to_entries[] | select(.value.ts != null and ((.value.ts | to_epoch) >= \$cutoff))] | length
    " "$ledger_file" 2>/dev/null || echo "0"
  fi
}

# Plane 5 — EXTRA (optional, additive): 1..N caller-supplied artifact paths,
# each checked the same way as Plane 1. Caller (run_detect_analysis_only_exit)
# is responsible for the "skip when none supplied" branch — bash 3.2's
# `"${arr[@]}"` on a truly-empty array under `set -u` yields one spurious
# empty-string element rather than zero elements, so emptiness MUST be
# decided by `${#arr[@]}` BEFORE this function is ever called, not inside it.
_plane_extra() {
  local repo_root="$1" since_ts="$2" until_ts="$3"
  shift 3
  local total=0 p n
  for p in "$@"; do
    if [ -f "$repo_root/$p" ]; then
      if [ -n "$until_ts" ]; then
        n=$(git -C "$repo_root" log --since="$since_ts" --until="$until_ts" --oneline -- "$p" 2>/dev/null | grep -c '.')
      else
        n=$(git -C "$repo_root" log --since="$since_ts" --oneline -- "$p" 2>/dev/null | grep -c '.')
      fi
    else
      n=0
    fi
    total=$((total + n))
  done
  echo "$total"
}

# CLAIMS — every [OUTPUT-CONTRACT] line the agent itself published,
# extracted from whatever the notebook commit(s) in [since,until] actually
# ADDED (git-diff '+' lines, not the file's current full content — a stale
# line already present before this window must never be misread as this
# window's claim). Zero or more lines. Empty when no notebook commit landed
# in-window (Plane 1 == 0, the ordinary zero-diff case) or when the agent's
# notebook convention doesn't publish this line at all (most non-auditor
# leaf agents). See scripts/lib/output-contract-invariant.sh header for why
# ALL matches are returned rather than picking "the newest" one.
_plane_output_contract_claims() {
  local repo_root="$1" notebook_path="$2" since_ts="$3" until_ts="$4"
  if [ ! -f "$repo_root/$notebook_path" ]; then
    echo ""
    return 0
  fi
  if [ -n "$until_ts" ]; then
    git -C "$repo_root" log --since="$since_ts" --until="$until_ts" -p -- "$notebook_path" 2>/dev/null | oc_extract_all_added_contract_lines_from_text
  else
    git -C "$repo_root" log --since="$since_ts" -p -- "$notebook_path" 2>/dev/null | oc_extract_all_added_contract_lines_from_text
  fi
}

# =============================================================================
# INTERFACE — CLI / library entrypoint
# =============================================================================

run_detect_analysis_only_exit() {
  local agent_id="" since_ts="" until_ts="" cycle_tag="" notebook_path="" orch_state_file="" \
        dedup_ledger_file="__UNSET__" commit_prefix="" repo_root=""
  local extra_artifacts=()

  while [ $# -gt 0 ]; do
    case "$1" in
      --agent-id) agent_id="${2:-}"; shift 2 ;;
      --since-ts) since_ts="${2:-}"; shift 2 ;;
      --until-ts) until_ts="${2:-}"; shift 2 ;;
      --cycle-tag) cycle_tag="${2:-}"; shift 2 ;;
      --notebook-path) notebook_path="${2:-}"; shift 2 ;;
      --orch-state-file) orch_state_file="${2:-}"; shift 2 ;;
      --dedup-ledger-file) dedup_ledger_file="${2:-}"; shift 2 ;;
      --commit-prefix) commit_prefix="${2:-}"; shift 2 ;;
      --extra-artifact) extra_artifacts+=("${2:-}"); shift 2 ;;
      --repo-root) repo_root="${2:-}"; shift 2 ;;
      *)
        echo "[detect-analysis-only-exit] ABORT unknown-arg $1"
        return 2
        ;;
    esac
  done

  if [ -z "$agent_id" ]; then
    echo "[detect-analysis-only-exit] ABORT missing-required-arg --agent-id"
    return 2
  fi
  if [ -z "$since_ts" ]; then
    echo "[detect-analysis-only-exit] ABORT missing-required-arg --since-ts"
    return 2
  fi

  [ -z "$repo_root" ] && repo_root="$DEFAULT_REPO_ROOT"
  [ -z "$notebook_path" ] && notebook_path="docs/agent-memory/notebooks/${agent_id}.md"
  [ -z "$orch_state_file" ] && orch_state_file="$repo_root/docs/data/orch/orch-state.json"
  if [ "$dedup_ledger_file" = "__UNSET__" ]; then
    dedup_ledger_file="$repo_root/docs/data/auditor-dedup-ledger.json"
  fi
  [ -z "$commit_prefix" ] && commit_prefix="memory/${agent_id}"

  local n_notebook n_commit n_sq n_ledger n_extra
  n_notebook=$(_plane_notebook "$repo_root" "$notebook_path" "$since_ts" "$until_ts")
  n_commit=$(_plane_commit "$repo_root" "$commit_prefix" "$since_ts" "$until_ts")
  n_sq=$(_plane_signal_queue "$orch_state_file" "$agent_id" "$since_ts" "$until_ts" "$cycle_tag")
  n_ledger=$(_plane_ledger "$dedup_ledger_file" "$since_ts" "$until_ts")
  if [ "${#extra_artifacts[@]}" -eq 0 ]; then
    n_extra="skip"
  else
    n_extra=$(_plane_extra "$repo_root" "$since_ts" "$until_ts" "${extra_artifacts[@]}")
  fi

  # Zero-diff verdict: mandatory planes (notebook/commit/signal_queue) always
  # count; optional planes (ledger/extra) count ONLY when not "skip".
  local all_zero=1
  [ "${n_notebook:-0}" -ne 0 ] 2>/dev/null && all_zero=0
  [ "${n_commit:-0}" -ne 0 ] 2>/dev/null && all_zero=0
  [ "${n_sq:-0}" -ne 0 ] 2>/dev/null && all_zero=0
  if [ "$n_ledger" != "skip" ] && [ "${n_ledger:-0}" -ne 0 ] 2>/dev/null; then all_zero=0; fi
  if [ "$n_extra" != "skip" ] && [ "${n_extra:-0}" -ne 0 ] 2>/dev/null; then all_zero=0; fi

  # PARTIAL-WRITE CONTRACT CHECK (AC-1 + AC-2, FIX-ANALYSIS-ONLY-EXIT-
  # DETECTOR-OR-VERDICT-BLIND-TO-PARTIAL-WRITE-CYCLE) — independent of the
  # zero-diff OR-verdict above; can force DETECTED even when every plane
  # above is non-zero (c80's actual shape). See scripts/lib/output-contract-
  # invariant.sh for the shared extraction/arithmetic this reuses verbatim
  # with scripts/auditor-notebook-commit.sh's AC-4 pre-commit backstop.
  # Checks EVERY claim line found in-window (a single commit can bundle
  # more than one cycle's own section — see that lib's header) rather than
  # guessing which one is "the newest": ANY individual line failing the
  # AC-2 arithmetic invariant, or the SUM of all claimed
  # signal_queue_rows_written being >0 while the real Plane-3 re-read is 0,
  # forces DETECTED.
  local claims contract_status="absent"
  claims=$(_plane_output_contract_claims "$repo_root" "$notebook_path" "$since_ts" "$until_ts")
  if [ -n "$claims" ]; then
    contract_status="ok"
    local claim_sqr_sum=0 _line _c_sp _c_sqr _c_ds
    while IFS= read -r _line; do
      [ -z "$_line" ] && continue
      _c_sp=$(oc_parse_counter "$_line" "signals_posted")
      _c_sqr=$(oc_parse_counter "$_line" "signal_queue_rows_written")
      _c_ds=$(oc_parse_counter "$_line" "dedup_skipped")
      if ! oc_check_arithmetic_invariant "$_c_sp" "$_c_sqr" "$_c_ds"; then
        # AC-2 — zero-false-positive structural gate, needs no plane lookup.
        contract_status="arithmetic-violation"
      fi
      claim_sqr_sum=$((claim_sqr_sum + _c_sqr))
    done <<< "$claims"
    if [ "$contract_status" != "arithmetic-violation" ] \
       && [ "${claim_sqr_sum:-0}" -gt 0 ] 2>/dev/null && [ "${n_sq:-0}" -eq 0 ] 2>/dev/null; then
      # AC-1 — aggregate claim vs Plane 3 ground-truth reconciliation.
      contract_status="plane-mismatch"
    fi
  fi

  local detected=0
  [ "$all_zero" -eq 1 ] && detected=1
  [ "$contract_status" = "arithmetic-violation" ] && detected=1
  [ "$contract_status" = "plane-mismatch" ] && detected=1

  if [ "$detected" -eq 1 ]; then
    echo "[detect-analysis-only-exit] DETECTED agent=${agent_id} since=${since_ts} notebook=${n_notebook} commit=${n_commit} signal_queue=${n_sq} ledger=${n_ledger} extra=${n_extra} contract=${contract_status}"
    return 1
  else
    echo "[detect-analysis-only-exit] PASS agent=${agent_id} since=${since_ts} notebook=${n_notebook} commit=${n_commit} signal_queue=${n_sq} ledger=${n_ledger} extra=${n_extra} contract=${contract_status}"
    return 0
  fi
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_detect_analysis_only_exit "$@"
  exit $?
fi
