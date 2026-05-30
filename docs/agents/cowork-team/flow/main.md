<!-- size-justification: 510L — single dispatcher flow; cron-match logic extracted to .claude/scripts/cowork-match-slots.js. Step 0b leader lock (DWF-DEV-CROSS-4 Phase 2) + Step 4.6 per-work-item token (R1/R3 blocking, suffix-free, ttl=180s) + Step 4.6b heartbeat (DWF-DEV-CROSS-4) + Step 4.7 tick-snapshot (1968c-P01) + Step 4.8 pressure-state emitter (DWF-DEV-CROSS-3) + §drift-min threshold table (1967-09) + Step 5 published-marker gate instruction text (DWF-DEV-CROSS-5 FR-P2-7) added inline for auditability. Error boundary + telemetry + collision guard remain inline. Split deferred until next architectural sprint. -->

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

## Step 0b — Claim cowork-leader lock (DWF-DEV-CROSS-4 Phase 2 — FR-P2-5)

<!-- Leader lock: ensures exactly one session leads each tick. Two+ concurrent CLI sessions
     sharing the same mcp-server Docker process cannot both dispatch. WIN → proceed.
     LOSE → silent exit, no dispatch, no WORK message.
     TTL = 1800s (2 × 15-min heartbeat). MUST be explicit — never rely on default 3600s (AC-P2-5-3).
     Heartbeat: after dispatch body (Step 4.6b), extend TTL from current time.
     Dark window after force-recreate: max 1800s — see docs/protocols/dwf-ops-runbook.md. -->

```
LEADER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-leader",
  task_kind:   "cowork-slot",
  ttl_seconds: 1800,
  owner_agent: "cowork-dispatcher"
}))
```

```
if LEADER_CLAIM.claimed != true:
  # Another session holds the leader lock — silent exit
  log "[cowork] leader lock held by peer — silent exit"
  EXIT
```

Win → proceed with dispatch body.

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

---

## Step 4.2 — Read and validate pressure-state.json (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-6: Staleness self-check on every tick (NFR-P1-7).
     AC-P1-6-1: Missing → legacy cron fallback, zero behavioral difference from today.
     AC-P1-6-2: emitted_at > 20 min old → fallback.
     AC-P1-6-3: stale_warning=true → fallback even if emitted_at is recent.
     _staleness_threshold_minutes is read from cadence-policy.json (SSOT — not hardcoded).
     Rate-limit WORK telegram: only emit when staleness epoch changes (tick_id differs). -->

```
PRESSURE_FILE   = "docs/data/pressure-state.json"
POLICY_FILE     = "docs/data/cadence-policy.json"
PRESSURE_MODE   = "adaptive"   # default; may downgrade to "legacy" below
PRESSURE_STATE  = null

# Load cadence policy (needed for _staleness_threshold_minutes)
if POLICY_FILE is missing or fails JSON parse:
  log "[cowork] WARN: cadence-policy.json missing/malformed — cadence fallback to legacy cron"
  PRESSURE_MODE = "legacy"
  → skip to Step 4.5b (CADENCE_MATCHES = MATCHES; proceed to Step 4.6)
else:
  POLICY_OBJ = JSON.parse(readFile(POLICY_FILE))
  STALENESS_THRESHOLD = POLICY_OBJ._staleness_threshold_minutes || 20

# Load pressure state
if PRESSURE_FILE is missing or fails JSON parse:
  reason = "missing" if file absent else "malformed"
  log "[cowork] WARN: pressure-state.json unavailable (" + reason + ") — cadence fallback to legacy cron"
  send_telegram(channel=work, "[cowork] WARN: pressure-state.json unavailable — cadence fallback to legacy cron (reason: " + reason + ")")
  PRESSURE_MODE = "legacy"
  → skip to Step 4.5b (CADENCE_MATCHES = MATCHES; proceed to Step 4.6)
else:
  PRESSURE_STATE = JSON.parse(readFile(PRESSURE_FILE))
  # isStale checks both stale_warning flag AND age threshold (AC-P1-6-2 / AC-P1-6-3)
  stale = isStale(PRESSURE_STATE, STALENESS_THRESHOLD)   # from cadence-policy.js
  if stale:
    reason = "stale_warning_flag" if PRESSURE_STATE.stale_warning == true else "stale"
    log "[cowork] WARN: pressure-state.json stale (reason: " + reason + ") — cadence fallback to legacy cron"
    # Rate-limit telegram: only emit when tick_id changes vs previous staleness epoch
    PRESSURE_MODE = "legacy"
    → skip to Step 4.5b (CADENCE_MATCHES = MATCHES; proceed to Step 4.6)

# PRESSURE_MODE = "adaptive" — proceed to Steps 4.3, 4.4, 4.5
```

