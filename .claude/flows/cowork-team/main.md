<!-- size-justification: ~300L — single dispatcher flow; cron-match logic extracted to .claude/scripts/cowork-match-slots.js. Step 4.6 slot-lock (Sprint 1955 Phase 2) + Step 4.7 tick-snapshot (1968c-P01) + §drift-min threshold table (1967-09) added inline for auditability. Error boundary + telemetry + collision guard remain inline. Split deferred until next architectural sprint. -->

# cowork-team — Master Cron Dispatcher

## Team Boundary (Sprint 1951c)

This dispatcher spawns ONLY cowork-team agents per `docs/data/cowork-schedule.json`:
- **scheduled:** news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau
- **demand-spawnable:** report-analyzer, qa-responder, market-analyst

NEVER spawn dev-team agents (po, ba, architect, pm, developer, qa, fixer, dev-*, ops) from this dispatcher.

Cross-team work (e.g. a cowork agent finds a code bug or needs a dev-team action): write a signal row to `docs/signals/DASHBOARD.md` per skill `.claude/skills/signal-dashboard/SKILL.md`. The dev-team flow drains the dashboard (Step 0a-D in `drain-signals.md`) at its next cycle.

Maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) are invoked by main terminal or self-cron — NEVER spawned by this dispatcher.

Fires every 15 min via `*/15 * * * *` CronCreate (Claude Code CLI). Reads `docs/data/cowork-schedule.json`, matches current UTC ±2min, parallel fan out matching subagent for working in one message block.

<!-- decision: OQ-1 — Spawn primitive shape. Confirmed: same subagent_type pattern as dev-team. The `agent_id` field in cowork-schedule.json maps 1:1 to subagent_type in the Agent tool call. Spawn prompt = "run <flow_path>  slot=<slot_id>" (mirrors existing trigger_prompt field). No new spawn primitive needed — Claude Code CLI Agent tool is the mechanism, identical to how dev-team spawns po/ba/architect etc. -->

<!-- decision: OQ-2 — Collision-detection guard. Added in Step 4b below: if two or more matching slots share the same agent_id, log a WARNING to WORK channel listing the duplicate agent_id and both slot_ids. This is a schema-drift guard — no collision exists in the current 16-slot inventory (chef-morning/eod/evening all have distinct minutes; */15 slots on the same agent_id are intentional co-fires). The guard does NOT block spawns — R3 from brief §5 explicitly allows same agent_id multi-slot firing. -->

**SSOT:** `docs/data/cowork-schedule.json`
**Fail-loud protocol:** `docs/protocols/fail-loud-protocol.md`

---

## Step 0a — Drain `docs/signals/DASHBOARD.md` (cross-team inbox)

Read DASHBOARD.md per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find all cowork-addressed sections (po, tran-ngoc-bau, unified-agent, alert-commander).
Collect `status=NEW` rows → load payloads → route to matching agent slot at Step 5 or log for PO.
Mark each processed row `NEW → READ`. If DASHBOARD.md missing → log `"[cowork-team] dashboard skip"` and continue. Never fail-loud on this step.

---

## Step 1 — Resolve current UTC

```bash
NOW_ISO=$(date -u +%Y%m%dT%H%M%SZ)
```

Save as NOW_ISO. Slot-matcher script reads the system clock directly — no field parsing needed.

---

## Step 2+3 — Match enabled slots (single call)

```bash
RAW=$(node .claude/scripts/cowork-match-slots.js)
MATCHES=$(echo "$RAW" | jq '.slots')
DRIFT_MIN=$(echo "$RAW" | jq '.drift_min')
```

Script SSOT: `.claude/scripts/cowork-match-slots.js` — reads `docs/data/cowork-schedule.json`, filters `enabled && !_disabled_by`, cron ±2min window, returns `{"slots": [{slot_id, agent, flow_path, cron, trigger_prompt}, ...], "drift_min": <N>}`. `drift_min` = `actualUTCMinute − nominalTick` (always 0–14).

**On script error** (non-zero exit / non-JSON output / schedule.json missing):
- `send_telegram(channel=work, "[cowork-team] slot-matcher failed: <stderr first line>")`
- Write `docs/signals/cowork-team-${NOW_ISO}-error.json` → `{from:"cowork-team", to:"po", type:"matcher-error", payload:{error:"<msg>"}, createdAt:"${NOW_ISO}"}`
- EXIT immediately.

---

## §drift-min

<!-- anchor: §drift-min — reserved for L-10 delta-read. Do NOT merge into other steps. -->
<!-- collision-scope: drift_min commentary ONLY. Spawn-guard region (Step 4.6+) is reserved for TASK_1967-10. -->

