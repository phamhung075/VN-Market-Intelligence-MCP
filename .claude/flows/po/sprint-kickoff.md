# PO — Sprint Kickoff (Self-Initiating Sprint)

**Entry from:** `po/main.md` § Dispatch when triage produces "no in-progress work but found backlog issues" OR when user explicitly asks "kick off a new sprint".

**Not for:** routine channel audit (stay in main.md), BA spec review (`po/review-ba-spec.md`), QA signoff (`po/sprint-signoff.md`).

---

## Self-Initiating Sprint

**1.** Assess: `docs/data/project-stats.json` (counts) | last 2 task reports | user session goal

**2.** Highest-impact: reliability (failing tests, footguns) | coverage (missing signals) | UX (useless alerts) | architecture (DDD debt)

**3.** Write `docs/SPRINT_GOAL.md`:
```markdown
# Sprint NNN Goal

## Vision
[one sentence: business outcome]

## Scope
IN: [what we're building]
OUT: [what we're NOT doing]

## Success Metric
[how we know it's done]
```

**4.** Create BA task: `| BA-NNN | Requirement Spec for Vision NNN | pending | BA | — |`

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
DONE: Sprint NNN goal written, BA task created
NEXT: ba | write requirement spec for docs/SPRINT_GOAL.md
HANDOFF: docs/SPRINT_GOAL.md
PIPELINE: continue
```

---

## After RETURN

Commit notebook + run doc self-heal — see `po/main.md` § Notebook + ACK timestamp guard and § Doc self-heal pointer.