If `PRESSURE_MODE = "legacy"` at end of this step: CADENCE_MATCHES = MATCHES (raw from Steps 2+3). Skip Steps 4.3–4.5. Proceed directly to Step 4.5b. This satisfies NFR-P1-3 (never worse than today).

---

## Step 4.3 — Calendar suppression (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-4: Suppress non-guaranteed slots on holiday/weekend.
     BLOCKER-1 resolution: suppression runs BEFORE Step 4.6 per-work-item claim.
     No token is acquired for suppressed slots — no task_release needed.
     AC-P1-4-1: holiday → guaranteed slots still fire (never suppressed).
     AC-P1-4-2: unknown → no suppression (conservative).
     OQ-P1-3: bctc-offmarket + holiday → suppress; bctc-offmarket + weekend → NOT suppressed here
               (cadence policy handles 1440-min rate for weekend bctc slots in Step 4.4). -->

Only runs if `PRESSURE_MODE = "adaptive"`.

```
CALENDAR_STATUS = PRESSURE_STATE.calendar_status   # from Step 4.2

SUPPRESS_CALENDAR = new Set()

if CALENDAR_STATUS in ["holiday", "weekend"]:
  for each slot in MATCHES:
    if slot.guaranteed == true:
      continue   # guaranteed slots never suppressed (NFR-P1-4)

    if slot.policy_id == "bctc-offmarket":
      if CALENDAR_STATUS == "holiday":
        SUPPRESS_CALENDAR.add(slot.slot_id)
        log "[cowork] calendar suppress: " + slot.slot_id + " reason=holiday (bctc-offmarket policy)"
      # bctc-offmarket + weekend: NOT suppressed here — Step 4.4 cadence policy resolves 1440-min rate
      continue

    # All other non-guaranteed slots: suppress on holiday OR weekend
    SUPPRESS_CALENDAR.add(slot.slot_id)
    log "[cowork] calendar suppress: " + slot.slot_id + " reason=" + CALENDAR_STATUS

# No token acquired → no task_release needed (BLOCKER-1 resolution)
CALENDAR_ALLOWED = MATCHES.filter(s => !SUPPRESS_CALENDAR.has(s.slot_id))
```

For `CALENDAR_STATUS` values `"open"`, `"half_day"`, `"unknown"`: no suppression (conservative — AC-P1-4-2).

---

## Step 4.4 — Cadence due-check (adaptive mode) (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-3: evaluateCadence per slot; due = elapsed >= cadence.
     EC-3: last_fired=null → always due (first-run semantics).
     _cron_fallback: bctc-offmarket on open/half_day/unknown → cron governs.
     AC-P1-3-1: last_fired=null → always included.
     AC-P1-3-2: elapsed < cadence → not included.
     AC-P1-3-3: elapsed >= cadence → included.
     AC-P1-3-4: output slots carry due_reason + cadence_minutes fields. -->

Only runs if `PRESSURE_MODE = "adaptive"`.

