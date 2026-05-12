# Dev Team — Triage

## docs_required
> Read ALL of the following in a single parallel tool call before Step 1.

- docs/TASKS.md                    # why: current task state + open blockers
- docs/pipeline-state.json         # why: in-progress pipeline check (conditional: if drain output shows in_progress)

## Step 1: PO Triage

Launch `po`. Triage inputs:
- `pendingSignals[]` from drain (if any — pass as context in spawn prompt)
- `read_telegram_reports(status="new")`
- Unresolved reports: `listUnresolvedReports()` → `WHERE resolution NOT IN ('fixed','wontfix','duplicate') AND status='processed'`
- docs/TASKS.md
- `git log --oneline -30`
- `git branch` — list all branches; flag any non-main branch as a **CLEAN** task if it has 0 unmerged commits (`git log main..<branch> --oneline` returns empty) or is a stale worktree branch

Return EXACTLY ONE of:

`NOTHING` → `send_telegram(work, "Dev loop idle.")` → EXIT

`BATCH([{type, id, title, desc, size?, files, baseline_pass, zone?}])`
- `zone`: optional service name (e.g. `"stock-price"`, `"alert-engine"`) — drives agent routing in execution
- **FIX**: ≤10 lines ≤3 files no new types — skip planning
- **SPRINT-S**: ≤30 lines ≤5 files 1 domain
- **SPRINT-M**: multi-domain or 1 new interface
- **SPRINT-L**: arch change or new service
- **UNBLOCK**: blocker + `route_to` agent
- **CLEAN**: stale branch list to delete + worktrees to remove → route to `qa`
- Priority: recurring bugs → UNBLOCK → FIX → CLEAN → S → M/L

## RETURN

```
DONE: Triage complete — batch type determined
BATCH: {type, tasks[]}
PIPELINE: continue → plan | execute | scan
```

---

## next_flows (compose)
> After this flow, you MAY read AND follow any of the below. Multiple allowed.
- → flows/dev-team/plan.md        # when: batch type is SPRINT-S, SPRINT-M, or SPRINT-L
- → flows/dev-team/execute.md     # when: batch type is FIX (skip planning) or UNBLOCK or CLEAN
- → STOP                          # when: PO returns NOTHING (no actionable signals)
