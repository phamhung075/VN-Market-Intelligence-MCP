#!/bin/bash
# Install the VN Market MCP launchd agent so the Bun server auto-starts at
# login and auto-restarts on crash.
#
# Usage: ./launchd/install.sh
#
# Idempotent: safe to re-run after editing the plist.

set -e
cd "$(dirname "$0")"

PLIST_SRC="$(pwd)/com.vn-market.mcp.plist"
PLIST_DST="$HOME/Library/LaunchAgents/com.vn-market.mcp.plist"
LABEL="com.vn-market.mcp"

if [ ! -f "$PLIST_SRC" ]; then
  echo "ERROR: $PLIST_SRC not found" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"

# Unload previous copy if already registered.
if launchctl list 2>/dev/null | grep -q "$LABEL"; then
  echo "Unloading existing $LABEL ..."
  launchctl unload -w "$PLIST_DST" 2>/dev/null || true
fi

cp "$PLIST_SRC" "$PLIST_DST"
chmod 644 "$PLIST_DST"
chmod +x "$(pwd)/mcp-launch.sh"

echo "Loading $LABEL ..."
launchctl load -w "$PLIST_DST"

sleep 2

echo ""
echo "=== launchctl list ==="
launchctl list | grep "$LABEL" || echo "(not listed — check /tmp/vn-market-mcp.log)"

echo ""
echo "=== last 10 log lines ==="
tail -10 /tmp/vn-market-mcp.log 2>/dev/null || echo "(log not yet written)"

echo ""
echo "Installed. Reboot-safe: the MCP server will auto-start on next login."
echo "  status:   launchctl list | grep com.vn-market.mcp"
echo "  logs:     tail -f /tmp/vn-market-mcp.log"
echo "  stop:     launchctl unload -w $PLIST_DST"
echo "  restart:  launchctl unload -w $PLIST_DST && launchctl load -w $PLIST_DST"
