#!/usr/bin/env bash
# scripts/audit-output-contract.sh
#
# FIX-AUDITOR-DASHBOARD-APPEND-NO-ACTUATOR-CONTRACT-COUNT-NARRATED
#
# Replaces the system-auditor's hand-COMPOSED
#   "[OUTPUT-CONTRACT] signals_posted=N | telegram_sent=N | signal_queue_rows_written=N | dashboard_rows=N"
# line (docs/agents/system-auditor/flow/main.md — OUTPUT-CONTRACT section)
# with a MECHANICAL parse of the marker lines the cycle already produced.
# The agent stops choosing N; it can only report what this script computes
# from the emit-audit-signal.sh / emit-dashboard-row.sh markers it actually
# paste-accumulated into a scratch file this cycle.
#
# Confirmed failure shape this closes (recurring on 2026-07-29, both
# directions on the SAME defect):
#   over-report — narrated dashboard_rows=N, wrote 0 (occurrences 1/2)
#   under-report — narrated signals_posted=0 | telegram_sent=0 |
#     signal_queue_rows_written=0 | dashboard_rows=0, while a signal_queue
#     row HAD in fact been written (occurrence 3 — root cause: a SKIP-dedup
#     marker line, which STILL carries `id=` per the emit-audit-signal.sh
#     contract, was misread as "nothing was emitted").
#
# CONTRACT (named args):
#   scripts/audit-output-contract.sh \
#     --markers-file <path>            # REQUIRED. Plain text, one marker
#                                       # line per line, verbatim stdout the
#                                       # agent already pasted into the
#                                       # notebook this cycle from every
#                                       # emit-audit-signal.sh /
#                                       # emit-dashboard-row.sh /
#                                       # bare-post_agent_signal call site.
#                                       # Missing/empty file = genuine
#                                       # ALL_GREEN cycle: all 4 counts = 0,
#                                       # exit 0 (NOT an error).
#     [--anomalies-count <N>]          # agent's own tally of NEW anomalies
#                                       # this cycle (the RETURN headline's
#                                       # N) — still narrated (no marker set
#                                       # spans PASS-only checks), but cross-
#                                       # checked below (V4), never trusted
#                                       # alone.
#     [--next-token <token>]           # agent's own RETURN NEXT: token —
#                                       # cross-checked below (V5).
#     [--cycle-start-ts <ISO-8601>]    # enables the INDEPENDENT signal_queue
#                                       # cross-check (V1) — re-reads
#                                       # .signal_queue.rows[] filtered by
#                                       # from==<from-agent> and ts>=this,
#                                       # asserts it equals the marker-parsed
#                                       # signal_queue_rows_written. Without
#                                       # this + --orch-state-file, V1 is
#                                       # skipped (logged, not silently
#                                       # green).
#     [--orch-state-file <path>        default: $REPO_ROOT/docs/data/orch/orch-state.json]
#     [--from-agent <agent-id>         default: "system-auditor"]
#     [--cycle-tag <value>]            # FIX-AUDIT-OUTPUT-CONTRACT-SIGNALQUEUE-
#                                       # ROWS-WRITTEN-SELFREPORT-MISMATCH — when
#                                       # supplied (the caller's own FIRE_TASK_ID),
#                                       # V1 scopes the independent re-read to an
#                                       # EXACT audit_cycle_tag match instead of
#                                       # the from+ts-window guess below, immune to
#                                       # cross-tier/cross-session identity
#                                       # collision (every tier shares the same
#                                       # default from="system-auditor"). Falls
#                                       # back to the legacy from+ts-window path
#                                       # (--from-agent / --cycle-start-ts) when
#                                       # absent, for backward compatibility.
#
# ── V6/V7 — FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-VERDICT
# (2026-08-13) — ALL THREE args below are optional and purely additive: absent
# every one of them, this script's behavior/output is byte-identical to before
# (no `| verdict=` suffix on the STDOUT contract line either — see STDOUT
# section below). V1-V5 above close the COUNT plane; these close the VERDICT
# TOKEN plane — "the machine computed X, the agent's own prose said Y", which
# V1-V5 cannot see (a mismatched dashboard_rows count says nothing about
# whether ESCALATE got narrated as FOLD). Two confirmed live occurrences +
# 1 corroboration on the owning task row; full root_cause/deliverable there.
#
#     [--raw-verdicts-file <path>]     # ARM A (in-commit plane, catches the
#                                       # OCC-1 shape: a machine-computed
#                                       # verdict captured THIS cycle gets
#                                       # inverted/contradicted in prose two
#                                       # paragraphs later). This cycle's own
#                                       # captured machine-verdict JSON blobs
#                                       # — e.g. scripts/audits/verify-a30-mcp-
#                                       # memory-reclamation.sh's stdout — one
#                                       # per line (JSONL; blank lines
#                                       # ignored), OR a single JSON array of
#                                       # such objects (file starts with `[`
#                                       # after trimming whitespace — auto-
#                                       # detected, no separate flag needed).
#                                       # Each object's check id is read from
#                                       # `.check`, falling back to
#                                       # `.check_id`, falling back to the
#                                       # leading `[A-Z]+-[0-9]+` token inside
#                                       # `.probe` (verify-a30's own shape —
#                                       # `"probe":"A-30 mcp-server memory
#                                       # reclamation discriminator"` — this is
#                                       # what lets a RAW-PROBE JSON blob be
#                                       # diffed with ZERO changes to the
#                                       # probe script itself). The verdict
#                                       # value is read from `.verdict`.
#     [--declared-verdicts <check>=<token>[:<qualifier>][,<check>=<token>[:<qualifier>]...]]
#                                       # This cycle's own prose/Findings
#                                       # verdict per check, as the agent is
#                                       # ABOUT to write it (e.g.
#                                       # `A-30=FOLD` or, when the token alone
#                                       # would otherwise read as a violation,
#                                       # a documented-legitimate qualifier
#                                       # after a `:` — see ARM B below —
#                                       # `A-30=WARN:dedup-SKIP vs c48`). Comma
#                                       # separates checks; colon separates a
#                                       # check's token from its optional
#                                       # qualifier — this is why a qualifier
#                                       # may itself safely contain commas
#                                       # (`A-30=WARN:dedup-SKIP vs c48, peer
#                                       # already signalled`) without being
#                                       # mis-split into a second bogus check.
#                                       # For every check id present in BOTH
#                                       # --raw-verdicts-file and here: assert
#                                       # declared token == machine verdict.
#                                       # Mismatch -> VIOLATION (V6), forces
#                                       # the cycle verdict field below to
#                                       # ESCALATE — never resolved by
#                                       # preferring the prose. A machine
#                                       # verdict with NO declared counterpart
#                                       # is ALSO a V6 VIOLATION (silent
#                                       # omission is the same bug, same
#                                       # ESCALATE-forcing). A declared check
#                                       # with no machine counterpart in
#                                       # --raw-verdicts-file is logged
#                                       # (`[audit-output-contract] INFO
#                                       # declared-no-machine-counterpart ...`)
#                                       # only — PASS-only checks legitimately
#                                       # never emit a structured raw verdict,
#                                       # this is not itself a violation.
#     [--trigger-verdict-file <path>]  # ARM B (spawn-trigger plane, catches
#                                       # the OCC-2/c53 shape: an agent that
#                                       # writes NOTHING never reaches ARM A at
#                                       # all, or — c53, the sharper case —
#                                       # behaves correctly at every documented
#                                       # step and the divergence STILL exists
#                                       # because the faulty plane is the one
#                                       # upstream of this cycle). The full
#                                       # verdict JSON `scripts/agents-flow/
#                                       # auditor-tier1-probe.sh` persisted for
#                                       # THIS tick (its own new sole-written
#                                       # `docs/data/auditor-tier1-last-
#                                       # trigger.json` — see that script's own
#                                       # header comment; this is a distinct
#                                       # file from `auditor-tier1-last-
#                                       # healthy.json`, never overloads it).
#                                       # Shape: `{written_at, fire_tick,
#                                       # verdict, detail, checks:{<6 keys>:
#                                       # PASS|FAIL}}`. If `.verdict=="FAILURE"`:
#                                       # for every `.checks[k]=="FAIL"`, map
#                                       # k to an audit dimension (mem_creep ->
#                                       # A-30, disk -> A-32 — both cited
#                                       # verbatim in that script's own check-4/
#                                       # check-5 header comments; the
#                                       # remaining 4 trigger checks map
#                                       # best-effort, see
#                                       # _aoc_trigger_check_dimension below)
#                                       # and look up THAT dimension in
#                                       # --declared-verdicts (SAME flag as ARM
#                                       # A, reused, not a second copy). If the
#                                       # declared token is FOLD/PASS/ALL_GREEN
#                                       # -> VIOLATION (V7, "DIVERGENCE") UNLESS
#                                       # its qualifier names a pre-approved
#                                       # exemption (case-insensitive substring
#                                       # `dedup-skip` / `acked` / `acknowledg`
#                                       # / `ack-suppress`) — a legitimate
#                                       # dedup-SKIP-against-a-peer-cycle or an
#                                       # honestly-surfaced acknowledged-
#                                       # degraded suppression. ARM B
#                                       # DELIBERATELY does NOT re-implement
#                                       # ack-ledger reconciliation itself: the
#                                       # trigger file's `.checks{}` values are
#                                       # already ack-reconciled BY THE PRE-GATE
#                                       # ITSELF (`_mem_container_acked`/
#                                       # `_launchd_label_acked` — a suppressed
#                                       # breach reports PASS there, never
#                                       # FAIL) before they ever reach this
#                                       # file, so a legitimate ACK can never
#                                       # present as a FAILing trigger check
#                                       # here in the first place — this is
#                                       # what makes ARM B "reconcilable
#                                       # against the ack ledger" (PO
#                                       # corroboration 2026-08-08T14:47Z) with
#                                       # zero new ledger-parsing code. A V7
#                                       # VIOLATION does NOT force the cycle
#                                       # verdict to ESCALATE (sets it to
#                                       # DIVERGENCE instead, unless a V6
#                                       # violation already forced ESCALATE) —
#                                       # per that same corroboration, a pre-
#                                       # gate-FAILURE/cycle-declared-FOLD split
#                                       # is SOMETIMES correct behavior by
#                                       # design (AUD-CP-1, `main.md:138-154`,
#                                       # requires the cycle to refuse a
#                                       # caller-asserted verdict contradicting
#                                       # its own documented predicate) — V7 is
#                                       # a mandatory REVIEW flag, never an
#                                       # automatic agent-blame verdict.
#
# STDOUT — MANDATORY, paste verbatim into the RETURN block:
#   [OUTPUT-CONTRACT] signals_posted=<N> | telegram_sent=<N> | signal_queue_rows_written=<N> | dashboard_rows=<N> | dedup_skipped=<N>
# ...with a trailing ` | verdict=<CLEAN|DIVERGENCE|ESCALATE>` field APPENDED
# ONLY when at least one of --raw-verdicts-file / --declared-verdicts /
# --trigger-verdict-file was supplied (ARM A/B "engaged" this run) — omitted
# entirely otherwise, so every pre-existing caller/test of this script that
# never passes those flags sees byte-identical output to before this fix.
#
# Any violation ALSO prints one distinct line per violation (grep for
# "[OUTPUT-CONTRACT] VIOLATION:") and fires a BUG-channel Telegram itself —
# the flow does not have to remember to do this separately.
#
# EXIT CODE: 0 = no violation. 1 = >=1 violation detected (already reported).
#
# MARKER GRAMMAR PARSED (per scripts/emit-audit-signal.sh header comment,
# verbatim — this script does NOT re-derive the grammar, it cites it):
#   [emit-signal] OK dedup_key=<k> id=<id>                         -> counts: signals_posted++, signal_queue_rows_written++, telegram_sent++
#   [emit-signal] OK-escalation-bypass dedup_key=.. .. id=<id>     -> counts: signals_posted++, signal_queue_rows_written++, telegram_sent++
#   [emit-signal] SKIP-dedup dedup_key=<k> last_sent=<ts> id=<id>  -> counts: signals_posted++, signal_queue_rows_written++, dedup_skipped++ (NO telegram)
#   [emit-signal] OK e3-only id=<id> check_id=<cid>                -> counts: signals_posted++, signal_queue_rows_written++ (NO telegram — E-1/E-2 skipped by caller choice)
#   [emit-signal] OK no-telegram id=<id> check_id=<cid>            -> counts: signals_posted++, signal_queue_rows_written++ (NO telegram — E-2 skipped by caller choice)
#   [emit-signal] ABORT ...                                        -> counts: NOTHING (per main.md "ABORT ... -> do NOT count this toward signals_posted")
#   [emit-signal] SKIP-duplicate-invocation ...                     -> counts: NOTHING (FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS —
#                                                                       emit-audit-signal.sh's own cycle-scoped idempotency PRE-check
#                                                                       no-op'd this call before E-1/E-3 ran; zero new rows exist)
#   [emit-dashboard] OK id=<id> check_id=<cid>                     -> counts: dashboard_rows++ (this marker is ONLY ever printed by
#                                                                       scripts/emit-dashboard-row.sh after its OWN mandatory
#                                                                       write+read-back assert already passed — so this counter
#                                                                       is grounded in a per-unit verified write, not narration,
#                                                                       even before the V3 cross-check below)
#   [emit-dashboard] ABORT / WARN ...                              -> counts: NOTHING toward dashboard_rows
#   [post-agent-signal] OK ...                                     -> counts: signals_posted++ (bare post_agent_signal call
#                                                                       sites outside the emit-audit-signal.sh family — Tier-3
#                                                                       Roll-Up, DOC-AUDIT-GIT-ERR — do NOT write a signal_queue
#                                                                       row via E-3, so they contribute to signals_posted only,
#                                                                       never to signal_queue_rows_written. This is the
#                                                                       structural reason signals_posted and
#                                                                       signal_queue_rows_written MUST be allowed to differ.)
#   [post-agent-signal] ABORT ...                                  -> counts: NOTHING
#
# VIOLATIONS (each fires exactly one BUG-channel Telegram, non-dedup'd —
# these are meta-bugs about the auditor's own contract, not about the
# system under audit):
#   V1  signal_queue_rows_written(marker) != independent .signal_queue count (when cycle-start-ts + orch-state-file both resolve)
#   V2  signal_queue_rows_written == 0 AND signals_posted > 0   (main.md OUTPUT-CONTRACT check, unchanged — now on trustworthy operands)
#   V3  dashboard_rows == 0 AND signals_posted > 0              (acceptance 3 — symmetric extension to dashboard_rows)
#   V4  anomalies-count == 0 AND signals_posted > 0             (RETURN-headline consistency)
#   V5  next-token == "clean" AND signals_posted > 0            (RETURN NEXT-token consistency)
#   V6  ARM A — declared (prose) verdict != this cycle's own captured machine
#       verdict for the same check id, OR a machine verdict this cycle
#       captured has no declared counterpart at all (silent omission).
#       Forces the STDOUT contract line's `verdict=` field to ESCALATE.
#   V7  ARM B — a prior pre-gate tick persisted verdict=FAILURE on check X,
#       and this cycle's declared verdict for X's mapped audit dimension is
#       FOLD/PASS/ALL_GREEN with no pre-approved exemption qualifier. Sets
#       `verdict=` to DIVERGENCE (never ESCALATE — see --trigger-verdict-file
#       above for why this must never read as an automatic agent-blame call).
#
# DURABLE VIOLATION RECORD (FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS,
# acceptance 4): every VIOLATION line above is ALSO appended, synchronously,
# to docs/data/auditor-output-contract-violations.json (tmp+mv atomic write,
# same idiom as docs/data/auditor-dedup-ledger.json — NOT routed through
# orch-apply.sh, auditor-internal bookkeeping, not an orch-state.json-schema
# artifact) BEFORE this script returns. This is the real enforcement: the
# calling flow's own "paste the VIOLATION line into the notebook/RETURN"
# instruction (docs/agents/system-auditor/flow/main.md §OUTPUT-CONTRACT) is
# prose and can be, and was, skipped (confirmed occurrence 2026-07-29) — and
# as of the 2026-08-06 Notebook-Write reorder (FIX-AUDITOR-DURABILITY-
# STEP0B-DETECTION §3b.1) the calling flow's notebook is ALREADY committed
# by the time this script runs, so "paste it into the notebook" now
# describes a step that already happened. A durable record written by the
# SCRIPT itself, unconditional on any downstream narration, is the only way
# to make "this cycle's V1-V5 violations are never silently lost" actually
# true rather than aspirational. Override path for tests:
# AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE (unset -> production default below).
#
# Shell: bash 3.2+ (macOS system /bin/bash) — NO mapfile, NO associative
# arrays. Only plain indexed arrays / case statements / awk / jq.
#
# Precedents: scripts/emit-audit-signal.sh (marker grammar, DDD split,
# _send_orphan_bug_telegram style, ledger tmp+mv idiom), scripts/agents-
# flow/mcp-call.sh (transport, sourced not reinvented).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

