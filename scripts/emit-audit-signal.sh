#!/usr/bin/env bash
# scripts/emit-audit-signal.sh
#
# UC-ASL-P2 — ONE blessed emit script replacing the 6 copy-pasted EMIT
# SEQUENCE blocks in docs/agents/system-auditor/flow/main.md (Tier-2
# :292-328, Tier-3 :592-628, D-IMPROVE :412-416, D-BCTC-EVAL :344) and
# tier1-probe.md (general A-xx :139-171, A-20 :86-108), plus a durable
# 7-day BUG-dedup ledger (docs/data/auditor-dedup-ledger.json) replacing
# the in-memory/LLM-recall dedup that reset every agent invocation and
# the notebook's 3-section cap that could not span 7 days.
#
# Spec: docs/handoffs/UC-ASL-P2-BA-spec.md (FR-1..FR-8, AC-1..AC-6)
#       docs/handoffs/UC-ASL-P2-BA-spec.md § [Architect] Brownfield Findings
#       (E-3-only mode contract, CAS-retry loop shape, ARCH-RATIFY-1/2/3)
#
# CONTRACT (named args, mirrors auditor-notebook-commit.sh's explicit-arg
# discipline — never positional):
#   scripts/emit-audit-signal.sh \
#     --check-id <B-xx|C-xx|A-xx> \
#     --category-type <literal signal_type/type string the call site already
#                       uses — enum is OPEN per-site; this script passes it
#                       through VERBATIM, never rewrites it (I3 is a separate,
#                       out-of-scope task)> \
#     --severity <CRITICAL|WARN|INFO | CRITICAL|HIGH|MED — call-site literal,
#                 passed through verbatim to E-1/E-3 payloads> \
#     --summary "<≤120 chars — truncated if longer>" \
#     --detail-json '<JSON object merged into E-1 payload; MUST include
#                     "dedup_key" unless --e3-only is set>' \
#     [--from-agent <default "system-auditor">] \
#     [--to-agent <default "po">] \
#     [--e3-only]       # skip E-1 (post_agent_signal) AND E-2 (dedup+telegram)
#                        # entirely — only E-3 (signal-row write + read-back)
#                        # runs. Sites 3/4 (D-IMPROVE, D-BCTC-EVAL) use this —
#                        # they never had E-1/E-2 today (FR-6).
#     [--no-telegram]    # E-1 still fires; only E-2 (send_telegram) is
#                        # skipped. Distinct from --e3-only. Reserved for a
#                        # future call site — none of the 6 current sites use
#                        # this flag standalone.
#
# DDD LAYER SPLIT (bash has no module system — layers are function-naming/
# ordering, not file separation, per architect design decision 1):
#   INTERFACE      — _parse_args() (below, top of file)
#   APPLICATION    — _severity_rank(), _run_e1(), _check_dedup_and_maybe_send(),
#                    _e3_write_row() (CAS-retry control flow)
#   INFRASTRUCTURE — _ledger_read()/_ledger_write()/_ledger_prune_and_lookup()/
#                    _ledger_upsert() (tmp+mv ledger), _orch_apply_invoke()
#                    (orch-apply.sh integration), _send_bug_telegram()/
#                    _send_orphan_bug_telegram()
#
# MARKERS (RAW-verifiable, grep for "[emit-signal]"):
#   success, fresh key / window-expired    -> "[emit-signal] OK dedup_key=<k> id=<id>"
#   success, dedup-skip (Telegram gated)   -> "[emit-signal] SKIP-dedup dedup_key=<k> last_sent=<ts> id=<id>"
#   success, severity-escalation bypass    -> "[emit-signal] OK-escalation-bypass dedup_key=<k> prev_sev=<n> new_sev=<n> id=<id>"
#   success, --e3-only mode                -> "[emit-signal] OK e3-only id=<id> check_id=<check_id>"
#   success, --no-telegram (E-1 fired)     -> "[emit-signal] OK no-telegram id=<id> check_id=<check_id>"
#   E-1 transport failure (fail-loud)      -> "[emit-signal] ABORT e1-failed <detail>"
#   E-1 not written (dedup no-op / thrown  -> "[emit-signal] ABORT e1-not-written <detail>"
#     DB error surfaced as success:false —    (FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED
#     rc=0 from mcp_call is NOT sufficient)    AC-1/AC-2 — never trust rc alone)
#   E-1 write claimed but read-back of      -> "[emit-signal] ABORT e1-readback-failed id=<id>"
#     agent_signals found no matching row      (AC-2/AC-3 — mandatory read-back, mirrors E-3)
#   E-3 write failure (rc=1|3, no retry)   -> "[emit-signal] ABORT e3-write-failed rc=<n>"
#   E-3 CAS-retry exhausted (3x rc=2)      -> "[emit-signal] ABORT e3-cas-exhausted rc=2"
#   E-3 POST-WRITE read-back failure       -> "[emit-signal] ABORT e3-readback-failed <id>"
#   bad usage / malformed args             -> "[emit-signal] ABORT <reason>" (exit 2)
#
# DEDUP SCOPE (Hard Constraint 5 / FR-4): dedup gates E-2 (send_telegram)
# ONLY. E-1 (post_agent_signal) and E-3 (signal-row write + read-back) ALWAYS
# fire regardless of dedup state (except when --e3-only skips E-1/E-2 by
# explicit caller choice, not by dedup decision).
#
# LEDGER (FR-3, docs/data/auditor-dedup-ledger.json — separate sidecar, NOT
# part of orch-state.json, NOT routed through orch-apply.sh):
#   flat map: {"<dedup_key>": {"ts": "<ISO-8601>", "sev": <int 1|2|3>}}
#   tmp+mv same-directory atomic write. Missing/malformed on read -> treated
#   as empty (self-heal, never fail loud). Self-pruning: every invocation
#   drops entries whose ts is older than 7 days BEFORE the current key is
#   evaluated — since the prune step's cutoff IS the 7-day window boundary,
#   "entry absent after pruning" and "entry within the 7-day window" are
#   exactly complementary; no separate bash-side ISO8601 age arithmetic is
#   needed (jq's fromdateiso8601 does all date math, matching the repo's
#   existing precedent in scripts/devteam-signalqueue-prune-bounded.jq /
#   scripts/orch-cold-evict.sh).
#
# SEVERITY-RANK ESCALATION BYPASS (ARCH-RATIFY-2): CRITICAL=3, HIGH=WARN=2,
# MED=INFO=1, unrecognized=1 (conservative floor). A same-dedup_key call
# inside the 7-day window with a HIGHER rank than the ledger's stored value
# bypasses the mute (a worsening condition is new information, not a
# repeat) -> OK-escalation-bypass, sends Telegram, overwrites ledger entry.
#
# CAS-RETRY (FR-5 / architect design decision 3): plain `for attempt in 1 2 3`
# loop re-invoking the IDENTICAL `jq '.signal_queue.rows += [$row]' | orch-
# apply.sh` pipe each iteration — jq re-reads the live file fresh from disk
# every time, so no special "rebuild" logic is needed. rc=0 -> success.
# rc=2 (CAS mtime mismatch) -> retry (up to 3 total attempts). rc=1
# (validation/conservation failure) or rc=3 (usage error) -> immediate abort,
# NO retry. 3x rc=2 -> distinct "e3-cas-exhausted" marker (kept distinct from
# "e3-write-failed" so QA/dev can tell CAS-contention-exhaustion apart from a
# genuine schema/conservation validation failure).
#
# TESTABILITY HOOKS (env overrides, production defaults shown):
#   EMIT_SIGNAL_LEDGER_FILE       default: $REPO_ROOT/docs/data/auditor-dedup-ledger.json
#   EMIT_SIGNAL_ORCH_STATE_FILE   default: $REPO_ROOT/docs/data/orch/orch-state.json
#                                 (the READ path jq builds the candidate from)
#   ORCH_APPLY_LIVE_FILE_OVERRIDE forwarded, unmodified, to orch-apply.sh —
#                                 its own existing override env (the WRITE/
#                                 CAS-guard path). Point BOTH envs at the same
#                                 scratch fixture for a real, non-mocked
#                                 integration test — never the live file.
#   _orch_apply_invoke()          a plain bash function (INFRASTRUCTURE
#                                 section below) — tests may redefine it
#                                 after `source`-ing this script to script a
#                                 canned rc sequence for CAS-retry tests
#                                 (plain redirection `<<<`, not a pipe, so no
#                                 subshell is forked — a bash counter var
#                                 incremented inside the stub persists across
#                                 the 3 loop iterations).
#   mcp_call()                   defined by sourcing scripts/agents-flow/
#                                 mcp-call.sh (below) — tests may redefine
#                                 this after sourcing to stub E-1/E-2
#                                 transport outcomes per tool name ($1).
#
# Injection-safety (Hard Constraint 8): every mcp_call/orch-apply.sh JSON
# body is built via jq -n --arg/--argjson bound params ONLY — never string-
# concatenated. --detail-json is validated as parseable JSON before any use.
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain indexed arrays / case statements / jq for lookups.
#
# Precedents: scripts/agents-flow/mcp-call.sh (transport, sourced not
# reinvented), scripts/auditor-notebook-commit.sh (named-arg discipline,
# set -uo pipefail, one-line [marker] convention), scripts/orch-apply.sh
# (exit-code contract: 0=applied 1=validation-fail 2=CAS-mismatch
# 3=usage-error), scripts/devteam-signalqueue-prune-bounded.jq /
# scripts/orch-cold-evict.sh (fromdateiso8601 ts-pruning idiom).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# shellcheck source=./agents-flow/mcp-call.sh
source "$SCRIPT_DIR/agents-flow/mcp-call.sh"

