#!/usr/bin/env bash
# scripts/agents-flow/code-janitor-tick-preflight.sh
#
# Row 11 fix — docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md
# §3/§6 (task FIX-CRON-CODEJANITOR-NO-PRESPAWN-GATE-BOOTS-FULL-SESSION-4X-DAILY).
# Deterministic SKIP-SPAWN/SPAWN pre-gate for the code-janitor every-6h cron, mirroring
# db-integrity-probe.sh's (CADRAT-2) verdict/exit-code shape (0=SKIP-SPAWN, 1=SPAWN,
# FAIL-OPEN) and its atomic tmp-file+mv write pattern — see that script's own header
# for the precedent this one reuses (structure only, not code).
#
# WHAT IT CHECKS (SCOPE-LOCKSTEP — cross-referenced, not asserted-once, per the brief's
# §5.2 auditability contract): the SAME `git diff --name-only HEAD~3..HEAD` command,
# filtered to the SAME `src/**` | `apps/*/src/**` scope, that docs/agents/code-janitor/
# flow/main.md's own CADRAT-3 Pre-Check already documents (that section gates ONLY the
# in-flow Decision-Tree DRY scan; this script moves the identical check pre-boot, so a
# tick with zero src/ changes never boots a subagent at all). If main.md's Pre-Check
# scope ever changes, update BOTH `_git_diff_src_files` below and main.md's own section —
# this repo has already shipped one gate whose scope silently drifted from its
# downstream surface (FIX-AGENTFATHER-KEEP-PRECHECK-GATE-BLIND-TO-3-OF-5-SCAN-SURFACES,
# cited in the owning brief §4/§5.2) — do not repeat that here.
#
# TWO-BRANCH VERDICT:
#   Branch A (src diff non-empty): verdict=SPAWN, reason=diff. The 3 every-scan sweeps
#     (Memory Prune / Notebook Line-Cap / Cold Archive) are NOT run here — main.md's own
#     unconditional "every scan" steps run them fresh once the subagent boots, unchanged
#     from today's behavior. This script does zero mutation on this branch.
#   Branch B (src diff empty): this script itself runs the 3 deterministic sweep
#     scripts directly (the "run them from the prompt/thin outer tick instead of a
#     booted subagent" recommendation) and inspects their own stdout for the 3
#     judgment-needing signals the brief names (§3):
#       1. `SIGNAL-WRITTEN` (memory-prune-sweep.sh) — a NEW docs/signals/*.json payload
#          was created this run. NOTE (correctness fix beyond the brief's literal text):
#          because THIS script is the one running the sweep, a subagent's own later
#          re-run of the identical (idempotent) script will see the payload already on
#          disk and log SIGNAL-SKIP, not SIGNAL-WRITTEN — main.md's existing "skip this
#          row entirely on SIGNAL-SKIP" text would otherwise silently drop the signal
#          row (a real pointer-integrity leak, the exact defect class
#          docs/agents/code-janitor/flow/main.md's own Memory Prune Sweep section
#          already warns about). This script's verdict JSON records payload_ref for
#          this exact case so the CronCreate prompt can carry that fact into the
#          subagent's own launch context (see register-job-code-janitor.md) — no
#          main.md edit needed, no orch-state.json write from THIS script (memory-
#          prune-sweep.sh's own header: ".signal_queue.rows[] is the FLOW's job, not
#          the script's" — that boundary applies here too, this script never writes
#          orch-state.json).
#       2. `reason=safe-fail` (notebook-linecap-sweep.sh / cold-archive-sweep.sh
#          po-decisions leg) — a file neither script could safely auto-prune (no `## `
#          sections, or only 1 left and still over cap). Needs a human/agent look at
#          the corresponding docs/signals/notebook-unparseable-*.json /
#          notebook-single-section-breach-*.json payload.
#       3. Cold Archive's rare (~1x/month) non-trivial leg — proportionality/
#          traceability call per the brief (§3): a comparatively consequential monthly
#          event gets a full traced subagent cycle + notebook entry, not just a terse
#          verdict-file line.
#     If NONE of the 3 fire: verdict=SKIP-SPAWN. Either way, this branch COMMITS
#     whatever the sweep scripts moved/deleted/pruned on disk (git-status DELTA-scoped,
#     see `_git_status_scoped` below — never a bare/broad `git add`) so a SKIP-SPAWN
#     tick never leaves the working tree dirty for the next (up to 6h-later) fire.
#
# VERDICT/EXIT CONTRACT (mirrors db-integrity-probe.sh exactly):
#   stdout: ONE line of valid JSON, FIRST (and only) thing printed — no progress output
#   may precede or follow it (memory: feedback_tick_preflight_verdict_is_first_key_tail_
#   always_drops_it). All sweep/git progress goes to stderr.
#     {"verdict":"SKIP-SPAWN"|"SPAWN","detail":"<reason>","sweeps_ran":true|false,
#      "sweeps":{...},"checked_at":"<ISO-UTC>"}
#   Exit 0 = SKIP-SPAWN. Exit 1 = SPAWN (FAIL-OPEN — never suppress a legitimate run
#   on a probe/script fault: a `bash <sweep>.sh` invocation that itself fails to exec,
#   or the git-diff/git-status commands themselves erroring, both verdict=SPAWN).
#
# WRITES: docs/data/code-janitor-tick-preflight-last-verdict.json (atomic tmp+mv, same
# pattern as db-integrity-probe.sh's snapshot write). Plus, Branch B only, whatever git
# commit(s) the sweep scripts' own file moves require (explicit pathspec only, derived
# from a before/after `git status --porcelain` DELTA scoped to docs/agent-memory/ +
# docs/handoffs/ + the one exact SIGNAL-WRITTEN payload path when present — never a
# directory-wide or bare `git add`, per this session's git-sweep-guard discipline).
#
# Owning cron docs: .claude/commands/crons/cron-code-janitor.md,
# .claude/skills/cron-standalone-team/register-job-code-janitor.md
# Policy SSOT: docs/policies/dev-standards.md § Script Persistence
#
# Env overrides (test seam — code-janitor-tick-preflight.test.sh overrides the
# `_run_*`/`_commit_paths`/`_git_*` functions wholesale after sourcing, same pattern
# dev-team-tick-preflight.test.sh already uses for its `_step55_*` seams — NEVER
# exercised for real against the live repo from the unit tests):
#   REPO_ROOT_OVERRIDE     — repo root (default: resolved from this file's location)
#   VERDICT_FILE_PATH      — verdict output path (default: repo docs/data/
#                            code-janitor-tick-preflight-last-verdict.json)
#
# HARD CONSTRAINT: Branch A does zero mutation. Branch B mutates ONLY via the 3
# existing, already-idempotent, already-self-guarded sweep scripts plus the DELTA-
# scoped commit of exactly what they touched — this script never invents a new
# mutation path of its own.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="${REPO_ROOT_OVERRIDE:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
VERDICT_FILE="${VERDICT_FILE_PATH:-$REPO_ROOT/docs/data/code-janitor-tick-preflight-last-verdict.json}"

