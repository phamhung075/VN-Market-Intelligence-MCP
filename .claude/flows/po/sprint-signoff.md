# PO — Sprint Signoff

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                        # why: final task status check
- docs/SPRINT_GOAL.md                  # why: success metric to evaluate against
- reports/SPRINT_REPORT_NNN.md         # why: QA report to review (conditional: path NNN from spawn context)

## Step 1: Review QA sprint report

Read `reports/SPRINT_REPORT_NNN.md` + smoke test (MCP tool call or market output)
- **Approve** → update docs/TASKS.md + `docs/SPRINT_GOAL.md` → proceed to Step 2
- **Reject** → open Backlog tasks → return `NEXT: ba | new spec for remaining issues`

## Step 2: Update task states

Mark all approved sprint tasks as Done in docs/TASKS.md with completion date.

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
DONE: Sprint NNN signoff complete
PIPELINE: complete
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/po/channel-audit.md     # when: signoff approved and PO wants to scan channels before idle (optional quality pass)
- → STOP                          # when: sprint approved and no immediate follow-on work detected