LEDGER_FILE="${EMIT_SIGNAL_LEDGER_FILE:-$REPO_ROOT/docs/data/auditor-dedup-ledger.json}"
ORCH_STATE_FILE="${EMIT_SIGNAL_ORCH_STATE_FILE:-$REPO_ROOT/docs/data/orch/orch-state.json}"
ORCH_APPLY_SH="$REPO_ROOT/scripts/orch-apply.sh"

SEVEN_DAYS_SECONDS=$((7 * 24 * 3600))

# =============================================================================
# INTERFACE — CLI arg parsing (named flags, not positional)
# =============================================================================

_parse_args() {
  CHECK_ID=""
  CATEGORY_TYPE=""
  SEVERITY=""
  SUMMARY=""
  DETAIL_JSON="{}"
  FROM_AGENT="system-auditor"
  TO_AGENT="po"
  E3_ONLY="false"
  NO_TELEGRAM="false"
  DEDUP_KEY=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --check-id) CHECK_ID="${2:-}"; shift 2 ;;
      --category-type) CATEGORY_TYPE="${2:-}"; shift 2 ;;
      --severity) SEVERITY="${2:-}"; shift 2 ;;
      --summary) SUMMARY="${2:-}"; shift 2 ;;
      --detail-json) DETAIL_JSON="${2:-}"; shift 2 ;;
      --from-agent) FROM_AGENT="${2:-}"; shift 2 ;;
      --to-agent) TO_AGENT="${2:-}"; shift 2 ;;
      --e3-only) E3_ONLY="true"; shift ;;
      --no-telegram) NO_TELEGRAM="true"; shift ;;
      *)
        echo "[emit-signal] ABORT unknown-arg $1"
        return 2
        ;;
    esac
  done

  if [ -z "$CHECK_ID" ] || [ -z "$CATEGORY_TYPE" ] || [ -z "$SEVERITY" ] || [ -z "$SUMMARY" ]; then
    echo "[emit-signal] ABORT missing-required-arg (need --check-id --category-type --severity --summary)"
    return 2
  fi

  if ! printf '%s' "$DETAIL_JSON" | jq -e . >/dev/null 2>&1; then
    echo "[emit-signal] ABORT malformed-detail-json"
    return 2
  fi

  DEDUP_KEY=$(printf '%s' "$DETAIL_JSON" | jq -r '.dedup_key // empty')
  if [ "$E3_ONLY" != "true" ] && [ -z "$DEDUP_KEY" ]; then
    echo "[emit-signal] ABORT missing-dedup-key (required in --detail-json unless --e3-only)"
    return 2
  fi

  # ≤120 chars — truncate, never fail loud on an over-long summary.
  SUMMARY=$(printf '%s' "$SUMMARY" | cut -c1-120)

  return 0
}

