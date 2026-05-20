# Skill: task-lock

**Trigger:** agent implementing task_claim, task_heartbeat, or task_release
**Full protocol:** `docs/protocols/task-lock-protocol.md` (load if implementing locks)

---

## Quick Reference

### Claim before exclusive work

```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "<kind>:<id>",        // e.g. "cowork-slot:news-scout:20260520T140000Z"
  task_kind:   "cowork-slot",        // or "sprint-task" | "dashboard-row"
  owner_agent: "<your-agent-name>",
  ttl_seconds: 900,                  // 900 for cowork-slot, 3600 for sprint-task, 1800 for dashboard-row
  payload:     '{"slot_id":"..."}' // optional JSON context
})

if result.claimed == false: SKIP this task (another session holds it)
if result.claimed == true:  proceed + heartbeat every 5 min
```

### Heartbeat every 5 min

```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={ task_id: "<id>" })
if hb.ok == false: lock stolen → commit partial state → BUG telegram → EXIT
```

### Release on completion

```
call_tool(server="vn-market", tool="task_release", arguments={ task_id: "<id>" })
// ok=false is acceptable (already expired/stolen)
```

### List held locks (debug)

```
call_tool(server="vn-market", tool="task_list_held", arguments={
  kind: "cowork-slot",    // optional filter
  expired: true           // optional: show only stale locks
})
```

---

---

## On claim-fail: migration check

When `task_claim` returns `claimed: false`, check `pipeline-state.json` BEFORE treating as peer-session collision:

```
result = task_claim({task_id, task_kind, owner_agent, ttl_seconds, payload})

if not result.claimed:
  ps = read $PROJECT_ROOT/docs/pipeline-state.json
  current = result.current_holder
  now_s = unix epoch seconds

  bare_task_id = task_id.startsWith("task:") ? task_id.slice(5) : task_id

  is_logical_takeover = (
    ps.activeTaskId == bare_task_id
    AND ps.nextAgent == owner_agent
    AND current.owner_agent == owner_agent
    AND (now_s - current.heartbeat_at) > 300   // heartbeat stale >5 min
  )

  if is_logical_takeover:
    log "[<agent>] stale-lock takeover detected for " + task_id + " — awaiting natural TTL expiry"
    send_telegram(channel="work", "[<agent>] takeover pending — TTL expires in " + (current.expires_at - now_s) + "s")
    EXIT cycle (return PIPELINE: blocked, NEXT: idle, reason: stale-lock-takeover)
    // Next dev-team cron tick (15 min later) retries; by then TTL expired
  else:
    // Real collision — peer session is actively heartbeating
    log "[<agent>] SKIP task " + task_id + " — held by peer session " + current.owner_session.slice(0,8)
    send_telegram(channel="work", "[<agent>] SKIP collision — held by " + current.owner_agent)
    SKIP this task
```

Full design rationale: `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 3.

---

## Phase Status (as of 2026-05-20)

- Phase 1 SHIPPED 2026-05-20: coordination.db + 4 MCP tools (task_claim, task_heartbeat, task_release, task_list_held). Commits: 79ac45e9, b3d6ff80.
- Phase 2 SHIPPED 2026-05-20: cowork-slot wiring (cowork-team Step 4.6 slot-locking). Final commit: 9357ac38.
- Phase 3 SHIPPED 2026-05-20: sprint-task + dashboard-row wiring across dev-team flows.
  - 1960c (10 commits: 448eb7f3, 2a099357, 5e7ada82, dd5e5689, f0687912, a68fb93d, 00a0dd1b, 340a8e39, fa950e08, 31c47ea5): 8 flow .md files wired + tool packages updated.
  - 1960d smoke (commit 335dda54): 10/10 PASS (qa-1960d-approved.json).
  - Model 2 (agent-self heartbeat): TTL=3600s for sprint-task, TTL=1800s for dashboard-row. Heartbeat every 5 min by the running agent.
  - pipeline-state.json relationship: AUGMENT only (status/nextAgent/updatedAt preserved — task-lock does not replace pipeline-state).