```
{ signal_backlog_tier, volatility_tier } = computeTiers(PRESSURE_STATE)
  # signal_backlog_tier: low=0–2, medium=3–9, high=≥10
  # volatility_tier: low if last_volatility_level in ["unknown","low"], high otherwise

CADENCE_MATCHES = []

for each slot in CALENDAR_ALLOWED:
  if slot.policy_id == null:
    # Legacy cron — already matched by Steps 2+3; pass through unchanged
    CADENCE_MATCHES.push(slot with { due_reason: "cron", cadence_minutes: null })
    continue

  policy_result = evaluateCadence(slot.policy_id, CALENDAR_STATUS, signal_backlog_tier, volatility_tier, POLICY_OBJ)
  # evaluateCadence: first-match in cadence-policy.json array; unmatched → interval_minutes=240

  if policy_result._cron_fallback == true:
    # bctc-offmarket on open/half_day/unknown — cron already matched this slot in Steps 2+3
    CADENCE_MATCHES.push(slot with { due_reason: "cron", cadence_minutes: null })
    continue

  if policy_result.interval_minutes == null:
    # Suppressed by policy (e.g. chef-intraday on holiday/weekend)
    log "[cowork] cadence suppress: " + slot.slot_id + " policy=" + slot.policy_id + " reason=null_interval calendar=" + CALENDAR_STATUS
    continue   # do not add to CADENCE_MATCHES; no token acquired

  cadence_seconds = policy_result.interval_minutes * 60
  last_fired_unix = slot.last_fired ? new Date(slot.last_fired).getTime() / 1000 : null

  if last_fired_unix == null:
    # EC-3: first-run semantics (last_fired=null → always due)
    CADENCE_MATCHES.push(slot with { due_reason: "first_run", cadence_minutes: policy_result.interval_minutes })
    continue

  elapsed_seconds = now_unix - last_fired_unix
  if elapsed_seconds >= cadence_seconds:
    CADENCE_MATCHES.push(slot with { due_reason: "cadence", cadence_minutes: policy_result.interval_minutes })
  else:
    log "[cowork] cadence skip: " + slot.slot_id + " elapsed=" + Math.floor(elapsed_seconds) + "s cadence=" + cadence_seconds + "s"
    # no token acquired — no release needed
```

---

## Step 4.5 — Freshness silent-downgrade for gatherer slots (DWF-PHASE1)

<!-- DWF-PHASE1 FR-P1-5: Suppress gatherer slots when all three conditions hold:
     last_regime="unknown" AND signal_backlog=0 AND calendar_status in ["holiday","weekend"].
     Condition: "nothing has changed and market is closed — no value in running gatherers."
     AC-P1-5-1: Three-condition AND gate enforced (not two of three).
     This downgrade applies only to non-guaranteed gatherers; guaranteed slots are never touched. -->

Only runs if `PRESSURE_MODE = "adaptive"`.

```
GATHERER_SLOTS = ["news-scout-offhours", "market-watcher-offhours", "news-scout-sentiment", "market-watcher-eod"]

DOWNGRADED = []

if PRESSURE_STATE.last_regime == "unknown"
   AND PRESSURE_STATE.signal_backlog == 0
   AND CALENDAR_STATUS in ["holiday", "weekend"]:

  for each slot in CADENCE_MATCHES:
    if slot.slot_id in GATHERER_SLOTS AND slot.guaranteed == false:
      DOWNGRADED.push(slot.slot_id)
      log "[cowork] freshness downgrade: " + slot.slot_id + " — no regime, empty backlog, market closed"

  CADENCE_MATCHES = CADENCE_MATCHES.filter(s => !DOWNGRADED.includes(s.slot_id))
  # Note: these slots were in CADENCE_MATCHES but not yet claimed — no token release needed (BLOCKER-1)
```

---

## Step 4.5b — Resolve final CADENCE_MATCHES (DWF-PHASE1)

<!-- BLOCKER-1 resolution: CADENCE_MATCHES is the result after all Phase 1 gates.
     Step 4.6 receives this set (rebind MATCHES = CADENCE_MATCHES).
     Legacy mode: CADENCE_MATCHES = raw MATCHES from Steps 2+3 (no filtering). -->