# =============================================================================
# APPLICATION — E-1/E-2 dedup+severity policy, CAS-retry control flow
# =============================================================================

# Internal-only rank for the escalation-bypass decision. NEVER rewrites the
# literal --severity string passed to E-1/E-3 payloads (that passthrough is
# a separate, deliberate design choice — EC-5's category_type passthrough
# rule is untouched by this).
_severity_rank() {
  case "$1" in
    CRITICAL) echo 3 ;;
    HIGH|WARN) echo 2 ;;
    MED|INFO) echo 1 ;;
    *) echo 1 ;;
  esac
}

# Step E-1: post_agent_signal. Fail-loud on transport failure — never
# silently skips (FR-2, EC-2).
#
# FIX-AUDITOR-OUTPUT-CONTRACT-SIGNALSPOSTED-COUNTS-CALLS-NOT-CONFIRMED-ROWS
# (AC-1/AC-2/AC-3): confirmed live (2026-07-30) that `mcp_call` returning
# rc=0 is NOT sufficient evidence a row landed in `agent_signals` — two
# distinct mechanisms can produce a "successful" call with zero rows
# written: (a) the tool's own dedup-suppression sentinel (`signal_id<=0`)
# surfacing as `success:false` (now, post tool-side fix; previously
# `success:true` with a fake `signal_id:-1`), and (b) a genuine DB-write
# throw during a fault window. Neither is reliably distinguishable from a
# real write by inspecting the call's return code alone. This function now:
#   1. parses the tool's own JSON body for `success===true` AND a positive
#      integer `signal_id` — anything else ABORTs (e1-not-written), never
#      counted;
#   2. performs a MANDATORY read-back via `get_agent_signals` (sender-history
#      mode, read-mark suppressed) confirming that exact id is present in
#      `agent_signals` before this call is allowed to count toward
#      `signals_posted` — mirrors the E-3 signal_queue POST-WRITE read-back
#      pattern below, applied to the OTHER store this script writes to.
# The confirmed agent_signals id is NOT threaded into the final marker's
# `id=` field — that field is, and remains, the E-3 signal_queue row id (two
# separate stores, two separate id namespaces; see header MARKERS section).
_run_e1() {
  local payload e1_args result rc success_flag signal_id_val
  payload=$(jq -n \
    --arg check_id "$CHECK_ID" \
    --arg severity "$SEVERITY" \
    --argjson detail "$DETAIL_JSON" \
    '{check_id: $check_id, severity: $severity} + $detail')

  e1_args=$(jq -n \
    --arg from "$FROM_AGENT" \
    --arg to "$TO_AGENT" \
    --arg st "signal_feedback" \
    --argjson payload "$payload" \
    '{from_agent:$from, to_agent:$to, signal_type:$st, payload:$payload}')

  result=$(mcp_call "post_agent_signal" "$e1_args" 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then
    echo "[emit-signal] ABORT e1-failed $(printf '%s' "$result" | tr '\n' ' ' | cut -c1-200)"
    return 1
  fi

  # AC-1/AC-2: never trust "the call didn't error" alone — the tool's own
  # JSON body is the only place that distinguishes a real write from a
  # dedup-suppressed no-op (signal_id<=0, success:false).
  success_flag=$(printf '%s' "$result" | jq -r '.success // false' 2>/dev/null)
  signal_id_val=$(printf '%s' "$result" | jq -r '.signal_id // empty' 2>/dev/null)
  if [ "$success_flag" != "true" ] || [ -z "$signal_id_val" ] \
     || ! [[ "$signal_id_val" =~ ^[0-9]+$ ]] || [ "$signal_id_val" -le 0 ]; then
    echo "[emit-signal] ABORT e1-not-written $(printf '%s' "$result" | tr '\n' ' ' | cut -c1-200)"
    return 1
  fi

  # AC-2/AC-3: mandatory read-back — confirm the id the tool claims to have
  # written actually exists in agent_signals before this call is allowed to
  # count toward signals_posted. A mismatch here fails loud (ABORT +
  # anti-false-green BUG telegram, same treatment as an E-3 readback miss),
  # never silently rounded up to "it probably worked".
  local readback_args readback_result readback_rc
  readback_args=$(jq -n --arg from "$FROM_AGENT" --argjson hb 0.25 \
    '{from_agent:$from, status:"all", hours_back:$hb}')
  readback_result=$(mcp_call "get_agent_signals" "$readback_args" 2>&1)
  readback_rc=$?
  if [ "$readback_rc" -ne 0 ] || ! printf '%s' "$readback_result" | grep -qE "^\[${signal_id_val}\] "; then
    echo "[emit-signal] ABORT e1-readback-failed id=$signal_id_val"
    _send_orphan_bug_telegram "e1-readback-failed id=$signal_id_val"
    return 1
  fi

  return 0
}

# BUG-channel Telegram used by both the dedup-gated E-2 send AND the
# non-dedup-gated anti-false-green sends (FR-4/FR-5). Never fail loud on
# send_telegram failure itself — Telegram is best-effort; only E-1/E-3 are
# the fail-loud contract (Hard Constraint 4/5).
_send_bug_telegram() {
  local msg args
  msg="[system-auditor] ${SEVERITY}: ${SUMMARY} (check ${CHECK_ID})"
  args=$(jq -n --arg channel "bug" --arg message "$msg" '{channel:$channel, message:$message}')
  mcp_call "send_telegram" "$args" >/dev/null 2>&1
}

# Anti-false-green: fires on E-3 write/read-back failure, BYPASSING the FR-4
# dedup gate entirely — an orphan-key bug is never itself dedup-suppressed.
_send_orphan_bug_telegram() {
  local detail="$1" msg args
  msg="[emit-signal] BUG: E-3 write/read-back failure ${detail} (check_id=${CHECK_ID})"
  args=$(jq -n --arg channel "bug" --arg message "$msg" '{channel:$channel, message:$message}')
  mcp_call "send_telegram" "$args" >/dev/null 2>&1
}

# FR-4 + ARCH-RATIFY-2: dedup-gates Telegram only. Sets globals DEDUP_OUTCOME
# / DEDUP_DETAIL for the caller's final marker line — never prints its own
# marker (single grep-able marker per invocation, per AC-6).
_check_dedup_and_maybe_send() {
  local dedup_key="$1" severity="$2" new_rank now_ts stored_rank
  new_rank=$(_severity_rank "$severity")
  now_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

  _ledger_prune_and_lookup "$dedup_key"

  if [ -z "$LEDGER_ENTRY_TS" ]; then
    # Absent post-prune == never sent OR sent >7d ago (prune already removed
    # it) — both cases collapse to the same action: send now.
    _send_bug_telegram
    _ledger_upsert "$dedup_key" "$now_ts" "$new_rank"
    DEDUP_OUTCOME="OK"
    DEDUP_DETAIL="dedup_key=$dedup_key"
    return 0
  fi

  stored_rank="${LEDGER_ENTRY_SEV:-1}"
  if [ "$new_rank" -gt "$stored_rank" ]; then
    _send_bug_telegram
    _ledger_upsert "$dedup_key" "$now_ts" "$new_rank"
    DEDUP_OUTCOME="OK-escalation-bypass"
    DEDUP_DETAIL="dedup_key=$dedup_key prev_sev=$stored_rank new_sev=$new_rank"
    return 0
  fi

  DEDUP_OUTCOME="SKIP-dedup"
  DEDUP_DETAIL="dedup_key=$dedup_key last_sent=$LEDGER_ENTRY_TS"
  return 0
}

_gen_row_id() {
  local now_ts="$1" compact suffix
  # NOTE: delete-set argument must not start with '-' — some tr
  # implementations (BSD/macOS) misparse a leading '-' as an option flag
  # regardless of the preceding `-d`. ':-' (colon first) is portable.
  compact=$(printf '%s' "$now_ts" | tr -d ':-')
  compact="${compact%Z}"
  # 4-hex-digit disambiguator: whole-second timestamp granularity alone is
  # NOT collision-safe — two `emit-audit-signal.sh` invocations from the
  # same --from-agent landing in the same wall-clock second (routine under
  # real orch-apply.sh subprocess latency; confirmed empirically: 3/6
  # iterations collided in a tight back-to-back loop, UC-ASL-P2 QA bounce
  # 2026-07-16) previously produced two DIFFERENT signal-queue rows sharing
  # an IDENTICAL id, breaking the row-identity assumption the POST-WRITE
  # read-back (and any future ACK/CLOSE-by-id) depends on. $RANDOM is a
  # portable bash 3.2+ builtin (0-32767, PID+time seeded) — deliberately
  # NOT using sub-second date precision (macOS BSD `date` has no reliable
  # %N, see feedback_bsd_date_3n_literal_corrupts_iso8601.md).
  suffix=$(printf '%04x' $((RANDOM % 65536)))
  printf '%s-%s-%s' "${FROM_AGENT:0:3}" "$compact" "$suffix"
}

# FIX-AUDITOR-CALLER-PROSE-OVERRIDES-DOCUMENTED-DETECTOR-THRESHOLD (AC-3/AC-4):
# every row this function builds carries a hardcoded provenance:"detector" —
# no --provenance flag exists anywhere in _parse_args(), so there is no
# call-site-controllable path to any other value. SignalRowSchema is
# .passthrough() (apps/mcp-server/src/infrastructure/orchStateSchema.ts) so
# this needed no schema migration. A human/PO override channel already
# exists and needs no new mechanism here: a direct field write via
# orch-apply.sh (bypassing this script entirely), distinguishable by `from`
# + the presence of po_disposition_*/po_amend_*-shaped keys.
_build_row_json() {
  local row_id="$1" now_ts="$2"
  jq -n \
    --arg id "$row_id" \
    --arg ts "$now_ts" \
    --arg from "$FROM_AGENT" \
    --arg to "$TO_AGENT" \
    --arg type "$CATEGORY_TYPE" \
    --arg summary "$SUMMARY" \
    --arg severity "$SEVERITY" \
    '{id:$id, ts:$ts, from:$from, to:$to, type:$type, summary:$summary, severity:$severity, status:"NEW", payload_ref:null, provenance:"detector"}'
}

# Step E-3: signal-row append via orch-apply.sh + POST-WRITE read-back.
# CAS-retry contract per FR-5 / architect design decision 3.
_e3_write_row() {
  local row_json="$1" row_id="$2" attempt rc candidate found

  rc=1
  # shellcheck disable=SC2034  # loop var unused in body — only iteration count matters
  for attempt in 1 2 3; do
    candidate=$(jq --argjson row "$row_json" '.signal_queue.rows += [$row]' "$ORCH_STATE_FILE")
    _orch_apply_invoke <<< "$candidate"
    rc=$?
    if [ "$rc" -eq 0 ]; then
      break
    elif [ "$rc" -eq 2 ]; then
      continue
    else
      echo "[emit-signal] ABORT e3-write-failed rc=$rc"
      _send_orphan_bug_telegram "rc=$rc id=$row_id"
      return 1
    fi
  done

  if [ "$rc" -ne 0 ]; then
    echo "[emit-signal] ABORT e3-cas-exhausted rc=$rc"
    _send_orphan_bug_telegram "cas-exhausted id=$row_id"
    return 1
  fi

  found=$(jq --arg id "$row_id" '[.signal_queue.rows[] | select(.id==$id)] | length' "$ORCH_STATE_FILE" 2>/dev/null)
  if [ "${found:-0}" -lt 1 ]; then
    echo "[emit-signal] ABORT e3-readback-failed $row_id"
    _send_orphan_bug_telegram "readback-failed id=$row_id"
    return 1
  fi

  return 0
}

# =============================================================================
# INFRASTRUCTURE — ledger tmp+mv persistence, orch-apply.sh integration
# =============================================================================

# Missing/malformed ledger file -> treated as empty. Never fail loud (EC-1).
_ledger_read() {
  if [ -f "$LEDGER_FILE" ] && jq -e . "$LEDGER_FILE" >/dev/null 2>&1; then
    cat "$LEDGER_FILE"
  else
    echo "{}"
  fi
}

# tmp-file + mv same-directory atomic rename (mirrors auditor-tier1/tier2-
# last-healthy.json's pattern) — NOT routed through orch-apply.sh (Hard
# Constraint 3 / FR-3).
_ledger_write() {
  local content="$1" dir tmp
  dir="$(dirname "$LEDGER_FILE")"
  tmp=$(mktemp "$dir/.auditor-dedup-ledger-XXXXXXXX.json")
  printf '%s\n' "$content" > "$tmp"
  mv "$tmp" "$LEDGER_FILE"
}

# Self-pruning (FR-3): drops entries older than 7 days BEFORE the current
# key is checked, writes the pruned ledger back unconditionally (no
# separate cron, no unbounded growth), and sets globals LEDGER_ENTRY_TS /
# LEDGER_ENTRY_SEV for $1 (empty if absent post-prune). All date math is
# jq-side (fromdateiso8601) — matches the repo precedent in
# scripts/devteam-signalqueue-prune-bounded.jq / scripts/orch-cold-evict.sh;
# no bash-side ISO8601 parsing needed.
_ledger_prune_and_lookup() {
  local dedup_key="$1" raw cutoff_epoch result pruned_ledger

  raw=$(_ledger_read)
  cutoff_epoch=$(( $(date -u +%s) - SEVEN_DAYS_SECONDS ))

  result=$(printf '%s' "$raw" | jq --argjson cutoff "$cutoff_epoch" --arg key "$dedup_key" '
    def to_epoch:
      if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
      then (sub("Z$"; ":00Z") | fromdateiso8601)
      else fromdateiso8601
      end;
    (with_entries(select((.value.ts // "1970-01-01T00:00:00Z" | to_epoch) >= $cutoff))) as $pruned
    | {pruned: $pruned, entry: ($pruned[$key] // null)}
  ' 2>/dev/null)

  if [ -z "$result" ] || ! printf '%s' "$result" | jq -e . >/dev/null 2>&1; then
    result='{"pruned":{},"entry":null}'
  fi

  pruned_ledger=$(printf '%s' "$result" | jq -c '.pruned')
  _ledger_write "$pruned_ledger"

  LEDGER_ENTRY_TS=$(printf '%s' "$result" | jq -r '.entry.ts // empty')
  LEDGER_ENTRY_SEV=$(printf '%s' "$result" | jq -r '.entry.sev // empty')
}

_ledger_upsert() {
  local dedup_key="$1" ts="$2" sev="$3" raw updated
  raw=$(_ledger_read)
  updated=$(printf '%s' "$raw" | jq --arg k "$dedup_key" --arg ts "$ts" --argjson sev "$sev" \
    '.[$k] = {ts:$ts, sev:$sev}')
  _ledger_write "$updated"
}

# Single seam over `bash scripts/orch-apply.sh` — production default below.
# Tests redefine this function (after sourcing this script) to script a
# canned rc sequence for CAS-retry coverage. Called with a plain redirection
# (`<<<`), never a pipe, so no subshell is forked — a counter var a test
# stub increments persists across the CAS-retry loop's 3 iterations.
_orch_apply_invoke() {
  bash "$ORCH_APPLY_SH"
}

# =============================================================================
# Orchestration entrypoint
# =============================================================================

run_emit_signal() {
  DEDUP_OUTCOME=""
  DEDUP_DETAIL=""

  _parse_args "$@" || return 2

  if [ "$E3_ONLY" != "true" ]; then
    _run_e1 || return 1
  fi

  if [ "$E3_ONLY" != "true" ] && [ "$NO_TELEGRAM" != "true" ]; then
    _check_dedup_and_maybe_send "$DEDUP_KEY" "$SEVERITY"
  fi

  local now_ts row_id row_json
  now_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  row_id="$(_gen_row_id "$now_ts")"
  row_json=$(_build_row_json "$row_id" "$now_ts")

  _e3_write_row "$row_json" "$row_id" || return 1

  if [ "$E3_ONLY" = "true" ]; then
    echo "[emit-signal] OK e3-only id=$row_id check_id=$CHECK_ID"
  elif [ "$NO_TELEGRAM" = "true" ]; then
    echo "[emit-signal] OK no-telegram id=$row_id check_id=$CHECK_ID"
  else
    echo "[emit-signal] $DEDUP_OUTCOME $DEDUP_DETAIL id=$row_id"
  fi

  return 0
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_emit_signal "$@"
  exit $?
fi
