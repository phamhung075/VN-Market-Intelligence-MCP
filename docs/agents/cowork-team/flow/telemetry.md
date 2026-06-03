<!-- size-justification: 72L — Step 6 + Error Guard: telemetry signal write + unhandled error boundary. Child of main.md. -->

## Step 6 — Write telemetry signal

> **INVARIANT:** output MUST use enveloped schema `{from, to, type, payload, priority, createdAt}`.
> NEVER write flat root-level fields (`classification`, `reason`, `tick_nominal`, `written_at`).
> All observability fields (`classification`, `reason`, `tick_nominal`, `drift_min`, `matched_slots`,
> `leader_lock`, `spawned`, `dev_head`, `devq`, `signal_backlog`, `note`) MUST be nested inside `payload:{}`.

After each fire cycle (whether spawns happened or silent exit):

```bash
ISO=${NOW_ISO}
mkdir -p docs/signals
cat > docs/signals/cowork-team-${ISO}.json <<EOF
{
  "from": "cowork-team",
  "to": "dev-team",
  "type": "cowork-fire",
  "payload": {
    "fire_time": "${ISO}",
    "matched_slots": [<slot_ids from MATCHES>],
    "won_slots": [<slot_ids from WON_SLOTS — slots where claim succeeded>],
    "held_by_other": [<slot_ids from HELD_BY_OTHER — slots held by another session>],
    "all_held": <true if WON_SLOTS is empty and HELD_BY_OTHER is non-empty>,
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
    "devq": <pending task count in dev queue>,
    "signal_backlog": <unprocessed signal count in docs/signals/>,
    "note": "<free-text observation for this cycle>"
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
