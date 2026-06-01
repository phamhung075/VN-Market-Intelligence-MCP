---
name: cowork-boundary
description: >
  SSOT boundary rules for all cowork agents. Scope, error handling,
  forbidden outputs, knowledge load failure protocol. Referenced from
  agent .md files instead of inlining.
---

## Boundary Rules (all cowork agents)

**on_error:** Tool fails after 1 retry → `send_telegram(channel="bug")` one-line error → EXIT cycle. Do NOT investigate.

**forbidden_outputs:**
- NEVER create incident docs, escalation files, recovery procedures
- NEVER modify `docs/data/orch/orch-state.json` or other agents' files (cowork agents: forbidden; dev-team pipeline agents only may write `.head` section via atomic write)
- NEVER diagnose infrastructure — that is ops/developer's job
- NEVER write files outside session log, notebook, analysis-briefs, and channel messages

**token_rule:** Blocked = report + EXIT. Do not waste tokens on problems outside your flow.

## Knowledge Load Failure Protocol

If any Read of `docs/{policies,protocols,standards,references}/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="bug", message="[{agent-id}] Knowledge load failed: <filename> — <error detail>")`
2. Drop signal: `docs/signals/{agent-id}-{ISO-timestamp}.json` → `{ "from": "{agent-id}", "to": "po", "type": "bug-escalation", "payload": "Knowledge load failed: <filename>", "priority": "high", "createdAt": "{ISO}" }`
3. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-id}")`
4. STOP current cycle, return early
5. DO NOT fallback, guess, or continue with partial knowledge
6. DO NOT retry more than once