```
# Rebind MATCHES for Step 4.6 compatibility
# After this step: MATCHES contains only calendar-allowed + cadence-due + not-freshness-downgraded slots
MATCHES = CADENCE_MATCHES
```

Telemetry fields added to Step 6 payload (for observability):
```
{
  "pressure_mode":        "<adaptive|legacy>",
  "calendar_status":      "<status>",
  "suppressed_calendar":  ["<slot_ids suppressed in Step 4.3>"],
  "suppressed_cadence":   ["<slot_ids skipped in Step 4.4 for null interval or elapsed<cadence>"],
  "downgraded":           ["<slot_ids removed in Step 4.5>"],
  "due_reasons":          { "<slot_id>": "<cadence|cron|first_run>" },
  "cadence_minutes":      { "<slot_id>": <N|null> }
}
```

---

<!-- decision: Step 4.6 REWRITTEN — DWF-DEV-CROSS-4 Phase 2 (R1 + R3 blocking).
  OLD: key = cowork-slot:<agent>:<nominal_tick>; TTL = 900s (stale after next tick).
  NEW: key = cowork-slot:<slot_id> (SUFFIX-FREE — R3); TTL = 180s (EXPLICIT, mandatory — R1).

  R3 rationale: A tick suffix (e.g. cowork-slot:chef-morning@2026-05-30T05:15:00Z) changes
  the lock key at each 15-min boundary. A peer session at the next tick acquires a fresh key
  for the same work — re-launching a job that is still running. Suffix-free key (slot_id only)
  means the lock persists across ticks for as long as the job runs + renews.
  KEY: cowork-slot:<slot_id> — slot_id is stable work identity (NOT agent name alone, because
  same-agent multi-slot fires must get DISTINCT locks per slot_id).

  R1 rationale: Default TTL is 3600s. A crash after 5s would hold the lock for 3595 more
  seconds. TTL=180s (~3 min) frees the lock within one dispatch cycle on crash, preventing
  1-hour starvation. Long-running agents renew via heartbeat (Step 4.6b optional; required
  in future phases with long dev chains). NEVER omit ttl_seconds — the test checks its presence.

  Release: called after each spawn attempt (success OR failure) via try/finally. Per ARCH-DECIDE-B
  the spawned agent's own heartbeat chain extends the lock for long jobs. For short cowork
  jobs (< 3 min) the 180s TTL auto-frees after job completes without explicit release needed. -->

## Step 4.6 — Per-work-item idempotent token (REWRITTEN — DWF-DEV-CROSS-4, R1+R3 blocking)

Initialize tracking arrays:

```bash
WON_SLOTS=[]     # slots where task_claim returned claimed=true
HELD_BY_OTHER=[] # slots where task_claim returned claimed=false
```

For each slot in MATCHES, attempt per-work-item claim:

```
# KEY: suffix-free cowork-slot:<slot_id> — R3 BLOCKING (no nominal_tick, no time suffix)
# TTL: explicit 180s — R1 BLOCKING (never the default 3600s)
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-slot:" + slot.slot_id,
  task_kind:   "cowork-slot",
  owner_agent: "cowork-dispatcher",
  ttl_seconds: 180,
  payload:     JSON.stringify({ slot_id: slot.slot_id, agent: slot.agent, flow_path: slot.flow_path })
})
```

On claim result:

