<!-- size-justification: ~195L — thin dispatcher; full logic extracted to 11 child sub-flows via JUMP-TO table; Step 0a drain (7L) inline; Step 0-PREFLIGHT script gates the common SILENT/WORK path, original pseudocode kept as ERROR-fallback; history in git log. -->
<!-- BGFAN-1: ALL Agent spawns from this dispatcher MUST use run_in_background=true. Cowork agents are independent → genuine parallel background fan-out. Canonical rule → docs/protocols/agent-chaining-protocol.md § Background Spawn Mandate -->

# cowork-team — Master Cron Dispatcher

## Team Boundary (Sprint 1951c)

This dispatcher spawns ONLY cowork-team agents per `docs/data/cowork-schedule.json`:
- **scheduled:** news-scout, market-watcher, financial-analyst, alert-commander, digest-predict, unified-agent, tran-ngoc-bau, refine_bctc_md, fb-market-poster
- **demand-spawnable:** report-analyzer, qa-responder, market-analyst

NEVER spawn dev-team agents (po, ba, architect, pm, developer, qa, fixer, dev-*, ops) from this dispatcher.

Cross-team work: write a signal row to `docs/data/orch/orch-state.json` `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md`. Dev-team drains the signal_queue at its next cycle.

Maintenance agents (agent-father, agents-architect, claude-manager-helper, code-janitor, system-auditor, cowork-refactory-expert, idea-forge) are invoked by main terminal or self-cron — NEVER spawned by this dispatcher.

Fires every 15 min via `*/15 * * * *` CronCreate. Reads `docs/data/cowork-schedule.json`, matches UTC ±2min, parallel fan-out matching subagents in one message block.

<!-- decision: OQ-1 — agent_id maps 1:1 to subagent_type. Spawn prompt = slot.trigger_prompt
     (falls back to composed "run <flow_path> slot=<slot_id>" only if trigger_prompt is
     absent — corrected FIX-COWORK-SPAWNFANOUT-FLOWPATH-BYPASSES-DIGEST-DAILY-DEDUP-GATE
     2026-07-29; see spawn-fanout.md Step 5.2 for the full consistency-check contract). -->
<!-- decision: OQ-2 — Collision guard in match-slots.md Step 4b (WARNING only, R3 allows multi-slot). -->

**SSOT:** `docs/data/cowork-schedule.json`  **Fail-loud:** `docs/protocols/fail-loud-protocol.md`

---

## Dispatch — JUMP-TO table

| Step | What | Sub-flow |
|---|---|---|
| 0a | Drain signal_queue | inline below |
| 0b | Session-presence self-register + Fire-time election (P3 — cron:cowork:<tick>) | `dispatch-claim SKILL § Step 0a` (inline) then `leader-lock.md` |
| 0b.3 | Drain due one-shot scheduled tasks (DEFERRED-TASK-SCHEDULER-MVP) | inline below |
| 0c | Blind detection — gateway preflight | `blind-guard.md` |
| 1–4b | Resolve UTC, match slots, drift guard, silent-exit, collision guard | `match-slots.md` |
| 4.2–4.3 | Read pressure-state, calendar suppression | `pressure-read.md` |
| 4.4–4.5b | Cadence due-check, freshness downgrade, rebind MATCHES | `pressure-cadence.md` |
| 4.6–4.6b | Per-work-item slot claim tokens, leader heartbeat | `slot-claim.md` |
| 4.7 | Write shared tick snapshot | `tick-snapshot.md` |
| 4.8 | Pressure-state emit (no-op stub — Step 6 uses call_tool emit_pressure_state, EMIT-DARK-v2 Option C) | `pressure-emit.md` |
| 5 | Parallel fan-out + published-marker gate contract + spawn-identity preamble (5.2) + off-flow router-latch detector (5.3) | `spawn-fanout.md` |
| 5b | Batch last_fired write | `last-fired.md` |
| 6 + Error Guard | Write telemetry signal; Step 6.0 call_tool emit_pressure_state (mandatory, un-skippable); Step 6.1 conditional signal write; unhandled error boundary | `telemetry.md` |

---

## Step 0 — Cowork Preflight (TOKEN-ECONOMY-TICK-PREFLIGHT WU-1)

