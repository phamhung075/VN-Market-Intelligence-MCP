<!-- size-justification: 120L — Step 6 + mandatory pressure-state/cycle-snapshot emit (EMIT-DARK-RECURRING Option B) + Error Guard. Child of main.md. -->

## Step 6 — Write telemetry signal + mandatory state emit

> **INVARIANT:** enveloped schema `{from, to, type, payload, priority, createdAt}`. NEVER flat root-level fields. All observability fields inside `payload:{}`.

**Conditional signals/ write:** SKIP if `silent==true` AND `spawned[]` empty AND `errors[]` empty. WRITE if spawns occurred OR errors exist.

```bash
ISO=${NOW_ISO}

# --- MANDATORY EMIT: pressure-state.json + cycle-snapshot-latest.json ---
# This block ALWAYS runs (not guarded by SILENT). It is the un-skippable anchor
# for EMIT-DARK-RECURRING Option B: telemetry is git-committed every tick, so
# narration-skip here is immediately visible in git history.
FLOOR_M=$(( ( $(date -u +%M | sed 's/^0*//;s/^$/0/') / 15 ) * 15 ))
TICK_ID_PS=$(date -u +"%Y-%m-%dT%H:")$(printf '%02d' $FLOOR_M)":00Z"
EMITTED_AT_PS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SIG_BACKLOG=$(ls docs/signals/*.json 2>/dev/null | { grep -v '/cowork-team-' || true; } | wc -l | tr -d ' ')
DEV_Q=$(jq '[.task_board.active_sprints[].tasks[] | select(.status=="IN_PROGRESS" or .status=="TODO")] | length' docs/data/orch/orch-state.json 2>/dev/null || echo 0)
HOST_MB="null"
if command -v vm_stat &>/dev/null; then
  PF=$(vm_stat 2>/dev/null | grep "^Pages free" | awk '{gsub(/\./,""); print $3}')
  [ -n "$PF" ] && [ "$PF" -gt 0 ] 2>/dev/null && HOST_MB=$(( PF * 4096 / 1024 / 1024 ))
elif command -v free &>/dev/null; then
  HOST_MB=$(free -m 2>/dev/null | awk '/^Mem:/{print $7}' || echo null)
fi
LAST_REG="unknown"; LAST_VOL="unknown"
FILE_TICK_NOW=$(date -u +%H:%M)
SNAP="docs/data/cycle-snapshot-${FILE_TICK_NOW}.json"
if [ -f "$SNAP" ]; then
  LAST_REG=$(jq -r '.regime_status // "unknown"' "$SNAP" 2>/dev/null || echo unknown)
  LAST_VOL=$(jq -r '.volatility_level // "unknown"' "$SNAP" 2>/dev/null || echo unknown)
  # Promote current tick snapshot → cycle-snapshot-latest.json (atomic)
  cp "$SNAP" docs/data/cycle-snapshot-latest.json.tmp && mv docs/data/cycle-snapshot-latest.json.tmp docs/data/cycle-snapshot-latest.json
elif [ -f "docs/data/cycle-snapshot-latest.json" ]; then
  LAST_REG=$(jq -r '.regime_status // "unknown"' docs/data/cycle-snapshot-latest.json 2>/dev/null || echo unknown)
  LAST_VOL=$(jq -r '.volatility_level // "unknown"' docs/data/cycle-snapshot-latest.json 2>/dev/null || echo unknown)
fi
CAL_ST="${CALENDAR_STATUS:-unknown}"
PRESSURE_TMP="docs/data/pressure-state.json.tmp"
cat > "$PRESSURE_TMP" <<PS_EOF
{
  "emitted_at": "${EMITTED_AT_PS}",
  "tick_id": "${TICK_ID_PS}",
  "signal_backlog": ${SIG_BACKLOG},
  "last_regime": "${LAST_REG}",
  "last_volatility_level": "${LAST_VOL}",
  "calendar_status": "${CAL_ST}",
  "dev_queue_depth": ${DEV_Q},
  "host_headroom_mb": ${HOST_MB},
  "stale_warning": false
}
PS_EOF
mv "$PRESSURE_TMP" "docs/data/pressure-state.json"

# --- CONDITIONAL: docs/signals/ write (skip silent non-actionable ticks) ---
if [[ "$SILENT" == "true" ]] && [[ -z "$SPAWNED" ]] && [[ -z "$ERRORS" ]]; then
  exit 0
fi

mkdir -p docs/signals
cat > docs/signals/cowork-team-${ISO}.json <<EOF
{
  "from": "cowork-team",
  "to": "dev-team",
  "type": "cowork-fire",
  "payload": {
    "fire_time": "${ISO}",
    "matched_slots": [<slot_ids from MATCHES>],
    "won_slots": [<slot_ids from WON_SLOTS>],
    "held_by_other": [<slot_ids from HELD_BY_OTHER>],
    "all_held": <true if WON_SLOTS empty and HELD_BY_OTHER non-empty>,
    "spawned": [<flow_paths of successfully spawned slots>],
    "silent": <true if MATCHES empty, false otherwise>,
    "drift_min": ${DRIFT_MIN},
    "errors": [<{slot_id, error} per failed spawn>],
    "pressure_mode": "<adaptive|legacy>",
    "calendar_status": "<status>",
    "suppressed_calendar": ["<slot_ids suppressed in Step 4.3>"],
    "suppressed_cadence": ["<slot_ids skipped in Step 4.4>"],
    "downgraded": ["<slot_ids removed in Step 4.5>"],
    "due_reasons": { "<slot_id>": "<cadence|cron|first_run>" },
    "cadence_minutes": { "<slot_id>": "<N|null>" },
    "last_fired_timestamp": "<ISO8601 or null>",
    "last_fired_slots": ["<slot_ids updated>"],
    "last_fired_write_errors": "<null or error message>",
    "classification": "<SILENT|FIRE|HELD|ERROR>",
    "reason": "<no_cron_match|suppressed|held|spawned|...>",
    "nominal_tick": "<HH:MM of scheduled tick>",
    "leader_lock": "<acquired|not_acquired_silent|not_acquired_held|...>",
    "dev_head": "<idle|active|unknown>",
    "devq": <pending task count>,
    "signal_backlog": <unprocessed signal count>,
    "note": "<free-text observation>"
  },
  "priority": "low",
  "createdAt": "${ISO}"
}
EOF
```

---

## Error Guard

Wrap Steps 3–5 in try/catch. On any unhandled error:

```bash
ISO=${NOW_ISO}
mkdir -p docs/signals
cat > docs/signals/cowork-team-${ISO}-error.json <<EOF
{"from":"cowork-team","to":"po","type":"dispatcher-error","payload":{"error":"<message>","step":"<N>"},"createdAt":"${ISO}"}
EOF
```

`send_telegram(channel=work, "[cowork-team] ERROR ${ISO} — <message> (step <N>)")`

Then EXIT.
