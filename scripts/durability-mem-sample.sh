#!/usr/bin/env bash
# scripts/durability-mem-sample.sh
#
# Reusable D3/D5 evidence collector for `docs/standards/oom-durability-verification-bar.md`.
#
# WHY THIS EXISTS: D3 needs a fitted growth rate over the window's final segment and
# D5 needs `durability_samples[] >= 6` of `{ts, mem_pct}`. Neither is reconstructible
# after the fact — `docker stats` has no history and no service in this fleet logs RSS.
# Three consecutive qa cycles on FU-RAG-DEPLOY-MEMORY (2026-08-14, 2026-08-23T08:4xZ,
# 2026-08-23T11:36Z) each reached a mature D1 wall-clock and then could not certify,
# because nobody was sampling. The one prior series (docs/incidents/data/
# rag-durability-2026-08-14T2015Z-*.csv) lived in /tmp and was corrupted by three
# concurrent samplers writing two schemas — hence the lock + fixed schema here.
#
# Read-only w.r.t. the target: `docker stats --no-stream` only. Does NOT count as a
# D4 mitigation.
#
# Usage:
#   scripts/durability-mem-sample.sh <container> <interval_s> <duration_s> <out.csv>
# Example (30s cadence for 6h):
#   scripts/durability-mem-sample.sh vn-market-intelligence-mcp-rag-service-1 30 21600 \
#     docs/incidents/data/rag-durability-$(date -u +%Y-%m-%dT%H%MZ).csv
#
# Emits header comments carrying the D2 identity fields (container id, StartedAt,
# RestartCount, live HostConfig.Memory) so the series is self-describing and the cap
# is never taken from prose — see the bar's § 3 D5.
# Owning flow: docs/agents/qa/flow/main.md § OOM-Class Durability Gate.
set -uo pipefail

CONTAINER="${1:?container name required}"
INTERVAL="${2:?interval seconds required}"
DURATION="${3:?duration seconds required}"
OUT="${4:?output csv path required}"

LOCK="/tmp/durability-mem-sample.$(echo "$CONTAINER" | tr -c 'A-Za-z0-9' '_').lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  echo "[durability-mem-sample] REFUSE: another sampler holds $LOCK — concurrent samplers corrupted the 2026-08-14 series" >&2
  exit 3
fi
trap 'rmdir "$LOCK" 2>/dev/null' EXIT

INSPECT=$(docker inspect "$CONTAINER" \
  --format '{{.Id}}|{{.State.StartedAt}}|{{.RestartCount}}|{{.HostConfig.Memory}}|{{.Image}}' 2>/dev/null) || {
  echo "[durability-mem-sample] REFUSE: docker inspect failed for $CONTAINER" >&2; exit 4; }
CID=${INSPECT%%|*}; REST=${INSPECT#*|}
STARTED=${REST%%|*}; REST=${REST#*|}
RCOUNT=${REST%%|*}; REST=${REST#*|}
MEMLIMIT=${REST%%|*}; IMAGE=${REST#*|}

[ "$MEMLIMIT" = "0" ] && { echo "[durability-mem-sample] REFUSE: HostConfig.Memory=0 (uncapped) — mem_pct has no denominator" >&2; exit 5; }

mkdir -p "$(dirname "$OUT")"
{
  echo "# durability sample series — docs/standards/oom-durability-verification-bar.md D3/D5"
  echo "# container=$CONTAINER"
  echo "# container_id=$CID"
  echo "# started_at=$STARTED   restart_count=$RCOUNT   (D2 identity at OPEN)"
  echo "# mem_limit_bytes=$MEMLIMIT   image=$IMAGE   (read live, never from prose)"
  echo "# opened_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)  interval_s=$INTERVAL  duration_s=$DURATION"
  echo "timestamp,used_percent,used_bytes,container_status"
} > "$OUT"

END=$(( $(date +%s) + DURATION ))
while [ "$(date +%s)" -lt "$END" ]; do
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  RAW=$(docker stats --no-stream --format '{{.MemUsage}}|{{.MemPerc}}' "$CONTAINER" 2>/dev/null)
  ST=$(docker inspect "$CONTAINER" --format '{{.State.Status}}' 2>/dev/null || echo "gone")
  if [ -n "$RAW" ]; then
    PCT=${RAW#*|}; PCT=${PCT%\%}
    USED=${RAW%%|*}; USED=${USED%% /*}
    printf '%s,%s,%s,%s\n' "$TS" "$PCT" "$USED" "$ST" >> "$OUT"
  else
    printf '%s,,,%s\n' "$TS" "${ST:-unreadable}" >> "$OUT"
  fi
  sleep "$INTERVAL"
done

# D2 identity at CLOSE — a moved StartedAt VOIDS the window (bar § 3 D2), so record it.
CLOSE=$(docker inspect "$CONTAINER" --format '{{.Id}}|{{.State.StartedAt}}|{{.RestartCount}}' 2>/dev/null || echo "unreadable")
{
  echo "# closed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# identity_at_close=$CLOSE"
  echo "# identity_at_open=$CID|$STARTED|$RCOUNT"
} >> "$OUT"
echo "[durability-mem-sample] done -> $OUT"
