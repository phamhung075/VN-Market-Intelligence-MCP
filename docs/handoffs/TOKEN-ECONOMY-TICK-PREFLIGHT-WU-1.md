# WU-1 — Cowork Silent-Path Script

**Sprint:** TOKEN-ECONOMY-TICK-PREFLIGHT · **Type:** dev · **Zone:** root (scripts/agents-flow + docs/agents + .claude/skills)
**PM decomposition:** docs/agent-memory/decisions/sprint-TOKEN-ECONOMY-TICK-PREFLIGHT-pm.md
**Risk focus:** R1 (build mcp-call.sh once), R2 (full objects in verdict), R3 (safe defaults), R4 (signal_queue read-only), R5 (retire dead script)

---

## [Architect] Brownfield Findings

Per docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md § WU-1:

### Files to Read (before any code)
- `docs/agents/cowork-team/flow/main.md` (current flow, ~700L cumulative across main.md + support files)
- `docs/agents/cowork-team/flow/{leader-lock,blind-guard,match-slots,pressure-read,pressure-cadence,tick-snapshot,pressure-emit,slot-claim,telemetry}.md`
- `.claude/skills/cron-cowork-team/SKILL.md` (cron trigger)
- `scripts/agents-flow/{drain-signals,ci-health-probe}.js` (precedent for bash+jq scripts calling MCP tools)
- `docs/data/pressure-state.json` (runtime state for safe-default fallback)
- `docs/data/cycle-snapshot-latest.json` (runtime state)

### Files to Create (NEW)
- `scripts/agents-flow/mcp-call.sh` — shared helper (bash + jq, ~150L)
- `scripts/agents-flow/cowork-tick-preflight.sh` — main script (~200–250L)

### Files to Modify
- `docs/agents/cowork-team/flow/main.md` — JUMP-TO table + collapse Steps 0a/0b/0b.3/0c/1–4b to "run preflight script"
- Optionally: `.claude/skills/cron-cowork-team/SKILL.md` — doc-note if CronCreate prompt text changes

### Files to Retire (DELETE)
- `scripts/agents-flow/cowork-tick-autosilent.sh` — dead code, unwired, contradicts telemetry.md (R5)

### Files to Annotate (no functional change)
- `docs/agents/cowork-team/flow/leader-lock.md`, `blind-guard.md`, `match-slots.md` — add header note that these are reached only on ERROR fallback

---

## Design Specification (from architect brief + live verification)

### 1. Shared Helper: `scripts/agents-flow/mcp-call.sh`

**Contract:**
```bash
mcp_call <tool_name> <json_args_via_jq>
# Returns:
# - stdout: .result.content[0].text (parsed JSON or plain string)
# - exit code: 0 on success, non-zero on error
# - stderr: error detail on failure
```

**Implementation:**
- Base URL: `${MCP_HTTP_URL:-http://localhost:3000/mcp}` (fallback to `https://zenmidi.com/vn-market/mcp` on local connection failure)
- JSON-RPC POST to `/mcp` with `method="tools/call"`, `params={name, arguments}`
- Response: SSE-framed (`event: message`, `data: {...}`)
- Success: `.result.content[0].text` printed to stdout
- Error: `.result.isError == true` (HTTP 200, but `isError` flag set) → non-zero exit + stderr
- Transport failure (timeout, connection refused, malformed JSON) → non-zero exit + stderr
- **DRAIN-INJECTION-SAFE:** request body built entirely via `jq -n --arg name --argjson args` — tool name always a static literal at each call site, args always bound params, never raw string interpolation

**Dependencies:** bash, jq, curl (all system-standard)

---

### 2. Main Script: `scripts/agents-flow/cowork-tick-preflight.sh`

**Inputs (all from environment or internal compute):**
- `$CLAUDE_CODE_SESSION_ID` (passed by cron-cowork-team dispatcher, coordination parameter)
- Computed TICK (floor UTC minute to 15-min boundary: `TICK=$(( ($(date +%M) / 15) * 15 ))`)

**Steps 1–8 (per brief):**

1. **Compute TICK** — floor to 15-min boundary
   ```bash
   TICK=$(( ($(date +%M) / 15) * 15 ))
   ```

