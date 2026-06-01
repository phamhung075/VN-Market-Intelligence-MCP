# Bundle: PM

One call, always-needed rules. PM's full protocol + handoff template are in pm.md itself — not duplicated here.

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `docs/{policies,protocols,standards,references}/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[pm] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="pm")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Critical Rules

- **WIP limit**: max 2 tasks In Progress at any time — HARD LIMIT
- **`docs/data/orch/orch-state.json .task_board` task count ≤ 80** always. Done sprints → `.task_board.archive[]` immediately after merge via task-archive sub-flow.
- **Recurring bug escalation**: if same file has ≥2 prior fix commits → DO NOT assign to Developer → block + call Architect

---

## Lazy-Load (read ONLY when task touches that area)

- MCP tool surface → `docs/standards/mcp-tools.md`
- Agent roster (signal bus, cooperation) → `docs/references/agent-roster.md`
- Cron schedule → `docs/standards/cron-jobs.md`
