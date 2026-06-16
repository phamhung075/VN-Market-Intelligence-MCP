#!/bin/bash
# Docker build cache cleanup script
# Prunes dangling images + builder cache beyond 20GB limit
# Runs daily from launchd to prevent ENOSPC incidents

set -euo pipefail

LOG_DIR="$HOME/Library/Logs/vn-market"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/docker-cleanup.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

{
  echo "[$TIMESTAMP] docker-cleanup start"
  
  # Prune dangling images (safe, no in-use images touched)
  echo "[$TIMESTAMP] Pruning dangling images..."
  docker image prune -f --filter "dangling=true" || echo "Image prune failed (non-fatal)"
  
  # Prune builder cache beyond 20GB
  # GC policy: keep-storage=20GB is set in daemon.json
  # This is a safety prune in case GC hasn't run
  echo "[$TIMESTAMP] Pruning builder cache (keep 20GB)..."
  docker builder prune -af --keep-storage 20GB || echo "Builder prune failed (non-fatal)"
  
  # Report disk usage
  FREE_SPACE=$(df /System/Volumes/Data | awk 'NR==2 {print $4}' | numfmt --to=iec 2>/dev/null || awk 'NR==2 {print $4}')
  CACHE_SIZE=$(docker builder du 2>/dev/null | tail -1 | awk '{print $NF}' || echo "N/A")
  
  echo "[$TIMESTAMP] Disk free: $FREE_SPACE, Builder cache: $CACHE_SIZE"
  echo "[$TIMESTAMP] docker-cleanup end"
} >> "$LOG_FILE" 2>&1

exit 0
