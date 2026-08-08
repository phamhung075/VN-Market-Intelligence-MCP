#!/usr/bin/env bash
# verify-a30-mcp-memory-reclamation.sh
#
# Discriminator for system-auditor finding A-30 ("mcp-server MemPerc >= 85%").
#
# WHY THIS EXISTS: A-30 fires on a SINGLE MemPerc snapshot. mcp-server runs a GC
# sawtooth against its 3GiB cap (documented normal band 85-93%, peaks to ~97.8%),
# so one snapshot above threshold is NOT evidence of a leak-to-OOM. Distinguishing
# benign sawtooth from genuine loss-of-reclamation requires a multi-probe window
# that spans at least one GC cycle, plus VmHWM vs the cgroup cap / its own prior
# value across the window (see VMHWM below). This was done ad hoc on 07-19 and
# again on 07-21; persisting it stops the third re-derivation and makes the
# verdict reproducible.
#
# TRIPWIRE (escalate to ops on ANY of these):
#   - RestartCount or StartedAt CHANGED between the pre-loop and post-loop reads
#     (container died/restarted DURING the observation window itself)
#   - OOMKilled = true (checked before AND after the loop)
#   - ExitCode==0 with a FinishedAt delta during the window (this fleet's
#     documented memory-death signature never sets OOMKilled — Docker-Desktop
#     VM-plane reap + Bun mmap page-fault, see FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
#     / FIX-MCP-MEMORY-CODE-LEAK)
#   - any single-step sample-to-sample drop >40pp (a discontinuity / crash cliff
#     — NEVER counted as a benign reclamation "dip")
#   - VmHWM advances to a NEW peak during the window AND is pinned at/near the
#     cgroup memory limit (new peaks near the ceiling, not reclamation)
#   - all samples >93% sustained high across the window — loss of reclamation
#     (evaluated on the raw min/max; a lone <=0.5pp jitter dip no longer vetoes
#     this evidence, see FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP)
#   - window MEDIAN >97% — peak sustained across the majority of the window
#     (Nth-percentile/median evaluation, not a single-sample max spike, so one
#     benign ~97.8% GC peak that promptly reclaims does NOT trip this)
# Otherwise: FOLD to FIX-MCP-MEMORY-CODE-LEAK, no mint, no ops route.
#
# ROOT-CAUSE FIX (FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP,
# 2026-08-08 — recurring-failed-fix, same shape first recorded 2026-08-05 in memory
# feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip, NOT fixed
# then; re-fired for real 2026-08-07T05:56:47Z when mcp-server actually died mid-
# window and this script still returned FOLD): the PRE-fix script (a) read
# RestartCount/StartedAt ONCE, before the sample loop, and never re-read them, so
# a death inside the window was structurally invisible; (b) hard-gated BOTH
# percentage-based escalation branches on `dips==0`, where a "dip" was ANY
# sample-to-sample drop >0.5pp — so a 95.88pp crash cliff (the single most severe
# possible sample-to-sample event) counted as "a reclamation dip" and unconditionally
# forced FOLD, and simultaneously dragged min_pct below the >93 tripwire; (c) had
# no discontinuity class distinct from a jitter dip; (d) had no death signature
# other than OOMKilled, which this fleet's memory deaths never set; (e) asserted
# in the emitted narrative that the peak-vs-current memory gap being large proves
# reclamation already occurred — that comparison's left side is a monotonic
# non-decreasing high-water mark, so it is greater-or-equal to the right side TRUE
# BY DEFINITION at all times including during terminal saturation; it proved
# nothing and was not gated on anything, a pure narrative false-negative that a
# human/agent reading the JSON used to ratify FOLD across a real death. All 5
# fixed below. Regression test (replays the exact 2026-08-07T05:56Z 12-sample
# death series + the RestartCount 0->1 delta, asserts verdict==ESCALATE, plus
# negative controls for the benign-sawtooth / single-spike-then-reclaim /
# vmhwm-advancing-but-not-pinned cases so the fix does not itself become a new
# false-positive generator): scripts/audits/verify-a30-mcp-memory-reclamation.test.sh
#
# AMENDMENTS A+B (FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE,
# po_redispatch_ruling_20260808T1445Z, 2026-08-08) — this row's PLANE B port
# (docs/agents/system-auditor/probe.sh) now loops this script over EVERY
# capped container, not just mcp-server, including rag-service at ~1GiB-cap
# headroom as thin as single-digit MiB. Two safety amendments landed with it:
#   A — DELETED the VmRSS exec/field entirely (VMRSS_KB, its UNAVAILABLE
#       default, the "vmrss_kb" JSON key). Grep-verified dead: the only
#       functional consumer anywhere in the repo was the OLD `vmhwm_kb >
#       vmrss_kb` tautology veto (removed by this same task's predecessor,
#       see ROOT-CAUSE FIX above) — nothing reads vmrss_kb post-removal.
#       VmHWM (:before/:after) is KEPT — it feeds the live ESCALATE branch
#       at "VmHWM advancing ... pinned at cap" below.
#   B — the two surviving VmHWM `docker exec` calls are now gated behind a
#       HOST-SIDE headroom pre-check (`_a30_headroom_ok()` below, reusing
#       `_mem_headroom_mib()` + `MEM_FLOOR_MIB=40` already shipped on PLANE A,
#       scripts/agents-flow/auditor-tier1-probe.sh — sourced, not
#       reimplemented, and PLANE A itself is untouched by this task). Below
#       MEM_FLOOR_MIB of headroom AT THE MOMENT OF EACH CALL (recomputed
#       independently before the before-loop AND the after-loop exec — a
#       container's headroom can swing tens of MiB in minutes, see the
#       row's own rag-service evidence), the exec is skipped and the field
#       reads "UNAVAILABLE" — exactly the same value/shape this script
#       already used for a docker-exec that failed for any other reason, so
#       no new code path is needed downstream. This is a HOST-side check
#       (docker stats + docker inspect only) — it allocates nothing inside
#       the target container's own cgroup, so it does not reproduce the
#       exec-into-a-low-headroom-container risk it exists to prevent
#       (architect_exec_safety_note_20260729T1343Z item (2), which forbids
#       an exec-IMPLEMENTED guard, not a host-side one). Losing VmHWM on a
#       thin container costs zero detection: VMHWM_ADVANCING/
#       VMHWM_PINNED_AT_CAP default to "false" below and the verdict falls
#       through cleanly to the exec-free MINP>93 / MEDIANP>97 branches,
#       which already handle 5 of 6 escalate paths.
#
# Owning flow doc: docs/agents/cowork-team/flow/main.md (Step 4.2 signal triage)
# Memory: feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn,
#         feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip
#
# Usage: bash scripts/audits/verify-a30-mcp-memory-reclamation.sh [PROBES] [INTERVAL_SEC]
# Exit code is ALWAYS 0 on a completed run — the verdict is in the JSON on stdout.
# A non-zero exit means the probe itself failed, not that memory is unhealthy.
#
# TEST SEAM: this file is safe to `source` — all logic lives inside
# run_a30_reclamation_check() and the standalone-execution guard at the bottom
# only fires when the file is EXECUTED, not sourced (same idiom as
# db-integrity-mount-drift-check.sh / auditor-tier1-probe.sh). A test harness
# sources this file, overrides `docker` as a shell function (controls
# inspect/exec/stats output deterministically, incl. distinct before-loop vs
# after-loop answers via a call counter), sets CONTAINER/PROBES/INTERVAL, then
# calls run_a30_reclamation_check directly and captures its stdout/rc.

