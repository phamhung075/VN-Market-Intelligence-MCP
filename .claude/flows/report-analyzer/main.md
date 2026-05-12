# Report Analyzer — Main Dispatcher

Universal entry. Report Analyzer is event-driven (earnings release) with a single sub-flow today (`cycle.md`); this dispatcher keeps the entry uniform with the rest of the team.

## Dispatch

Always → `.claude/flows/report-analyzer/cycle.md`

## Steps

1. Read and execute `.claude/flows/report-analyzer/cycle.md` end-to-end.
2. Return that sub-flow's RETURN block verbatim.
