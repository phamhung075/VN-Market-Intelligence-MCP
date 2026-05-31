---
sprint: DYN-WF-FOUNDATION
task: DWF-DEV-CROSS-3
branch: task/dwf-dev-cross-3-pressure-state
size: S
zone: developer
depends_on: [DWF-DEV-MCP-1]
blocks: [DWF-DEV-CROSS-4]
---

# DWF-DEV-CROSS-3 — Pressure-State.json Emitter

## TLDR

Add Step 4.8 to `docs/agents/cowork-team/flow/main.md` that emits `docs/data/pressure-state.json` at each cowork tick. Single-row rolling SSOT with calendar status, signal backlog, dev queue depth, host headroom. Instrument-only Phase 0 (no decision path reads it). Requires `is_trading_day` tool (DWF-DEV-MCP-1) to be deployed.

## [PM] Planning Context

**Zone:** `developer` (cross-service)

**Acceptance Criteria:**

- [ ] **AC-P0-4-1:** After one cowork tick, `docs/data/pressure-state.json` exists and parses as valid JSON.
- [ ] **AC-P0-4-2:** `emitted_at` is a valid ISO 8601 UTC timestamp within 60 seconds of the tick firing time.
- [ ] **AC-P0-4-3:** `calendar_status` is populated by calling the new `is_trading_day` tool (not hardcoded 02:00-08:59 UTC window logic).
- [ ] **AC-P0-4-4:** No code outside the cowork dispatcher reads `pressure-state.json` to make routing/spawn decisions (grep for `pressure-state` in `apps/` and `.claude/skills/` returns zero hits outside the emitter).
- [ ] **AC-P0-4-5:** File is written atomically (write temp → rename) so readers never see partial JSON.
- [ ] **AC-P0-4-6:** If `is_trading_day` call fails, `calendar_status` is set to `"unknown"` and emission still succeeds (fail-safe, never blocks tick).

**Files to read first:**

- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § pressure-state.json Emitter Design (schema, fields, where written, atomic write pattern)
- `docs/REQ_DYN-WF-FOUNDATION.md` § FR-P0-4 (detailed schema + ACs)
- `docs/agents/cowork-team/flow/main.md` (Step 4.7 and Step 5 context; insertion point is after Step 4.7, before Step 5 spawns)

**Files to modify:**

- `docs/agents/cowork-team/flow/main.md` — Add new Step 4.8 (pressure-state emitter) after Step 4.7 (tick-snapshot), before Step 5 (spawn agents):

  ```bash
  # Step 4.8 — Emit pressure-state.json (new step)
  
  # Assemble JSON object
  TMPFILE="docs/data/pressure-state.json.tmp"
  
  EMITTED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  TICK_ID="2026-05-30T20:45:00Z"  # <- compute from nominal_tick (floor to 15-min)
  
  # signal_backlog: count of unprocessed signals
  SIGNAL_BACKLOG=$(ls docs/signals/*.json 2>/dev/null | wc -l)
  
  # calendar_status: call is_trading_day tool
  CALENDAR_STATUS="unknown"
  IS_TRADING_RESULT=$(call_tool(server="vn-market", tool="is_trading_day", arguments={}))
  if [ $? -eq 0 ]; then
    CALENDAR_STATUS=$(echo "$IS_TRADING_RESULT" | jq -r '.session_status // "unknown"')
  fi
  
  # last_regime, last_volatility: read from latest cycle-snapshot-*.json
  LAST_REGIME="unknown"
  LAST_VOLATILITY="unknown"
  if [ -f "docs/data/cycle-snapshot-latest.json" ]; then
    LAST_REGIME=$(jq -r '.regime_status // "unknown"' docs/data/cycle-snapshot-latest.json)
    LAST_VOLATILITY=$(jq -r '.volatility_level // "unknown"' docs/data/cycle-snapshot-latest.json)
  fi
  
  # dev_queue_depth: count OPEN and IN_PROGRESS tasks
  DEV_QUEUE_DEPTH=$(grep -c "| [A-Z]*-DEV-.*| *OPEN\|| [A-Z]*-DEV-.*| *IN_PROGRESS" docs/TASKS.md 2>/dev/null || echo 0)
  
  # host_headroom_mb: best-effort memory probe
  HOST_HEADROOM=$(vm_stat | grep "free" | awk '{print int($3 / 256)}' 2>/dev/null)
  if [ -z "$HOST_HEADROOM" ]; then
    HOST_HEADROOM="null"
  fi
  
  # stale_warning: compare emitted_at to wall clock (should be recent)
  STALE_WARNING="false"
  # If file is > 15 min old, stale_warning = true (but file just emitted, so false here)
  
  # Write atomically
  cat > "$TMPFILE" <<EOF
  {
    "emitted_at": "$EMITTED_AT",
    "tick_id": "$TICK_ID",
    "signal_backlog": $SIGNAL_BACKLOG,
    "last_regime": "$LAST_REGIME",
    "last_volatility_level": "$LAST_VOLATILITY",
    "calendar_status": "$CALENDAR_STATUS",
    "dev_queue_depth": $DEV_QUEUE_DEPTH,
    "host_headroom_mb": $HOST_HEADROOM,
    "stale_warning": $STALE_WARNING
  }
  EOF
  
  mv "$TMPFILE" "docs/data/pressure-state.json"
  ```

