#!/bin/bash
# Launcher used exclusively by the launchd plist.
#
# Why not call ./start.sh?
#   start.sh uses `nohup bun … &` and exits the wrapper immediately.
#   launchd would see the wrapper exit cleanly and lose its handle on the
#   actual Bun process — KeepAlive/Crashed detection would never fire.
#
# This launcher instead:
#   1. cd's to the project root
#   2. Sources .env so TELEGRAM / VULTR / DB_PATH / etc. are in the env
#   3. Exports the Rust log silencer (for LanceDB) + RUST_LOG=error
#   4. exec's bun --hot run src/index.ts IN THE FOREGROUND so launchd
#      directly owns the Bun process lifetime

set -u

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

export RUST_LOG="${RUST_LOG:-error}"
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
export TELEGRAM_INFO_MARKET_GROUP_ID="${TELEGRAM_INFO_MARKET_GROUP_ID:-}"
export TELEGRAM_INFO_WORK_CHANNEL_ID="${TELEGRAM_INFO_WORK_CHANNEL_ID:-}"
export TELEGRAM_REPORT_BUG_CHANNEL_ID="${TELEGRAM_REPORT_BUG_CHANNEL_ID:-}"
export TELEGRAM_ENABLED="${TELEGRAM_ENABLED:-true}"
export VULTR_IP="${VULTR_IP:-}"
export VULTR_USERNAME="${VULTR_USERNAME:-root}"
export VULTR_PASSWORD="${VULTR_PASSWORD:-}"
export VPS_PUSH_API_KEY="${VPS_PUSH_API_KEY:-}"

exec /Users/admin/.bun/bin/bun --hot run src/index.ts
