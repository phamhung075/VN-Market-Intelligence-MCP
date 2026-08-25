#!/usr/bin/env bash
# scripts/agents-flow/auditor-tier1-probe.sh
#
# TOKEN-ECONOMY-TICK-PREFLIGHT WU-3 — deterministic Tier-1 shell pre-gate for
# system-auditor's */30min cron tick. PURE SHELL (R9 — does NOT source
# scripts/agents-flow/mcp-call.sh; this gate needs no MCP calls, only
# docker/curl/df/jq, all READ-ONLY). Replaces the LLM-narrated "always spawn
# system-auditor subagent" step in .claude/skills/cron-detect-loop/SKILL.md
# Job 2 with one bash call on the common ALL_GREEN path.
# Spec: docs/agent-memory/decisions/sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-pm.md
#       § WU-3, docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md (R9/R10/R11)
#
# Checks (thresholds mirror docs/agents/system-auditor/flow/tier1-probe.md
# A-01..A-32, narrowed to the two endpoints named in the WU-3 brief —
# mcp-server:3000 and frontend:3001 — the full 5-endpoint sweep + A-20
# pdf-extractor in-container multi-probe stay in the subagent's own
# probe.sh, unchanged, reached only on a non-ALL_GREEN verdict here):
#   1. docker ps health-state sweep — every service in system-map.json
#      .project.infrastructure.docker.host_runtime_set.services[] must show
#      "Up" in `docker ps -a`.
#   2. curl -m6 http://localhost:3000/health == 200
#   3. curl -m6 http://localhost:3001/       == 200
#      (FIX-AUDITOR-TIER1-PROBE-HEALTH-TIMEOUT-TIGHT 2026-07-12: bumped from
#      -m3 to -m6 — live-measured frontend-1 (:3001) baseline response time
#      is 2.0-2.2s with spikes to 3.4s, all server-side/no network delay; a
#      3s timeout left near-zero margin and randomly false-FAILed on
#      ordinary jitter, recurring 3-4x/session, each requiring a re-verify.
#      6s gives real margin without masking a genuinely hung service.)
#   4. df -h / capacity < 85% (WARN boundary reused from tier1-probe.md A-32
#      as this pre-gate's pass/fail line — anything >= 85% defers to the
#      subagent, which applies the full WARN/CRITICAL severity split)
#   5. per-container memory creep — EVERY running container that declares a
#      memory cap (resolved live via `docker inspect ...HostConfig.Memory`,
#      never a hardcoded name list): `docker stats --no-stream` MemPerc
#      < 85% (WARN boundary reused from A-30, same reasoning as #4 — a
#      single-point threshold, since this pure-shell gate has no baseline-
#      diff state store; a true trend/creep detector stays a Tier-2/3 job).
#      Uncapped containers are skipped (their MemPerc is vs total HOST
#      memory, not a per-container headroom signal). A breach already
#      tracked by an open backlog row is suppressed via the SAME
#      acknowledged-degraded ledger mechanism as check 6 below
#      (FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE, 2026-07-25 —
#      closes a demonstrated false-pass where this check, then hardcoded to
#      mcp-server only, reported HEALTHY while rag-service sat at 98.46% of
#      its 768m cap, 12 of 13 containers with zero coverage)
#   6. FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED — vn-market LaunchAgents
#      loaded: every repo-tracked `launchd/*.plist` Label (read off the
#      plist's own <key>Label</key>, never hardcoded — this repo's
#      launchd/ dir IS the SSOT of "what must be loaded") must appear in
#      `launchctl list` output. Closes the gap found in the 2026-07-07
#      cowork-guaranteed-slot-durability brief §2: the OLD fb-daily-firer
#      plist WAS loaded and firing correctly 2026-07-01→07-04, then
#      silently unloaded with nothing detecting it — the ~73h multi-day
#      outage this self-check exists to prevent from recurring.
#
# Verdict JSON (one line, stdout): {verdict, detail, last_healthy_at}, plus,
# on a genuine standalone Tier-1 FAILURE tick only (never when suppressed for
# tier 2/3 — see "SPAWN DEBOUNCE" section below), two ADDITIVE keys:
# {spawn_decision, signature} (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT).
#   verdict ∈ ALL_GREEN|FAILURE.
# Exit code: 0 = ALL_GREEN (heartbeat written, no subagent spawn needed).
#            1 = FAILURE (cron LLM spawns system-auditor subagent, full
#                Tier-1 flow unchanged from today).
# On FAILURE, last_healthy_at reports the PREVIOUS successful heartbeat
# timestamp (or "never") — NOT updated — so the passive-health-masking
# guard in cron-detect-loop/SKILL.md Job 2 can see exactly how stale things
# are on the very next tick, even if this run's own detail line is generic.
#
# Heartbeat (R10 — dedicated data file, NEVER the auditor notebook, to avoid
# a race with a live subagent's mutex-guarded notebook write): on ALL_GREEN
# only, atomically overwrite docs/data/auditor-tier1-last-healthy.json
# (tmp file + mv rename — never a raw `>` truncate-write). If the write
# itself fails, the run is downgraded to FAILURE (never claim green without
# a verified write — "not just process-up"). On FAILURE the file is left
# untouched, so its `last_healthy_at` age keeps growing — this is what lets
# the passive-health-masking guard detect a silently-dead probe (stale
# "green" is not green).
#
# SOLE-WRITER INVARIANT (FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-AGENT-WRITE-TIER1):
# _write_heartbeat() below is the ONLY authorized writer of
# docs/data/auditor-tier1-last-healthy.json, and its shape ({last_healthy_at,
# checks:{6 keys, all "PASS"}}) is the ONLY authorized shape for that file —
# enforced in code (not just prose) by scripts/git-hooks/pre-commit's
# _check_auditor_heartbeat_shapes, which rejects any staged commit that
# deviates. Full spec, cited from both writers: docs/policies/dev-standards.md
# CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER.
#
# Env overrides (test seams — auditor-tier1-probe.test.sh mocks docker/
# curl/df/launchctl as functions after sourcing; these path vars point the
# script at fixtures instead of the real repo files):
#   SYSTEM_MAP_PATH     — system-map.json path (default: repo docs/data/system-map.json)
#   HEARTBEAT_FILE_PATH — heartbeat output path (default: repo docs/data/auditor-tier1-last-healthy.json)
#   LAUNCHD_DIR_PATH    — directory of *.plist files to require-loaded (default: repo launchd/)
#   LAUNCHD_ACK_PATH    — acknowledged-degraded ledger (default: repo
#                         docs/data/auditor-launchd-ack.json) — see Check 6 /
#                         _check_launchd_agents() header comment below
#                         (FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION).
#                         SAME file also carries `.acked_memory[]`, read by
#                         Check 5 / _check_mem_creep() below
#                         (FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE) —
#                         one ledger, two arrays, honouring the identical
#                         mixed-case-never-suppresses + staleness-rule
#                         guarantees for both launchd and memory signatures.
#   LAUNCHD_INSTALLED_DIR_PATH — directory of the LIVE INSTALLED *.plist files
#                         (default: $HOME/Library/LaunchAgents), read by
#                         _launchd_label_expected_disabled() below
#                         (FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-
#                         LAUNCHD-JOB-AS-DEGRADED) — deliberately separate from
#                         LAUNCHD_DIR_PATH: that var points at the REPO copy
#                         (label discovery only, never carries a live Disabled
#                         key); this one points at the INSTALLED copy, the only
#                         place a user's real Disabled=>1 policy choice lives.
#   ORCH_STATE_PATH     — docs/data/orch/orch-state.json path (default: repo
#                         docs/data/orch/orch-state.json) — read by
#                         _task_status_in_orch_state(), shared by both ack
#                         arms above to make the ledger's own STALENESS RULE
#                         load-bearing (FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-
#                         DEAD-TRACKEDBY).
#   TRIGGER_FILE_PATH   — Tier-1 trigger-verdict output path (default: repo
#                         docs/data/auditor-tier1-last-trigger.json) — see
#                         "TRIGGER FILE" section below
#                         (FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-
#                         MACHINE-VERDICT, ARM B).
#   SPAWN_DEBOUNCE_FILE_PATH — per-signature spawn-debounce ledger path
#                         (default: repo docs/data/auditor-tier1-spawn-debounce.json)
#                         — see "SPAWN DEBOUNCE" section below
#                         (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT).
#   SPAWN_DEBOUNCE_WINDOW_MIN — override the debounce window in whole minutes
#                         (default: this script's own
#                         _fresh_threshold_minutes_for_tier(1) == 60min,
#                         2x Tier-1's own 30min cadence — reused, not
#                         reinvented).
#
# TRIGGER FILE (FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-OVERRIDES-MACHINE-
# VERDICT, ARM B, 2026-08-13): every genuine standalone Tier-1 invocation of
# this script (no `--tier=2/3`; see `suppress_heartbeat` gate below, reused
# for this write too — a `--tier=2/3` call's INNER run_probe() call must
# never touch this file, only its own tier-specific heartbeat) atomically
# persists its FULL verdict JSON — `{written_at, fire_tick, verdict, detail,
# checks:{6 keys: PASS|FAIL}}` — to `docs/data/auditor-tier1-last-trigger.json`
# (tmp+mv atomic write, same idiom as `_write_heartbeat()` below), on EVERY
# run regardless of ALL_GREEN/FAILURE. This is a DISTINCT, NEW file — it
# never overloads `docs/data/auditor-tier1-last-healthy.json`, whose sole
# authorized writer/shape contract (FIX-AUDITOR-HEARTBEAT-OUT-OF-CONTRACT-
# AGENT-WRITE-TIER1, `docs/policies/dev-standards.md`
# CANONICAL:SSOT-AUDITOR-HEARTBEAT-SOLE-WRITER) is unrelated and unchanged.
# Purpose: when this pre-gate's own FAILURE spawns the system-auditor
# Tier-1 subagent, that subagent's own `scripts/audit-output-contract.sh
# --trigger-verdict-file` call (§OUTPUT-CONTRACT, `docs/agents/system-
# auditor/flow/main.md`) reads this file to assert its OWN declared verdict
# for each failing check does not silently FOLD/PASS/ALL_GREEN a condition
# THIS pre-gate already found broken — the cross-plane half of that task's
# two-arm fix (Arm A is the in-commit prose-vs-JSON diff, entirely inside
# `audit-output-contract.sh`). This file's own `.checks{}` values are
# already ACK-LEDGER-RECONCILED by the time they land here (a suppressed
# breach reports PASS from `_mem_container_acked`/`_launchd_label_acked`,
# never FAIL) — the consuming script deliberately does not re-parse the ack
# ledger itself; see that script's own header comment for why this makes
# the cross-plane check safe against legitimate acked-suppression ticks by
# construction, not by a second copy of this script's own ack logic.
# SOLE WRITER: `_write_trigger_file()` below, called only from `run_probe()`'s
# own top-level (non-suppressed) invocation. Read-only from every other
# caller — same discipline as the heartbeat file, no shape-guard needed in
# `scripts/git-hooks/pre-commit` yet (this file carries no
# healthy-vs-degraded ambiguity the way the heartbeat filename family does).
#
# SPAWN DEBOUNCE (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT, 2026-08-24):
# debounces the cron's SPAWN decision on a PERSISTING failure signature — it
# NEVER touches the verdict (AC-3, paramount: verdict stays "FAILURE" on
# every failing tick, unconditionally, exactly as before this fix). Full
# design: docs/architecture-briefs/2026-08-24-fix-auditor-tier1-spawn-debounce.md.
# Field/file contract (authoritative, cited from both this script and the
# sibling cron-prompt row that consumes it): docs/policies/dev-standards.md
# CANONICAL:SSOT-AUDITOR-TIER1-SPAWN-DEBOUNCE.
#
# Signature = sorted, "|"-joined "<checkname>[:<sorted,comma-joined UNACKED
# entity names>]" tokens, one per FAILING check this tick — built from a
# clean, prose-free, percentage-free entity side-channel threaded out of
# _check_docker_ps/_check_mem_creep/_check_launchd_agents's own per-entity
# loops (never a regex re-parse of the human `detail` string, which drifts
# every tick on percentages alone and would debounce nothing). The
# `(also acknowledged-degraded, tracked: ...)` clause never enters the
# signature — an acked entity going STALE moves it INTO the unacked breach
# list, which by construction changes the signature and forces an immediate
# SPAWN (AC-4), with zero special-case code.
#
# Ledger: docs/data/auditor-tier1-spawn-debounce.json, `{entries:[{signature,
# first_seen_at, last_seen_at, last_spawn_at, spawn_count,
# window_expires_at}]}`. Read-modify-write via `_spawn_debounce_decision()`,
# called ONLY from `run_probe()`'s own top-level (non-suppressed) FAILURE
# branch — gated behind the SAME `suppress_heartbeat` test already used for
# `_write_trigger_file`/`_write_heartbeat`, so a `--tier=2/3` caller's inner
# `run_probe("suppress_heartbeat")` call never touches this file (provably
# unaffected by construction, no new isolation logic needed).
#
# Window: 60min default (`SPAWN_DEBOUNCE_WINDOW_MIN` above), reusing —
# never reinventing — this script's own "2x own cadence"
# `_fresh_threshold_minutes_for_tier()` convention. Missing/unreadable/
# corrupt ledger, or any read/write/parse fault, is FAIL-OPEN to SPAWN —
# never fail-closed to DEBOUNCED (Auditability Contract, same rule every
# sibling pre-gate script already follows).
#
# HARD CONSTRAINT: every probe below is READ-ONLY (docker ps/stats, curl GET,
# df, launchctl list, jq). This script NEVER runs docker restart/stop/rm/
# exec-with-mutation or launchctl load/unload anywhere, including its own
# test suite (auditor-tier1-probe.test.sh mocks docker/curl/df/launchctl —
# zero real container/launchd calls in tests).
#
# P1-IDLE-AUDITOR-TIER23-SCRIPT (2026-07-04) — `--tier=1|2|3` generalization.
# Default (no flag) or `--tier=1`: 100% unchanged — calls run_probe() directly,
# same {verdict,detail,last_healthy_at} JSON, same exit codes, same default
# heartbeat file. This is the exact pre-existing Tier-1 behavior, untouched.
#
# `--tier=2`/`--tier=3`: routes through run_tiered_probe() instead, which
# reuses run_probe()'s SAME 6 checks (against a tier-specific heartbeat file,
# docs/data/auditor-tier<N>-last-healthy.json, same HEARTBEAT_FILE_PATH
# test-seam override — see _heartbeat_file_for_tier) and additionally
# applies, INSIDE the script, the SAME ALL_GREEN + fresh-heartbeat pre-spawn
# gate that today only exists as LLM narration in cron-detect-loop/SKILL.md
# Job 2 (the "passive-health-masking guard"). This makes the skip-spawn
# decision for Tier-2/3 deterministic and testable — evaluated BEFORE the
# cron would ever launch the system-auditor subagent (not merely before
# commit) — so a no-delta re-invocation short-circuits to SKIP-SPAWN and
# launches nothing.
#
# auditor-signal-loop-P1 (2026-07-16): the tier-specific heartbeat file is now
# read-only from this script's point of view — run_probe()'s write is
# suppressed for tier 2/3 (see run_probe()'s "suppress_heartbeat" arg) and
# freshness is computed from the PRE-EXISTING value read before run_probe()
# runs, never from a timestamp this pass is about to mint itself. Authorship
# of docs/data/auditor-tier<N>-last-healthy.json for tier 2/3 belongs solely
# to the system-auditor subagent's own end-of-cycle write on a REAL completed
# audit (docs/agents/system-auditor/flow/main.md) — this was the fix for the
# self-defeating gate where age was always ~0 because it was computed from a
# value this same pre-gate had just written, making SKIP-SPAWN unconditional
# on green and the "ALL_GREEN + stale heartbeat → SPAWN" branch dead code.
# Output contract for tier 2/3 (unchanged):
#   {tier, checks_verdict: ALL_GREEN|FAILURE (raw 5-check result),
#    verdict: SKIP-SPAWN|SPAWN (the cron-facing decision),
#    detail, last_healthy_at, fresh_threshold_minutes, heartbeat_age_minutes}
# Exit 0 = SKIP-SPAWN (checks_verdict=ALL_GREEN AND heartbeat fresh — no
#   subagent needed this tick). Exit 1 = SPAWN (checks_verdict=FAILURE, OR
#   ALL_GREEN but heartbeat stale/unparseable — cron should launch
#   system-auditor AUDIT_TIER=<N>).
# Freshness threshold = 2x each tier's own cron cadence (mirrors the "~2 tick
# periods" heuristic already in cron-detect-loop/SKILL.md Job 2):
#   tier1=60min (2x30min) — reference only, tier1 path never uses this since
#     it calls run_probe() directly and leaves the freshness gate to the LLM,
#     unchanged.
#   tier2=480min (2x4h), tier3=2880min (2x24h).
# Zero orch-state.json / commit interaction anywhere in this script — it only
# ever prints a verdict line; the caller (cron LLM prompt) decides whether to
# spawn a subagent or commit anything.

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# shellcheck source=./lib/tick-telemetry.sh
source "$SCRIPT_DIR/lib/tick-telemetry.sh"