Run the deterministic preflight script FIRST and capture its one-line JSON verdict — on the
common SILENT/WORK path this replaces the LLM-narrated Steps 0a-4b below entirely (~80% of
ticks are silent off-hours/no-due-work; this cuts that to one bash call + a short JSON reply).

```bash
VERDICT_JSON=$(bash "$PROJECT_ROOT/scripts/agents-flow/cowork-tick-preflight.sh")
PREFLIGHT_RC=$?
VERDICT=$(echo "$VERDICT_JSON" | jq -r '.verdict')
```

Script SSOT: `scripts/agents-flow/cowork-tick-preflight.sh` (uses shared `scripts/agents-flow/mcp-call.sh`). Requires `$CLAUDE_CODE_SESSION_ID` in the environment.

### JUMP-TO table (preflight verdict)

| Verdict | Action |
|---|---|
| `SILENT` | Done. Script already emitted pressure state (Step 8) and released the election lock. No LLM read of Steps 0a-6 needed. EXIT. |
| `WORK` | Election lock is HELD by this session. Continue at **§ WORK continuation** below — do NOT re-run Steps 0b/0b.3/0c/1-4b, they are already satisfied by the script's Steps 2-6. |
| `LOST_ELECTION` | Done. Script already sent the `work`-channel telegram (peer session leads this tick). EXIT. |
| `DEFER` | Done. AF-1 backstop-window defer — retries automatically at the next 15-min tick. EXIT. |
| `ERROR` | Script hit a transport/tool/local-guard failure (`$VERDICT_JSON.detail` has why). Election lock state is undefined. Fall back to the full original inline pseudocode below (Steps 0a/0b/0b.3/0c/1-4b — unchanged, never deleted) — read from **Step 0a** onward as if the script never ran. |

### § WORK continuation

The script already: registered presence (Step 2), won the fire-time election (Step 3 — lock
HELD, released later by `telemetry.md` Step 6 P3 release, unchanged), claimed due one-shots
(Step 4 — `$VERDICT_JSON.one_shots[]` carries the FULL claimed task objects, R2), confirmed the
gateway is not blind (Step 5), and matched slots (Step 6 — `$VERDICT_JSON.slots[]` carries full
slot objects). **Do NOT re-call `claim_due_scheduled_tasks` or `cowork-match-slots.js`** —
re-claiming would find the rows already flipped to `firing`, orphaning them (R2).

1. **Drain signal_queue** — the script only did a READ-ONLY count for the SILENT gate (R4); run
   the real drain-and-route-and-mark-READ body of Step 0a below against the live
   `.signal_queue.rows[]`.
2. **Route one-shots** — for each object in `$VERDICT_JSON.one_shots[]`, run the routing body of
   Step 0b.3 below (deadline gate → PRE-CLAIM intent gate + background spawn for `team=="COWORK"`
   rows / signal_queue emission for `team=="DEV"` rows → `complete_scheduled_task`) directly on
   the already-claimed object — skip the `claim_due_scheduled_tasks` call itself (already done).
3. **Slots** — treat `$VERDICT_JSON.slots[]` as `MATCHES` and `$VERDICT_JSON.drift_min` as
   `DRIFT_MIN`; run Step 4b (collision-detection guard) only — skip Steps 1-3 and Step 4 silent-exit
   (already computed by the script; WORK implies at least one of slots/one_shots/new_signals is non-empty).
4. **Continue unchanged** at Steps 4.2-4.3 (`pressure-read.md`), 4.4-4.5b (`pressure-cadence.md`),
   4.6-4.6b (`slot-claim.md`), 4.7 (`tick-snapshot.md`), 4.8 (`pressure-emit.md`), 5
   (`spawn-fanout.md`), 5b (`last-fired.md`), 6 (`telemetry.md` — the P3 election-lock release
   stays the single release point on the WORK path).

---

<!-- FALLBACK BODY (TOKEN-ECONOMY-TICK-PREFLIGHT WU-1): reached only when the Step 0 preflight
     script returns ERROR verdict (full re-read, execute from here) or as the source body for the
     targeted WORK-continuation steps referenced above. Kept verbatim — never deleted. -->