set -uo pipefail

# LOCALE PIN — MANDATORY, do not remove.
# Under a comma-decimal locale (fr_FR etc) awk does BOTH of these silently:
#   1. parses "95.20"+0 as 95      (stops at the '.', which is not its separator)
#   2. prints %.2f as "95,00"      (comma decimal)
# The first corrupts every computed min/max/median; the second emits INVALID
# JSON that still parses visually ("min_pct": 87,00). Caught only because the
# emitted numbers were all *.00. Pin the numeric locale before any float math.
export LC_ALL=C
export LC_NUMERIC=C

CONTAINER="${CONTAINER:-vn-market-intelligence-mcp-mcp-server-1}"
PROBES="${1:-12}"
INTERVAL="${2:-25}"

# Thresholds (named, not re-derived inline at each use site) — DIP_PP is the
# pre-existing benign-jitter boundary; DISCONTINUITY_PP is the fix (c)
# crash-cliff boundary; VMHWM_CAP_PIN_PCT is the fix (e) "pinned at the cap"
# boundary. Plain constants, same style as the pre-existing 93/97 thresholds
# below — no env-override seam, none of the 5 fixes asked for one.
DIP_PP=0.5
DISCONTINUITY_PP=40
VMHWM_CAP_PIN_PCT=90

_is_uint() { case "$1" in ''|*[!0-9]*) return 1 ;; *) return 0 ;; esac; }

