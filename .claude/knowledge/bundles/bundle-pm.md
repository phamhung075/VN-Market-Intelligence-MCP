# Bundle: PM

One call, always-needed rules. PM's full protocol + handoff template are in pm.md itself — not duplicated here.

---

## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[pm] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="pm")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once

---

## Critical Rules

- **WIP limit**: max 2 tasks In Progress at any time — HARD LIMIT
- **TASKS.md ≤ 80 lines** always. Done sprints → `docs/archive/sprints-NNN-NNN.md` immediately after merge.
- **Recurring bug escalation**: if same file has ≥2 prior fix commits → DO NOT assign to Developer → block + call Architect

---

## Lazy-Load (read ONLY when task touches that area)

- MCP tool surface → `.claude/knowledge/mcp-tools.md`
- Agent roster (signal bus, cooperation) → `.claude/knowledge/agent-roster.md`
- Cron schedule → `.claude/knowledge/cron-jobs.md`