## Step 0a — Drain `docs/data/orch/orch-state.json .signal_queue` (cross-team inbox)

Read `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find all cowork-addressed rows (`to` ∈ {po, tran-ngoc-bau, unified-agent, alert-commander}).
Collect `status=NEW` rows → load payload_ref → route to matching agent slot at Step 5 or log for PO.
Mark each processed row `NEW → READ` (atomic write). If orch-state.json missing → log `"[cowork-team] signal_queue skip"` and continue. Never fail-loud on this step.

---

## Step 0b — Presence + Leader lock

<!-- P2-PRESENCE (TASK_1990): session-presence claim fires BEFORE leader-lock.
     Registers this cowork-dispatcher session for cross-session observability.
     dispatch-claim SKILL § Step 0a is authoritative — this is the cowork-team instantiation.
     Non-adoptable: presence row expiry = liveness GC, never orphan-signal. -->

**Step 0b.1 — Session-presence self-registration** (→ skill: `.claude/skills/dispatch-claim/SKILL.md` § Step 0a)

```
# P2-PRESENCE: register this dispatcher session before leader-lock
# task_id is session-unique — re-entrant across recurring ticks (heartbeat on re-entry)

presence_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          1800,
  payload:              {
    agent_id:     "cowork-team",
    host:         $(hostname),
    started_at:   $(date -u +"%Y-%m-%dT%H:%M:%SZ"),
    current_task: "dispatch-init"
  }
})

# Re-entrant tick: heartbeat to renew if already claimed by this session
if not presence_result.claimed:
  if presence_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: "session-presence:" + $CLAUDE_CODE_SESSION_ID,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
# Always proceed — presence result is NEVER a gate.
```

**Step 0b.2 — Fire-time election (P3)** → Run sub-flow: `docs/agents/cowork-team/flow/leader-lock.md`
<!-- P3: leader-lock.md now implements per-tick cron:cowork:<TICK> election (TTL=600s, no heartbeat).
     Session that wins proceeds to Step 0b.3. Loser EXITs cleanly. Release at end of Step 6 (telemetry.md).
     TICK variable set in leader-lock.md persists through Steps 0b.3–6 for the release call. -->

---

## Step 0b.3 — Drain Due One-Shot Scheduled Tasks

<!-- DEFERRED-TASK-SCHEDULER-MVP (2026-06-29) — AC-4: This step is INSIDE the recurring */15 cron.
     NEVER convert this to a scheduled_task row itself (self-deleting sweeper strands the queue).
     Only the fire-time election winner (Step 0b.2 WIN) reaches this step. -->

SWEEP_TICK=$(date -u +"%Y-%m-%dT%H:%MZ")

```
# Claim all due rows atomically (pending→firing). Empty = no-op → proceed to Step 0c.
due_result = call_tool(server="vn-market", tool="claim_due_scheduled_tasks", arguments={
  sweep_tick: $SWEEP_TICK
})
# due_result.tasks = rows just claimed; due_result.now_epoch = server epoch at claim time

