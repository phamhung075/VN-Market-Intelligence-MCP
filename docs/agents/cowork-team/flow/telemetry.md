<!-- size-justification: 90L — Step 6 + call_tool emit_pressure_state (EMIT-DARK-v2 Option C) + conditional signal write + Error Guard. Child of main.md. -->

## Step 6 — Write telemetry signal + emit pressure state

> **INVARIANT:** enveloped schema `{from, to, type, payload, priority, createdAt}`. NEVER flat root-level fields. All observability fields inside `payload:{}`.

**Conditional signals/ write:** SKIP if `silent==true` AND `spawned[]` empty AND `errors[]` empty. WRITE if spawns occurred OR errors exist.

### Step 6.0 — MANDATORY pressure-state emit (EMIT-DARK-v2 Option C)

Execute this call_tool BEFORE the conditional signal-file write. It is un-skippable and independent of the SILENT guard. The tool computes signal_backlog, dev_queue_depth, and host_headroom_mb server-side (shell computations the dispatcher cannot perform) and atomically writes docs/data/pressure-state.json + promotes cycle-snapshot-latest.json. It NEVER throws — on internal error it returns {success: false, reason: "..."} and the dispatcher continues regardless.

```
call_tool(server="vn-market", tool="emit_pressure_state", arguments={
  "calendar_status": "<CALENDAR_STATUS from Step 4.3>",
  "tick_id": "<nominal_tick, e.g. 2026-06-05T18:00:00Z>",
  "fire_time": "<ISO now>",
  "pressure_mode": "<adaptive|legacy as computed in Step 4.2>",
  "last_regime": "<regime_status from cycle-snapshot-latest.json if known, else unknown>",
  "last_volatility_level": "<volatility_level from cycle-snapshot-latest.json if known, else unknown>"
})
```

### Step 6.1 — CONDITIONAL: docs/signals/ write

```bash
ISO=${NOW_ISO}
# Skip silent non-actionable ticks
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

---

## P3 Fire-Election Release (mandatory — runs here, at end of Step 6)

<!-- P3-FIRE-ELECTION (TASK_1994): explicit release of the fire-time election lock.
     TICK was set in leader-lock.md Step 0b.2 compute_tick_boundary.
     TTL=600s is the crash-safety backstop; this explicit release is the NORMAL exit path.
     ok=false is acceptable (TTL expired on a pathologically long dispatch body — not an error).
     Spec: addendum §D.3 (explicit release mandatory on every exit path). -->

```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              "cron:cowork:" + TICK,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false acceptable: TTL=600s expired (long tick) or already released (re-entrant restart).
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

`send_telegram(channel="work", message="[cowork-team] ERROR ${ISO} — <message> (step <N>)")`

```
# P3: release fire-election on error exit too (all exit paths)
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              "cron:cowork:" + TICK,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
```

Then EXIT.