## Step 3b — Drift threshold guard (TASK_1967-05 fix)

After receiving `DRIFT_MIN` from the slot-matcher script:

```
if DRIFT_MIN > 10:
  send_telegram(channel=work,
    "[cowork-team] WARN drift_min=${DRIFT_MIN} exceeds 10min threshold; slot lock safety margin narrowing. Review system load. Safe limit: drift_min < 15.")
  # Do NOT block — proceed to Step 4. Warning only.
```

**Drift envelope thresholds:**

| drift_min | Status | Action |
|-----------|--------|--------|
| 0 – 10 | Safe | None — floor-15min rounding absorbs lag |
| 11 – 14 | Caution | WORK telegram warning (above) |
| ≥ 15 | Collision risk | Two ticks could map to same nominal_tick key → duplicate slot-lock claim collision possible. Escalate immediately. |

**Rationale:** Floor-15min nominal_tick rounding absorbs drift safely up to drift_min=14. At drift_min ≥ 15, two ticks could map to the same nominal_tick key, causing a duplicate slot-lock claim collision. The 10-min warning provides a 5-minute safety margin to detect load drift before it becomes a structural risk.

**Current safe envelope:** drift_min max observed = 9 (2026-05-21). No spawn is blocked by this check. Warning threshold = 10. Danger threshold = 15.

---

## Step 4 — Silent exit if no matches

If MATCHES is `[]` or empty (i.e. `jq 'length == 0'` on the slots array):
- Write silent telemetry signal (Step 6, `silent: true`).
- EXIT. No WORK message, no spawns.

---

## Step 4b — Collision-detection guard (schema-drift warning)

Before spawning, group MATCHES by `agent_id`. For any `agent_id` that appears in ≥2 slots:

```
send_telegram(channel=work,
  "[cowork-team] WARN collision: agent_id=<id> matched <N> slots: <slot_id_1>, <slot_id_2>, ... — all will spawn (R3). Check schedule schema if unexpected.")
```

This is a WARNING only — do NOT block spawns. Intentional multi-slot fires (e.g. `*/15` slots) are expected per brief §5 R3.

---

<!-- spawn-guard: policy-only — no runtime assertion; enforced by convention, not code check (ITEM-16 doc note, 1967-10). NEVER spawn dev-team agents from this dispatcher. -->

<!-- decision: Step 4.6 Model 1 — Master holds lock 900s TTL, agents do NOT heartbeat.
  Rationale: cowork-slots are time-bucketed by nominal_tick (floor-15min UTC). A 900s TTL
  covers exactly one 15-min cycle. If the spawned agent stalls or the master crashes after
  claiming, the lock auto-expires before the NEXT nominal_tick, which uses a fresh key
  ("cowork-slot:<agent>:<next_tick>"). There is no risk of stale locks blocking future cycles.
  Model 2 (master releases via agent signal) was considered but rejected: it requires the
  spawned agent to signal back, adding coupling and a new failure mode. Model 1 is correct
  for cowork-slot because the key is tick-scoped — see architecture brief §7 (2026-05-20).
  Implementation note: release is called after each spawn attempt (success OR failure) via a
  try/finally pattern. If ALL matched slots are held by other sessions, exit silently with
  telemetry all_held=true. Partial holds (some won, some held): spawn only WON_SLOTS. -->

## Step 4.6 — Slot lock claim (Model 1: master holds the lock)

Compute `nominal_tick` = floor-15min of current UTC minute (same math as `cowork-match-slots.js`):

```bash
ACTUAL_M=$(date -u +%M | sed 's/^0//')   # strip leading zero
M=$(( (ACTUAL_M / 15) * 15 ))
nominal_tick=$(date -u +%Y%m%dT%H)$(printf '%02d' $M)00Z
```

Initialize tracking arrays:

```bash
WON_SLOTS=[]     # slots where task_claim returned claimed=true
HELD_BY_OTHER=[] # slots where task_claim returned claimed=false
```

For each slot in MATCHES, attempt claim:

```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-slot:" + slot.agent + ":" + nominal_tick,
  task_kind:   "cowork-slot",
  owner_agent: "cowork-team",
  ttl_seconds: 900,
  payload:     JSON.stringify({ slot_id: slot.slot_id, agent: slot.agent, flow_path: slot.flow_path })
})
```

On claim result:

```
if result.claimed == false:
  send_telegram(channel=work,
    "[cowork-team] slot held by ${result.current_holder.owner_session} → skip ${slot.slot_id}")
  append slot to HELD_BY_OTHER
  continue to next slot

if result.claimed == true:
  append slot to WON_SLOTS
```

All-held guard (after iterating all MATCHES):

