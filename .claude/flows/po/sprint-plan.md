# PO — Sprint Plan

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                    # why: existing tasks + sprint numbering
- docs/data/project-stats.json     # why: system counts + capacity metrics
- docs/SPRINT_GOAL.md              # why: current sprint vision (conditional: only if file exists)

## Step 1: Self-Initiating Sprint

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

**5.** Return:
```
## RETURN
DONE: Sprint NNN goal written, BA task created
NEXT: ba | write requirement spec for docs/SPRINT_GOAL.md
HANDOFF: docs/SPRINT_GOAL.md
PIPELINE: continue
```

## Step 2: When BA Returns Spec

Read `docs/REQ_NNN.md` — matches vision? AC clear? blockers answerable?
- **Approve** → `status: APPROVED` → return `NEXT: architect | run brownfield analysis`
- **Reject** → feedback in `docs/REQ_NNN.md` → return `NEXT: ba | revise spec per feedback`

## Step 3: Commit notebook

> Timestamp invariant: always `date -u +"%Y-%m-%dT%H:%M:%SZ"` — never speculative.

```bash
git add docs/agent-memory/notebooks/po.md
git commit -m "chore(memory/po): notebook YYYY-MM-DD"
```
Convention: `docs/policies/commit-convention.md` § Notebook Commits

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`

## RETURN

```
DONE: Sprint NNN goal written, BA task created
NEXT: ba | write requirement spec for docs/SPRINT_GOAL.md
HANDOFF: docs/SPRINT_GOAL.md
PIPELINE: continue
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → STOP                          # when: BA task created and SPRINT_GOAL.md written — handoff to BA/architect; PO does not chain further
