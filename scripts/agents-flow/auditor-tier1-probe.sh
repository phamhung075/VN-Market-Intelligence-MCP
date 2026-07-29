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
# Verdict JSON (one line, stdout): {verdict, detail, last_healthy_at}.
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
#   ORCH_STATE_PATH     — docs/data/orch/orch-state.json path (default: repo
#                         docs/data/orch/orch-state.json) — read by
#                         _task_status_in_orch_state(), shared by both ack
#                         arms above to make the ledger's own STALENESS RULE
#                         load-bearing (FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-
#                         DEAD-TRACKEDBY).
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
SYSTEM_MAP="${SYSTEM_MAP_PATH:-$REPO_ROOT/docs/data/system-map.json}"
HEARTBEAT_FILE="${HEARTBEAT_FILE_PATH:-$REPO_ROOT/docs/data/auditor-tier1-last-healthy.json}"
LAUNCHD_DIR="${LAUNCHD_DIR_PATH:-$REPO_ROOT/launchd}"
LAUNCHD_ACK="${LAUNCHD_ACK_PATH:-$REPO_ROOT/docs/data/auditor-launchd-ack.json}"
ORCH_STATE="${ORCH_STATE_PATH:-$REPO_ROOT/docs/data/orch/orch-state.json}"
WARN_PCT=85
# FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY (2026-07-29): absolute
# headroom floor an acked_memory[] ACK may not swallow — see
# _mem_container_acked's header comment for the full calibration (2x the
# ~20 MiB measured rag-service optimize()-rewrite burst, NOT the cap size).
MEM_FLOOR_MIB=40

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
      continue
    fi
    status="${line#*$'\t'}"
    case "$status" in
      Up*) : ;;
      *) bad="${bad}${svc}(${status}) " ;;
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
_check_mem_creep() {
  local ctr_ids inspect_out name mem_cap pct_raw pct
  local breach="" acked="" ack_list=""
  local headroom_mib ack_reason ack_rc

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

    pct_raw=$(docker stats --no-stream --format '{{.MemPerc}}' "$name" 2>/dev/null)
    if [ -z "$pct_raw" ]; then
      breach="${breach}${name}(stats-unavailable) "
      continue
    fi
    pct=$(printf '%s' "$pct_raw" | tr -d '%' | tr -d '\n')
    if ! printf '%s' "$pct" | grep -Eq '^[0-9]+(\.[0-9]+)?$'; then
      breach="${breach}${name}(unparseable:${pct_raw}) "
      continue
    fi
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
      else
        breach="${breach}${name}(${pct}%) "
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
_check_launchd_agents() {
  local dir="$LAUNCHD_DIR" plist label lc_out bad="" acked="" match_line status
  local obsolete_labels="com.vn-market.socat-bridge"
  local ack_labels="" ack_reason ack_rc
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
      ack_reason=$(_launchd_label_acked "$label" "$ack_labels"); ack_rc=$?
      if [ "$ack_rc" -eq 0 ]; then
        acked="${acked}${label}(not-loaded) "
      elif [ -n "$ack_reason" ]; then
        bad="${bad}${label}(not-loaded, ${ack_reason}) "
      else
        bad="${bad}${label}(not-loaded) "
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
      else
        bad="${bad}${label}(exit-status:${status}) "
      fi
    fi
  done
  if [ -n "$bad" ]; then
    echo "launchd not loaded/unhealthy: ${bad}${acked:+(also acknowledged-degraded, tracked: $acked)}"
    return 1
  fi
  if [ -n "$acked" ]; then
    echo "acknowledged-degraded (suppressed — open backlog fix-task tracks it): $acked"
    return 0
  fi
  return 0
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

  [ -f "$HEARTBEAT_FILE" ] && prev_healthy=$(jq -r '.last_healthy_at // empty' "$HEARTBEAT_FILE" 2>/dev/null)

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
    jq -n --arg v "ALL_GREEN" \
      --arg d "$green_detail" \
      --arg lh "$ts" \
      '{verdict:$v, detail:$d, last_healthy_at:$lh}'
    return 0
  fi

  jq -n --arg v "FAILURE" --arg d "$failures" --arg lh "${prev_healthy:-never}" \
    '{verdict:$v, detail:$d, last_healthy_at:$lh}'
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
      run_probe
      exit $?
      ;;
    2|3)
      run_tiered_probe "$TIER"
      exit $?
      ;;
    *)
      jq -n --arg d "invalid --tier value (must be 1, 2, or 3): $TIER" \
        '{verdict:"ERROR", detail:$d, last_healthy_at:"never"}'
      exit 2
      ;;
  esac
fi