MEMORY_PRUNE_SH="$REPO_ROOT/scripts/agents-flow/memory-prune-sweep.sh"
NOTEBOOK_LINECAP_SH="$REPO_ROOT/scripts/agents-flow/notebook-linecap-sweep.sh"
COLD_ARCHIVE_SH="$REPO_ROOT/scripts/agents-flow/cold-archive-sweep.sh"

_now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── Branch-A gate — same command + scope as main.md's own CADRAT-3 Pre-Check ──
# Returns the COUNT of changed files under src/** | apps/*/src/** on stdout (rc=0 on
# success). rc=1 on a git-command fault (FAIL-OPEN caller responsibility).
_git_diff_src_files() {
  local out rc n
  out=$(git -C "$REPO_ROOT" diff --name-only HEAD~3..HEAD 2>/dev/null)
  rc=$?
  [ "$rc" -ne 0 ] && return 1
  n=$(printf '%s\n' "$out" | grep -cE '^(src/|apps/[^/]+/src/)') || n=0
  printf '%s' "$n"
  return 0
}

# ── Scoped git-status snapshot — docs/agent-memory/ + docs/handoffs/ ONLY. Called
# once as "before" and once as "after" the sweep run to compute a DELTA of paths the
# sweeps themselves touched, never a bare/broad add (this session's dirty tree already
# holds unrelated pending changes elsewhere in the repo — a directory-wide add would
# sweep them up). Takes an explicit phase arg ("before"|"after") so the test harness
# can stub each call independently WITHOUT a mutable call-counter — a counter mutated
# inside this function would live only in the command-substitution subshell each `$(...)`
# call forks and never persist back to the caller across two separate invocations; the
# real implementation below ignores $1 (git status is git status either way). ──
_git_status_scoped() {
  git -C "$REPO_ROOT" status --porcelain -- docs/agent-memory/ docs/handoffs/ 2>/dev/null
}

