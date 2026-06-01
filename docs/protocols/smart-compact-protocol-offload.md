> Parent: [./smart-compact-protocol.md](./smart-compact-protocol.md)

# Smart Compact Protocol — Offload Strategy

Dev-team orchestration, context budgets, and state preservation across compaction.

## Dev-Team Orchestration: Compaction-Aware Behavior

### Flow State to Preserve at Each Step

When hooks fire during `docs/agents/dev-team/flow/main.md`, the **main terminal** MUST offload:

| Step | State to preserve | Where |
|---|---|---|
| Step 1 (PO Triage) | BATCH output: type, id, title, desc, size, files, baseline_pass | `log_agent_work` with tag `po-triage` |
| Step 2 (Planning) | architect decisions + pm task list + dep map | `append_session_record` with step label |
| Step 3 (Execution) | Current tier index, completed task IDs, failed task IDs | `log_agent_work` with tag `dev-loop-tier-N` |
| Step 4 (Scan) | Processed report IDs, leftover branches | `append_session_record` |

### Per-Agent Offload Targets

| Agent | State to offload on hook | Target |
|---|---|---|
| `po` | BATCH decisions, idle/active signal | `log_agent_work` → notebook |
| `architect` | Design decisions, ADRs, file targets | `append_session_record` → notebook |
| `pm` | Task list JSON, dep map, WIP count | `log_agent_work` → `orch-state.json .task_board` update → notebook |
| `developer` | Branch name, changed files, test status | `log_agent_work(branch, files_changed, tests_pass)` → notebook |
| `qa` | Test counts (pass/fail/skip), branch cleanup log | `log_agent_work` → notebook |
| `fixer` | Patch description, file + line targets | `log_agent_work` → notebook |

Notebook path per agent: `docs/agent-memory/notebooks/<agent-id>.md` — read at start, overwrite at end of each session.

---

## Parallel Spawn Safety

When multiple developers are running in the same tier (parallel Agent calls):

- **Do NOT initiate compaction** while parallel agents are in-flight
- Wait for all agents in the tier to return before offloading state
- If context hits 40% before tier finishes: offload what is already complete; do not abort in-flight agents
- If context hits 60%+: post `send_telegram(work, "Context critical — pausing after current tier")` then compact

---

## Resume Protocol After `/compact`

After `/compact` fires, the main terminal resumes by:

1. Read notebook: `docs/agent-memory/notebooks/main.md` (main terminal working memory)
2. Call `get_agent_work_log(tag="dev-loop-tier-N")` to find last completed tier
3. Re-read `docs/data/orch/orch-state.json .task_board` for current task states
4. Skip already-Done tasks — spawn only Pending/In-Progress tasks for the current tier
5. Continue from Step 3 at the correct tier index — do not restart from Step 1

---

## Proactive Compact Between Sprints

Auto-compact (50% threshold) is a reactive emergency trigger — it fires too late after large sprints.

**After Step 4 exits cleanly, before re-entering Step 1:**

```
if ctx > 25%:
  1. log_agent_work(tag="sprint-boundary", state=current_sprint_id)
  2. Write main terminal notebook: docs/agent-memory/notebooks/main.md
  3. send_telegram(work, "Sprint boundary — offloaded state, ctx at N%")
  4. Return
```

The agent does NOT need to explicitly trigger compact — `stop-context-advisor.sh` fires automatically on every response end and handles it:
- ctx >40% → osascript types `/compact` into main terminal iTerm2 tab (path check: `SESSION_FILE != */subagents/*`)
- ctx 30-40% → injects `decision: block` warning into next turn
- ctx <30% → hook exits silently — no compact needed

This keeps the main terminal fresh at the start of every sprint rather than accumulating context across multiple sprints until the 50% emergency fires mid-execution.
