<!-- size-justification: ~120L — Step 0a drain body + Step 0b.3 one-shot-routing body, split from main.md TE-T03 2026-08-11; shared by main.md § WORK continuation direct calls AND preflight-error-fallback.md's ERROR-path re-entry. -->
<!-- TWO REACHABLE PATHS, SAME BODY BELOW:
     (1) main.md § WORK continuation Steps 1-2 — direct call, script already read (0a) / claimed
         (0b.3) the objects; skip the raw read/claim calls, run only the body against them.
     (2) preflight-error-fallback.md Steps 0a/0b.3 — ERROR-path re-entry: runs the raw read (0a)
         or claim_due_scheduled_tasks (0b.3) itself first, then the identical body below.
     Content kept verbatim from the pre-split main.md — never deleted, history in git log. -->

## Step 0a — Drain `docs/data/orch/orch-state.json .signal_queue` (cross-team inbox)

Read `.signal_queue.rows[]` per skill `.claude/skills/signal-dashboard/SKILL.md` § READ.
Find all cowork-addressed rows (`to` ∈ {po, tran-ngoc-bau, unified-agent, alert-commander}).
Collect `status=NEW` rows → load payload_ref → route to matching agent slot at Step 5 or log for PO.
Mark each processed row `NEW → READ` (atomic write). If orch-state.json missing → log `"[cowork-team] signal_queue skip"` and continue. Never fail-loud on this step.

**Reached from:**
- `main.md` § WORK continuation Step 1 — the preflight script only ran a READ-ONLY NEW-count for the SILENT gate (R4); this runs the real drain-and-route-and-mark-READ body against the live rows.
- `preflight-error-fallback.md` Step 0a — full ERROR-path re-entry, unchanged.

---

## Step 0b.3 — Drain Due One-Shot Scheduled Tasks

<!-- DEFERRED-TASK-SCHEDULER-MVP (2026-06-29) — AC-4: This step is INSIDE the recurring */15 cron.
     NEVER convert this to a scheduled_task row itself (self-deleting sweeper strands the queue). -->

**Reached from:**
- `main.md` § WORK continuation Step 2 — for each object in `$VERDICT_JSON.one_shots[]` (already claimed by the preflight script's Step 4 — carries the FULL claimed task objects, R2), run the routing body below directly on the already-claimed object — skip the `claim_due_scheduled_tasks` call itself (already done; re-claiming would find the rows already flipped to `firing`, orphaning them).
- `preflight-error-fallback.md` Step 0b.3 — full ERROR-path re-entry: computes `SWEEP_TICK` fresh and calls `claim_due_scheduled_tasks` itself (below) before entering the same routing body.

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

# Step 0b.3 complete — WORK path: proceed to main.md § WORK continuation Step 3.
#                       ERROR path: proceed to Step 0c (preflight-error-fallback.md).
```

**Concurrency protection (two layers):**
- Layer 1: fire-time election (Step 0b.2, `leader-lock.md`) ensures at most one session reaches this step per 15-min tick (WORK path's election already happened inside the preflight script).
- Layer 2: `claim_due_scheduled_tasks` uses atomic `UPDATE WHERE status='pending' RETURNING` — each row can only be claimed once even if two sessions race.