# ── Overridable sweep runners — real impl just shells out; test harness replaces
# these wholesale with canned stdout, matching dev-team-tick-preflight.sh's
# `_step55_run_cold_evict`-style seam. ──
_run_memory_prune_sweep() { bash "$MEMORY_PRUNE_SH" 2>&1; }
_run_notebook_linecap_sweep() { bash "$NOTEBOOK_LINECAP_SH" 2>&1; }
_run_cold_archive_sweep() { bash "$COLD_ARCHIVE_SH" 2>&1; }

# ── Commit exactly the given paths (explicit pathspec, never bare/broad) — no-op if
# the array is empty. Mirrors _step55_git_commit_evict's precedent (dev-team-tick-
# preflight.sh) of a deterministic shell script safely self-committing its own
# mutation, and main.md's own "Commit the sweep's moved/deleted paths with explicit
# pathspecs" instruction — just narrated by this gate instead of a booted subagent. ──
_commit_paths() {
  local paths=("$@")
  [ "${#paths[@]}" -eq 0 ] && return 0
  git -C "$REPO_ROOT" add -- "${paths[@]}" 2>&1 || true
  git -C "$REPO_ROOT" commit -m "chore(memory/code-janitor): pre-gate sweep $(date -u +%Y-%m-%d)" \
    -- "${paths[@]}" >&2 2>&1
  return 0
}

# ── Atomic verdict write — tmp-file + mv rename (mirrors db-integrity-probe.sh). ──
_write_verdict() {
  local json="$1" tmp
  tmp="$(mktemp "${VERDICT_FILE}.tmp.XXXXXX" 2>/dev/null)" || tmp="${VERDICT_FILE}.tmp.$$"
  printf '%s' "$json" > "$tmp" 2>/dev/null
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp" 2>/dev/null
    return 1
  fi
  chmod 644 "$tmp" 2>/dev/null
  mv -f "$tmp" "$VERDICT_FILE" 2>/dev/null
}

# ── Parse a porcelain status DELTA (lines in $2 not present in $1) into a bash array
# of paths (handles simple "XY path" and "XY old -> new" rename-hint lines — takes the
# new-side path for the latter). Echoes NUL-separated so the caller can safely re-array
# even if a path contains spaces. ──
_delta_paths() {
  local before="$1" after="$2"
  comm -13 <(printf '%s\n' "$before" | sort) <(printf '%s\n' "$after" | sort) 2>/dev/null \
    | while IFS= read -r line; do
        [ -z "$line" ] && continue
        local p="${line:3}"
        case "$p" in *" -> "*) p="${p##* -> }" ;; esac
        printf '%s\0' "$p"
      done
}

