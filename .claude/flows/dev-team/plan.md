# Dev Team — Plan

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                    # why: task numbering + current sprint state

## Step 1: Planning loop (sequential by nature — each needs previous output)

**FIX** → skip to execute flow

**SPRINT-S**:
1. Spawn `architect` → read return
2. Spawn `pm` → read return (contains task list + deps) → execute flow

**SPRINT-M/L**:
1. Spawn `ba` → read return
2. Spawn `architect` → read return
3. Spawn `pm` → read return → execute flow
   - L only: after last merge → spawn `architect` post-merge review

**UNBLOCK** → spawn `{route_to}` (use `dev-*` agent if zone-specific, else generic) → read return → `send_telegram(work, "Unblocked: [brief]")` → EXIT

**CLEAN** → spawn `qa` with branch list → qa runs:
```
for each branch:
  unmerged=$(git log main..<branch> --oneline | wc -l)
  if unmerged == 0: git branch -d <branch>
  if worktree: git worktree remove --force <path> && git branch -D <branch>
  if unmerged > 0: report to WORK — "Branch <name> has N unmerged commits — manual review needed"
git push origin --prune  # clean up remote refs
```
→ EXIT

## RETURN

```
DONE: Planning complete
TASK_LIST: [tier map from pm return]
PIPELINE: continue → execute
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/dev-team/execute.md     # when: pm has returned task list with dependency tiers ready
- → STOP                          # when: UNBLOCK or CLEAN batch — handoff complete, no execution needed