```
if result.claimed == false:
  log "[cowork] slot " + slot.slot_id + " already claimed — skip duplicate spawn"
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

## Step 4.6b — Heartbeat leader lock (DWF-DEV-CROSS-4 Phase 2 — ARCH-DECIDE-B)

<!-- After all per-work-item slots are processed (win or skip), renew the leader lock TTL.
     This extends expires_at from current time by 1800s so a long dispatch body (tick-snapshot
     write + pressure-state emit + fan-out) does not self-expire the leader lock mid-tick.
     Pattern: explicit task_heartbeat on each tick win (ARCH-DECIDE-B: cleaner than reclaim).
     ok=false: lock was stolen (another session won during this long tick) — log, proceed anyway
     (we already won all per-work-item slots; dispatch body continues; no spawn gate here). -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path).

```
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cowork-leader"
})
```

On heartbeat failure (`ok=false`): log `"[cowork-team] leader heartbeat failed — lock may have been stolen; continuing dispatch"`. Do NOT abort — per-work-item tokens were already won.

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

# signal_backlog: count of unprocessed signal JSON files
SIGNAL_BACKLOG=$(ls docs/signals/*.json 2>/dev/null | wc -l | tr -d ' ')

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

# dev_queue_depth: approximate count of OPEN/IN_PROGRESS tasks in TASKS.md
DEV_QUEUE_DEPTH=$(grep -cE '\|\s*(OPEN|IN_PROGRESS)\s*\|' docs/TASKS.md 2>/dev/null || echo 0)
DEV_QUEUE_DEPTH=${DEV_QUEUE_DEPTH:-0}

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

---

## Step 5 — Parallel fan-out

<!-- Published marker gate (FR-P2-7, DWF-DEV-CROSS-4 Phase 2 — ARCH-DECIDE-C):
     The spawned agent flow MUST claim a published marker BEFORE calling send_telegram.
     This is belt-and-suspenders with the per-work-item token: the token prevents duplicate
     spawns; the publish marker prevents duplicate sends if a spawn somehow executes twice.

     Pattern each spawned agent MUST follow (in its own flow, before send_telegram):
       1. Compute work_date = current VN date (GMT+7) in YYYY-MM-DD format
       2. Claim the published marker:
          publish_claim = call_tool(server="vn-market", tool="task_claim", arguments={
            task_id:     "published:" + slot_id + ":" + work_date,
            task_kind:   "cowork-slot",
            owner_agent: "<agent_id>",
            ttl_seconds: 100800   # 28h per ARCH-DECIDE-D (daily slots)
          })
       3. if publish_claim.claimed == false:
            log "[cowork] publish blocked — already published work-id=" + slot_id + ":" + work_date
            EXIT (do not call send_telegram)
       4. if publish_claim.claimed == true:
            proceed with send_telegram(...)
     Weekly slots (digest-sunday, tnb-audit): use work_date = ISO week (YYYY-WW) + ttl_seconds=691200 (8d).
     The publisher owns the marker — the dispatcher (this flow) does NOT call publish markers. -->

**Important — Published marker gate (FR-P2-7):** Each spawned agent MUST check and set a
published marker BEFORE calling `send_telegram`. This is the final belt-and-suspenders
defense against duplicate Telegram posts: the per-work-item token (Step 4.6) prevents
duplicate spawns; the published marker prevents duplicate sends if a spawn somehow executes
twice (e.g. retry under transport lag).

The key identifies CONTENT, not the dispatch attempt: `published:<slot_id>:<YYYY-MM-DD>`.
A new date = genuinely new content = new key, so the next day's dish is never blocked.

```
# In the spawned agent flow — BEFORE send_telegram:

WORK_DATE=$(TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d)   # VN date (GMT+7)
PUBLISHED_KEY="published:<slot_id>:${WORK_DATE}"

MARKER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     PUBLISHED_KEY,
  task_kind:   "cowork-slot",
  owner_agent: "<agent_id>",
  ttl_seconds: 100800    # 28h for daily slots (ARCH-DECIDE-D)
                         # Weekly slots (digest-sunday, tnb-audit): ttl_seconds = ~8 days
                         # (see coordinationStore TTL cap)
}))

if MARKER_CLAIM.claimed != true:
  log "[cowork] publish blocked — already published work-id=<slot_id>:<WORK_DATE>"
  EXIT   # Do NOT call send_telegram — already published today

