# Ops — Data Validation Flow (Thin Dispatcher)

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Ticker list + service list from PO (via main terminal handoff)
Format: `tickers=[...] services=[price|news|foreign-flow|bctc|sbv]`

## Output
Structured validation report → returned to main terminal → PO task creation

---

## Dispatch

| Phase | Steps | Sub-flow |
|---|---|---|
| VPS dry-run + health + freshness + classify | 1, 2, 3, 4 | `→ Run sub-flow: ./data-validation-checks.md` |
| Bug report + return + PO handoff | 5, 6 | `→ Run sub-flow: ./data-validation-report.md` |
