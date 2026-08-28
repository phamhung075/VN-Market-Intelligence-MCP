# Card: dispatch-claim (hot path — every pre-spawn)

Full reference (namespace spec, Step 0a presence detail, Fire-Time Election, edge cases) → `.claude/skills/dispatch-claim/SKILL.md`

## Ownership key
`owner_client_session = $CLAUDE_CODE_SESSION_ID` is the SOLE ownership key on every claim/heartbeat/release. `owner_agent` is a label only, never a discriminator. Unset → mint `host-$(hostname)-pid-$$-ts-$(date +%s)` + warn.

## Phase A — orphan-adoption probe (fires BEFORE Phase B)
```
N_MAX = 3
for s in task_list_held(kind="orphan-signal", owner_agent=<role>):
  if s.payload.redispatch_count >= N_MAX:
    if s.payload.status != "ESCALATED":
      send_telegram(bug, ...); task_heartbeat(ttl_seconds=86400, payload_patch={status:"ESCALATED"})
    continue
  a = task_claim(task_id=s.payload.original_task_id, task_kind=s.payload.original_task_kind,
                 owner_agent=<role>, owner_client_session=$SID, ttl_seconds=3600, payload={adopted_from, redispatch_count})
  if a.claimed: try: spawn(agent, checkpoint=s.payload.last_payload, mode=adopt-resume)
               finally: task_release("orphan-signal:"+original_task_id, $SID)
```
Escalation/resume-contract detail → SKILL.md § Orphan-Adoption Probe.

## Phase A.5 — presence roster (read-only, advisory, never blocks)
`roster = task_list_held(kind="session-presence")`; log `agent_id/host/current_task`; warn on duplicate `agent_id`; proceed regardless. Detail → SKILL.md § Phase A.5.

## Phase B — intent PRE-CLAIM (the hard gate)
```
c = task_claim(task_id="intent:<agent>:<key>", task_kind="intent", owner_agent=<role>,
               owner_client_session=$SID, ttl_seconds=600, payload={site:"router", intent:<key>})
if c.claimed:
  try: spawn(agent)  finally: task_release("intent:<agent>:<key>", $SID)
elif c.current_holder.owner_client_session == $SID:
  task_heartbeat(...) # re-entrant — proceed to spawn as above
else:
  log "PRE-CLAIM collision"; send_telegram(work); EXIT  # no spawn, no cost
```

Step 0a self-registration, Fire-Time Election, sprint-task `task:` wrap → SKILL.md (dispatchers already inline their own Step 0a instantiation — see cowork-team/dev-team `main.md`).
