# PO — Sprint Signoff (QA Sprint-Complete Signal)

**Entry from:** `po/main.md` § Dispatch when QA signals sprint complete (caller passes `sprint_report=reports/SPRINT_REPORT_NNN.md`).

**Not for:** triage (stay in main.md), kickoff (`po/sprint-kickoff.md`), BA spec review (`po/review-ba-spec.md`).

---

## When QA Signals Sprint Complete

**Pre-approve container rebuild check (microservice tasks only):**
If the sprint touched any `apps/<service>/` zone, verify the close-gate was completed before signing off:
→ `docs/protocols/docker-deployment-runbook.md` § Microservice Code-Change Close Gate
The gate is: ops rebuilt the container (`docker compose up -d --build <svc>`) + qa confirmed build timestamp > commit timestamp + /health + tool count. If not done, dispatch ops → qa before approving.

Read `reports/SPRINT_REPORT_NNN.md` + run a smoke test (MCP tool call or recent market output) to validate the merged work behaves end-to-end.

- **Approve** → update `docs/data/orch/orch-state.json` `.task_board` tasks to DONE + `.sprint_goal.entries[].status = "done"` (atomic write per §2.3) → release umbrella lock → return:

  **Release umbrella lock** → load skill: `.claude/skills/task-lock/SKILL.md`
  ```
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + sprint_id })
  // ok=false is acceptable (TTL already expired across long sprint)
  ```
  ```
  ## RETURN
  DONE: Sprint NNN signed off
  NEXT: (none)
  PIPELINE: complete
  ```

- **Reject** → open Backlog tasks for remaining issues in `docs/data/orch/orch-state.json` `.task_board.backlog[]` → release umbrella lock → return:

  **Release umbrella lock** → load skill: `.claude/skills/task-lock/SKILL.md`
  ```
  call_tool(server="vn-market", tool="task_release", arguments={ task_id: "task:" + sprint_id })
  // ok=false is acceptable (TTL already expired across long sprint)
  ```
  ```
  ## RETURN
  DONE: Sprint NNN partial — backlog tasks created in orch-state.json .task_board.backlog[]
  NEXT: ba | new spec for remaining issues
  HANDOFF: docs/data/orch/orch-state.json
  PIPELINE: continue
  ```

---

## After RETURN

Commit notebook + run doc self-heal — see `po/main.md` § Notebook + ACK timestamp guard and § Doc self-heal pointer.
