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

## Phase Status (as of 2026-05-20)

- Phase 1 SHIPPED: tools ready, flow wiring pending
- Phase 2/3: cowork-slot + sprint-task wiring = future sprint tasks
- Note in each entry: "Tool ready — flow-level wiring lands in Phase 2/3"
