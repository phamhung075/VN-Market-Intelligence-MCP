<!-- size-justification: 163L — Step 6 + call_tool emit_pressure_state (EMIT-DARK-v2 Option C) + conditional signal write (atomic temp+validate+rename, CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR step 1) + Error Guard (same atomic pattern). Child of main.md. FR-A4 (TASK_2008c, UC-CDC-P1, 2026-08-15): deleted circular calendar_status arg from Step 6.0's emit_pressure_state call — server now computes it server-side (TASK_2008a), closing the self-recycling loop this arg fed. FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS (2026-08-25, +~20L): new Step 6.2 — RAW-verified (grepped every file under docs/agents/cowork-team/flow/ for "git ") that NO commit step existed anywhere in this dispatcher's whole flow tree for `docs/data/cowork-schedule.json` (Step 5b's own write, `last-fired.md`) or this step's own signal file, despite `git log -- docs/data/cowork-schedule.json` proving this dispatcher commits both every ~15min tick ("chore(cowork): HH:MMZ tick ..."). A missing instruction, not a buggy line — every tick's commit was improvised ad hoc with no governing pathspec mandate, the root cause the sweep-guard hook's `caller_chain` forensic field (same task) was added to help surface for exactly this class of gap. Fixed the same way every other committer in the fleet already is (commit-mutex/SKILL.md, explicit trailing pathspec). -->

## Step 6 — Write telemetry signal + emit pressure state

> **INVARIANT:** enveloped schema `{from, to, type, payload, priority, createdAt}`. NEVER flat root-level fields. All observability fields inside `payload:{}`.

**Conditional signals/ write:** SKIP if `silent==true` AND `spawned[]` empty AND `errors[]` empty. WRITE if spawns occurred OR errors exist.

### Step 6.0 — MANDATORY pressure-state emit (EMIT-DARK-v2 Option C)

Execute this call_tool BEFORE the conditional signal-file write. It is un-skippable and independent of the SILENT guard. The tool computes signal_backlog, dev_queue_depth, and container_vm_headroom_mb server-side (shell computations the dispatcher cannot perform) and atomically writes docs/data/pressure-state.json + promotes cycle-snapshot-latest.json. It NEVER throws — on internal error it returns {success: false, reason: "..."} and the dispatcher continues regardless. `container_vm_headroom_mb` is the mcp-server container's own Docker VM headroom (`free -m` 'available'; renamed from `host_headroom_mb` — FIX-PRESSURE-HOST-HEADROOM-WRONG-MACHINE-WRONG-QUANTITY, 2026-07-28 — it never measured the macOS host).

```
call_tool(server="vn-market", tool="emit_pressure_state", arguments={
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

# ATOMIC-WRITE-GUARD (CLEAN-COWORK-DISPATCHER-TELEMETRY-DRAIN-DIR step 1): write to a
# hidden temp path first, validate it (non-empty AND parseable JSON), THEN rename onto
# the final path. A session interruption mid-heredoc only ever touches TMP — FINAL is
# never created until validation passes, so a 0-byte/truncated artifact can never land
# at the path the drain reads. TMP never ends in ".json" and starts with "." so it is
# invisible to every `docs/signals/*.json` glob (drain, MANDATORY-PERSIST-GUARD count)
# even if a kill mid-write leaves it behind.
FINAL="docs/signals/cowork-team-${ISO}.json"
TMP="docs/signals/.cowork-team-${ISO}.json.tmp.$$"

# Sweep stale temp files (>60min old) left by any prior interrupted run.
find docs/signals -maxdepth 1 -name '.cowork-team-*.tmp.*' -mmin +60 -delete 2>/dev/null || true

cat > "$TMP" <<EOF
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
    "chef_mutex_applied": <true|false>,
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

if [[ -s "$TMP" ]] && jq empty "$TMP" >/dev/null 2>&1; then
  mv "$TMP" "$FINAL"
else
  echo "[cowork-team] WARN telemetry write failed validation (empty or invalid JSON) — tick ${ISO} produced NO signal file at ${FINAL}; bad artifact retained at ${TMP} for forensic review (auto-swept after 60min)" >&2
fi
```

### Step 6.2 — Commit tick artifacts (mutex-guarded)

**CANONICAL, closes FIX-SWEEPGUARD-BARE-COMMIT-REPEAT-AFTER-BLOCK-ROUTER-SESSION-20-WARNS.**
This dispatcher commits `docs/data/cowork-schedule.json` (Step 5b's `last_fired` write,
`last-fired.md`) and this tick's own signal file (Step 6.1 above, `$FINAL` — only if it exists;
Step 6.1 is conditional/SILENT-skippable) every ~15min tick. Run this step unconditionally after
Step 6.1, even on the SILENT/skip branch — `docs/data/cowork-schedule.json` may still carry a
Step 5b `last_fired` update with no signal file this tick, and `git add` on an unmodified-but-
existing path is a harmless no-op (same convention as `docs/agents/po/flow/main.md`'s commit
step). NEVER a bare commit, NEVER `git add -A`/`.`/a directory — trailing pathspec matches the
`git add` line exactly, per `.claude/skills/commit-mutex/SKILL.md` Step 2c:

```bash
OWN_PATHS=(docs/data/cowork-schedule.json)
[ -f "$FINAL" ] && OWN_PATHS+=("$FINAL")   # Step 6.1's own signal file, only if this tick wrote one
```
```
→ skill: .claude/skills/commit-mutex/SKILL.md
  own_paths: ["${OWN_PATHS[@]}"]
  intent:    "chore(cowork): ${TICK} tick"
```
Mutex contract: `commit-mutex:main` (TTL=90s), same canonical id every other `orch-state.json`/
shared-artifact writer in this repo uses. Commit failure is non-fatal (same posture as every
other write in this file, and as commit-mutex's own C-2/C-2b fail-closed paths) — log
`[cowork-team] WARN commit failed — tick artifacts left uncommitted, retry next tick` and
continue to the P3 release below; the on-disk writes (Step 5b/6.1) already happened either way.

---

---

## P3 Fire-Election Release (mandatory — runs here, at end of Step 6)

<!-- P3-FIRE-ELECTION (TASK_1994): explicit release of the fire-time election lock.
     TICK was set in leader-lock.md Step 0b.2 compute_tick_boundary.
     TTL=600s is the crash-safety backstop; this explicit release is the NORMAL exit path.
     ok=false is acceptable (TTL expired on a pathologically long dispatch body — not an error).
     Spec: addendum §D.3 (explicit release mandatory on every exit path). -->

<!-- ORDERING INVARIANT (FIX-COWORK-FIRE-ELECTION-TICK-TOMBSTONE NFR-3): Step 6.0
     (emit_pressure_state, above) MUST run strictly BEFORE this release on the happy
     path -- verified current: Step 6.0 is the first sub-step of Step 6, this release
     is the last. This ordering is what makes the pre-election tombstone check
     (cowork-tick-preflight.sh Step 2.5 / leader-lock.md's mirror) correct-by-
     construction: pressure-state.json's tick_id only ever reflects a COMPLETED tick.
     The Error Guard below (L117-152) deliberately releases WITHOUT calling
     emit_pressure_state first -- that omission is what lets a tick that died before
     Step 6.0 re-run on its next fire (NFR-2). Do NOT "fix" the Error Guard by adding
     an emit_pressure_state call to it, and do NOT reorder Step 6.0 after this release
     -- either change reopens this exact double-fire defect. -->

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

# ATOMIC-WRITE-GUARD — same temp+validate+rename pattern as Step 6.1. This path fires
# precisely when the tick is already failing, i.e. when interruption is MOST likely,
# so it needs the guard at least as much as the happy-path writer.
FINAL="docs/signals/cowork-team-${ISO}-error.json"
TMP="docs/signals/.cowork-team-${ISO}-error.json.tmp.$$"

cat > "$TMP" <<EOF
{"from":"cowork-team","to":"po","type":"dispatcher-error","payload":{"error":"<message>","step":"<N>"},"createdAt":"${ISO}"}
EOF

if [[ -s "$TMP" ]] && jq empty "$TMP" >/dev/null 2>&1; then
  mv "$TMP" "$FINAL"
else
  echo "[cowork-team] WARN error-signal write failed validation (empty or invalid JSON) — tick ${ISO} produced NO error signal file at ${FINAL}; bad artifact retained at ${TMP} for forensic review" >&2
fi
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