SYSTEM_MAP="${SYSTEM_MAP_PATH:-$REPO_ROOT/docs/data/system-map.json}"
HEARTBEAT_FILE="${HEARTBEAT_FILE_PATH:-$REPO_ROOT/docs/data/auditor-tier1-last-healthy.json}"
TRIGGER_FILE="${TRIGGER_FILE_PATH:-$REPO_ROOT/docs/data/auditor-tier1-last-trigger.json}"
LAUNCHD_DIR="${LAUNCHD_DIR_PATH:-$REPO_ROOT/launchd}"
LAUNCHD_ACK="${LAUNCHD_ACK_PATH:-$REPO_ROOT/docs/data/auditor-launchd-ack.json}"
# FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED
# — the INSTALLED plist directory (never the repo copy — see header table above).
LAUNCHD_INSTALLED_DIR="${LAUNCHD_INSTALLED_DIR_PATH:-$HOME/Library/LaunchAgents}"
ORCH_STATE="${ORCH_STATE_PATH:-$REPO_ROOT/docs/data/orch/orch-state.json}"
# FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT — see "SPAWN DEBOUNCE"
# header section above for the full contract.
SPAWN_DEBOUNCE_FILE="${SPAWN_DEBOUNCE_FILE_PATH:-$REPO_ROOT/docs/data/auditor-tier1-spawn-debounce.json}"
WARN_PCT=85
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY (2026-07-29): absolute
# headroom floor an acked_memory[] ACK may not swallow — see
# _mem_container_acked's header comment for the full calibration (2x the
# ~20 MiB measured rag-service optimize()-rewrite burst, NOT the cap size).
MEM_FLOOR_MIB=40
# FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE (2026-07-30): sampling
# knobs for _check_mem_creep() — see that function's header comment for the
# live-verified incident (ALL_GREEN flipped FAILURE ~5.5min later, pdf-
# extractor 99.91% MemPerc, a transient peak a single sample missed). Both
# resolved ONCE here (test seam, same pattern as SYSTEM_MAP/HEARTBEAT_FILE/
# etc above — tests override the plain var directly post-source, not the env
# var, for per-case knobs; the test SUITE-wide interval override is exported
# before source so every case stays instant).
MEM_CREEP_SAMPLES="${MEM_CREEP_SAMPLES:-2}"
MEM_CREEP_SAMPLE_INTERVAL_SEC="${MEM_CREEP_SAMPLE_INTERVAL_SEC:-2}"

