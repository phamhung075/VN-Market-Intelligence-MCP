#!/usr/bin/env bash
# verify-a30-mcp-memory-reclamation.sh
#
# Discriminator for system-auditor finding A-30 ("mcp-server MemPerc >= 85%").
#
# WHY THIS EXISTS: A-30 fires on a SINGLE MemPerc snapshot. mcp-server runs a GC
# sawtooth against its 3GiB cap (documented normal band 85-93%, peaks to ~97.8%),
# so one snapshot above threshold is NOT evidence of a leak-to-OOM. Distinguishing
# benign sawtooth from genuine loss-of-reclamation requires a multi-probe window
# that spans at least one GC cycle, plus VmHWM-vs-current (which shows whether a
# reclamation already happened). This was done ad hoc on 07-19 and again on 07-21;
# persisting it stops the third re-derivation and makes the verdict reproducible.
#
# TRIPWIRE (escalate to ops ONLY if one of these):
#   - OOMKilled = true
#   - all samples > 93% with NO downward dip  (loss of reclamation)
#   - peak > 97% sustained with no reclaim
# Otherwise: FOLD to FIX-MCP-MEMORY-CODE-LEAK, no mint, no ops route.
#
# Owning flow doc: docs/agents/cowork-team/flow/main.md (Step 4.2 signal triage)
# Memory: feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn
#
# Usage: bash scripts/audits/verify-a30-mcp-memory-reclamation.sh [PROBES] [INTERVAL_SEC]
# Exit code is ALWAYS 0 on a completed run — the verdict is in the JSON on stdout.
# A non-zero exit means the probe itself failed, not that memory is unhealthy.

set -uo pipefail

# LOCALE PIN — MANDATORY, do not remove.
# Under a comma-decimal locale (fr_FR etc) awk does BOTH of these silently:
#   1. parses "95.20"+0 as 95      (stops at the '.', which is not its separator)
#   2. prints %.2f as "95,00"      (comma decimal)
# The first corrupts every computed min/max; the second emits INVALID JSON that
# still parses visually ("min_pct": 87,00). Caught only because the emitted
# numbers were all *.00. Pin the numeric locale before any float math.
export LC_ALL=C
export LC_NUMERIC=C

CONTAINER="${CONTAINER:-vn-market-intelligence-mcp-mcp-server-1}"
PROBES="${1:-12}"
INTERVAL="${2:-25}"

command -v docker >/dev/null 2>&1 || { echo '{"error":"docker not on PATH"}'; exit 2; }

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "{\"error\":\"container not found: $CONTAINER\"}"; exit 2
fi

OOM=$(docker inspect -f '{{.State.OOMKilled}}' "$CONTAINER" 2>/dev/null || echo "unknown")
RESTARTS=$(docker inspect -f '{{.RestartCount}}' "$CONTAINER" 2>/dev/null || echo "unknown")
STARTED=$(docker inspect -f '{{.State.StartedAt}}' "$CONTAINER" 2>/dev/null || echo "unknown")

# VmHWM (peak RSS) vs VmRSS (current). HWM >> RSS proves reclamation already occurred.
# Report UNAVAILABLE loudly rather than silently omitting — absence of this field
# changes how the verdict should be read.
VMHWM_KB=$(docker exec "$CONTAINER" sh -c 'grep VmHWM /proc/1/status 2>/dev/null | awk "{print \$2}"' 2>/dev/null || true)
VMRSS_KB=$(docker exec "$CONTAINER" sh -c 'grep VmRSS /proc/1/status 2>/dev/null | awk "{print \$2}"' 2>/dev/null || true)
[ -z "${VMHWM_KB:-}" ] && VMHWM_KB="UNAVAILABLE"
[ -z "${VMRSS_KB:-}" ] && VMRSS_KB="UNAVAILABLE"

SAMPLES=()
for i in $(seq 1 "$PROBES"); do
  PCT=$(docker stats --no-stream --format '{{.Name}}\t{{.MemPerc}}' 2>/dev/null \
        | awk -v c="$CONTAINER" -F'\t' '$1==c {gsub(/%/,"",$2); print $2}')
  [ -z "${PCT:-}" ] && PCT="null"
  TS=$(date -u +%H:%M:%SZ)
  SAMPLES+=("{\"n\":$i,\"t\":\"$TS\",\"pct\":$PCT}")
  [ "$i" -lt "$PROBES" ] && sleep "$INTERVAL"
done

JOINED=$(IFS=,; echo "${SAMPLES[*]}")

# Analysis: min/max, and whether any sample dipped below its predecessor by >0.5pp
# (a real reclamation event, not measurement jitter).
read -r MINP MAXP DIPS DIPDETAIL <<EOF
$(printf '%s\n' "${SAMPLES[@]}" \
  | sed -E 's/.*"pct":([0-9.]+|null).*/\1/' \
  | awk 'BEGIN{min=1e9;max=-1;prev=-1;dips=0;dd=""}
         $1!="null"{
           v=$1+0
           if(v<min)min=v
           if(v>max)max=v
           if(prev>=0 && (prev-v)>0.5){dips++; dd=dd sprintf("%.2f->%.2f;",prev,v)}
           prev=v
         }
         END{if(dd=="")dd="none"; printf "%.2f %.2f %d %s", min, max, dips, dd}')
EOF

VERDICT="FOLD"
REASON="benign GC sawtooth or below tripwire"

if [ "$OOM" = "true" ]; then
  VERDICT="ESCALATE"; REASON="OOMKilled=true"
elif [ "$DIPS" -eq 0 ] && awk "BEGIN{exit !($MINP > 93)}"; then
  VERDICT="ESCALATE"; REASON="all samples >93% with no reclamation dip — loss of reclamation"
elif [ "$DIPS" -eq 0 ] && awk "BEGIN{exit !($MAXP > 97)}"; then
  VERDICT="ESCALATE"; REASON="peak >97% sustained with no reclaim"
fi

cat <<JSON
{
  "probe": "A-30 mcp-server memory reclamation discriminator",
  "container": "$CONTAINER",
  "window": {"probes": $PROBES, "interval_sec": $INTERVAL, "span_sec": $(( (PROBES-1) * INTERVAL ))},
  "state": {"oom_killed": "$OOM", "restart_count": "$RESTARTS", "started_at": "$STARTED"},
  "vm": {"vmhwm_kb": "$VMHWM_KB", "vmrss_kb": "$VMRSS_KB",
         "note": "VmHWM >> VmRSS proves a reclamation already occurred; UNAVAILABLE means this evidence is missing, not that it is absent"},
  "samples": [$JOINED],
  "analysis": {"min_pct": $MINP, "max_pct": $MAXP, "reclamation_dips": $DIPS, "dip_detail": "$DIPDETAIL"},
  "verdict": "$VERDICT",
  "reason": "$REASON",
  "tripwire_ref": "feedback_auditor_mcpserver_a21_a30_memory_fp_reemit_churn — escalate ONLY on OOMKilled, or >93% with no dips, or >97% sustained no reclaim"
}
JSON
exit 0
