# Fail-Loud Lazy-Load Protocol

**Load when:** analysis agent needs the full knowledge-load failure procedure.

## Rule

Read `.claude/knowledge/<file>.md` when knowledge is needed. If Read fails (ENOENT, empty, <50 chars, permission denied) → follow these 5 steps immediately. Do NOT proceed with partial knowledge.

## The 5 Steps

```
1. send_telegram(channel="work", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")
2. submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```

User must manually fix the config before the next cycle.

## Why

Agents on stale/missing knowledge produce hallucinated analyses, wrong sector classifications, misfired alerts. Silent fallback is worse than no output — a missing file is a deployment/config problem, not a transient network error.

## Inline Block for Agent Files

Every analysis agent (`01`–`06`, `unified-agent`, `dev-team-cron`) embeds this under `## KNOWLEDGE LOAD FAILURE PROTOCOL`. The inline block is intentional — agents must be self-contained and cannot lazy-load the failure protocol itself.

```markdown
## KNOWLEDGE LOAD FAILURE PROTOCOL

If any Read of `.claude/knowledge/*.md` fails (file missing, empty, <50 chars, or permission denied):
1. IMMEDIATELY `send_telegram(channel="work", message="[{agent-name}] Knowledge load failed: <filename> — <error detail>")`
2. `submit_feedback(severity="critical", title="Knowledge load failed: <filename>", agent="{agent-name}")`
3. STOP current cycle, return early
4. DO NOT fallback, guess, or continue with partial knowledge
5. DO NOT retry more than once
```