**Files to create:**

- `docs/data/pressure-state.json` (seed file, empty/stub initially):
  ```json
  {
    "emitted_at": "2026-05-30T20:00:00Z",
    "tick_id": "2026-05-30T20:00:00Z",
    "signal_backlog": 0,
    "last_regime": "unknown",
    "last_volatility_level": "unknown",
    "calendar_status": "unknown",
    "dev_queue_depth": 0,
    "host_headroom_mb": null,
    "stale_warning": false
  }
  ```

**Dependencies:**

- Depends on DWF-DEV-MCP-1 (is_trading_day tool must be deployed before CROSS-3 can call it)
- Blocks DWF-DEV-CROSS-4 (logical sequencing)

**Knowledge needed:**

- `docs/policies/dev-standards.md` — Flow rewrite, atomic file write pattern
- `docs/architecture-briefs/2026-05-30-dyn-wf-foundation.md` § pressure-state.json Emitter Design (field definitions, atomic write)
- Bash scripting: date, jq, vm_stat, grep, mv

**Implementation notes:**

1. **Insertion point:** After Step 4.7 (tick-snapshot emission), before Step 5 (spawn agents). This ensures pressure-state reflects the current tick state before dispatches start.

2. **Field assembly:**
   - `emitted_at`: ISO 8601 UTC timestamp (current time when emitting)
   - `tick_id`: Floor-15-min bucket (e.g., if nominal_tick is 2026-05-30T20:47, floor to 2026-05-30T20:45)
   - `signal_backlog`: `ls docs/signals/*.json | wc -l` (count of signal files)
   - `calendar_status`: Call `is_trading_day()` via gateway; on failure, default to `"unknown"`
   - `last_regime`, `last_volatility_level`: Read from latest cycle-snapshot file (if exists); fallback `"unknown"`
   - `dev_queue_depth`: Grep TASKS.md for OPEN or IN_PROGRESS rows; count matches
   - `host_headroom_mb`: `vm_stat | grep "free"` (parse free pages); on failure, `null`
   - `stale_warning`: `false` if just emitted; `true` if > 1 tick old (handled by next tick)

3. **Atomic write:**
   ```bash
   # Write to temp file
   cat > "$TMPFILE" << 'EOF'
   {JSON content}
   EOF
   
   # Rename atomically
   mv "$TMPFILE" "docs/data/pressure-state.json"
   ```
   - This is atomic at filesystem level (atomic rename)
   - Readers never see partial JSON

4. **Fail-safe on tool failure:**
   - If `is_trading_day` call fails (network/DB error), catch exception
   - Set `calendar_status: "unknown"` and continue emitting
   - Never block the tick due to pressure-state failure
   - Log the failure for observability

5. **vm_stat parsing:**
   - Output format varies slightly by macOS version
   - Safest approach: `vm_stat | grep "free" | head -1 | awk '{print $3}'` to get free pages count
   - Convert pages to MB: `pages * 4096 / 1024 / 1024`
   - On Linux, use `free -m | grep Mem | awk '{print $7}'` (available column)
   - On failure, default to `null` (best-effort, non-blocking)

6. **Update flow size-justification comment:**
   - Current `main.md` is ~300L
   - After adding Step 4.8, expect ~350L
   - Update the size-justification comment at the top to reflect new line count

---

## RETURN

Upon completion, developer will commit with trailers:

```
feat(cowork-team): add Step 4.8 pressure-state.json emitter

Emit single-row rolling SSOT at each tick: signal backlog, last regime/volatility,
calendar status (via is_trading_day tool), dev queue depth, host headroom.
Atomic write-temp-then-rename. Fail-safe on tool failure (calendar_status="unknown").
Create seed file docs/data/pressure-state.json. Phase 0 instrumentation (no decision
path reads it yet).

Task: DWF-DEV-CROSS-3
AC: AC-P0-4-1, AC-P0-4-2, AC-P0-4-3, AC-P0-4-4, AC-P0-4-5, AC-P0-4-6
```

Then PM will unblock DWF-DEV-CROSS-4 (Phase 2 leader lock rewrite).