for each task in due_result.tasks:

  # Gate 1: Deadline expiry check (AC-3)
  if task.deadline_at IS NOT NULL AND due_result.now_epoch > task.deadline_at:
    call_tool(server="vn-market", tool="expire_scheduled_task", arguments={
      id: task.id, sweep_tick: $SWEEP_TICK
    })
    log "[cowork-team] one-shot " + task.id + " (" + task.intent + ") EXPIRED — past deadline"
    continue

  if task.team == "COWORK":
    # Gate 2: PRE-CLAIM intent gate (CLAUDE.md §2.5 — AC-5: no dispatch bypass)
    # task_kind="intent" is already in deployed enum — AC-7: no new task_kind
    preclaim = call_tool(server="vn-market", tool="task_claim", arguments={
      task_id:              "intent:one-shot:" + task.id,
      task_kind:            "intent",
      owner_agent:          task.agent,
      owner_client_session: $CLAUDE_CODE_SESSION_ID,
      ttl_seconds:          600,
      payload:              {site:"one-shot-sweeper", intent:task.intent, scheduled_task_id:task.id}
    })
    if not preclaim.claimed:
      log "[cowork-team] one-shot " + task.id + " PRE-CLAIM collision — skipping (row stays firing, ops triage via list_scheduled_tasks({status:'firing'}))"
      continue

    try:
      Agent(task.agent, prompt=task.prompt, run_in_background=true)
      call_tool(server="vn-market", tool="complete_scheduled_task", arguments={
        id: task.id, status: "fired", sweep_tick: $SWEEP_TICK
      })
    catch err:
      call_tool(server="vn-market", tool="fail_scheduled_task", arguments={
        id: task.id, error: err.message, sweep_tick: $SWEEP_TICK
      })
    finally:
      call_tool(server="vn-market", tool="task_release", arguments={
        task_id: "intent:one-shot:" + task.id,
        owner_client_session: $CLAUDE_CODE_SESSION_ID
      })

  elif task.team == "DEV":
    # AC-6: Emit via orch-apply.sh with --argjson bound vars.
    # NEVER raw-write orch-state.json. NEVER shell-interpolate task.prompt (injection scar).
    # D3 BINDING: ALWAYS write companion file docs/signals/one-shot-<task.id>.json
    #             (no char-count threshold); set payload_ref to it.
    #             NEVER embed full prompt in summary field.
    NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    COMPANION_PATH="docs/signals/one-shot-" + task.id + ".json"

    # Write companion file (jq --argjson to avoid shell injection)
    jq -n --argjson task '<task JSON>' '{"task": $task}' > "$COMPANION_PATH"

    # Emit signal row (bound argjson only)
    jq --argjson row '{
      "id":          "one-shot-" + task.id,
      "summary":     "[one-shot] " + task.intent + " → " + task.agent,
      "severity":    "INFO",
      "status":      "NEW",
      "ts":          NOW,
      "from":        "cowork-team/one-shot-sweeper",
      "to":          task.agent,
      "type":        "deferred_task",
      "payload_ref": COMPANION_PATH
    }' --arg now "$NOW" \
      '.signal_queue.rows += [$row] | .signal_queue._updated_at = $now | .signal_queue._updated_by = "one-shot-sweeper"' \
      docs/data/orch/orch-state.json \
      | bash "$PROJECT_ROOT/scripts/orch-apply.sh"

    call_tool(server="vn-market", tool="complete_scheduled_task", arguments={
      id: task.id, status: "fired", sweep_tick: $SWEEP_TICK
    })

# Step 0b.3 complete — proceed to Step 0c
```

**Concurrency protection (two layers):**
- Layer 1: fire-time election (Step 0b.2) ensures at most one session reaches Step 0b.3 per 15-min tick.
- Layer 2: `claim_due_scheduled_tasks` uses atomic `UPDATE WHERE status='pending' RETURNING` — each row can only be claimed once even if two sessions race.

---

## Step 0c — Blind detection

→ Run sub-flow: `docs/agents/cowork-team/flow/blind-guard.md`

---

## Steps 1–4b — Slot matching

→ Run sub-flow: `docs/agents/cowork-team/flow/match-slots.md`

---

## Steps 4.2–4.3 — Pressure read + calendar suppression

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-read.md`

---

## Steps 4.4–4.5b — Cadence due-check + freshness downgrade

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-cadence.md`

---

## Steps 4.6–4.6b — Slot claim tokens + leader heartbeat

→ Run sub-flow: `docs/agents/cowork-team/flow/slot-claim.md`

---

## Step 4.7 — Tick snapshot

→ Run sub-flow: `docs/agents/cowork-team/flow/tick-snapshot.md`

---

## Step 4.8 — Pressure-state emit

→ Run sub-flow: `docs/agents/cowork-team/flow/pressure-emit.md`

---

## Step 5 — Parallel fan-out (background)

→ Run sub-flow: `docs/agents/cowork-team/flow/spawn-fanout.md`
<!-- BGFAN-1: spawn-fanout.md MUST set run_in_background=true on every Agent call — see inline markers there -->

---

## Step 5b — Batch last_fired write

→ Run sub-flow: `docs/agents/cowork-team/flow/last-fired.md`

---

## Step 6 + Error Guard — Telemetry + error boundary

→ Run sub-flow: `docs/agents/cowork-team/flow/telemetry.md`
