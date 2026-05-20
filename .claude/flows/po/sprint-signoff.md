# PO — Sprint Signoff (QA Sprint-Complete Signal)

**Entry from:** `po/main.md` § Dispatch when QA signals sprint complete (caller passes `sprint_report=reports/SPRINT_REPORT_NNN.md`).

**Not for:** triage (stay in main.md), kickoff (`po/sprint-kickoff.md`), BA spec review (`po/review-ba-spec.md`).

---

## When QA Signals Sprint Complete

Read `reports/SPRINT_REPORT_NNN.md` + run a smoke test (MCP tool call or recent market output) to validate the merged work behaves end-to-end.

- **Approve** → update `docs/TASKS.md` + `docs/SPRINT_GOAL.md` (mark sprint Done) → release umbrella lock → return:

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

- **Reject** → open Backlog tasks for remaining issues → return:
  ```
  ## RETURN
  DONE: Sprint NNN partial — backlog tasks created
  NEXT: ba | new spec for remaining issues
  HANDOFF: docs/TASKS.md (Backlog rows)
  PIPELINE: continue
  ```

---

## After RETURN

Commit notebook + run doc self-heal — see `po/main.md` § Notebook + ACK timestamp guard and § Doc self-heal pointer.
