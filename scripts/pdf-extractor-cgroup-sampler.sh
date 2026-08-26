#!/bin/bash
# pdf-extractor-cgroup-sampler.sh
# Persistent sampler for pdf-extractor container AC-7 memory metrics
# One sample per 5 minutes; collects cgroup memory.stat, memory.events, and /proc/1/status
# Critical: stamps container ID on every row to detect recreation

set -e

PROJECT_ROOT="/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP"
CSV_FILE="${PROJECT_ROOT}/docs/incidents/data/pdf-extractor-ac7-sampler.csv"
SAMPLE_INTERVAL=300  # 5 minutes in seconds

# Ensure output directory exists
mkdir -p "$(dirname "$CSV_FILE")"

# Write CSV header if file does not exist
if [ ! -f "$CSV_FILE" ]; then
  printf "ts,container_id,memory_current_bytes,memory_stat_anon,memory_stat_file,memory_stat_inactive_file,memory_stat_pgscan,memory_stat_pgsteal,memory_stat_workingset_refault_anon,memory_events_max,memory_events_oom,memory_events_oom_kill,vmrss_kib,vmhwm_kib\n" > "$CSV_FILE"
fi

# Main sampling loop
while true; do
  # Get current timestamp in UTC (critical: must use real UTC, not local time)
  TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  
  # Get container ID - match pdf-extractor service
  CONTAINER_ID=$(docker ps --no-trunc -q -f name="pdf-extractor" 2>/dev/null | head -1)
  
  if [ -z "$CONTAINER_ID" ]; then
    echo "[$(date -u)] ERROR: Container with 'pdf-extractor' in name not found" >&2
    sleep "$SAMPLE_INTERVAL"
    continue
  fi
  
  # Shorten container ID to 12 chars for readability (but keep full precision on each row)
  CONTAINER_SHORT="${CONTAINER_ID:0:12}"
  
  # Get cgroup v2 memory stats (modern cgroups layout)
  MEM_CURRENT=$(docker exec "$CONTAINER_ID" cat /sys/fs/cgroup/memory.current 2>/dev/null || echo "0")
  MEM_ANON=$(docker exec "$CONTAINER_ID" grep "^anon " /sys/fs/cgroup/memory.stat 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_FILE=$(docker exec "$CONTAINER_ID" grep "^file " /sys/fs/cgroup/memory.stat 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_INACTIVE_FILE=$(docker exec "$CONTAINER_ID" grep "^inactive_file " /sys/fs/cgroup/memory.stat 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_PGSCAN=$(docker exec "$CONTAINER_ID" grep "^pgscan " /sys/fs/cgroup/memory.stat 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_PGSTEAL=$(docker exec "$CONTAINER_ID" grep "^pgsteal " /sys/fs/cgroup/memory.stat 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_WORKINGSET_REFAULT=$(docker exec "$CONTAINER_ID" grep "^workingset_refault_anon " /sys/fs/cgroup/memory.stat 2>/dev/null | awk '{print $2}' || echo "0")
  
  # Get memory.events counters
  MEM_EVENTS_MAX=$(docker exec "$CONTAINER_ID" grep "^max " /sys/fs/cgroup/memory.events 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_EVENTS_OOM=$(docker exec "$CONTAINER_ID" grep "^oom " /sys/fs/cgroup/memory.events 2>/dev/null | awk '{print $2}' || echo "0")
  MEM_EVENTS_OOM_KILL=$(docker exec "$CONTAINER_ID" grep "^oom_kill " /sys/fs/cgroup/memory.events 2>/dev/null | awk '{print $2}' || echo "0")
  
  # Get /proc/1/status metrics from inside container
  PROC_STATUS=$(docker exec "$CONTAINER_ID" cat /proc/1/status 2>/dev/null || echo "")
  VMRSS=$(echo "$PROC_STATUS" | grep "^VmRSS:" | awk '{print $2}' || echo "0")
  VMHWM=$(echo "$PROC_STATUS" | grep "^VmHWM:" | awk '{print $2}' || echo "0")
  
  # Append CSV row with container ID stamped
  printf "%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s\n" \
    "$TS" "$CONTAINER_ID" "$MEM_CURRENT" "$MEM_ANON" "$MEM_FILE" "$MEM_INACTIVE_FILE" \
    "$MEM_PGSCAN" "$MEM_PGSTEAL" "$MEM_WORKINGSET_REFAULT" "$MEM_EVENTS_MAX" \
    "$MEM_EVENTS_OOM" "$MEM_EVENTS_OOM_KILL" "$VMRSS" "$VMHWM" >> "$CSV_FILE"
  
  # Log to stdout for visibility
  echo "[$(date -u)] Sample #{$(wc -l < "$CSV_FILE" | tr -d ' ')} @ ${TS}: container=${CONTAINER_SHORT}, memory=${MEM_CURRENT}, oom_kill=${MEM_EVENTS_OOM_KILL}"
  
  # Sleep until next sample (5 min)
  sleep "$SAMPLE_INTERVAL"
done
