# PO — Sprint Kickoff (Self-Initiating Sprint)

**Entry from:** `po/main.md` § Dispatch when triage produces "no in-progress work but found backlog issues" OR when user explicitly asks "kick off a new sprint".

**Not for:** routine channel audit (stay in main.md), BA spec review (`po/review-ba-spec.md`), QA signoff (`po/sprint-signoff.md`).

---

## Self-Initiating Sprint

**1.** Assess: `docs/data/project-stats.json` (counts) | last 2 task reports | user session goal

**2.** Highest-impact: reliability (failing tests, footguns) | coverage (missing signals) | UX (useless alerts) | architecture (DDD debt)

**3.** Append entry to `docs/data/orch/orch-state.json` `.sprint_goal.entries[]` (atomic write per §2.3, read full → modify only `.sprint_goal` → write atomically):
```json
{
  "sprint_id": "NNN",
  "status": "active",
  "vision": "<one sentence: business outcome>",
  "scope_in": "<what we're building>",
  "scope_out": "<what we're NOT doing>",
  "success_metric": "<how we know it's done>",
  "created_at": "<ISO-8601 UTC>"
}
```

**4.** Create BA task entry in `docs/data/orch/orch-state.json` `.task_board.backlog[]` — canonical shape per `docs/standards/task-schema.md`:
```json
{
  "id": "BA-NNN",
  "title": "Requirement Spec for Vision NNN",
  "owner": "ba",
  "status": "TODO",
  "zone": "docs/agents/",
  "created_at": "<ISO-8601 UTC now>"
}
```

**4b.** Claim sprint umbrella lock → load skill: `.claude/skills/task-lock/SKILL.md`
```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "task:" + sprint_id,
  task_kind:   "sprint-task",
  owner_agent: "po",
  ttl_seconds: 3600,
  payload:     '{"sprint_id":"' + sprint_id + '","stage":"kickoff"}'
})
if not result.claimed:
  → Apply migration check per `.claude/skills/task-lock/SKILL.md` § On claim-fail
```

**5.** Return:
```
## RETURN
DONE: Sprint NNN goal written to orch-state.json .sprint_goal, BA task created
NEXT: ba | write requirement spec for sprint NNN goal in docs/data/orch/orch-state.json .sprint_goal
HANDOFF: docs/data/orch/orch-state.json
PIPELINE: continue
```

---

## After RETURN

Commit notebook + run doc self-heal — see `po/main.md` § Notebook + ACK timestamp guard and § Doc self-heal pointer.