VIOLATIONS_FILE="${AUDIT_OUTPUT_CONTRACT_VIOLATIONS_FILE:-$REPO_ROOT/docs/data/auditor-output-contract-violations.json}"

# shellcheck source=./agents-flow/mcp-call.sh
source "$SCRIPT_DIR/agents-flow/mcp-call.sh"

_send_bug_telegram() {
  local msg="$1" args
  args=$(jq -n --arg channel "bug" --arg message "$msg" '{channel:$channel, message:$message}')
  mcp_call "send_telegram" "$args" >/dev/null 2>&1
}

# See "DURABLE VIOLATION RECORD" header comment above — unconditional,
# synchronous, script-owned persistence of every VIOLATION detected this
# run. Never fails loud on its own I/O (self-heal, mirrors _ledger_write()
# in scripts/emit-audit-signal.sh) — a violations-file write failure must
# never mask or abort the REAL violation it is trying to record.
_record_violation_durable() {
  local detail="$1" cycle_tag="$2" from_agent="$3" now_ts dir tmp existing updated
  now_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  dir="$(dirname "$VIOLATIONS_FILE")"
  if [ -f "$VIOLATIONS_FILE" ] && jq -e . "$VIOLATIONS_FILE" >/dev/null 2>&1; then
    existing=$(cat "$VIOLATIONS_FILE")
  else
    existing="[]"
  fi
  updated=$(printf '%s' "$existing" | jq --arg ts "$now_ts" --arg tag "$cycle_tag" --arg from "$from_agent" --arg detail "$detail" \
    '(. + [{ts:$ts, cycle_tag:(if $tag=="" then null else $tag end), from:$from, detail:$detail}]) | .[-200:]' 2>/dev/null)
  [ -z "$updated" ] && return 0
  tmp=$(mktemp "$dir/.auditor-output-contract-violations-XXXXXXXX.json" 2>/dev/null) || return 0
  printf '%s\n' "$updated" > "$tmp" 2>/dev/null && mv "$tmp" "$VIOLATIONS_FILE" 2>/dev/null
  return 0
}

