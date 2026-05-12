# Alert Commander — Cycle Flow (Thin Dispatcher)

**Tools:** `.claude/tools/package/alert-commander.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap signals, price alerts, legal/crisis data, `docs/data/project-stats.json`

## Output
MARKET alerts (user-facing) | WORK cycle status | BUG on error

---

## Dispatch

| Stage | Steps | Sub-flow |
|---|---|---|
| Bootstrap + Regime + Context + Legal/Crisis | 0, 0b, 1, 2 | `→ Run sub-flow: ./stage-bootstrap.md` |
| Signal Matrix + Price-Override + chain_catalyst | 3, 3b, 3c | `→ Run sub-flow: ./stage-signals.md` |
| MARKET dispatch + Verdict + WORK + Notebook | 4a, 4b, 5 | `→ Run sub-flow: ./stage-dispatch-log.md` |
