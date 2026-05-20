#!/usr/bin/env bash
# Pre-flight disk check before docker compose up -d
# Fails fast if free disk < 15 GB to prevent cold-start hang under disk pressure (1958 RCA).
set -euo pipefail

THRESHOLD_GB=15

# Use portable df syntax: df -g shows blocks in 1GB units
# Fall back to checking root filesystem if /var/lib/docker not available (macOS case)
FREE_GB=$(df -g /var/lib/docker 2>/dev/null | tail -1 | awk '{print $4}' || df -g / | tail -1 | awk '{print $4}')

if [ "$FREE_GB" -lt "$THRESHOLD_GB" ]; then
  echo "ERROR: Docker disk has ${FREE_GB}GB free, need ≥${THRESHOLD_GB}GB. Run disk-relief: docker builder prune -a -f && docker image prune -a -f" >&2
  exit 1
fi

echo "OK: Docker disk has ${FREE_GB}GB free (≥${THRESHOLD_GB}GB threshold)."