# ── Amendment B (po_redispatch_ruling_20260808T1445Z) — reuse, not
# reimplement, PLANE A's already-shipped _mem_headroom_mib() + MEM_FLOOR_MIB.
# `source`-only: scripts/agents-flow/auditor-tier1-probe.sh has its own
# standalone-execution guard at its tail (same idiom this file's own TEST
# SEAM comment documents above), so sourcing it here only pulls in function/
# constant definitions — nothing executes, and PLANE A is not edited by this
# task (qa's 2026-07-28 CHANGES_REQUESTED: "do NOT re-open or re-fix it").
_VERIFY_A30_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
_A30_MEM_LIB="$_VERIFY_A30_SCRIPT_DIR/../agents-flow/auditor-tier1-probe.sh"
if [ -r "$_A30_MEM_LIB" ]; then
  # shellcheck disable=SC1090,SC1091
  source "$_A30_MEM_LIB"
fi
MEM_FLOOR_MIB="${MEM_FLOOR_MIB:-40}"   # defensive fallback if the source above failed

# Host-side (no exec) headroom check for $CONTAINER AT THE MOMENT OF THE
# CALL — cap from `docker inspect -f '{{.HostConfig.Memory}}'`, current usage
# from `docker stats` MemPerc, same arithmetic PLANE A's _mem_headroom_mib()
# already performs. Returns 0 (safe to exec) only when the lib sourced AND a
# real cap was resolved AND headroom >= MEM_FLOOR_MIB; unsafe-by-default
# (rc=1) on ANY missing/unparseable input — never assume safety on a read
# failure (po_redispatch_ruling_20260808T1445Z: "treat headroom as
# unsafe-by-default").
_a30_headroom_ok() {
  command -v _mem_headroom_mib >/dev/null 2>&1 || return 1
  local cap pct hrm
  cap=$(docker inspect -f '{{.HostConfig.Memory}}' "$CONTAINER" 2>/dev/null)
  _is_uint "$cap" || return 1
  [ "$cap" -eq 0 ] && return 1   # uncapped -- no comparable headroom signal, treat unsafe
  pct=$(docker stats --no-stream --format '{{.MemPerc}}' "$CONTAINER" 2>/dev/null | tr -d '%')
  case "${pct:-}" in ''|*[!0-9.]*) return 1 ;; esac
  hrm=$(_mem_headroom_mib "$cap" "$pct")
  awk -v h="${hrm:-0}" -v f="${MEM_FLOOR_MIB:-40}" 'BEGIN{exit !(h >= f)}'
}