```
if WON_SLOTS is empty:
  # Silent exit — write telemetry (Step 6) with all_held=true, then EXIT.
  # Do NOT send a WORK telegram. Do NOT attempt any spawns.
  EXIT (go to Step 6 with all_held=true)
```

---

## Step 4.7 — Write shared tick snapshot (L-6, 1968c-P01)

<!-- Writes docs/data/cycle-snapshot-<HH:MM>.json before agent spawn.
     Agents read this file instead of calling get_cycle_bootstrap independently.
     File is ephemeral (overwritten each tick). Not git-committed (.gitignore).
     Fallback: if this step fails, agents fall back to direct get_cycle_bootstrap — zero blocker.
     HARDENED 2026-05-25: All scratch/staging MUST be project-local under docs/data/ — NEVER /tmp or any path outside the repo.
     Executor receives MCP tool output as text and stages it to project-local files for jq. -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path).

**STAGING FILE LOCATIONS (critical hardening):** All scratch must land under `docs/data/`. Never use `/tmp` or paths outside the repo.

```bash
# Resolve tick key (floor-15min, same math as nominal_tick above)
FILE_TICK=$(date -u +%H:%M)

# Staging file paths — project-local only, never /tmp
MC_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.mc.stage"
MACRO_STAGE="docs/data/.cycle-snapshot-${FILE_TICK}.macro.stage"
SNAPSHOT_FILE="docs/data/cycle-snapshot-${FILE_TICK}.json"
TMPFILE="${SNAPSHOT_FILE}.tmp"

# Clean up any stale staging files (success or failure)
trap "rm -f \"$MC_STAGE\" \"$MACRO_STAGE\"" EXIT

# Call get_cycle_bootstrap once for the snapshot payload
# Executor receives as conversation text; stage to MC_STAGE for jq --rawfile
BOOTSTRAP_RESULT=$(call_tool(server="vn-market", tool="get_cycle_bootstrap",
  arguments={"agent_name": "cowork-team"}))
echo "$BOOTSTRAP_RESULT" > "$MC_STAGE"

# Call get_macro_snapshot once for the macro payload
# Executor receives as conversation text; stage to MACRO_STAGE for jq --slurpfile
MACRO_RESULT=$(call_tool(server="vn-market", tool="get_macro_snapshot", arguments={}))
echo "$MACRO_RESULT" > "$MACRO_STAGE"

# Assemble final snapshot from staged files
# jq --rawfile reads MC_STAGE as a raw string, --slurpfile reads MACRO_STAGE as JSON array
jq -n \
  --arg tick "$FILE_TICK" \
  --arg created_at "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" \
  --rawfile market_context_raw "$MC_STAGE" \
  --slurpfile macro_snapshot_raw "$MACRO_STAGE" \
  '{tick: $tick, created_at: $created_at, market_context: ($market_context_raw | fromjson | .market_context // {}), macro_snapshot: $macro_snapshot_raw[0]}' \
  > "$TMPFILE" && mv "$TMPFILE" "$SNAPSHOT_FILE"
```

**On any error in this step** (tool failure, jq error, write failure): log `"[cowork-team] tick-snapshot write failed: <error>"` and continue to Step 5. Do NOT block spawns — agents fall back to direct `get_cycle_bootstrap` via the Step -1 miss path in `cycle-bootstrap/SKILL.md`. Staging files are cleaned via trap EXIT in all cases.

---

## Step 5 — Parallel fan-out

Fire **all** WON_SLOTS simultaneously in a single Agent tool message block. No sequential gating.

For each slot in WON_SLOTS:

```
subagent_type : <slot.agent>
prompt        : "run <slot.flow_path>  slot=<slot.slot_id>"
description   : "<slot.slot_id> dispatch"
```

Track spawn results: success (no error) vs failure (agent tool returns error).

**On spawn failure for any slot:**
- Log to `errors[]` in telemetry (Step 6).
- `send_telegram(channel=work, "[cowork-team] spawn failed: <slot.slot_id> — <one-line error>")`
- Continue remaining spawns. R4: one slot failure never blocks others.

**On flow path missing** (slot.flow_path does not exist as a file — verify before spawn):
- `send_telegram(channel=work, "[cowork-team] flow missing: <slot.slot_id> → <slot.flow_path>")`
- Add to `errors[]`. Skip this slot's spawn.

**After each spawn attempt (success OR failure) — release lock immediately (try/finally):**

```
try:
  spawn agent for slot
finally:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id: "cowork-slot:" + slot.agent + ":" + nominal_tick
  })
  # ok=false is acceptable (already expired or stolen) — ignore release errors
```

---

## Step 6 — Write telemetry signal

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
    "errors": [<{slot_id, error} per failed spawn>]
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