2. **Presence claim** — heartbeat session presence lock
   ```bash
   presence_result=$(mcp_call "task_heartbeat" "{ task_id: \"session-presence:$CLAUDE_CODE_SESSION_ID\", owner_client_session: \"$CLAUDE_CODE_SESSION_ID\" }" 2>&1)
   ```
   On SUCCESS: continue to Step 3
   On ERROR: verdict = ERROR (fallback to full flow)

3. **Fire-election claim** — one-time election lock per TICK
   ```bash
   election_result=$(mcp_call "task_claim" "{ task_id: \"cron:cowork:$TICK\", task_kind: \"fire-election\", owner_agent: \"cowork-team\", owner_client_session: \"$CLAUDE_CODE_SESSION_ID\", ttl_seconds: 600, payload: \"{\\\"site\\\":\\\"router\\\"}\" }" 2>&1)
   ```
   - On claim SUCCESS (`.claimed == true`): continue to Step 4 (hold election lock)
   - On claim ERROR during backstop window (hour ∈ {0,4,8,12,16,20}, minute < 15): verdict = DEFER (backward-compat with AF-1 silent-tick logic; LLM retries in regular flow)
   - On LOST_ELECTION (`.claimed == false`, `.current_holder.owner_agent != "cowork-team"`): verdict = LOST_ELECTION + send WORK telegram (script-initiated, not LLM)

4. **Claim due one-shots** — sweep for tasks entering `firing` window
   ```bash
   claim_result=$(mcp_call "claim_due_scheduled_tasks" "{ sweep_tick: \"$TICK\" }" 2>&1)
   # Result format (on success):
   # { "claimed": [...], "dup_skipped": [...], "errors": [...] }
   # "claimed" = [{id, team, agent, intent, prompt, deadline_at, zone}, ...]
   ```
   Store full claimed objects for verdict (R2).

5. **Blind guard** — verify MCP surface integrity
   ```bash
   blind_guard=$(jq '.mcpServers | length' .mcp.json)
   # Just checks file exists and is readable; if jq fails or length < 1: verdict = ERROR
   ```

6. **Slot matcher** — run cowork-match-slots.js (unchanged, reused)
   ```bash
   slot_result=$(node scripts/agents-flow/cowork-match-slots.js 2>&1)
   # Output: JSON slots[] array
   ```

7. **SILENT gate** — check if slots empty AND no one-shots AND signal_queue has no NEW cowork rows
   ```bash
   # Read-only count of NEW signal_queue rows with route_to="cowork-team"
   signal_count=$(jq '[.signal_queue[] | select(.status=="NEW" and .route_to=="cowork-team")] | length' docs/data/orch/orch-state.json 2>/dev/null || echo "0")
   
   if [ -z "$slots" ] && [ -z "$claimed_objects" ] && [ "$signal_count" -eq 0 ]; then
       # SILENT condition met → emit pressure state and release lock
   else
       # WORK condition → proceed with verdict.WORK, hold election lock
   fi
   ```

8. **Emit pressure state (on SILENT only)** — use last-known values
   ```bash
   pressure_state=$(jq '.calendar_status // "unknown", .pressure_mode // "unknown", .last_regime // "unknown", .last_volatility_level // "unknown"' docs/data/pressure-state.json 2>/dev/null)
   cycle_snapshot=$(jq '.last_snapshot_at // "unknown"' docs/data/cycle-snapshot-latest.json 2>/dev/null)
   # R3: safe default "unknown" for missing-file edge case
   
   pressure_emit=$(mcp_call "emit_pressure_state" "{ calendar_status: $pressure_state, pressure_mode: $pressure_mode, last_regime: $last_regime, last_volatility_level: $volatility, snapshot_at: $cycle_snapshot }" 2>&1)
   # On SUCCESS or PARTIAL: release election lock → verdict = SILENT
   # On ERROR: verdict = ERROR (fallback to full flow)
   ```

