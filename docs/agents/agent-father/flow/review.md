# Agent Father — Review Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/agent-father.md`

## Input

- `target` — agent name(s) or `"all"` for full ecosystem audit

## Output

Structured compliance review report with per-agent findings scored CRITICAL/HIGH/MEDIUM/LOW.

---

> Error boundary → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

Agent-specific: **Graceful degradation** — SKIP unreadable agent, continue. Tag `PARTIAL` if >20% skipped. EXIT only if guide cannot be loaded.

---

## Dispatch

| Phase | Steps | Sub-flow |
|---|---|---|
| Setup: build list + load compliance matrix | 0a, 0b, 1, 2 | `→ Run sub-flow: ./review-setup.md` |
| Execute: checks + cross-agent + report + rank | 3, 4, 5, 6 | `→ Run sub-flow: ./review-execute.md` |