# Marker claimed → proceed with send_telegram
send_telegram(channel, message, ...)
```

TTL values:
- **Daily slots** (`ttl_seconds: 100800` = 28 hours): covers the full 24h content cycle
  with a 4h buffer against timezone drift. A 24h TTL risks a same-day retry leaking through
  at a 23h59m gap.
- **Weekly slots** (`ttl_seconds` = ~8 days, see coordinationStore TTL cap): digest-sunday
  and tnb-audit use ISO week as `work_date` (`YYYY-WW` format, e.g. `2026-W22`).

Where this gate lives: inside each spawned agent's own flow, co-located with `send_telegram`.
The dispatcher (this file) does NOT set published markers — the publishing agent is responsible.
See `docs/protocols/dwf-ops-runbook.md` § Published Marker Interaction for ops context.

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

**After each spawn attempt (success OR failure) — release per-work-item token immediately (try/finally):**

```
try:
  spawn agent for slot
finally:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id: "cowork-slot:" + slot.slot_id
  })
  # ok=false is acceptable (already expired, stolen, or crashed) — ignore release errors
  # NOTE: key uses slot.slot_id (suffix-free) matching the claim in Step 4.6
```

---

## Step 5b — Batch `last_fired` write (DWF-PHASE1 FR-P1-7)

<!-- BLOCKER-3 resolution: single batched read→update-all-WON→write.tmp→rename.
     No per-slot writes (avoids lost-update race from parallel fan-out).
     Only WON_SLOTS (successful spawns) update last_fired — failed spawns leave it unchanged.
     Non-fatal on write failure: log WARN, continue to Step 6, do NOT roll back spawns.
     AC-P1-7-1: last_fired written after successful spawn.
     AC-P1-7-2: spawn failure → last_fired NOT written.
     AC-P1-7-3: write failure is non-fatal; spawn already happened. -->

Only execute if `WON_SLOTS` is non-empty (skip on silent-exit path).

```
FIRED_AT      = new Date().toISOString()   # UTC ISO8601 — same timestamp for all WON_SLOTS in this tick
SCHED_FILE    = "docs/data/cowork-schedule.json"
SCHED_TMPFILE = "docs/data/cowork-schedule.json.tmp"

try:
  # Single read — load entire schedule into memory
  schedule = JSON.parse(readFileSync(SCHED_FILE, 'utf8'))

  # Update in memory — only for WON_SLOTS (suppressed + held slots untouched)
  WON_IDS = new Set(WON_SLOTS.map(s => s.slot_id))
  for each slot in schedule.slots:
    if WON_IDS.has(slot.slot_id):
      slot.last_fired = FIRED_AT

  # Atomic write: write to .tmp then rename (AC-P1-2-2 / NFR-P1-6)
  writeFileSync(SCHED_TMPFILE, JSON.stringify(schedule, null, 2))
  renameSync(SCHED_TMPFILE, SCHED_FILE)

  log "[cowork-team] last_fired updated for slots: " + [...WON_IDS].join(", ") + " at " + FIRED_AT

catch (e):
  # Non-fatal: spawn already happened (Steps 0–5 complete). Next tick computes due from stale last_fired.
  # Conservative: under-suppress (slot may fire again at next tick) — never over-suppress.
  # Do NOT abort or roll back the spawn (FR-P1-7 AC-P1-7-3).
  log "[cowork-team] WARN: last_fired write failed: " + e.message + " — slot(s): " + WON_SLOTS.map(s=>s.slot_id).join(", ")
  # Telemetry captures the failure in last_fired_write_errors below
```

**Extend telemetry payload (Step 6):** Add these fields to the signal output:

```json
{
  "last_fired_timestamp":    "<ISO8601 of write — same as FIRED_AT>",
  "last_fired_slots":        ["<slot_ids whose last_fired was updated>"],
  "last_fired_write_errors": "<null or error message if write failed>"
}
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
    "last_fired_write_errors": "<null or error message>"
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