**Verdict Schema:**
```json
{
  "verdict": "SILENT|WORK|LOST_ELECTION|DEFER|ERROR",
  "tick": "<TICK>",
  "drift_min": <drift_in_minutes_or_0>,
  "slots": [ { "slot_id": "...", "agent": "...", "flow_path": "...", "cron": "...", ... } ],
  "one_shots": [ { "id": "...", "team": "...", "agent": "...", "intent": "...", ... } ],
  "new_signals": <count>,
  "detail": "<error message or empty>"
}
```

**Exit codes:**
- `0` = SILENT (no LLM reading needed)
- `1` = WORK, LOST_ELECTION, DEFER, or ERROR (LLM continues with full flow)

**Lock semantics:**
- SILENT: election lock released by script via task_release call
- WORK: election lock **held** (released by main.md telemetry.md Step 6.1 on the WORK path)
- LOST_ELECTION: no lock held (peer won); script sends WORK telegram
- DEFER: election lock never claimed (early return); no telegram
- ERROR: election lock state undefined; fallback to full flow (which will repair via presence heartbeat or fresh claim)

---

## Acceptance Criteria

### AC-1: mcp-call.sh shared helper
- [ ] Created at `scripts/agents-flow/mcp-call.sh` (bash + jq only)
- [ ] Contract: `mpc_call <tool_name> <json_args>` → stdout + exit code
- [ ] Base URL precedence: `$MPC_HTTP_URL` → fallback `https://zenmidi.com/vn-market/mcp` → error
- [ ] DRAIN-INJECTION-SAFE: no raw string interpolation in request bodies (only `jq --arg`/`--argjson`)
- [ ] Parses SSE response and extracts `.result.content[0].text`
- [ ] Returns non-zero on `.isError`, transport failure, timeout, malformed JSON
- [ ] Used by WU-1 and WU-2 scripts without modification

### AC-2: cowork-tick-preflight.sh main script
- [ ] Created at `scripts/agents-flow/cowork-tick-preflight.sh` (~200–250L)
- [ ] Implements Steps 1–8 per spec above
- [ ] Verdict JSON emitted to stdout (one-liner, no logging)
- [ ] Exit code: 0 (SILENT) or 1 (WORK/LOST/DEFER/ERROR)
- [ ] SILENT: election lock released before exit
- [ ] WORK: election lock **held** (script does not release)
- [ ] LOST_ELECTION: script sends WORK telegram via mcp_call (not LLM)
- [ ] R2: verdict.one_shots[] carries full task objects (not just IDs)
- [ ] R3: pressure_state emit uses safe default `"unknown"` if docs/data/pressure-state.json missing or fields absent
- [ ] R4: signal_queue check is READ-ONLY count (no mark, no drain, no orch-apply — stays in main.md WORK path)

### AC-3: Modify main.md
- [ ] Add JUMP-TO table at top of Steps 0–4b (before Step 0a):
  ```
  | Verdict | Action |
  | --- | --- |
  | SILENT | Done (no LLM read) |
  | WORK | Continue at Step 4.2 (signal drain, slot fan-out, spawn, emit, release) |
  | LOST_ELECTION | Done (LLM skipped, script sent telegram) |
  | DEFER | Done (retries in next 15-min tick) |
  | ERROR | Fallback to original inline pseudocode (full Steps 0a–4b) |
  ```
- [ ] Collapse Steps 0a–4b to:
  ```
  **Step 0 — Cowork Preflight**
  Run cowork-tick-preflight.sh, capture JSON verdict.
  Based on verdict, proceed per JUMP-TO table above.
  On ERROR → re-read this section (original pseudocode) and execute manually.
  ```
- [ ] Original inline pseudocode (old Steps 0a/0b/0b.3/0c/1–4b) **stays inline** as fallback (never deleted)
- [ ] Annotation: `<!-- On ERROR verdict from preflight script, continue below... -->`

### AC-4: Annotate fallback docs
- [ ] `leader-lock.md`: add header note "Reached on preflight ERROR; in normal flow, replaced by cowork-tick-preflight.sh Step 2"
- [ ] `blind-guard.md`: same annotation
- [ ] `match-slots.md`: same annotation (already reused by preflight, but note the fallback path)

### AC-5: Retire dead script
- [ ] Delete `scripts/agents-flow/cowork-tick-autosilent.sh` (R5)
- [ ] Document deletion with AC note in commit message referencing R5 (dead code, incompatible strategy, unwired, contradicts telemetry.md silent-skip rule)