run_a30_reclamation_check() {
  command -v docker >/dev/null 2>&1 || { echo '{"error":"docker not on PATH"}'; return 2; }

  if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
    echo "{\"error\":\"container not found: $CONTAINER\"}"; return 2
  fi

  # ── fix (a): capture state BEFORE the sample loop ──────────────────────────
  local OOM_BEFORE RESTARTS_BEFORE STARTED_BEFORE EXITCODE_BEFORE FINISHED_BEFORE MEMLIMIT_BYTES
  OOM_BEFORE=$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  RESTARTS_BEFORE=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  STARTED_BEFORE=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  EXITCODE_BEFORE=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  FINISHED_BEFORE=$(docker inspect -f '{{.State.FinishedAt}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  MEMLIMIT_BYTES=$(docker inspect -f '{{.HostConfig.Memory}}' "$CONTAINER" 2>/dev/null || echo "unknown")

  # fix (e): VmHWM read BEFORE the loop too, so it can be compared to its own
  # prior value across the window — never against VmRSS (that comparison was
  # a tautology: VmHWM >= VmRSS by definition, always — VmRSS itself was
  # deleted entirely, Amendment A, po_redispatch_ruling_20260808T1445Z: dead,
  # zero consumers repo-wide once the tautology veto was removed).
  # Amendment B: gated behind a host-side headroom pre-check — never exec
  # into a container below MEM_FLOOR_MIB headroom at the moment of the call.
  local VMHWM_BEFORE_KB
  if _a30_headroom_ok; then
    VMHWM_BEFORE_KB=$(docker exec "$CONTAINER" sh -c 'grep VmHWM /proc/1/status 2>/dev/null | awk "{print \$2}"' 2>/dev/null || true)
  else
    VMHWM_BEFORE_KB=""
  fi
  [ -z "${VMHWM_BEFORE_KB:-}" ] && VMHWM_BEFORE_KB="UNAVAILABLE"

  local SAMPLES=() i PCT TS
  for i in $(seq 1 "$PROBES"); do
    PCT=$(docker stats --no-stream --format '{{.Name}}\t{{.MemPerc}}' 2>/dev/null \
          | awk -v c="$CONTAINER" -F'\t' '$1==c {gsub(/%/,"",$2); print $2}')
    [ -z "${PCT:-}" ] && PCT="null"
    TS=$(date -u +%H:%M:%SZ)
    SAMPLES+=("{\"n\":$i,\"t\":\"$TS\",\"pct\":$PCT}")
    [ "$i" -lt "$PROBES" ] && sleep "$INTERVAL"
  done

  local JOINED
  JOINED=$(IFS=,; echo "${SAMPLES[*]}")

  # ── fix (a): re-read state AFTER the sample loop — a death/restart mid-window
  # is otherwise structurally invisible to this script no matter what the
  # samples show. ──────────────────────────────────────────────────────────
  local OOM_AFTER RESTARTS_AFTER STARTED_AFTER EXITCODE_AFTER FINISHED_AFTER VMHWM_AFTER_KB
  OOM_AFTER=$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  RESTARTS_AFTER=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  STARTED_AFTER=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  EXITCODE_AFTER=$(docker inspect -f '{{.State.ExitCode}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  FINISHED_AFTER=$(docker inspect -f '{{.State.FinishedAt}}' "$CONTAINER" 2>/dev/null || echo "unknown")
  # Amendment B: independently re-checked here (not reused from the
  # before-loop call) — headroom can swing tens of MiB across the probe
  # window (row evidence: ~60MiB in 8min on rag-service).
  if _a30_headroom_ok; then
    VMHWM_AFTER_KB=$(docker exec "$CONTAINER" sh -c 'grep VmHWM /proc/1/status 2>/dev/null | awk "{print \$2}"' 2>/dev/null || true)
  else
    VMHWM_AFTER_KB=""
  fi
  [ -z "${VMHWM_AFTER_KB:-}" ] && VMHWM_AFTER_KB="UNAVAILABLE"

  local STATE_CHANGED="false"
  if [ "$RESTARTS_BEFORE" != "unknown" ] && [ "$RESTARTS_AFTER" != "unknown" ] && [ "$RESTARTS_BEFORE" != "$RESTARTS_AFTER" ]; then
    STATE_CHANGED="true"
  fi
  if [ "$STARTED_BEFORE" != "unknown" ] && [ "$STARTED_AFTER" != "unknown" ] && [ "$STARTED_BEFORE" != "$STARTED_AFTER" ]; then
    STATE_CHANGED="true"
  fi

  # fix (d): ExitCode==0 with a FinishedAt delta during the window is an
  # accepted death signature alongside OOMKilled==true — this fleet's memory
  # deaths never set OOMKilled (Docker-Desktop VM-plane reap + Bun mmap
  # page-fault, already root-caused on FIX-RAG-SERVICE-CLEAN-EXIT-RESTART-LOOP
  # / FIX-MCP-MEMORY-CODE-LEAK). A FinishedAt that is UNCHANGED between the
  # before/after reads is a STALE pre-existing value (some earlier, unrelated
  # exit) and must NOT be treated as evidence from THIS window.
  local FINISHED_DELTA="false" DEATH_SIGNATURE="false"
  if [ "$FINISHED_BEFORE" != "unknown" ] && [ "$FINISHED_AFTER" != "unknown" ] && [ "$FINISHED_BEFORE" != "$FINISHED_AFTER" ]; then
    FINISHED_DELTA="true"
  fi
  if [ "$FINISHED_DELTA" = "true" ] && [ "$EXITCODE_AFTER" = "0" ]; then
    DEATH_SIGNATURE="true"
  fi

  # fix (e): VmHWM — advancing to a NEW peak during the window (after > before)
  # AND pinned at/near the cgroup memory limit is the escalate signal; VmRSS is
  # never consulted for this comparison (that combination was the tautology).
  local VMHWM_ADVANCING="false" VMHWM_PINNED_AT_CAP="false" MEMLIMIT_KB="UNAVAILABLE"
  if _is_uint "$VMHWM_BEFORE_KB" && _is_uint "$VMHWM_AFTER_KB" \
     && awk -v a="$VMHWM_AFTER_KB" -v b="$VMHWM_BEFORE_KB" 'BEGIN{exit !(a>b)}'; then
    VMHWM_ADVANCING="true"
  fi
  if _is_uint "$MEMLIMIT_BYTES" && [ "$MEMLIMIT_BYTES" -gt 0 ] && _is_uint "$VMHWM_AFTER_KB"; then
    MEMLIMIT_KB=$(( MEMLIMIT_BYTES / 1024 ))
    if awk -v h="$VMHWM_AFTER_KB" -v c="$MEMLIMIT_KB" -v p="$VMHWM_CAP_PIN_PCT" 'BEGIN{exit !(h >= c*p/100)}'; then
      VMHWM_PINNED_AT_CAP="true"
    fi
  fi

  # Analysis: min/max/median, reclamation dips (<=DISCONTINUITY_PP, >DIP_PP
  # sample-to-sample drop), and discontinuities (>DISCONTINUITY_PP drop — fix
  # (c): a crash cliff is classified separately and NEVER counted as a dip).
  local MINP MAXP DIPS DIPDETAIL DISCONT DISCONTDETAIL MEDIANP
  read -r MINP MAXP DIPS DIPDETAIL DISCONT DISCONTDETAIL MEDIANP <<EOF
$(printf '%s\n' "${SAMPLES[@]}" \
  | sed -E 's/.*"pct":([0-9.]+|null).*/\1/' \
  | awk -v dipthresh="$DIP_PP" -v discthresh="$DISCONTINUITY_PP" \
        'BEGIN{min=1e9;max=-1;prev=-1;dips=0;dd="";disc=0;dcd="";n=0}
         $1!="null"{
           v=$1+0
           vals[n]=v; n++
           if(v<min)min=v
           if(v>max)max=v
           if(prev>=0){
             d=prev-v
             if(d>discthresh){disc++; dcd=dcd sprintf("%.2f->%.2f;",prev,v)}
             else if(d>dipthresh){dips++; dd=dd sprintf("%.2f->%.2f;",prev,v)}
           }
           prev=v
         }
         END{
           if(dd=="")dd="none"
           if(dcd=="")dcd="none"
           med=0
           if(n>0){
             for(i=1;i<n;i++){key=vals[i];j=i-1;while(j>=0 && vals[j]>key){vals[j+1]=vals[j];j--};vals[j+1]=key}
             if(n%2==1) med=vals[int(n/2)]; else med=(vals[int(n/2)-1]+vals[int(n/2)])/2
           }
           printf "%.2f %.2f %d %s %d %s %.2f", min, max, dips, dd, disc, dcd, med
         }'
)
EOF

  local VERDICT="FOLD"
  local REASON="benign GC sawtooth or below tripwire"

  if [ "$STATE_CHANGED" = "true" ]; then
    VERDICT="ESCALATE"
    REASON="container died/restarted during window (RestartCount ${RESTARTS_BEFORE}->${RESTARTS_AFTER}, StartedAt ${STARTED_BEFORE}->${STARTED_AFTER})"
  elif [ "$OOM_BEFORE" = "true" ] || [ "$OOM_AFTER" = "true" ]; then
    VERDICT="ESCALATE"
    REASON="OOMKilled=true"
  elif [ "$DEATH_SIGNATURE" = "true" ]; then
    VERDICT="ESCALATE"
    REASON="ExitCode=0 with FinishedAt delta during window (FinishedAt ${FINISHED_BEFORE}->${FINISHED_AFTER}) — accepted fleet memory-death signature, OOMKilled never set for a VM-plane reap"
  elif [ "$DISCONT" -gt 0 ]; then
    VERDICT="ESCALATE"
    REASON="single-step memory discontinuity >${DISCONTINUITY_PP}pp (crash cliff) detected, never counted as a reclamation dip: $DISCONTDETAIL"
  elif [ "$VMHWM_ADVANCING" = "true" ] && [ "$VMHWM_PINNED_AT_CAP" = "true" ]; then
    VERDICT="ESCALATE"
    REASON="VmHWM advancing (${VMHWM_BEFORE_KB}kB->${VMHWM_AFTER_KB}kB) during the window and pinned at/near the cgroup memory limit (${MEMLIMIT_KB}kB cap, >=${VMHWM_CAP_PIN_PCT}%) — new peaks near the ceiling, not reclamation"
  elif awk "BEGIN{exit !($MINP > 93)}"; then
    VERDICT="ESCALATE"
    REASON="all samples >93% sustained high — loss of reclamation (dip-jitter no longer vetoes this evidence; ${DIPS} dip(s) <=${DISCONTINUITY_PP}pp observed, ${DISCONT} discontinuity(ies) observed)"
  elif awk "BEGIN{exit !($MEDIANP > 97)}"; then
    VERDICT="ESCALATE"
    REASON="peak >97% sustained across the window (median ${MEDIANP}%, Nth-percentile/median evaluation — independent of jitter dips, not a single-sample max spike)"
  fi

  cat <<JSON
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "$CONTAINER",
  "window": {"probes": $PROBES, "interval_sec": $INTERVAL, "span_sec": $(( (PROBES-1) * INTERVAL ))},
  "state": {
    "oom_killed_before": "$OOM_BEFORE", "oom_killed_after": "$OOM_AFTER",
    "restart_count_before": "$RESTARTS_BEFORE", "restart_count_after": "$RESTARTS_AFTER",
    "started_at_before": "$STARTED_BEFORE", "started_at_after": "$STARTED_AFTER",
    "exit_code_before": "$EXITCODE_BEFORE", "exit_code_after": "$EXITCODE_AFTER",
    "finished_at_before": "$FINISHED_BEFORE", "finished_at_after": "$FINISHED_AFTER",
    "state_changed_during_window": $STATE_CHANGED
  },
  "vm": {"vmhwm_kb_before": "$VMHWM_BEFORE_KB", "vmhwm_kb_after": "$VMHWM_AFTER_KB",
         "mem_limit_kb": "$MEMLIMIT_KB",
         "vmhwm_advancing_in_window": $VMHWM_ADVANCING, "vmhwm_pinned_at_cap": $VMHWM_PINNED_AT_CAP,
         "note": "VmHWM is a monotonic non-decreasing high-water mark, so a direct VmHWM-vs-VmRSS comparison is true BY DEFINITION at all times and is NOT evidence reclamation occurred (this WAS the FIX-AUDITOR-A30-DISCRIMINATOR-CRASH-CLIFF-SCORED-AS-RECLAMATION-DIP narrative false-negative; vmrss_kb was deleted entirely, Amendment A po_redispatch_ruling_20260808T1445Z -- dead, zero consumers repo-wide once that comparison was removed). Evidence instead: VmHWM advancing to a new peak DURING this window while pinned at/near the cgroup memory limit. UNAVAILABLE means this evidence is missing, not that it is absent -- either a real docker-exec failure, OR (Amendment B) the host-side headroom pre-check found this container below MEM_FLOOR_MIB at the moment of the call and skipped the exec entirely; either way, MINP/MEDIANP below remain exec-free and unaffected."},
  "samples": [$JOINED],
  "analysis": {"min_pct": $MINP, "max_pct": $MAXP, "median_pct": $MEDIANP,
               "reclamation_dips": $DIPS, "dip_detail": "$DIPDETAIL",
               "discontinuities": $DISCONT, "discontinuity_detail": "$DISCONTDETAIL"},
  "verdict": "$VERDICT",
  "reason": "$REASON",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn + feedback_a30_discriminator_crash_cliff_misscored_as_reclamation_dip — escalate on: state changed during window, OOMKilled, ExitCode=0+FinishedAt delta, a >${DISCONTINUITY_PP}pp discontinuity, VmHWM advancing+pinned at cap, >93% sustained (min), or median >97%"
}
JSON
  return 0
}

# ── Standalone execution (only when run directly, not sourced by a test harness) ──
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  run_a30_reclamation_check
  exit $?
fi