_now_iso() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

# ── Shared: resolve a tracked_by task_id's CURRENT status against EVERY
# docs/data/orch/orch-state.json task_board lane ─────────────────────────────
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY: makes the ack
# ledger's own STALENESS RULE promise ("remove the entry once its tracked_by
# row reaches DONE_VERIFIED") load-bearing — until this fix, tracked_by was
# read by NOTHING in this script (both _check_mem_creep's acked_memory[] arm
# and _check_launchd_agents's acked[] arm). Used by both.
# Scans backlog/ready/in_progress/review/qa/done/done_verified/archive
# (array lanes) plus active_sprints[].tasks[]/closed_sprints[].tasks[]
# (nested) — the SAME lane set task_board rows can actually occupy.
# Prints the raw status string on a match, or the literal "ABSENT" if the
# id is present in NO lane — both are VALID resolutions (rc=0); the caller
# decides which count as stale (this fix treats ABSENT and DONE_VERIFIED
# as stale, everything else as live).
# FAIL-LOUD (never `2>/dev/null || true`) on an unreadable/unparseable
# orch-state.json — missing file OR a jq parse error both print
# "ORCH_STATE_UNREADABLE: <detail>" and return 2, a THIRD, distinct code so
# callers can tell "verified stale" (rc=0, ABSENT/DONE_VERIFIED) apart from
# "could not verify" (rc=2) — both must refuse to suppress an ACK, but the
# detail line differs so the operator knows which happened.
# Env override (test seam): ORCH_STATE_PATH (default: repo
# docs/data/orch/orch-state.json).
_task_status_in_orch_state() {
  local task_id="$1" out rc
  if [ ! -f "$ORCH_STATE" ]; then
    printf 'ORCH_STATE_UNREADABLE: file not found: %s' "$ORCH_STATE"
    return 2
  fi
  out=$(jq -r --arg tid "$task_id" '
    def lane($k): (.task_board[$k] // []);
    def nested_tasks($k): [(.task_board[$k] // [])[] | (.tasks // [])[]];
    (lane("backlog") + lane("ready") + lane("in_progress") + lane("review")
     + lane("qa") + lane("done") + lane("done_verified") + lane("archive")
     + nested_tasks("active_sprints") + nested_tasks("closed_sprints"))
    | map(select(.id == $tid)) | (.[0].status // "ABSENT")
  ' "$ORCH_STATE" 2>&1)
  rc=$?
  if [ "$rc" -ne 0 ]; then
    printf 'ORCH_STATE_UNREADABLE: jq parse failed on %s: %s' "$ORCH_STATE" "$out"
    return 2
  fi
  printf '%s' "$out"
  return 0
}

# ── Check 1: docker ps health-state sweep (host_runtime_set) ─────────────────
_check_docker_ps() {
  local ps_out services svc line status bad=""
  ps_out=$(docker ps -a --format '{{.Names}}\t{{.Status}}' 2>/dev/null)
  if [ -z "$ps_out" ]; then
    echo "docker ps returned no output (docker unreachable?)"
    return 1
  fi
  services=$(jq -r '.project.infrastructure.docker.host_runtime_set.services[]' "$SYSTEM_MAP" 2>/dev/null)
  if [ -z "$services" ]; then
    echo "host_runtime_set unreadable from $SYSTEM_MAP"
    return 1
  fi
  while IFS= read -r svc; do
    [ -z "$svc" ] && continue
    line=$(printf '%s\n' "$ps_out" | grep -i "$svc" | head -1)
    if [ -z "$line" ]; then
      bad="${bad}${svc}(not-found) "
      # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: bare-name-only
      # entity side-channel for the spawn-debounce signature — see "SPAWN
      # DEBOUNCE" header section. Zero behavior change to $bad/return-code.
      [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'docker_ps\t%s\n' "$svc" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      continue
    fi
    status="${line#*$'\t'}"
    case "$status" in
      Up*) : ;;
      *)
        bad="${bad}${svc}(${status}) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'docker_ps\t%s\n' "$svc" >> "$_SIG_ENTITY_FILE" 2>/dev/null
        ;;
    esac
  done <<< "$services"
  if [ -n "$bad" ]; then
    echo "down/unhealthy: $bad"
    return 1
  fi
  return 0
}

# ── Checks 2/3: health endpoints ──────────────────────────────────────────────
_check_health() {
  local port="$1" path="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 6 "http://localhost:${port}${path}" 2>/dev/null) || code="CURL_ERR"
  [ -z "$code" ] && code="CURL_ERR"
  if [ "$code" != "200" ]; then
    echo "http://localhost:${port}${path} -> HTTP ${code}"
    return 1
  fi
  return 0
}

# ── Check 4: disk headroom (df -h /, Capacity column) ─────────────────────────
_check_disk() {
  local df_out pct
  df_out=$(df -h / 2>/dev/null)
  if [ -z "$df_out" ]; then
    echo "df returned no output"
    return 1
  fi
  pct=$(printf '%s\n' "$df_out" | awk 'NR==2 {print $5}' | tr -d '%')
  if ! [[ "$pct" =~ ^[0-9]+$ ]]; then
    echo "could not parse Capacity% from df output: $(printf '%s' "$df_out" | tr '\n' ' ')"
    return 1
  fi
  if [ "$pct" -ge "$WARN_PCT" ]; then
    echo "disk ${pct}% >= ${WARN_PCT}% threshold (A-32 WARN boundary)"
    return 1
  fi
  return 0
}

# ── Check 5: per-container memory creep (docker stats MemPerc, looped over
# every RUNNING container that declares a memory cap) ────────────────────────
# FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (2026-07-25): the OLD
# check inspected exactly one hardcoded container (mcp-server), leaving the
# other 12 running containers with ZERO memory coverage — demonstrated
# false-pass 2026-07-25 08:30Z (rag-service sat at 94.76%->98.46% of its
# 768m cap while Tier-1 reported "A-30 Memory: 58.63% — PASS" / HEALTHY).
# Scope is now resolved LIVE from the daemon (never a hardcoded name list,
# never docker-compose.yml — config-truth drifts from runtime-truth):
#   docker inspect -f '{{.Name}} {{.HostConfig.Memory}}' $(docker ps -q)
# returns one line per RUNNING container — its name and byte memory cap
# (exactly 0 for uncapped). Uncapped containers are SKIPPED: docker stats
# reports their MemPerc against total HOST memory (mcp-gateway is the one
# live example — 0 cap), not a per-container headroom signal, so it is not
# comparable against WARN_PCT.
#
# Same already-tuned WARN_PCT=85 boundary applies per container (no
# per-container threshold constants — PO DECISION on the owning task
# explicitly rejected static overrides as the same lagging-whitelist
# failure mode already open on FIX-AUDITOR-D4-WHITELIST-DATA-QUALITY-
# ANOMALY-PREFIX). rag-service's legitimately-high steady-state (~94-98% of
# its 768m cap, healthy/serving throughout) is resolved via the SAME
# acknowledged-degraded ledger mechanism _check_launchd_agents() already
# uses below, not via a threshold carve-out: $LAUNCHD_ACK's `.acked_memory[]`
# entries ({container, tracked_by, acked_at}) are matched by case-insensitive
# substring against each breaching container's full name (see
# _mem_container_acked() — same substring-match style _check_docker_ps
# already uses for service-name-within-container-name; safe here because
# this repo's compose service names do not substring-collide with one
# another, e.g. "rag-service" is not a substring of "kinh-dich-service").
# The SAME two guarantees as the launchd arm apply: (1) mixed case never
# suppresses — an unacknowledged breach alongside acked ones still FAILS,
# and names the unacked container(s); (2) STALENESS RULE — remove the entry
# once its tracked_by row reaches DONE_VERIFIED.
#
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY (2026-07-29): the
# above two guarantees were PROSE ONLY — tracked_by was read by nothing, so
# an ACK could never expire, and the ACK predicate was pure pct>=WARN_PCT
# with no absolute floor, so 85.01% and 99.99% suppressed identically. LIVE
# CONSEQUENCE: rag-service sat ACK-suppressed at 97.11% of its 768 MiB cap
# (22.2 MiB free, falling toward 11.4 MiB 15min later) while Tier-1 reported
# ALL_GREEN. _mem_container_acked() below now enforces BOTH: an absolute
# headroom floor (MEM_FLOOR_MIB) the ACK cannot swallow, and a LIVE
# tracked_by resolved against orch-state.json — see its own header comment
# for the full calibration + staleness detail.
#
# FIX-AUDITOR-T1-PREGATE-MEMCREEP-SINGLE-POINT-SAMPLE (2026-07-30): this
# check used to take exactly ONE `docker stats` sample per container and
# gate ALL_GREEN/FAILURE off that single reading. LIVE-VERIFIED CONSEQUENCE:
# a re-run of this exact script ~5.5 minutes after a cited ALL_GREEN result
# flipped to FAILURE — pdf-extractor had hit 99.91% MemPerc, a transient
# memory peak the earlier single-point sample simply landed a few seconds
# clear of and never saw. DISTINCT mechanism from
# FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (that fix widened WHICH
# containers are looked at; this fix widens HOW MANY TIMES each one is
# sampled per invocation) — do not conflate the two, and this task does NOT
# touch pdf-extractor's own memory-management code (that belongs to
# FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM) nor the mcp-server VmHWM
# veto (FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE) — detector
# sampling methodology only.
# Now takes MEM_CREEP_SAMPLES (>=2, default 2) samples per container,
# MEM_CREEP_SAMPLE_INTERVAL_SEC apart (default 2s — both resolved once at
# top-of-script, test seams), and gates off the WORST (max) sample
# observed — a transient peak in ANY one sample forces FAILURE for that
# container even when another sample in the SAME invocation reads
# comfortably under WARN_PCT, so a single lucky/unlucky sample can no
# longer manufacture a false ALL_GREEN. If any sample's `docker stats`
# read is unavailable/unparseable the container is treated as a breach
# (unchanged fail-loud behavior, now applied per-sample not just once).
_check_mem_creep() {
  local ctr_ids inspect_out name mem_cap pct_raw pct
  local breach="" acked="" ack_list=""
  local headroom_mib ack_reason ack_rc
  local samples interval sample_idx worst_pct sample_failed

  samples="$MEM_CREEP_SAMPLES"
  [[ "$samples" =~ ^[0-9]+$ ]] && [ "$samples" -ge 2 ] || samples=2
  interval="$MEM_CREEP_SAMPLE_INTERVAL_SEC"
  [[ "$interval" =~ ^[0-9]+(\.[0-9]+)?$ ]] || interval=2

  ctr_ids=$(docker ps -q 2>/dev/null)
  if [ -z "$ctr_ids" ]; then
    echo "docker ps -q returned no output (docker unreachable?)"
    return 1
  fi

  # ack_list carries tracked_by too now (TSV container\ttracked_by) — see
  # _mem_container_acked's tracked_by-liveness check below.
  [ -f "$LAUNCHD_ACK" ] && ack_list=$(jq -r '.acked_memory[]? | [(.container // ""), (.tracked_by // "")] | @tsv' "$LAUNCHD_ACK" 2>/dev/null)

  # ctr_ids is a newline-separated id list from `docker ps -q`;
  # word-splitting is intended below (one positional arg per id).
  # shellcheck disable=SC2086
  inspect_out=$(docker inspect -f '{{.Name}} {{.HostConfig.Memory}}' $ctr_ids 2>/dev/null)
  if [ -z "$inspect_out" ]; then
    echo "docker inspect returned no output for running containers"
    return 1
  fi

  while read -r name mem_cap; do
    [ -z "$name" ] && continue
    name="${name#/}"
    [[ "$mem_cap" =~ ^[0-9]+$ ]] || continue
    [ "$mem_cap" -eq 0 ] && continue  # uncapped — MemPerc would be vs host mem, not a headroom signal

    worst_pct=""
    sample_failed=0
    for ((sample_idx = 1; sample_idx <= samples; sample_idx++)); do
      pct_raw=$(docker stats --no-stream --format '{{.MemPerc}}' "$name" 2>/dev/null)
      if [ -z "$pct_raw" ]; then
        breach="${breach}${name}(stats-unavailable) "
        # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: bare-name-only
        # entity side-channel — see "SPAWN DEBOUNCE" header section.
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'mem_creep\t%s\n' "$name" >> "$_SIG_ENTITY_FILE" 2>/dev/null
        sample_failed=1
        break
      fi
      pct=$(printf '%s' "$pct_raw" | tr -d '%' | tr -d '\n')
      if ! printf '%s' "$pct" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
        breach="${breach}${name}(unparseable:${pct_raw}) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'mem_creep\t%s\n' "$name" >> "$_SIG_ENTITY_FILE" 2>/dev/null
        sample_failed=1
        break
      fi
      if [ -z "$worst_pct" ] || awk -v p="$pct" -v w="$worst_pct" 'BEGIN{exit !(p>w)}'; then
        worst_pct="$pct"
      fi
      [ "$sample_idx" -lt "$samples" ] && sleep "$interval" 2>/dev/null
    done
    [ "$sample_failed" -eq 1 ] && continue
    pct="$worst_pct"

    if awk -v p="$pct" -v w="$WARN_PCT" 'BEGIN{exit !(p>=w)}'; then
      headroom_mib=$(_mem_headroom_mib "$mem_cap" "$pct")
      ack_reason=$(_mem_container_acked "$name" "$headroom_mib" "$ack_list"); ack_rc=$?
      if [ "$ack_rc" -eq 0 ]; then
        acked="${acked}${name}(${pct}%) "
      elif [ -n "$ack_reason" ]; then
        # Matched a ledger entry but the ACK was disqualified (below-floor
        # or stale tracked_by) — surface pct AND MiB-free so the operator
        # can tell this apart from an ordinary unacknowledged breach.
        breach="${breach}${name}(${pct}%, ${headroom_mib}MiB-free, ${ack_reason}) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'mem_creep\t%s\n' "$name" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      else
        breach="${breach}${name}(${pct}%) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'mem_creep\t%s\n' "$name" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      fi
    fi
  done <<< "$inspect_out"

  if [ -n "$breach" ]; then
    echo "mem >= ${WARN_PCT}% threshold (A-30 WARN boundary, mem-creep gate): ${breach}${acked:+(also acknowledged-degraded, tracked: $acked)}"
    return 1
  fi
  if [ -n "$acked" ]; then
    echo "acknowledged-degraded (suppressed — open backlog fix-task tracks it): $acked"
    return 0
  fi
  return 0
}

# Absolute free MiB for a memory-capped container — cap minus current usage,
# both derived from values THIS check already pulls (mem_cap bytes from
# docker inspect, pct from docker stats MemPerc), so no extra docker call is
# needed. FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY.
# LOCALE PIN — MANDATORY, do not remove (same class already documented in
# scripts/audits/verify-a30-mcp-memory-reclamation.sh): under a comma-decimal
# locale (fr_FR etc) awk's `%.1f` prints "22,2" instead of "22.2", corrupting
# the detail line and any downstream numeric re-parse. Pin before the float
# math, scoped to this one command only (never a global `export` — this
# script is SOURCED by the test harness and must not mutate its locale).
_mem_headroom_mib() {
  local mem_cap="$1" pct="$2"
  LC_ALL=C LC_NUMERIC=C awk -v cap="$mem_cap" -v p="$pct" 'BEGIN{printf "%.1f", (cap * (100 - p) / 100) / 1048576}'
}

# Case-insensitive substring membership test for a container's full name
# against the acked_memory[] ledger (container\ttracked_by TSV lines, from
# _check_mem_creep's ack_list) — PLUS the two load-bearing guarantees
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY adds on top of the
# plain name match FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE shipped:
#
#   (a) HEADROOM FLOOR — even a matched, live-tracked ACK does NOT suppress
#       once absolute headroom drops below MEM_FLOOR_MIB=40. Calibrated
#       against the largest MEASURED single allocation on an in-scope capped
#       container, NOT the cap size (po_floor_calibration_20260729T1135 on
#       this task's board row explicitly forbids sizing off the cap).
#       rag-service's compact() failure path re-fires a full-table
#       optimize() rewrite that emits ~20 MiB fragments (measured,
#       FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP root_cause — 5 largest data
#       files 19.4-20.0 MiB). A floor set AT the burst size would only fire
#       once headroom already equals exactly one burst's worth of room
#       (zero margin left post-warning); MEM_FLOOR_MIB=40 doubles that
#       measured burst so the check goes red with a FULL burst of margin
#       still in hand — "warn BEFORE the allocation that kills it, not
#       after", per the calibration note. pdf-extractor's own burst profile
#       (FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM) is qualitatively
#       LARGER ("100s of MiB to ~1 GiB" per OCR job) but that row is still
#       BACKLOG/plan_only with the mechanism itself undiagnosed — no settled
#       single-allocation number exists yet to fold into a global constant,
#       and pdf-extractor carries no acked_memory entry today (this floor
#       only binds containers that ARE ACK'd), so it does not constrain this
#       value now. If that row lands a number that dwarfs this floor once
#       pdf-extractor is ever ACK'd here, a per-container floor may need
#       re-litigating — deliberately OUT of this row's scope (fix_spec (a):
#       "single global constant — NOT per-container", the same PO ruling
#       that already rejected per-container threshold overrides on the
#       parent FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE task).
#   (b) TRACKED_BY LIVENESS — resolves the matched entry's tracked_by
#       against EVERY orch-state.json task_board lane
#       (_task_status_in_orch_state). Absent from every lane, OR resolved to
#       DONE_VERIFIED, means the ACK is STALE and must NOT suppress — this
#       is the STALENESS RULE the ledger's own _comment_acked_memory has
#       always promised and that nothing enforced until this fix.
#
# Returns 0 (silently, no stdout) ONLY when: name matches AND headroom >=
# floor AND tracked_by resolves to a live, non-DONE_VERIFIED status — the
# suppress path, unchanged from before. Otherwise returns 1 and PRINTS the
# reason (BELOW-FLOOR / STALE-ACK / ORCH-STATE-UNREADABLE) so the caller
# builds an honest breach message instead of silently dropping the
# container. A name with NO ledger match at all returns 1 with NO output
# (unchanged — distinguishes "never acked" from "acked but disqualified").
_mem_container_acked() {
  local name="$1" headroom_mib="$2" list="$3"
  local ctr tb status rc
  [ -z "$list" ] && return 1
  while IFS=$'\t' read -r ctr tb; do
    [ -z "$ctr" ] && continue
    if printf '%s' "$name" | grep -qi -- "$ctr"; then
      if LC_ALL=C LC_NUMERIC=C awk -v h="$headroom_mib" -v f="$MEM_FLOOR_MIB" 'BEGIN{exit !(h < f)}'; then
        printf 'BELOW-FLOOR(floor=%sMiB)' "$MEM_FLOOR_MIB"
        return 1
      fi
      status=$(_task_status_in_orch_state "$tb"); rc=$?
      if [ "$rc" -eq 2 ]; then
        printf 'ORCH-STATE-UNREADABLE:%s' "$status"
        return 1
      fi
      if [ "$status" = "ABSENT" ] || [ "$status" = "DONE_VERIFIED" ]; then
        printf 'STALE-ACK(tracked_by=%s,status=%s)' "${tb:-<none>}" "$status"
        return 1
      fi
      return 0
    fi
  done <<< "$list"
  return 1
}

# ── Check 6: vn-market LaunchAgents loaded (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED) ──
# SSOT = this repo's own launchd/ directory: every *.plist file's own
# <key>Label</key> string is the required label, read directly off the
# file (never a hardcoded label list) — a new plist dropped into launchd/
# is covered automatically, zero script edits, same "no hardcode" pattern
# as the guaranteed-slot firer's matcher-driven design.
#
# OBSOLETE agents (kept in launchd/ for rollback reference only, not loaded in live system):
#   - com.vn-market.socat-bridge — RESOLVED 2026-06-06 per OPERATOR-ALERT-SOCAT-FIX.md
#     api-gateway Docker container now owns port :4000; socat band-aid was temporary fix
#
# FIX-LAUNCHD-PROBE-PRESENCE-ONLY-FALSE-GREEN (2026-07-23): `launchctl list`
# prints three tab-separated columns — PID\tStatus\tLabel — and the OLD
# check only asserted the LABEL substring appeared anywhere in the output,
# discarding the Status column entirely. That let a job that IS loaded but
# crash-looping (non-zero last exit status, e.g. EX_CONFIG=78 for
# com.vn-market.fleet-push, confirmed live for 522 consecutive runs) report
# ALL_GREEN forever — presence != works. Now: match the LABEL column
# EXACTLY (field 3), then require its Status column (field 2) == "0". A
# present-but-unhealthy label fails with BOTH the label and its exit code
# named in the detail line, same as the pre-existing not-loaded failure
# shape. The obsolete-label allow-list below is untouched — those labels
# are skipped before either presence or status is evaluated.
#
# FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION (2026-07-23): the
# check above made every launchd death visible, which surfaced a NEW problem
# — two already-tracked, already-backlogged deaths (com.vn-market.docker-
# events exit-1, com.vn-market.fleet-push exit-78) now fail EVERY tick,
# fail-opening the Tier-1 cron's passive-health guard into spawning a full
# system-auditor subagent ~48x/day that only ever re-confirms the same known
# signature (pure churn, zero new signal). Fix: read the ACK LEDGER
# ($LAUNCHD_ACK, docs/data/auditor-launchd-ack.json) — labels listed there
# are reported as "acknowledged" rather than "bad". If EVERY unhealthy label
# this pass finds is acknowledged, the check still PASSes (rc=0, detail
# names the acked labels for transparency via the `acked` output line —
# see run_probe()'s launchd_note handling). A label NOT in the ledger still
# fails the check even when acked labels are ALSO present (mixed case never
# suppresses) — acknowledgment only ever silences a signature the ledger
# explicitly names, never a fresh one.
#
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY (2026-07-29), fix_spec
# (c): applies the SAME tracked_by-liveness fix as the acked_memory[] arm
# above — until now `.acked[].tracked_by` (3 live entries) was read by
# nothing, so an ACK here could never expire either. _launchd_label_acked()
# below now resolves tracked_by against orch-state.json exactly like
# _mem_container_acked() does (no headroom-floor concept applies here —
# that predicate is memory-specific).
#
# FIX-AUDITOR-TIER1-PROBE-SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-
# DEGRADED (2026-08-25): the not-loaded branch above only ever had two
# dispositions — "bad" or "acked" — with no way to say "the user deliberately
# disarmed this job". That laundered a policy decision (com.vn-market.
# fleet-push, Disabled=>1, disarmed to stop an unattended push of ~224
# unpushed commits) through the ack ledger, which is semantically wrong (the
# ledger's contract is "degraded + open tracked fix"; a deliberate disarm is
# neither) and cannot self-expire the way a real ack can. A THIRD
# disposition, EXPECTED-DISABLED, is now checked BEFORE the ack lookup in the
# not-loaded branch (see _launchd_label_expected_disabled() below): a label
# whose INSTALLED plist carries Disabled=>1, or that is a member of
# `launchctl print-disabled`'s per-user disable database, is reported as
# expected-disabled and never touches `bad`/`acked`/the spawn-debounce
# entity side-channel. Deliberately NOT applied to the loaded-but-bad-exit-
# status branch below: Disabled=>1 can never be loaded by launchd in the
# first place, so that branch is always a live, possibly-crashing process —
# widening this there would risk hiding a real crash, not a policy decision.
_check_launchd_agents() {
  local dir="$LAUNCHD_DIR" plist label lc_out bad="" acked="" expected_disabled="" match_line status
  local obsolete_labels="com.vn-market.socat-bridge"
  local ack_labels="" ack_reason ack_rc disabled_reason disabled_rc
  # ack_labels carries tracked_by too now (TSV label\ttracked_by) — see
  # _launchd_label_acked's tracked_by-liveness check below.
  [ -f "$LAUNCHD_ACK" ] && ack_labels=$(jq -r '.acked[]? | [(.label // ""), (.tracked_by // "")] | @tsv' "$LAUNCHD_ACK" 2>/dev/null)
  if [ ! -d "$dir" ]; then
    echo "launchd source dir not found: $dir"
    return 1
  fi
  lc_out=$(launchctl list 2>/dev/null)
  if [ -z "$lc_out" ]; then
    echo "launchctl list returned no output"
    return 1
  fi
  for plist in "$dir"/*.plist; do
    [ -e "$plist" ] || continue
    label=$(awk '/<key>Label<\/key>/{getline; gsub(/.*<string>|<\/string>.*/,""); print; exit}' "$plist" 2>/dev/null)
    [ -z "$label" ] && continue
    # Skip obsolete agents (kept in repo for rollback reference, not loaded in live system)
    case "$label" in
      $obsolete_labels) continue ;;
    esac
    match_line=$(printf '%s\n' "$lc_out" | awk -F'\t' -v want="$label" '$3 == want {print; exit}')
    if [ -z "$match_line" ]; then
      disabled_reason=$(_launchd_label_expected_disabled "$label"); disabled_rc=$?
      if [ "$disabled_rc" -eq 0 ]; then
        expected_disabled="${expected_disabled}${label}(${disabled_reason}) "
        continue
      fi
      ack_reason=$(_launchd_label_acked "$label" "$ack_labels"); ack_rc=$?
      if [ "$ack_rc" -eq 0 ]; then
        acked="${acked}${label}(not-loaded) "
      elif [ -n "$ack_reason" ]; then
        bad="${bad}${label}(not-loaded, ${ack_reason}) "
        # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: bare-name-only
        # entity side-channel — see "SPAWN DEBOUNCE" header section.
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'launchd_agents\t%s\n' "$label" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      else
        bad="${bad}${label}(not-loaded) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'launchd_agents\t%s\n' "$label" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      fi
      continue
    fi
    status=$(printf '%s' "$match_line" | awk -F'\t' '{print $2}')
    if [ "$status" != "0" ]; then
      ack_reason=$(_launchd_label_acked "$label" "$ack_labels"); ack_rc=$?
      if [ "$ack_rc" -eq 0 ]; then
        acked="${acked}${label}(exit-status:${status}) "
      elif [ -n "$ack_reason" ]; then
        bad="${bad}${label}(exit-status:${status}, ${ack_reason}) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'launchd_agents\t%s\n' "$label" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      else
        bad="${bad}${label}(exit-status:${status}) "
        [ -n "${_SIG_ENTITY_FILE:-}" ] && printf 'launchd_agents\t%s\n' "$label" >> "$_SIG_ENTITY_FILE" 2>/dev/null
      fi
    fi
  done
  if [ -n "$bad" ]; then
    echo "launchd not loaded/unhealthy: ${bad}${acked:+(also acknowledged-degraded, tracked: $acked)}${expected_disabled:+(also expected-disabled, no fix needed: $expected_disabled)}"
    return 1
  fi
  if [ -n "$acked" ] || [ -n "$expected_disabled" ]; then
    echo "${acked:+acknowledged-degraded (suppressed — open backlog fix-task tracks it): $acked}${expected_disabled:+expected-disabled (deliberately disabled by user policy, self-expiring, no tracked_by/staleness): $expected_disabled}"
    return 0
  fi
  return 0
}

# Returns 0 (EXPECTED-DISABLED, PRINTS the disarm mechanism) if the label's
# LIVE INSTALLED plist carries Disabled=>1, OR the label is a member of
# `launchctl print-disabled`'s per-user disable database. Either signal is a
# legitimate, user-initiated disarm mechanism (AC-3, FIX-AUDITOR-TIER1-PROBE-
# SCORES-DELIBERATELY-DISABLED-LAUNCHD-JOB-AS-DEGRADED) — checked
# independently because they are two DIFFERENT mechanisms (plist key vs.
# launchctl's disabled-database), not because either alone is unreliable.
# Reads the INSTALLED plist ($LAUNCHD_INSTALLED_DIR, never the repo copy,
# AC-2) — the repo copy never carries a live Disabled=>1 (verified: the
# repo's com.vn-market.fleet-push.plist has no Disabled key at all; only the
# installed copy under ~/Library/LaunchAgents does, so reading the repo copy
# would silently miss every real disarm). Uses `plutil -p` (never `grep -i
# disabled` against the binary plist — that already produced one false
# negative: absent-key and Disabled=>0 both print nothing to grep, only
# plutil -p's structured `"Disabled" => N` line distinguishes them). Prints
# nothing and returns 1 on no match (same reason/rc convention as
# _launchd_label_acked() above).
_launchd_label_expected_disabled() {
  local label="$1" installed_plist disabled_val uid
  installed_plist="$LAUNCHD_INSTALLED_DIR/${label}.plist"
  if [ -f "$installed_plist" ]; then
    disabled_val=$(plutil -p "$installed_plist" 2>/dev/null \
      | awk -F'=> ' '/"Disabled"/{print $2; exit}')
    if [ "$disabled_val" = "1" ]; then
      printf 'disabled-by-plist'
      return 0
    fi
  fi
  uid=$(id -u)
  if launchctl print-disabled "gui/$uid" 2>/dev/null | grep -q "\"${label}\" => disabled"; then
    printf 'disabled-by-launchctl'
    return 0
  fi
  return 1
}

# Exact-match membership test for a label against the acked[] ledger
# (label\ttracked_by TSV lines, from _check_launchd_agents's ack_labels) —
# never substring, so a label like "com.vn-market.fleet-push-v2" could not
# accidentally match an ack entry for "com.vn-market.fleet-push". PLUS the
# TRACKED_BY LIVENESS guarantee FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-
# TRACKEDBY adds (fix_spec (c)) — see _mem_container_acked's header comment
# for the full rationale, identical mechanism here, no headroom concept.
# Returns 0 (silent) only when label matches AND tracked_by resolves live;
# otherwise returns 1 and PRINTS the reason (STALE-ACK/ORCH-STATE-
# UNREADABLE) on a match, or nothing on no match at all (unchanged).
_launchd_label_acked() {
  local label="$1" list="$2" l tb status rc
  [ -z "$list" ] && return 1
  while IFS=$'\t' read -r l tb; do
    [ -z "$l" ] && continue
    if [ "$l" = "$label" ]; then
      status=$(_task_status_in_orch_state "$tb"); rc=$?
      if [ "$rc" -eq 2 ]; then
        printf 'ORCH-STATE-UNREADABLE:%s' "$status"
        return 1
      fi
      if [ "$status" = "ABSENT" ] || [ "$status" = "DONE_VERIFIED" ]; then
        printf 'STALE-ACK(tracked_by=%s,status=%s)' "${tb:-<none>}" "$status"
        return 1
      fi
      return 0
    fi
  done <<< "$list"
  return 1
}

# ── Trigger-file write helpers (FIX-AUDITOR-VERDICT-TRANSCRIPTION-PROSE-
# OVERRIDES-MACHINE-VERDICT, ARM B) — see "TRIGGER FILE" header comment above
# for the full contract. ──────────────────────────────────────────────────────

# Same */30min boundary arithmetic as docs/agents/system-auditor/flow/
# main.md's own Step 0d Tier=1 FIRE_TICK derivation — computed independently
# here (this script never calls task_claim/MCP tools) so a spawned subagent's
# own FIRE_TICK matches this value as long as both run inside the same
# 30-minute tick window, the same assumption every other cross-cycle
# correlation in this flow already relies on (MARKERS_FILE naming, dedup
# ledger, etc). `10#$min` forces base-10 (a leading-zero minute like "05"
# would otherwise be parsed as an invalid octal literal by bash arithmetic).
_tier1_fire_tick() {
  local min bmin
  min=$(date -u +%M)
  bmin=$(( (10#$min / 30) * 30 ))
  date -u +"%Y-%m-%dT%H:$(printf '%02d' "$bmin")Z"
}

# Atomic tmp-file + mv rename (same idiom as _write_heartbeat below) — writes
# the FULL verdict JSON for THIS tick, unconditional on ALL_GREEN/FAILURE
# (unlike the heartbeat file, which is ALL_GREEN-only). A write failure here
# never downgrades the run_probe() verdict itself (unlike a heartbeat-write
# failure) — this file is a diagnostic/cross-check input for a downstream
# consumer, not a claim this pre-gate makes about system health.
_write_trigger_file() {
  local verdict="$1" detail="$2" checks_json="$3" ts fire_tick tmp
  ts=$(_now_iso)
  fire_tick=$(_tier1_fire_tick)
  tmp="$(mktemp "${TRIGGER_FILE}.tmp.XXXXXX" 2>/dev/null)" || tmp="${TRIGGER_FILE}.tmp.$$"
  jq -n --arg ts "$ts" --arg ft "$fire_tick" --arg v "$verdict" --arg d "$detail" --argjson checks "$checks_json" \
    '{written_at:$ts, fire_tick:$ft, verdict:$v, detail:$d, checks:$checks}' > "$tmp" 2>/dev/null
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp" 2>/dev/null
    return 1
  fi
  chmod 644 "$tmp" 2>/dev/null
  mv -f "$tmp" "$TRIGGER_FILE" 2>/dev/null
}

# ── Heartbeat write — atomic tmp-file + mv rename (R10) ───────────────────────
_write_heartbeat() {
  local ts="$1" checks_json="$2" tmp
  tmp="$(mktemp "${HEARTBEAT_FILE}.tmp.XXXXXX" 2>/dev/null)" || tmp="${HEARTBEAT_FILE}.tmp.$$"
  jq -n --arg ts "$ts" --argjson checks "$checks_json" '{last_healthy_at:$ts, checks:$checks}' > "$tmp" 2>/dev/null
  if [ ! -s "$tmp" ]; then
    rm -f "$tmp" 2>/dev/null
    return 1
  fi
  chmod 644 "$tmp" 2>/dev/null
  mv -f "$tmp" "$HEARTBEAT_FILE" 2>/dev/null
}

# ── Spawn debounce (FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT) ─────────
# See the "SPAWN DEBOUNCE" header section above for the full contract, and
# docs/policies/dev-standards.md CANONICAL:SSOT-AUDITOR-TIER1-SPAWN-DEBOUNCE
# for the field/file contract the sibling cron-prompt row consumes.

# Builds the stable per-tick signature from (a) the bare-entity side-channel
# file populated by _check_docker_ps/_check_mem_creep/_check_launchd_agents
# during THIS tick (checkname<TAB>entity lines — percentages/status
# codes/acked-clause text never reach this file, only bare, UNACKNOWLEDGED
# entity names), and (b) the 6 checks' own PASS/FAIL verdicts for this tick.
# `entity_file` may be empty/missing even for a FAILING entity-bearing check
# (e.g. "docker ps -q returned no output" fires before that check's own
# per-entity loop ever runs) — falls back to the bare checkname alone for
# that check, so an infra-wide fault still yields a stable, comparable
# signature instead of silently dropping the check from the string.
_build_signature() {
  local entity_file="$1" st_docker="$2" st_h3000="$3" st_h3001="$4" st_disk="$5" st_mem="$6" st_launchd="$7"
  local tokens="" chk entities

  [ "$st_h3000" = "FAIL" ] && tokens="${tokens}health_3000"$'\n'
  [ "$st_h3001" = "FAIL" ] && tokens="${tokens}health_3001"$'\n'
  [ "$st_disk" = "FAIL" ] && tokens="${tokens}disk"$'\n'

  for chk in docker_ps mem_creep launchd_agents; do
    case "$chk" in
      docker_ps) [ "$st_docker" = "FAIL" ] || continue ;;
      mem_creep) [ "$st_mem" = "FAIL" ] || continue ;;
      launchd_agents) [ "$st_launchd" = "FAIL" ] || continue ;;
    esac
    entities=""
    if [ -n "$entity_file" ] && [ -f "$entity_file" ]; then
      entities=$(awk -F'\t' -v c="$chk" '$1==c{print $2}' "$entity_file" 2>/dev/null | sort -u | paste -sd, -)
    fi
    if [ -n "$entities" ]; then
      tokens="${tokens}${chk}:${entities}"$'\n'
    else
      tokens="${tokens}${chk}"$'\n'
    fi
  done

  printf '%s' "$tokens" | sed '/^$/d' | sort | paste -sd'|' -
}

# Debounce window in whole minutes. SPAWN_DEBOUNCE_WINDOW_MIN env override,
# default = this exact script's own _fresh_threshold_minutes_for_tier(1)
# (60min, 2x Tier-1's own 30min cadence) — REUSES that existing convention,
# never a second, parallel hardcoded constant (architecture brief §3.2).
_spawn_debounce_window_min() {
  local override="${SPAWN_DEBOUNCE_WINDOW_MIN:-}"
  if [[ "$override" =~ ^[0-9]+$ ]] && [ "$override" -gt 0 ]; then
    printf '%s' "$override"
  else
    _fresh_threshold_minutes_for_tier 1
  fi
}

# Per-signature SPAWN/DEBOUNCED decision + ledger read-modify-write
# (docs/data/auditor-tier1-spawn-debounce.json, atomic tmp+mv write, same
# idiom as _write_heartbeat/_write_trigger_file above). Called ONLY from
# run_probe()'s own top-level (non-suppressed) FAILURE branch — see call
# site. NEVER touches verdict (AC-3, paramount) — this function's return
# value feeds a NEW, additive `spawn_decision` JSON key only.
# FAIL-OPEN on any read/parse/write fault (missing/unreadable/corrupt ledger,
# unwritable dir, malformed date on a hand-edited entry) — never silently
# downgrades to DEBOUNCED on an I/O fault (Auditability Contract, same rule
# every sibling pre-gate script already follows,
# docs/architecture-briefs/2026-08-11-cron-heartbeat-prespawn-gating.md §5.3).
_spawn_debounce_decision() {
  local signature="$1"
  local now window_min ledger_raw combined tmp decision

  now=$(_now_iso)
  window_min=$(_spawn_debounce_window_min)

  ledger_raw='{"entries":[]}'
  if [ -f "$SPAWN_DEBOUNCE_FILE" ] && jq -e . "$SPAWN_DEBOUNCE_FILE" >/dev/null 2>&1; then
    ledger_raw=$(cat "$SPAWN_DEBOUNCE_FILE" 2>/dev/null)
    [ -z "$ledger_raw" ] && ledger_raw='{"entries":[]}'
  fi

  combined=$(printf '%s' "$ledger_raw" | jq -c \
    --arg sig "$signature" --arg now "$now" --argjson win "$window_min" '
    (try (.entries // []) catch []) as $entries
    | ($entries | map(select(.signature == $sig)) | .[0]) as $existing
    | ($now | fromdateiso8601) as $now_epoch
    | (if $existing != null then (try ($existing.window_expires_at | fromdateiso8601) catch null) else null end) as $expires_epoch
    | (if $existing != null and $expires_epoch != null and $now_epoch < $expires_epoch
       then "DEBOUNCED" else "SPAWN" end) as $decision
    | (if $decision == "DEBOUNCED" then
         ($entries | map(if .signature == $sig then .last_seen_at = $now else . end))
       else
         ($entries | map(select(.signature != $sig))) + [{
           signature: $sig,
           first_seen_at: (if $existing != null and ($existing.first_seen_at | type) == "string" then $existing.first_seen_at else $now end),
           last_seen_at: $now,
           last_spawn_at: $now,
           spawn_count: (if $existing != null and ($existing.spawn_count | type) == "number" then ($existing.spawn_count + 1) else 1 end),
           window_expires_at: (($now_epoch + ($win * 60)) | todateiso8601)
         }]
       end) as $new_entries
    | {decision: $decision, ledger: {entries: $new_entries}}
  ' 2>/dev/null)

  if [ -z "$combined" ]; then
    echo "[auditor-tier1-spawn-debounce] ledger read/parse fault on $SPAWN_DEBOUNCE_FILE — failing OPEN to SPAWN" >&2
    printf 'SPAWN'
    return 0
  fi

  decision=$(printf '%s' "$combined" | jq -r '.decision')
  tmp="$(mktemp "${SPAWN_DEBOUNCE_FILE}.tmp.XXXXXX" 2>/dev/null)" || tmp="${SPAWN_DEBOUNCE_FILE}.tmp.$$"
  printf '%s' "$combined" | jq '.ledger' > "$tmp" 2>/dev/null
  if [ -s "$tmp" ]; then
    chmod 644 "$tmp" 2>/dev/null
    mv -f "$tmp" "$SPAWN_DEBOUNCE_FILE" 2>/dev/null
  else
    rm -f "$tmp" 2>/dev/null
    echo "[auditor-tier1-spawn-debounce] ledger write FAILED for $SPAWN_DEBOUNCE_FILE — decision still returned, next tick will fail-open identically" >&2
  fi
  printf '%s' "$decision"
}

# auditor-signal-loop-P1 (2026-07-16): optional first positional arg — pass
# the literal string "suppress_heartbeat" to skip the _write_heartbeat call
# below ENTIRELY (no mktemp/jq/mv attempted at all) instead of attempting-
# then-discarding a write. Used exclusively by run_tiered_probe() for tier
# 2/3, where heartbeat AUTHORSHIP belongs solely to the system-auditor
# subagent's own end-of-cycle write on a completed REAL audit (see
# docs/agents/system-auditor/flow/main.md), never to this deterministic shell
# pre-gate. Tier-1's direct callers (cron LLM, this script's own `--tier=1`/
# no-flag path, and every pre-existing test) pass no argument and are
# completely unaffected — identical write-on-green behavior as before.
# Deliberately NOT implemented as HEARTBEAT_FILE=/dev/null: _write_heartbeat's
# mktemp/jq would try to create /dev/null.tmp.* inside /dev, fail for any
# non-root caller, and silently downgrade every green run to FAILURE→SPAWN —
# the OPPOSITE of the intended effect.
run_probe() {
  local suppress_heartbeat="${1:-}"
  local prev_healthy="" out rc failures="" checks_json ts
  local st_docker="PASS" st_h3000="PASS" st_h3001="PASS" st_disk="PASS" st_mem="PASS" st_launchd="PASS"
  local launchd_note="" mem_note=""
  local entity_sig_file="" signature="" spawn_decision=""

  [ -f "$HEARTBEAT_FILE" ] && prev_healthy=$(jq -r '.last_healthy_at // empty' "$HEARTBEAT_FILE" 2>/dev/null)

  # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: entity side-channel for
  # the spawn-debounce signature — only allocated on a genuine top-level
  # (non-suppressed) call, so a --tier=2/3 caller's inner
  # run_probe("suppress_heartbeat") call never even opens the scratch file
  # (provably unaffected by construction, mirrors the heartbeat/trigger-file
  # suppress gate below). _SIG_ENTITY_FILE is a script-global (no `local`)
  # so the entity-bearing check functions — invoked below via `$(...)`
  # command substitution, always a subshell — can see its value; the
  # ACTUAL entity data crosses the subshell boundary via the FILE itself
  # (a real filesystem object, unaffected by subshell exit), never via the
  # variable, exactly like _next_mem_stub's file-based counter in
  # auditor-tier1-probe.test.sh.
  if [ "$suppress_heartbeat" != "suppress_heartbeat" ]; then
    entity_sig_file="$(mktemp "${TMPDIR:-/tmp}/auditor-tier1-sig.XXXXXX" 2>/dev/null)" || entity_sig_file="/tmp/auditor-tier1-sig.$$"
    : > "$entity_sig_file" 2>/dev/null
  fi
  _SIG_ENTITY_FILE="$entity_sig_file"

  out=$(_check_docker_ps 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_docker="FAIL"; failures="${failures}docker_ps: ${out}; "; }

  out=$(_check_health 3000 /health 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_h3000="FAIL"; failures="${failures}health_3000: ${out}; "; }

  out=$(_check_health 3001 / 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_h3001="FAIL"; failures="${failures}health_3001: ${out}; "; }

  out=$(_check_disk 2>&1); rc=$?
  [ $rc -ne 0 ] && { st_disk="FAIL"; failures="${failures}disk: ${out}; "; }

  out=$(_check_mem_creep 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    st_mem="FAIL"; failures="${failures}mem_creep: ${out}; "
  elif [ -n "$out" ]; then
    # FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE: mirrors the launchd
    # arm above — check PASSED (rc=0) but has an acknowledged-degraded note
    # to surface. st_mem stays "PASS" (no schema drift); the note is
    # appended to the ALL_GREEN detail line below for transparency.
    mem_note="$out"
  fi

  out=$(_check_launchd_agents 2>&1); rc=$?
  if [ $rc -ne 0 ]; then
    st_launchd="FAIL"; failures="${failures}launchd_agents: ${out}; "
  elif [ -n "$out" ]; then
    # FIX-AUDITOR-TIER1-PROBE-ACKED-LAUNCHD-DEATH-SUPPRESSION: check PASSED
    # (rc=0) but has something to say — an acknowledged-degraded note. Keep
    # st_launchd="PASS" (checks_json stays the pre-existing PASS/FAIL enum,
    # no schema drift) and surface the note in the ALL_GREEN detail line
    # below for transparency instead — "ALL_GREEN verdict, honest detail".
    launchd_note="$out"
  fi

  checks_json=$(jq -n --arg d "$st_docker" --arg h1 "$st_h3000" --arg h2 "$st_h3001" --arg dk "$st_disk" --arg mc "$st_mem" --arg ld "$st_launchd" \
    '{docker_ps:$d, health_3000:$h1, health_3001:$h2, disk:$dk, mem_creep:$mc, launchd_agents:$ld}')

  if [ -z "$failures" ]; then
    ts=$(_now_iso)
    if [ "$suppress_heartbeat" != "suppress_heartbeat" ]; then
      if ! _write_heartbeat "$ts" "$checks_json"; then
        rm -f "$entity_sig_file" 2>/dev/null
        # Deliberately NO spawn_decision/signature here — this is a rare
        # heartbeat-WRITE I/O fault, not a real checks_verdict failure, and
        # the sibling cron-prompt row's own contract already fail-opens to
        # SPAWN on a missing spawn_decision field, which is exactly the
        # right behavior for this pathological path (never silently
        # suppress on a local-disk write fault).
        jq -n --arg v "FAILURE" \
          --arg d "all 6 checks passed but heartbeat write FAILED ($HEARTBEAT_FILE) — never claim green without a verified write" \
          --arg lh "${prev_healthy:-never}" \
          '{verdict:$v, detail:$d, last_healthy_at:$lh}'
        return 1
      fi
    fi
    local green_detail="all 6 checks passed (docker_ps, health_3000, health_3001, disk, mem_creep, launchd_agents)"
    [ -n "$mem_note" ] && green_detail="${green_detail} — ${mem_note}"
    [ -n "$launchd_note" ] && green_detail="${green_detail} — ${launchd_note}"
    # ARM B trigger-file write — see "TRIGGER FILE" header comment. Same
    # suppress gate as the heartbeat write above: a --tier=2/3 caller's inner
    # run_probe() invocation must never touch the Tier-1 trigger file either.
    [ "$suppress_heartbeat" != "suppress_heartbeat" ] && _write_trigger_file "ALL_GREEN" "$green_detail" "$checks_json"
    rm -f "$entity_sig_file" 2>/dev/null
    jq -n --arg v "ALL_GREEN" \
      --arg d "$green_detail" \
      --arg lh "$ts" \
      '{verdict:$v, detail:$d, last_healthy_at:$lh}'
    return 0
  fi

  [ "$suppress_heartbeat" != "suppress_heartbeat" ] && _write_trigger_file "FAILURE" "$failures" "$checks_json"
  # FIX-AUDITOR-TIER1-SPAWN-DEBOUNCE-1-PROBE-SCRIPT: additive spawn_decision/
  # signature keys, ONLY on a genuine top-level (non-suppressed) FAILURE —
  # AC-3 paramount, verdict below is UNCONDITIONALLY "FAILURE" either way;
  # this debounces the cron's SPAWN decision, never the verdict.
  if [ "$suppress_heartbeat" != "suppress_heartbeat" ]; then
    signature=$(_build_signature "$entity_sig_file" "$st_docker" "$st_h3000" "$st_h3001" "$st_disk" "$st_mem" "$st_launchd")
    spawn_decision=$(_spawn_debounce_decision "$signature")
    rm -f "$entity_sig_file" 2>/dev/null
    jq -n --arg v "FAILURE" --arg d "$failures" --arg lh "${prev_healthy:-never}" \
      --arg sd "$spawn_decision" --arg sig "$signature" \
      '{verdict:$v, detail:$d, last_healthy_at:$lh, spawn_decision:$sd, signature:$sig}'
  else
    jq -n --arg v "FAILURE" --arg d "$failures" --arg lh "${prev_healthy:-never}" \
      '{verdict:$v, detail:$d, last_healthy_at:$lh}'
  fi
  return 1
}

# ── Tier 2/3 generalization (P1-IDLE-AUDITOR-TIER23-SCRIPT) ───────────────────

# Per-tier heartbeat file path. Respects the SAME HEARTBEAT_FILE_PATH
# test-seam override run_probe() already honors (so a caller/test pointing
# HEARTBEAT_FILE_PATH at a fixture affects tier 2/3 exactly like tier 1
# already does); absent an override, each tier gets its own file so Tier-1's
# */30min heartbeat is never confused with Tier-2's 4h or Tier-3's daily one.
_heartbeat_file_for_tier() {
  local tier="$1"
  if [ -n "${HEARTBEAT_FILE_PATH:-}" ]; then
    printf '%s' "$HEARTBEAT_FILE_PATH"
  else
    printf '%s' "$REPO_ROOT/docs/data/auditor-tier${tier}-last-healthy.json"
  fi
}

# 2x each tier's own cron cadence (mirrors the "~2 tick periods" heuristic
# already used for Tier-1 in cron-detect-loop/SKILL.md Job 2).
_fresh_threshold_minutes_for_tier() {
  case "$1" in
    1) echo 60 ;;
    2) echo 480 ;;
    3) echo 2880 ;;
    *) return 1 ;;
  esac
}

# ISO8601 UTC (YYYY-MM-DDTHH:MM:SSZ) -> epoch seconds. Tries GNU `date -d`
# first (Linux/containers), falls back to BSD `date -j -f` (macOS) — same
# GNU/BSD dual-path pattern already used in dev-team-tick-preflight.test.sh.
_iso_to_epoch() {
  local iso="$1" epoch
  [ -z "$iso" ] && return 1
  epoch=$(date -u -d "$iso" +%s 2>/dev/null) && { printf '%s' "$epoch"; return 0; }
  epoch=$(date -u -j -f "%Y-%m-%dT%H:%M:%SZ" "$iso" +%s 2>/dev/null) && { printf '%s' "$epoch"; return 0; }
  return 1
}

# Age of an ISO8601 timestamp in whole minutes vs now. Prints nothing (and
# returns 1) for "never"/empty/unparseable input — caller treats that as
# stale (never claim fresh without a parseable prior heartbeat).
_heartbeat_age_minutes() {
  local iso="$1" epoch now
  if [ -z "$iso" ] || [ "$iso" = "never" ]; then
    return 1
  fi
  epoch=$(_iso_to_epoch "$iso") || return 1
  now=$(date -u +%s)
  echo $(( (now - epoch) / 60 ))
}

# Tier 2/3 entry point: reuses run_probe()'s SAME 6 checks (against a
# tier-specific file — see _heartbeat_file_for_tier), then applies the
# ALL_GREEN + fresh-heartbeat pre-spawn gate INSIDE the script (Tier-1 leaves
# this to the cron LLM narration in cron-detect-loop/SKILL.md Job 2; here it
# is deterministic and testable). `local HEARTBEAT_FILE=` below shadows the
# global for the duration of this call ONLY — bash dynamic scoping means
# run_probe() (called from inside this function) sees the tier-specific
# path, while every other caller of run_probe() (the tier-1 path) is
# completely unaffected.
#
# auditor-signal-loop-P1 (2026-07-16, closes auditor-signal-loop-I1): the
# heartbeat file is READ-ONLY from this function's perspective. Freshness is
# computed from the PRE-EXISTING last_healthy_at read BEFORE run_probe() runs
# (captured into pre_existing_lh below); run_probe() itself is called with
# "suppress_heartbeat" so it never writes this file for tier 2/3 — only the
# system-auditor subagent's own end-of-cycle write (on a REAL completed
# audit) ever updates docs/data/auditor-tier<N>-last-healthy.json. Previously
# run_probe() wrote a fresh timestamp on every green pass AND that same
# just-written value was used to compute age — age was always ~0, making
# SKIP-SPAWN unconditional on green and the "ALL_GREEN + stale heartbeat →
# SPAWN" branch below unreachable dead code. That branch is now reachable:
# real shell checks can be ALL_GREEN while the pre-existing heartbeat is
# stale (no real audit ran recently), correctly forcing SPAWN.
run_tiered_probe() {
  local tier="$1"
  local threshold_min heartbeat_path inner_out inner_rc
  local checks_verdict detail age_min="" spawn_verdict exit_code age_json
  local pre_existing_lh=""

  threshold_min=$(_fresh_threshold_minutes_for_tier "$tier") || {
    jq -n --arg d "invalid --tier value (must be 1, 2, or 3): $tier" \
      '{verdict:"ERROR", detail:$d, last_healthy_at:"never"}'
    return 2
  }

  heartbeat_path="$(_heartbeat_file_for_tier "$tier")"
  local HEARTBEAT_FILE="$heartbeat_path"

  # (a) Read the PRE-EXISTING heartbeat BEFORE calling run_probe() — this is
  # the last REAL audit's timestamp, never a value this pass is about to mint.
  [ -f "$heartbeat_path" ] && pre_existing_lh=$(jq -r '.last_healthy_at // empty' "$heartbeat_path" 2>/dev/null)

  # (b) Shell checks still run in full (checks_verdict reflects them exactly
  # as before); "suppress_heartbeat" stops the inner call from writing
  # $HEARTBEAT_FILE — see run_probe()'s header comment for why this is an
  # explicit flag arg, not HEARTBEAT_FILE=/dev/null.
  inner_out=$(run_probe "suppress_heartbeat"); inner_rc=$?
  checks_verdict=$(printf '%s' "$inner_out" | jq -r '.verdict // empty' 2>/dev/null)
  detail=$(printf '%s' "$inner_out" | jq -r '.detail // empty' 2>/dev/null)

  if [ "$checks_verdict" = "ALL_GREEN" ]; then
    age_min=$(_heartbeat_age_minutes "$pre_existing_lh") || age_min=""
    if [[ "$age_min" =~ ^[0-9]+$ ]] && [ "$age_min" -le "$threshold_min" ]; then
      spawn_verdict="SKIP-SPAWN"; exit_code=0
    else
      spawn_verdict="SPAWN"; exit_code=1
    fi
  else
    spawn_verdict="SPAWN"; exit_code=1
  fi

  if [[ "$age_min" =~ ^[0-9]+$ ]]; then
    age_json="$age_min"
  else
    age_json="null"
  fi

  jq -n --argjson tier "$tier" --arg checks_verdict "${checks_verdict:-FAILURE}" --arg verdict "$spawn_verdict" \
    --arg detail "$detail" --arg lh "${pre_existing_lh:-never}" --argjson threshold "$threshold_min" --argjson age "$age_json" \
    '{tier:$tier, checks_verdict:$checks_verdict, verdict:$verdict, detail:$detail, last_healthy_at:$lh, fresh_threshold_minutes:$threshold, heartbeat_age_minutes:$age}'
  return $exit_code
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
# TICK-WU-3: tt_capture_and_log wraps EACH branch's own real-stdout call —
# Tier-1 wraps run_probe (no args), Tier-2/3 wraps run_tiered_probe "$TIER".
# This is the extracted choke point (architect ratification, sprint-TICK-
# PREFLIGHT-USAGE-INSTRUMENTATION-architect.md): both branches print directly
# to real stdout today, so both get their own tt_capture_and_log call. The
# inner run_probe() call INSIDE run_tiered_probe() (captured into a variable,
# never reaching real stdout) is NEVER wrapped — wrapping it would double-log
# every Tier-2/3 invocation. Invalid-tier branch deliberately left unwrapped
# (R5 — cron-misconfiguration path, never occurs in production). Purely
# additive telemetry: stdout/exit code/lock behavior are unchanged (AC-3/AC-6/
# AC-7) — see scripts/agents-flow/lib/tick-telemetry.sh.
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  TIER=1
  for arg in "$@"; do
    case "$arg" in
      --tier=*) TIER="${arg#--tier=}" ;;
      *) : ;; # forward-compatible: ignore unrecognized args
    esac
  done

  case "$TIER" in
    1)
      tt_capture_and_log "auditor-tier1-probe.sh" run_probe
      exit $?
      ;;
    2|3)
      tt_capture_and_log "auditor-tier1-probe.sh" run_tiered_probe "$TIER"
      exit $?
      ;;
    *)
      jq -n --arg d "invalid --tier value (must be 1, 2, or 3): $TIER" \
        '{verdict:"ERROR", detail:$d, last_healthy_at:"never"}'
      exit 2
      ;;
  esac
fi