run_preflight() {
  local ts diff_n rc detail sweeps_json

  ts=$(_now_iso)
  diff_n=$(_git_diff_src_files); rc=$?

  if [ "$rc" -ne 0 ]; then
    echo "[code-janitor-preflight] git diff command FAILED — falling open to SPAWN" >&2
    detail="git diff --name-only HEAD~3..HEAD failed — fail-open"
    _write_verdict "$(jq -nc --arg v "SPAWN" --arg d "$detail" --arg ts "$ts" \
      '{verdict:$v, detail:$d, sweeps_ran:false, sweeps:{}, checked_at:$ts}')"
    printf '%s\n' "$(jq -nc --arg v "SPAWN" --arg d "$detail" --arg ts "$ts" \
      '{verdict:$v, detail:$d, sweeps_ran:false, sweeps:{}, checked_at:$ts}')"
    return 1
  fi

  if [ "${diff_n:-0}" -gt 0 ]; then
    detail="${diff_n} file(s) touched under src/**|apps/*/src/** since HEAD~3 — DRY scan needed (CADRAT-3 Pre-Check scope, main.md)"
    echo "[code-janitor-preflight] Branch A: $detail" >&2
    _write_verdict "$(jq -nc --arg v "SPAWN" --arg d "$detail" --argjson n "$diff_n" --arg ts "$ts" \
      '{verdict:$v, detail:$d, src_diff_files:$n, sweeps_ran:false, sweeps:{}, checked_at:$ts}')"
    printf '%s\n' "$(jq -nc --arg v "SPAWN" --arg d "$detail" --argjson n "$diff_n" --arg ts "$ts" \
      '{verdict:$v, detail:$d, src_diff_files:$n, sweeps_ran:false, sweeps:{}, checked_at:$ts}')"
    return 1
  fi

  # ── Branch B: diff empty — run the 3 sweeps directly, no subagent boot ──
  echo "[code-janitor-preflight] Branch B: src diff empty — running the 3 deterministic sweeps directly" >&2

  local before_status after_status
  before_status=$(_git_status_scoped "before")

  local mp_out nl_out ca_out mp_rc nl_rc ca_rc
  mp_out=$(_run_memory_prune_sweep); mp_rc=$?
  nl_out=$(_run_notebook_linecap_sweep); nl_rc=$?
  ca_out=$(_run_cold_archive_sweep); ca_rc=$?
  printf '%s\n' "$mp_out" "$nl_out" "$ca_out" >&2

  if [ "$mp_rc" -ne 0 ] || [ "$nl_rc" -ne 0 ] || [ "$ca_rc" -ne 0 ]; then
    echo "[code-janitor-preflight] >=1 sweep script exec itself failed (rc mp=$mp_rc nl=$nl_rc ca=$ca_rc) — falling open to SPAWN" >&2
    detail="a sweep script invocation itself failed (non-zero exit from bash, not the script's own internal logic — all 3 scripts always exit 0 by design) — fail-open"
    _write_verdict "$(jq -nc --arg v "SPAWN" --arg d "$detail" --arg ts "$ts" \
      '{verdict:$v, detail:$d, sweeps_ran:true, sweeps:{}, checked_at:$ts}')"
    printf '%s\n' "$(jq -nc --arg v "SPAWN" --arg d "$detail" --arg ts "$ts" \
      '{verdict:$v, detail:$d, sweeps_ran:true, sweeps:{}, checked_at:$ts}')"
    return 1
  fi

  after_status=$(_git_status_scoped "after")

  # ── Signal 1: SIGNAL-WRITTEN (memory-prune-sweep.sh) ──
  local signal_written=false payload_ref="null"
  if printf '%s\n' "$mp_out" | grep -q 'SIGNAL-WRITTEN'; then
    signal_written=true
    payload_ref=$(printf '%s\n' "$mp_out" | grep 'SIGNAL-WRITTEN' | head -1 | sed -n 's/.*path=//p')
    payload_ref="\"$payload_ref\""
  fi

  # ── Signal 2: safe-fail (notebook-linecap-sweep.sh + cold-archive-sweep.sh) ──
  local safe_fail=false
  if printf '%s\n' "$nl_out" "$ca_out" | grep -q 'reason=safe-fail'; then
    safe_fail=true
  fi

  # ── Signal 3: Cold Archive non-trivial monthly leg ──
  local ca_summary handoffs_archived=0 sessions_archived=0 po_decisions_pruned=0 cold_nontrivial=false
  ca_summary=$(printf '%s\n' "$ca_out" | grep '\[cold-archive-sweep\] SUMMARY' | tail -1)
  if [ -n "$ca_summary" ]; then
    # NOTE: [0-9][0-9]* (not [0-9]\+) — BSD/macOS sed's BRE does not support \+ as a
    # GNU extension without -E; this repo's dev host is macOS (Darwin), confirmed live.
    handoffs_archived=$(printf '%s' "$ca_summary" | sed -n 's/.*handoffs_archived=\([0-9][0-9]*\).*/\1/p')
    sessions_archived=$(printf '%s' "$ca_summary" | sed -n 's/.*sessions_archived=\([0-9][0-9]*\).*/\1/p')
    po_decisions_pruned=$(printf '%s' "$ca_summary" | sed -n 's/.*po_decisions_pruned=\([0-9][0-9]*\).*/\1/p')
    : "${handoffs_archived:=0}" "${sessions_archived:=0}" "${po_decisions_pruned:=0}"
    if [ "$handoffs_archived" -gt 0 ] || [ "$sessions_archived" -gt 0 ] || [ "$po_decisions_pruned" -gt 0 ]; then
      cold_nontrivial=true
    fi
  fi

  # ── Commit whatever the sweeps moved (DELTA-scoped, explicit pathspec only) ──
  local commit_paths=()
  while IFS= read -r -d '' p; do
    [ -n "$p" ] && commit_paths+=("$REPO_ROOT/$p")
  done < <(_delta_paths "$before_status" "$after_status")
  if [ "$signal_written" = "true" ] && [ "$payload_ref" != "null" ]; then
    local pr_path
    pr_path=$(printf '%s' "$payload_ref" | tr -d '"')
    [ -n "$pr_path" ] && commit_paths+=("$REPO_ROOT/$pr_path")
  fi
  if [ "${#commit_paths[@]}" -gt 0 ]; then
    echo "[code-janitor-preflight] committing ${#commit_paths[@]} sweep-touched path(s)" >&2
    _commit_paths "${commit_paths[@]}"
  fi

  sweeps_json=$(jq -nc \
    --argjson sw "$signal_written" --argjson pr "$payload_ref" \
    --argjson sf "$safe_fail" \
    --argjson ct "$cold_nontrivial" --arg ha "$handoffs_archived" --arg sa "$sessions_archived" --arg pp "$po_decisions_pruned" \
    --argjson cp "${#commit_paths[@]}" \
    '{memory_prune:{signal_written:$sw, payload_ref:$pr}, notebook_linecap_or_cold_archive:{safe_fail:$sf}, cold_archive:{non_trivial:$ct, handoffs_archived:($ha|tonumber), sessions_archived:($sa|tonumber), po_decisions_pruned:($pp|tonumber)}, committed_paths:$cp}')

  if [ "$signal_written" = "true" ] || [ "$safe_fail" = "true" ] || [ "$cold_nontrivial" = "true" ]; then
    detail="sweep judgment signal fired (signal_written=$signal_written safe_fail=$safe_fail cold_archive_non_trivial=$cold_nontrivial)"
    echo "[code-janitor-preflight] $detail — SPAWN" >&2
    _write_verdict "$(jq -nc --arg v "SPAWN" --arg d "$detail" --argjson sweeps "$sweeps_json" --arg ts "$ts" \
      '{verdict:$v, detail:$d, sweeps_ran:true, sweeps:$sweeps, checked_at:$ts}')"
    printf '%s\n' "$(jq -nc --arg v "SPAWN" --arg d "$detail" --argjson sweeps "$sweeps_json" --arg ts "$ts" \
      '{verdict:$v, detail:$d, sweeps_ran:true, sweeps:$sweeps, checked_at:$ts}')"
    return 1
  fi

  detail="3 deterministic sweeps ran clean — no SIGNAL-WRITTEN, no safe-fail, no non-trivial Cold Archive leg"
  echo "[code-janitor-preflight] $detail — SKIP-SPAWN" >&2
  _write_verdict "$(jq -nc --arg v "SKIP-SPAWN" --arg d "$detail" --argjson sweeps "$sweeps_json" --arg ts "$ts" \
    '{verdict:$v, detail:$d, sweeps_ran:true, sweeps:$sweeps, checked_at:$ts}')"
  printf '%s\n' "$(jq -nc --arg v "SKIP-SPAWN" --arg d "$detail" --argjson sweeps "$sweeps_json" --arg ts "$ts" \
    '{verdict:$v, detail:$d, sweeps_ran:true, sweeps:$sweeps, checked_at:$ts}')"
  return 0
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_preflight
  exit $?
fi
