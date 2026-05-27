# News Scout — Main Dispatcher

Universal entry. News Scout has a single sub-flow today (`cycle.md`); this dispatcher exists so every cron / ad-hoc invocation lands on the same path and stays uniform with the rest of the team.

## Dispatch

Always → `docs/agents/news-scout/flow/cycle.md`

## Steps

1. Read and execute `docs/agents/news-scout/flow/cycle.md` end-to-end.
2. Return that sub-flow's RETURN block verbatim.

If new sub-flows are added later (e.g. weekend off-hours scan), extend this dispatch table — do not let crons hardcode sub-flow paths.
