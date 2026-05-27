# Unified Agent — Market Cycle Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/unified-agent.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap (market context 24h, system status, agent signals)

## Output
Conviction shifts posted | issues filed | WORK heartbeat | `docs/analysis-briefs/` updated on event

---

## Dispatch

| Phase | Steps | Sub-flow |
|---|---|---|
| Bootstrap + Regime + System health | 0, 0b, 1 | `→ Run sub-flow: ./market-bootstrap.md` |
| Intelligence + Portfolio + Domain + Pillar check + WORK | 2, 3, 4, 4b, 5, 6 | `→ Run sub-flow: ./market-analysis.md` |
| Special events + Notebook commit | event triggers | `→ Run sub-flow: ./market-events-log.md` |
