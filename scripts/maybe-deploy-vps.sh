#!/bin/bash
set -euo pipefail

DRY_RUN=false
[ "${1:-}" = "--dry-run" ] && DRY_RUN=true

# Source .env if present (silent)
[ -f "$(dirname "$0")/../.env" ] && source "$(dirname "$0")/../.env" 2>/dev/null || true

# Diff detection
if [ "${FAKE_DIFF+x}" = "x" ]; then
  DIFF_OUTPUT="$FAKE_DIFF"
else
  DIFF_OUTPUT=$(git diff HEAD~1 --name-only 2>/dev/null || { echo "WARN: git diff failed — skipping VPS deploy" >&2; echo ""; })
fi

# Trigger check (prefix-anchored; ^vps-scripts/ and ^deploy-vinahost\.sh$)
TRIGGERED=false
while IFS= read -r line; do
  if [[ "$line" =~ ^vps-scripts/ ]] || [[ "$line" = "deploy-vinahost.sh" ]]; then
    TRIGGERED=true
    break
  fi
done <<< "$DIFF_OUTPUT"

if $TRIGGERED; then
  if $DRY_RUN; then
    echo "VPS deploy triggered (dry-run)"
  else
    DEPLOY="$(dirname "$0")/../deploy-vinahost.sh"
    if [ ! -f "$DEPLOY" ]; then
      echo "ERROR: deploy-vinahost.sh not found at repo root" >&2
      exit 1
    fi
    echo "VPS deploy triggered"
    bash "$DEPLOY"
    # Telegram WORK-channel notification (silent on missing vars)
    if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_INFO_WORK_CHANNEL_ID:-}" ]; then
      curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_INFO_WORK_CHANNEL_ID}" \
        -d text="VPS deploy complete: vps-scripts/ or deploy-vinahost.sh changed in last merge." \
        > /dev/null
    fi
  fi
else
  if $DRY_RUN; then
    echo "VPS deploy skipped (dry-run)"
  else
    echo "VPS deploy skipped"
  fi
fi
