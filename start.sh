#!/bin/bash
# VN Market Intelligence MCP — Production Startup Script
# Usage: ./start.sh
#
# Sets RUST_LOG=error BEFORE Bun starts to suppress LanceDB TRACE logs.
# The env var must be in the shell environment, not in code, because
# LanceDB's Rust runtime initializes its logger at import time.

cd "$(dirname "$0")"

LOG=/tmp/vn-market-mcp.log
MAX_SIZE_KB=51200  # 50MB

# Kill existing instance
pkill -f "bun.*src/index.ts" 2>/dev/null
sleep 1

# Rotate log if too large (keep 3 rolling files)
if [ -f "$LOG" ]; then
  size=$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null || echo 0)
  if [ "$size" -gt $((MAX_SIZE_KB * 1024)) ]; then
    [ -f "$LOG.2" ] && mv "$LOG.2" "$LOG.3"
    [ -f "$LOG.1" ] && mv "$LOG.1" "$LOG.2"
    mv "$LOG" "$LOG.1"
    echo "Log rotated ($((size / 1048576))MB)"
  fi
fi

# Load environment variables (.env)
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

# Start with suppressed Rust logs
# Export all .env vars explicitly so nohup subprocess inherits them
export RUST_LOG=error
export TELEGRAM_BOT_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
export TELEGRAM_CHAT_ID="${TELEGRAM_CHAT_ID:-}"
export TELEGRAM_REPORT_ID="${TELEGRAM_REPORT_ID:-}"
export TELEGRAM_ENABLED="${TELEGRAM_ENABLED:-true}"

# Use --hot for live code reload without full restart
# Pipe through grep --line-buffered to filter LanceDB TRACE from stderr
nohup bun --hot run src/index.ts 2>&1 | grep --line-buffered -v "TRACE" > "$LOG" &

echo "Server started (PID: $!)"
echo "Log: /tmp/vn-market-mcp.log"
sleep 2
curl -s http://127.0.0.1:3000/health | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Status: {d[\"status\"]} | Tools: {d[\"toolCount\"]}')" 2>/dev/null || echo "Health check failed"