# ── V6/V7 shared plumbing (FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-
# MACHINE-VERDICT) — plain GLOBAL indexed arrays (bash 3.2, no associative
# arrays), reset at the top of every _aoc_parse_declared_verdicts call so
# repeated sourced invocations (this script is sourced once, called many
# times, by both the real flow and its own test harness) never leak state
# from a prior call. ────────────────────────────────────────────────────────
_AOC_DECL_KEYS=()
_AOC_DECL_TOKENS=()
_AOC_DECL_QUALS=()

# Parses "--declared-verdicts" grammar: <check>=<token>[:<qualifier>][,...].
# Comma separates checks; colon (first one only) separates a check's token
# from its optional qualifier — this is what lets a qualifier safely contain
# commas of its own (e.g. "A-30=WARN:dedup-SKIP vs c48, peer already
# signalled") without being mis-split into a second bogus check.
_aoc_parse_declared_verdicts() {
  local raw="${1:-}" pair k rest tok qual oldifs
  _AOC_DECL_KEYS=()
  _AOC_DECL_TOKENS=()
  _AOC_DECL_QUALS=()
  [ -z "$raw" ] && return 0
  oldifs="$IFS"
  IFS=','
  for pair in $raw; do
    IFS="$oldifs"
    [ -z "$pair" ] && { IFS=','; continue; }
    k="${pair%%=*}"
    rest="${pair#*=}"
    tok="${rest%%:*}"
    if [ "$rest" = "$tok" ]; then qual=""; else qual="${rest#*:}"; fi
    _AOC_DECL_KEYS+=("$k")
    _AOC_DECL_TOKENS+=("$tok")
    _AOC_DECL_QUALS+=("$qual")
    IFS=','
  done
  IFS="$oldifs"
  return 0
}

