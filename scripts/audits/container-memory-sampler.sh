#!/usr/bin/env bash
# container-memory-sampler.sh — READ-ONLY memory trajectory sampler.
#
# WHY THIS EXISTS: a 2-3 sample read of `docker stats` over <60s is NOT a
# plateau and repeatedly gets read as one (feedback_ops_readonly_diagnostic_
# wrote_to_live_index_and_burned_the_headroom; PO self-correction 2026-07-29).
# This samples on a fixed cadence over a real window and emits TSV so the
# trajectory can be differenced instead of eyeballed.
#
# SAFETY CONTRACT — this script MUST stay effect-free against the target:
#   - `docker stats --no-stream` ONLY. No exec, no HTTP, no restart.
#   - `docker exec` allocates inside the TARGET's memory cgroup and can be the
#     killing allocation on a container near its ceiling. Never add it here.
#   - Nothing is written to the target; output goes to $OUT on the host.
#
# READING THE OUTPUT — MemUsage from `docker stats` is the cgroup's charged
# memory MINUS inactive file cache. It still INCLUDES active page cache for
# files the container has read (for LanceDB/pyarrow workloads that is mmap'd
# table data). So a rise is NOT automatically an anonymous-memory leak, and a
# rise that is page cache is reclaimable under pressure. This script cannot
# distinguish the two — it measures the trajectory only. Do not report a leak
# from this output alone; say "charged memory rose" and name what you did not
# separate.
#
# Usage:
#   bash scripts/audits/container-memory-sampler.sh <container> [interval_s] [samples] [out_file]
# Defaults: interval 30s, 11 samples (~5 min), out = /tmp-scratch tsv path echoed at exit.

set -uo pipefail

CTR="${1:?usage: container-memory-sampler.sh <container> [interval_s] [samples] [out]}"
INTERVAL="${2:-30}"
SAMPLES="${3:-11}"
OUT="${4:-./container-mem-$(date -u +%Y%m%dT%H%M%SZ).tsv}"

if ! docker inspect "$CTR" >/dev/null 2>&1; then
  echo "[sampler] FAIL: container not found: $CTR" >&2
  exit 2
fi

printf 'ts_utc\tmem_usage\tmem_limit\tmem_pct\tcpu_pct\trestart_count\n' > "$OUT"

i=0
while [ "$i" -lt "$SAMPLES" ]; do
  now=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  line=$(docker stats --no-stream --format '{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}' "$CTR" 2>/dev/null)
  rc=$(docker inspect "$CTR" --format '{{.RestartCount}}' 2>/dev/null)
  if [ -z "$line" ]; then
    printf '%s\tSTATS-UNAVAILABLE\t-\t-\t-\t%s\n' "$now" "${rc:--}" >> "$OUT"
  else
    usage=${line%%|*}; rest=${line#*|}
    pct=${rest%%|*}; cpu=${rest#*|}
    used=${usage%% /*}
    lim=${usage##*/ }
    printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$now" "$used" "$lim" "$pct" "$cpu" "${rc:--}" >> "$OUT"
  fi
  i=$((i + 1))
  [ "$i" -lt "$SAMPLES" ] && sleep "$INTERVAL"
done

echo "[sampler] wrote $SAMPLES samples -> $OUT"
