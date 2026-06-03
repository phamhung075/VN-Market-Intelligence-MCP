<!-- size-justification: 88L — Step 4.8: emit pressure-state.json (DWF-DEV-CROSS-3). Atomic write, instrument-only. Child of main.md. -->

## Step 4.8 — Emit pressure-state.json (DWF-DEV-CROSS-3)

<!-- DWF-DEV-CROSS-3: Single-row rolling SSOT. Atomic write (write .tmp then rename). Instrument-only Phase 0 — no decision path reads this file. Never blocks the tick on failure.
     AC-P0-4-5 atomic write: write to TMPFILE then mv (fs-level rename = atomic).
     AC-P0-4-6 fail-safe: is_trading_day failure → calendar_status="unknown", still emits.
     AC-P0-4-4 isolation: only this step writes pressure-state.json. grep apps/ .claude/skills/ = 0 hits. -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path). **Never blocks spawns on failure.**

```bash
# Step 4.8 — Emit pressure-state.json

PRESSURE_TMPFILE="docs/data/pressure-state.json.tmp"

# emitted_at: current wall-clock UTC (ISO 8601)
EMITTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# tick_id: floor-15min of current UTC (e.g. 22:47 → 22:45:00Z)
ACTUAL_M_PS=$(date -u +%M | sed 's/^0*//')
ACTUAL_M_PS=${ACTUAL_M_PS:-0}
FLOOR_M_PS=$(( (ACTUAL_M_PS / 15) * 15 ))
TICK_ID=$(date -u +"%Y-%m-%dT%H:")$(printf '%02d' $FLOOR_M_PS)":00Z"

# signal_backlog: count of ACTIONABLE INBOUND signal JSON files.
# Exclude cowork-team-*.json (own heartbeats/telemetry — not inbox backlog).
# Without exclusion the count is permanently ≥37 (own files dominate), pinning
# signal_backlog_tier HIGH and making signal_backlog==0 (deep-sleep guard) unreachable.
# `{ grep -v ... || true; }` neutralises grep exit-1 when no non-self files exist,
# so an empty inbox correctly yields 0 (not 1) under set -e.
SIGNAL_BACKLOG=$(ls docs/signals/*.json 2>/dev/null | { grep -v '/cowork-team-' || true; } | wc -l | tr -d ' ')

# calendar_status: call is_trading_day tool via gateway (fail-safe)
CALENDAR_STATUS="unknown"
IS_TRADING_RESULT=$(call_tool(server="vn-market", tool="is_trading_day", arguments={}))
if [ $? -eq 0 ] && [ -n "$IS_TRADING_RESULT" ]; then
  CALENDAR_STATUS=$(echo "$IS_TRADING_RESULT" | jq -r '.session_status // "unknown"' 2>/dev/null || echo "unknown")
fi
# On any failure above: CALENDAR_STATUS stays "unknown" — tick is never blocked (AC-P0-4-6)

# last_regime / last_volatility_level: read from latest cycle-snapshot if available
LAST_REGIME="unknown"
LAST_VOLATILITY="unknown"
if [ -f "docs/data/cycle-snapshot-latest.json" ]; then
  LAST_REGIME=$(jq -r '.regime_status // "unknown"' docs/data/cycle-snapshot-latest.json 2>/dev/null || echo "unknown")
  LAST_VOLATILITY=$(jq -r '.volatility_level // "unknown"' docs/data/cycle-snapshot-latest.json 2>/dev/null || echo "unknown")
fi

# dev_queue_depth: approximate count of OPEN/IN_PROGRESS tasks in orch-state.json .task_board
DEV_QUEUE_DEPTH=$(jq '[.task_board.active_sprints[].tasks[] | select(.status == "IN_PROGRESS" or .status == "TODO")] | length' docs/data/orch/orch-state.json 2>/dev/null); DEV_QUEUE_DEPTH=${DEV_QUEUE_DEPTH:-0}

# host_headroom_mb: available RAM in MB (best-effort, null on failure)
HOST_HEADROOM_MB="null"
if command -v vm_stat &>/dev/null; then
  PAGES_FREE=$(vm_stat 2>/dev/null | grep "^Pages free" | awk '{gsub(/\./,""); print $3}')
  if [ -n "$PAGES_FREE" ] && [ "$PAGES_FREE" -gt 0 ] 2>/dev/null; then
    HOST_HEADROOM_MB=$(( PAGES_FREE * 4096 / 1024 / 1024 ))
  fi
elif command -v free &>/dev/null; then
  HOST_HEADROOM_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}' || echo "null")
fi

# stale_warning: false when just emitted; set to true on next tick if previous was missed
STALE_WARNING="false"

# Atomic write: write to temp then rename — readers never see partial JSON (AC-P0-4-5)
cat > "$PRESSURE_TMPFILE" <<PRESSURE_EOF
{
  "emitted_at": "${EMITTED_AT}",
  "tick_id": "${TICK_ID}",
  "signal_backlog": ${SIGNAL_BACKLOG},
  "last_regime": "${LAST_REGIME}",
  "last_volatility_level": "${LAST_VOLATILITY}",
  "calendar_status": "${CALENDAR_STATUS}",
  "dev_queue_depth": ${DEV_QUEUE_DEPTH},
  "host_headroom_mb": ${HOST_HEADROOM_MB},
  "stale_warning": ${STALE_WARNING}
}
PRESSURE_EOF

mv "$PRESSURE_TMPFILE" "docs/data/pressure-state.json"
```

**On any error in this step:** log `"[cowork-team] pressure-state emit failed: <error>"` and continue to Step 5. This step is additive instrumentation — its failure never blocks spawns.