# Prints the 0-based index of check id $1 in _AOC_DECL_KEYS, rc=0. rc=1 (no
# stdout) if not found.
_aoc_lookup_declared_idx() {
  local want="$1" i n=${#_AOC_DECL_KEYS[@]}
  for ((i = 0; i < n; i++)); do
    if [ "${_AOC_DECL_KEYS[$i]}" = "$want" ]; then
      printf '%s' "$i"
      return 0
    fi
  done
  return 1
}

# ARM B pre-approved exemptions — case-insensitive substring match against a
# declared check's qualifier text (the part after ":" in --declared-verdicts).
# A legitimate dedup-SKIP-against-a-peer-cycle or an honestly-surfaced
# acknowledged-degraded suppression both pass; anything else does not.
_aoc_legit_qualifier() {
  local q_lc
  q_lc=$(printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]')
  case "$q_lc" in
    *dedup-skip*|*acked*|*acknowledg*|*ack-suppress*) return 0 ;;
    *) return 1 ;;
  esac
}

# ARM B trigger-check -> audit-dimension mapping. mem_creep->A-30 and
# disk->A-32 are SSOT-confirmed (scripts/agents-flow/auditor-tier1-probe.sh's
# own check-5/check-4 header comments cite the exact reused boundary — "Same
# already-tuned WARN_PCT=85 boundary ... reused from A-30" / "WARN boundary
# reused from tier1-probe.md A-32"). The remaining four are best-effort (no
# single SSOT line names their exact A-xx id) — docker_ps/health_3000/
# health_3001 land inside the documented A-01..A-11 / A-12..A-20 ranges
# (tier1-probe.md) without a confirmed per-service number; launchd_agents has
# no A-xx id at all (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED is its own,
# separate check family), hence the synthetic "D-LAUNCHD" label. None of
# these four are exercised by this task's acceptance fixtures — only
# mem_creep/A-30 is — but a --declared-verdicts entry keyed on whichever
# label is used here will still correctly suppress/flag a real divergence.
_aoc_trigger_check_dimension() {
  case "$1" in
    mem_creep) printf 'A-30' ;;
    disk) printf 'A-32' ;;
    docker_ps) printf 'A-01' ;;
    health_3000) printf 'A-12' ;;
    health_3001) printf 'A-13' ;;
    launchd_agents) printf 'D-LAUNCHD' ;;
    *) printf '%s' "$1" ;;
  esac
}