### AC-6: Testing
- [ ] Test SILENT path: run preflight script on off-market hour (no due slots, no one-shots, signal_queue NEW count = 0) → expect exit 0, verdict.SILENT
- [ ] Test WORK path: run preflight script with due slot → expect exit 1, verdict.WORK, election lock **held** (script does NOT release)
- [ ] Test ERROR path (injected): simulate mcp_call timeout or tool error → expect exit 1, verdict.ERROR → LLM re-reads main.md full flow (proves fallback path works)
- [ ] Test LOST_ELECTION: simulate claim returning `claimed=false` → expect exit 1, verdict.LOST_ELECTION, telegram sent
- [ ] Verify lock release on SILENT: confirm `task_release` call in script executes successfully

### AC-7: Decision journal
- [ ] Write DJ entry per `.claude/skills/decision-journal/SKILL.md` (task_id: "TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1", what-done, what-considered, why-decision)
- [ ] Minimum entry after implementation approach chosen; append final entry if any adaptation or approach change occurs

### AC-8: Commit
- [ ] Explicit file paths: new scripts, modified main.md, deleted autosilent.sh, annotated fallback docs
- [ ] Commit trailer: `Claude-Session: https://claude.ai/code/session_01CywgMgrauS1MafvS778UNE`
- [ ] Example commit message:
  ```
  dev(TOKEN-ECONOMY-TICK-PREFLIGHT-WU-1): cowork silent-path preflight + mcp-call.sh shared helper

  Scripts: new scripts/agents-flow/mcp-call.sh (bash+jq, JSON-RPC curl wrapper, DRAIN-INJECTION-SAFE)
           new scripts/agents-flow/cowork-tick-preflight.sh (Steps 1–8 deterministic, SILENT/WORK/ERROR verdicts)
  Docs: modify docs/agents/cowork-team/flow/main.md (JUMP-TO table, collapse 0a–4b to script call, keep original inline as fallback)
        annotate leader-lock.md, blind-guard.md, match-slots.md (fallback path notes)
  Cleanup: delete scripts/agents-flow/cowork-tick-autosilent.sh (dead code, contradicts telemetry rule — R5)
  Tests: SILENT/WORK/ERROR paths verified; lock release on SILENT proven.

  Risk focus (propagated from architect):
  - R1: mcp-call.sh built once, not reinvented per script.
  - R2: verdict.one_shots[] carries full task objects (re-call would orphan rows).
  - R3: pressure_state emit safe default "unknown" on missing-file.
  - R4: signal_queue check read-only (drain stays in main.md WORK path).
  - R5: retire dead cowork-tick-autosilent.sh.

  Claude-Session: https://claude.ai/code/session_01CywgMgrauS1MafvS778UNE
  ```

---

## Dependencies & Sequencing

- **WU-1 blocker:** mcp-call.sh must exist and be correct before WU-2 can use it
- **WU-2 dependency:** WU-2 script depends on mcp-call.sh; declare dependency in WU-2 handoff
- **WU-3 independence:** WU-3 pure shell (no MCP calls), can parallelize

---

## Fallback: Full Flow (Original Pseudocode)

On ERROR verdict from preflight script, the LLM re-reads `docs/agents/cowork-team/flow/main.md` and executes the full inline pseudocode for Steps 0a–4b (presence claim, fire-election claim, slot matcher, etc.) exactly as before. This path must remain **verbatim unchanged** in the flow document.

The flow switches between:
- **FAST PATH (SILENT):** 1 script call, exit
- **NORMAL PATH (WORK):** script call → continue at Step 4.2 (fan-out + emit + release)
- **ERROR FALLBACK:** script failed → re-read full flow, execute inline pseudocode

---

## Notes

- **Backward compatibility (AF-1):** DEFER verdict on backstop-window errors preserves existing silent-tick retry logic (retries in next 15-min tick rather than failing loud).
- **Injection safety:** All MPC calls use `jq --arg name --argjson args` — request bodies built safely, never interpolated.
- **Lock semantics:** SILENT releases election lock; WORK holds it for main.md telemetry to manage.
