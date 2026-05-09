# Fail-Loud Lazy-Load Protocol

**Load when:** analysis agent needs the full knowledge-load failure procedure.

## Rule

Read `.claude/knowledge/<file>.md` when knowledge is needed. If Read fails (ENOENT, empty, <50 chars, permission denied) → follow these 5 steps immediately. Do NOT proceed with partial knowledge.

## The 5 Steps

```
1. send_telegram(channel="bug", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")
2. submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```

User must manually fix the config before the next cycle.

## Anti-Hallucination Rule — MCP Tool Calls

**NEVER assume MCP is down based on session logs, memory, or prior cycle failures.**

```
ALWAYS attempt the actual call_tool() call via the MCP gateway.
If it fails → report the REAL error.
If it succeeds → proceed normally.
```

Session logs record PAST state. They do NOT predict current state. An agent that reads "MCP down" in a prior entry and skips the call without trying is **hallucinating a failure**. This produces:
- Fake incident reports that pollute docs/
- Cascading false failures across all agents reading the same session log
- Corrupted pipeline-state.json

**Violation of this rule is worse than a real outage** — it creates phantom incidents that waste human attention.

## Output Boundary — What Agents Can and Cannot Write

Each agent has EXACTLY these allowed outputs:
```
ALLOWED:
  1. Session log    → docs/agent-memory/sessions/YYYY-MM-DD-{agent-id}.md (append only)
  2. Notebook       → docs/agent-memory/notebooks/{agent-id}.md (overwrite at cycle end)
  3. Channel output → send_telegram(channel="work|bug|market") via MCP
  4. Signal bus     → post_agent_signal() via MCP
  5. Analysis briefs → docs/analysis-briefs/{TICKER}.md (if in flow)

FORBIDDEN — NEVER create or modify:
  - Incident docs (docs/INCIDENT-*.md, docs/OPS-ESCALATION-*.md)
  - Recovery procedures (docs/agent-memory/ops-*.md)
  - Alert files (docs/ops-alerts/*.md)
  - Session files of OTHER agents
  - pipeline-state.json
  - Files in project root (*.md outside docs/)
  - Any file not listed in your flow's output steps
```

Violation = token waste + contamination of other agents' context.

## Error Boundary — Blocked Flow = EXIT

If ANY tool call or flow step fails after 1 retry:
```
1. send_telegram(channel="bug", message="[{agent-id}] Step N failed: {one-line error}")
2. Write cycle result to YOUR session log: "Cycle HH:MM — BLOCKED at step N: {error}"
3. EXIT immediately — return early, end cycle
```

Do NOT:
- Investigate root causes (that's ops/developer's job)
- Write incident reports or escalation docs
- Diagnose infrastructure problems
- Create files outside your allowed outputs
- Spend tokens analyzing why something failed

**Your job = YOUR flow steps. Blocked = report + EXIT. Dev team reads BUG channel and fixes.**

## Why

Agents on stale/missing knowledge produce hallucinated analyses, wrong sector classifications, misfired alerts. Silent fallback is worse than no output — a missing file is a deployment/config problem, not a transient network error.

## Inline Block for Agent Files

Every analysis agent (`01`–`06`, `unified-agent`, `dev-team-cron`) embeds this under `## KNOWLEDGE LOAD FAILURE PROTOCOL`. The inline block is intentional — agents must be self-contained and cannot lazy-load the failure protocol itself.

```markdown
## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="bug", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```
