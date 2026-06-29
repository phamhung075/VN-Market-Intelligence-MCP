<!-- size-justification: ~195L — thin dispatcher; full logic extracted to 11 child sub-flows. JUMP-TO table routes each step. Step 0a drain inline (7L). NB-COWORK-MAIN-SPLIT refactor 2026-06-03. EMIT-DARK-v2 2026-06-05: telemetry.md Step 6.0 uses call_tool emit_pressure_state (Option C). BGFAN-1 2026-06-07: background spawn mandate; actual spawns in spawn-fanout.md carry run_in_background=true. BG-1 2026-06-18: Step 0c blind-guard.md added. P2-PRESENCE 2026-06-28 (TASK_1990): Step 0b now claims session-presence BEFORE leader-lock (+22L inline). P3-FIRE-ELECTION 2026-06-28 (TASK_1994): leader-lock.md redesigned to fire-time election cron:cowork:<tick> (TTL=600s); activation gate TASK_1995. DEFERRED-TASK-SCHEDULER-MVP 2026-06-29: Step 0b.3 added after leader-lock WIN — drains due one-shot scheduled tasks (+55L inline). -->
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

<!-- decision: OQ-1 — agent_id maps 1:1 to subagent_type. Spawn prompt = "run <flow_path> slot=<slot_id>". -->
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
| 5 | Parallel fan-out + published-marker gate contract | `spawn-fanout.md` |
| 5b | Batch last_fired write | `last-fired.md` |
| 6 + Error Guard | Write telemetry signal; Step 6.0 call_tool emit_pressure_state (mandatory, un-skippable); Step 6.1 conditional signal write; unhandled error boundary | `telemetry.md` |

---

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
