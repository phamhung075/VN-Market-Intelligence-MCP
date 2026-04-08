# Fail-Loud Lazy-Load Protocol

**When to read this file:** When you are an analysis agent (cowork team) and need the full knowledge-load failure procedure. Also read by any agent that embeds the KNOWLEDGE LOAD FAILURE PROTOCOL block in its own file.

---

## Rule

When an agent needs knowledge, Read the relevant `.claude/knowledge/<file>.md`. If Read fails (ENOENT, empty, <50 chars, permission denied), follow this protocol immediately — do NOT proceed with partial knowledge.

## The 5 Steps

```
1. IMMEDIATELY send_telegram(channel="work", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")
2. submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```

User must manually fix the config before the next cycle.

## Why these rules exist

- Agents operating on stale or missing knowledge produce hallucinated analyses, wrong sector classifications, and misfired alerts.
- Fail-loud ensures the Dev Team is notified immediately via the BUG channel and can fix the root cause before damage accumulates.
- Silent fallback is worse than no output — a missing file is a deployment/config problem, not a transient network error.

## Application

Every analysis agent (`01` through `06`, `unified-agent`, `dev-team-cron`) embeds a shortened version of this protocol under its `## KNOWLEDGE LOAD FAILURE PROTOCOL` header. That section should read:

```markdown
## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```

The inline block in each agent file is intentional (agents must be self-contained; they cannot lazy-load the failure protocol itself).