run_audit_output_contract() {
  local markers_file="" anomalies_count="" next_token="" cycle_start_ts=""
  local orch_state_file="${REPO_ROOT}/docs/data/orch/orch-state.json"
  local from_agent="system-auditor"
  local cycle_tag=""
  local raw_verdicts_file="" declared_verdicts_spec="" trigger_verdict_file=""

  while [ $# -gt 0 ]; do
    case "$1" in
      --markers-file) markers_file="${2:-}"; shift 2 ;;
      --anomalies-count) anomalies_count="${2:-}"; shift 2 ;;
      --next-token) next_token="${2:-}"; shift 2 ;;
      --cycle-start-ts) cycle_start_ts="${2:-}"; shift 2 ;;
      --orch-state-file) orch_state_file="${2:-}"; shift 2 ;;
      --from-agent) from_agent="${2:-}"; shift 2 ;;
      --cycle-tag) cycle_tag="${2:-}"; shift 2 ;;
      --raw-verdicts-file) raw_verdicts_file="${2:-}"; shift 2 ;;
      --declared-verdicts) declared_verdicts_spec="${2:-}"; shift 2 ;;
      --trigger-verdict-file) trigger_verdict_file="${2:-}"; shift 2 ;;
      *)
        echo "[audit-output-contract] ABORT unknown-arg $1"
        return 2
        ;;
    esac
  done

  if [ -z "$markers_file" ]; then
    echo "[audit-output-contract] ABORT missing-required-arg --markers-file"
    return 2
  fi

  local signals_posted=0 telegram_sent=0 signal_queue_rows_written=0 dashboard_rows=0 dedup_skipped=0
  local violations=0

  if [ -f "$markers_file" ]; then
    while IFS= read -r line; do
      [ -z "$line" ] && continue
      case "$line" in
        '[emit-signal] ABORT'*)
          : # counts toward nothing
          ;;
        '[emit-signal] SKIP-duplicate-invocation'*)
          : # FIX-AUDITOR-B12-DOUBLE-INVOKE-EMIT-MARKER-LOSS — emit-audit-signal.sh's
            # own same-cycle idempotency PRE-check no-op'd this call before E-1/E-3
            # ever ran; zero new agent_signals/signal_queue rows exist for it, so it
            # counts toward nothing here either (same treatment as ABORT, explicit
            # case for grammar completeness — the default `*)` bucket below would
            # already handle this correctly, but exhaustive > implicit for a parser
            # whose whole job is "never guess").
          ;;
        '[emit-signal] OK-escalation-bypass'*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          telegram_sent=$((telegram_sent + 1))
          ;;
        '[emit-signal] OK e3-only'*|'[emit-signal] OK no-telegram'*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          ;;
        '[emit-signal] OK '*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          telegram_sent=$((telegram_sent + 1))
          ;;
        '[emit-signal] SKIP-dedup'*)
          signals_posted=$((signals_posted + 1))
          signal_queue_rows_written=$((signal_queue_rows_written + 1))
          dedup_skipped=$((dedup_skipped + 1))
          ;;
        '[emit-dashboard] OK '*)
          dashboard_rows=$((dashboard_rows + 1))
          ;;
        '[emit-dashboard] ABORT'*|'[emit-dashboard] WARN'*)
          : # written-but-uncommitted (WARN commit-failed) still increments
            # dashboard_rows above via its own "OK id=" line printed right
            # after — WARN commit-failed lines are always followed by a
            # distinct OK line per emit-dashboard-row.sh's own contract, so
            # nothing to add here; ABORT never reaches an OK line at all.
          ;;
        '[post-agent-signal] OK'*)
          signals_posted=$((signals_posted + 1))
          ;;
        '[post-agent-signal] ABORT'*)
          : # counts toward nothing
          ;;
        *)
          : # unrecognized line — ignore (not a marker this script owns)
          ;;
      esac
    done < "$markers_file"
  fi

  # ── V1: independent signal_queue cross-check ────────────────────────────
  if [ -n "$cycle_start_ts" ] && [ -f "$orch_state_file" ]; then
    local independent_sqr
    if [ -n "$cycle_tag" ]; then
      # Exact-tag scoping (Bug B fix) — no from/time-window guessing, immune
      # to cross-tier/cross-session identity collision (every tier/session
      # shares the same default from="system-auditor").
      independent_sqr=$(jq --arg tag "$cycle_tag" \
        '[.signal_queue.rows[] | select(.audit_cycle_tag == $tag)] | length' \
        "$orch_state_file" 2>/dev/null)
    else
      # Legacy from+ts-window fallback for callers not yet passing
      # --cycle-tag. to_epoch ported verbatim from emit-audit-signal.sh's
      # _ledger_prune_and_lookup() (Bug A fix — cycle_start_ts is always
      # minute-precision FIRE_TICK, .ts is always second-precision; a raw
      # string >= silently drops same-minute rows).
      independent_sqr=$(jq --arg from "$from_agent" --arg ts "$cycle_start_ts" '
        def to_epoch:
          if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$")
          then (sub("Z$"; ":00Z") | fromdateiso8601)
          else fromdateiso8601
          end;
        ($ts | to_epoch) as $cutoff
        | [.signal_queue.rows[] | select(.from == $from and ((.ts // "1970-01-01T00:00:00Z") | to_epoch) >= $cutoff)] | length
      ' "$orch_state_file" 2>/dev/null)
    fi
    if [ -n "$independent_sqr" ] && [ "$independent_sqr" != "null" ]; then
      if [ "$independent_sqr" -ne "$signal_queue_rows_written" ]; then
        echo "[OUTPUT-CONTRACT] VIOLATION: signal_queue_rows_written mismatch narrated=${signal_queue_rows_written} independent=${independent_sqr}"
        _record_violation_durable "V1 signal_queue_rows_written mismatch narrated=${signal_queue_rows_written} independent=${independent_sqr}" "$cycle_tag" "$from_agent"
        _send_bug_telegram "[audit-output-contract] BUG: signal_queue_rows_written mismatch — marker-parsed=${signal_queue_rows_written}, independent re-read of .signal_queue.rows[]=${independent_sqr}. Trusting the higher (real-artifact) value."
        violations=$((violations + 1))
        # Take-the-max is sound ONLY because both operands are now
        # trustworthy per-direction (docs/architecture-briefs/2026-08-05-
        # fix-audit-output-contract-signalqueue-mismatch.md §3):
        #   independent < marker -> a verified write was drained/pruned
        #     AFTER this cycle wrote it; cannot un-write a real append,
        #     marker (already higher) wins by construction (no-op below).
        #   independent > marker -> this cycle's own $MARKERS_FILE is
        #     missing a row that legitimately carries its cycle-tag
        #     (dropped marker line / bypassed-script write); the scoped
        #     ground-truth read wins.
        if [ "$independent_sqr" -gt "$signal_queue_rows_written" ]; then
          signal_queue_rows_written=$independent_sqr
        fi
      fi
    else
      echo "[audit-output-contract] WARN independent-crosscheck-unavailable (jq query failed or returned null) — V1 skipped, not silently passed"
    fi
  else
    echo "[audit-output-contract] WARN independent-crosscheck-skipped (--cycle-start-ts or orch-state-file not resolvable) — V1 not run"
  fi

  # ── V2: existing main.md:669 check, now on trustworthy operands ────────
  if [ "$signal_queue_rows_written" -eq 0 ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: signals emitted but no signal_queue rows written"
    _record_violation_durable "V2 signals emitted but no signal_queue rows written (signals_posted=${signals_posted})" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: signals_posted=${signals_posted} but signal_queue_rows_written=0 this cycle"
    violations=$((violations + 1))
  fi

  # ── V3: acceptance (3) — symmetric extension to dashboard_rows ─────────
  if [ "$dashboard_rows" -eq 0 ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: signals emitted but no dashboard rows written"
    _record_violation_durable "V3 signals emitted but no dashboard rows written (signals_posted=${signals_posted})" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: signals_posted=${signals_posted} but dashboard_rows=0 this cycle"
    violations=$((violations + 1))
  fi

  # ── V4/V5: RETURN-headline consistency (best-effort — narrated inputs,
  # cross-checked rather than trusted alone) ──────────────────────────────
  if [ -n "$anomalies_count" ] && [ "$anomalies_count" -eq 0 ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: RETURN headline anomalies=0 but signals_posted>0"
    _record_violation_durable "V4 RETURN headline anomalies=0 but signals_posted=${signals_posted}" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: RETURN headline claimed 0 anomalies but signals_posted=${signals_posted} this cycle"
    violations=$((violations + 1))
  fi
  if [ "$next_token" = "clean" ] && [ "$signals_posted" -gt 0 ]; then
    echo "[OUTPUT-CONTRACT] VIOLATION: RETURN NEXT=clean but signals_posted>0"
    _record_violation_durable "V5 RETURN NEXT=clean but signals_posted=${signals_posted}" "$cycle_tag" "$from_agent"
    _send_bug_telegram "[audit-output-contract] BUG: RETURN NEXT token said clean but signals_posted=${signals_posted} this cycle"
    violations=$((violations + 1))
  fi

  # ── V6/V7 — FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-
  # VERDICT. Both OFF (byte-identical STDOUT to before, no `verdict=` field)
  # unless at least one of --raw-verdicts-file / --declared-verdicts /
  # --trigger-verdict-file was supplied. See header comment for full spec.
  local av_engaged=0
  local cycle_verdict_token=""

  if [ -n "$raw_verdicts_file" ] || [ -n "$declared_verdicts_spec" ] || [ -n "$trigger_verdict_file" ]; then
    av_engaged=1
    cycle_verdict_token="CLEAN"
    _aoc_parse_declared_verdicts "$declared_verdicts_spec"
  fi

  # ── ARM A (V6) — this cycle's own captured machine verdict vs its own
  # declared (prose) verdict, per check id. ───────────────────────────────
  local raw_seen_checks=""
  if [ -n "$raw_verdicts_file" ] && [ -f "$raw_verdicts_file" ]; then
    local raw_first_char raw_lines
    raw_first_char=$(sed 's/^[[:space:]]*//' "$raw_verdicts_file" 2>/dev/null | head -c1)
    if [ "$raw_first_char" = "[" ]; then
      raw_lines=$(jq -c '.[]' "$raw_verdicts_file" 2>/dev/null)
    else
      raw_lines=$(cat "$raw_verdicts_file" 2>/dev/null)
    fi
    local obj chk mverdict declared_idx dtoken
    while IFS= read -r obj; do
      [ -z "$obj" ] && continue
      chk=$(printf '%s' "$obj" | jq -r '(.check // .check_id // ((.probe // "") | (match("[A-Z]+-[0-9]+")? .string)) // "")' 2>/dev/null)
      mverdict=$(printf '%s' "$obj" | jq -r '.verdict // ""' 2>/dev/null)
      [ -z "$chk" ] && chk="UNKNOWN"
      [ -z "$mverdict" ] && continue
      raw_seen_checks="${raw_seen_checks} ${chk}"
      if declared_idx=$(_aoc_lookup_declared_idx "$chk"); then
        dtoken="${_AOC_DECL_TOKENS[$declared_idx]}"
        if [ "$dtoken" != "$mverdict" ]; then
          echo "[OUTPUT-CONTRACT] VIOLATION: verdict mismatch check=${chk} raw=${mverdict} declared=${dtoken}"
          _record_violation_durable "V6 verdict mismatch check=${chk} raw=${mverdict} declared=${dtoken}" "$cycle_tag" "$from_agent"
          _send_bug_telegram "[audit-output-contract] BUG: verdict transcription mismatch check=${chk} — machine-computed=${mverdict}, agent-declared=${dtoken}. Cycle verdict forced to ESCALATE."
          violations=$((violations + 1))
          cycle_verdict_token="ESCALATE"
        fi
      else
        echo "[OUTPUT-CONTRACT] VIOLATION: check=${chk} machine verdict=${mverdict} has no declared counterpart (silent omission)"
        _record_violation_durable "V6 check=${chk} machine verdict=${mverdict} has no declared counterpart (silent omission)" "$cycle_tag" "$from_agent"
        _send_bug_telegram "[audit-output-contract] BUG: check=${chk} machine-computed verdict=${mverdict} this cycle but no declared counterpart was transcribed — silent omission. Cycle verdict forced to ESCALATE."
        violations=$((violations + 1))
        cycle_verdict_token="ESCALATE"
      fi
    done <<< "$raw_lines"
  fi

  # Declared check with no machine counterpart -> logged only, never a
  # violation (PASS-only checks legitimately never emit a structured raw
  # verdict this cycle).
  if [ -n "$raw_verdicts_file" ] && [ -n "$declared_verdicts_spec" ]; then
    local dn=${#_AOC_DECL_KEYS[@]} j dk
    for ((j = 0; j < dn; j++)); do
      dk="${_AOC_DECL_KEYS[$j]}"
      case " $raw_seen_checks " in
        *" $dk "*) : ;;
        *)
          echo "[audit-output-contract] INFO declared-no-machine-counterpart check=${dk} declared=${_AOC_DECL_TOKENS[$j]} (no raw verdict captured this cycle for this check — not a violation)"
          ;;
      esac
    done
  fi

  # ── ARM B (V7) — cross-plane: a prior pre-gate tick's persisted trigger
  # verdict vs this cycle's own declared verdict for the mapped dimension.
  # NEVER forces ESCALATE (see _aoc_trigger_check_dimension / header comment
  # for why a divergence here is sometimes correct behavior by design). ────
  if [ -n "$trigger_verdict_file" ] && [ -f "$trigger_verdict_file" ]; then
    local trig_json trig_verdict trig_lines tkey tval dim declared_idx2 dtoken2 dqual2
    trig_json=$(cat "$trigger_verdict_file" 2>/dev/null)
    trig_verdict=$(printf '%s' "$trig_json" | jq -r '.verdict // ""' 2>/dev/null)
    if [ "$trig_verdict" = "FAILURE" ]; then
      trig_lines=$(printf '%s' "$trig_json" | jq -r '.checks // {} | to_entries[] | [.key, .value] | @tsv' 2>/dev/null)
      while IFS=$'\t' read -r tkey tval; do
        [ -z "$tkey" ] && continue
        [ "$tval" != "FAIL" ] && continue
        dim=$(_aoc_trigger_check_dimension "$tkey")
        if declared_idx2=$(_aoc_lookup_declared_idx "$dim"); then
          dtoken2="${_AOC_DECL_TOKENS[$declared_idx2]}"
          dqual2="${_AOC_DECL_QUALS[$declared_idx2]}"
        else
          dtoken2=""
          dqual2=""
        fi
        case "$dtoken2" in
          FOLD|PASS|ALL_GREEN)
            if _aoc_legit_qualifier "$dqual2"; then
              : # legitimate dedup-SKIP / acknowledged-degraded exemption
            else
              echo "[OUTPUT-CONTRACT] VIOLATION: DIVERGENCE trigger_check=${tkey} dimension=${dim} trigger_verdict=FAILURE declared=${dtoken2}"
              _record_violation_durable "V7 DIVERGENCE trigger_check=${tkey} dimension=${dim} trigger_verdict=FAILURE declared=${dtoken2}" "$cycle_tag" "$from_agent"
              _send_bug_telegram "[audit-output-contract] BUG: pre-gate trigger reported FAILURE on ${tkey} (dimension ${dim}) but this cycle declared ${dtoken2} — DIVERGENCE, review required (not an automatic agent-fault verdict)."
              violations=$((violations + 1))
              [ "$cycle_verdict_token" != "ESCALATE" ] && cycle_verdict_token="DIVERGENCE"
            fi
            ;;
          "")
            echo "[OUTPUT-CONTRACT] VIOLATION: DIVERGENCE trigger_check=${tkey} dimension=${dim} trigger_verdict=FAILURE declared=<none>"
            _record_violation_durable "V7 DIVERGENCE trigger_check=${tkey} dimension=${dim} trigger_verdict=FAILURE declared=<none>" "$cycle_tag" "$from_agent"
            _send_bug_telegram "[audit-output-contract] BUG: pre-gate trigger reported FAILURE on ${tkey} (dimension ${dim}) but this cycle declared no verdict for it at all — DIVERGENCE, review required."
            violations=$((violations + 1))
            [ "$cycle_verdict_token" != "ESCALATE" ] && cycle_verdict_token="DIVERGENCE"
            ;;
          *)
            : # WARN/CRITICAL/ESCALATE/FAILURE/etc — declared verdict already
              # reflects the problem, no divergence
            ;;
        esac
      done <<< "$trig_lines"
    fi
  fi

  if [ "$av_engaged" -eq 1 ]; then
    echo "[OUTPUT-CONTRACT] signals_posted=${signals_posted} | telegram_sent=${telegram_sent} | signal_queue_rows_written=${signal_queue_rows_written} | dashboard_rows=${dashboard_rows} | dedup_skipped=${dedup_skipped} | verdict=${cycle_verdict_token}"
  else
    echo "[OUTPUT-CONTRACT] signals_posted=${signals_posted} | telegram_sent=${telegram_sent} | signal_queue_rows_written=${signal_queue_rows_written} | dashboard_rows=${dashboard_rows} | dedup_skipped=${dedup_skipped}"
  fi

  [ "$violations" -eq 0 ] && return 0 || return 1
}

# ── Standalone CLI mode (only when executed directly, not sourced) ───────────
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_audit_output_contract "$@"
  exit $?
fi
