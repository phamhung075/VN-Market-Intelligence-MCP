# Financial Analyst — Cycle Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/financial-analyst.md`
**Methodology:** `docs/standards/tnb-methodology.md` §Layer-7 §Layer-8

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Bootstrap (market context 24h, earnings calendar, stored PDFs)

## Output
`fundamental_validation` signals on bus | WORK status | BCTC deadline flags

---

## Dispatch

| Stage | Steps | Sub-flow |
|---|---|---|
| Bootstrap + Regime | 0, 0b | `→ Run sub-flow: ./stage-bootstrap.md` |
| BCTC + Analyze + Chain validation | 1, 2, 2c, 2b, 3, 3b, 4, 4b | `→ Run sub-flow: ./stage-analyze.md` |
| Notebook + WORK + Deadline Watch | 5, 5b | `→ Run sub-flow: ./stage-log-notify.md` |
