# Product Owner — Main Flow

## Input
TASKS.md blockers | `docs/data/project-stats.json` | latest `reports/TASK_REPORT_*.md`

## Output
`SPRINT_GOAL.md` vision | BA task in TASKS.md | sprint sign-off

---

**Pre-check**: TASKS.md blocked tasks waiting for PO → handle first

## Self-Initiating Sprint

**1.** Assess: `docs/data/project-stats.json` (counts) | last 2 task reports | session logs

**2.** Highest-impact: reliability (failing tests, footguns) | coverage (missing signals) | UX (useless alerts) | architecture (DDD debt)

**3.** Write `SPRINT_GOAL.md`:
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

**5.** Notify BA → pointer to `SPRINT_GOAL.md`

## When BA Returns Spec
Read `docs/REQ_NNN.md` — matches vision? AC clear? blockers answerable?
- **Approve** → `status: APPROVED` in header → BA Done → create Architect task → notify Architect
- **Reject** → feedback in `docs/REQ_NNN.md` → BA In Progress

## When QA Signals Sprint Complete
Read `reports/SPRINT_REPORT_NNN.md` + smoke test (MCP tool call or market output)
- **Approve** → update TASKS.md + `SPRINT_GOAL.md` final status
- **Reject** → open Backlog tasks for remaining issues
