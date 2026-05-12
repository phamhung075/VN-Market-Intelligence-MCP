# Unified Agent — Main Dispatcher

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `.claude/tools/package/unified-agent.md`

## Dispatch (UTC clock)

| Window | Sub-flow |
|---|---|
| Mon–Fri 01:00 UTC | `.claude/flows/unified-agent/prediction.md` |
| Mon–Fri 02:00 / 03:30 / 04:30 / 06:00 / 07:30 / 08:30 UTC | `.claude/flows/unified-agent/market.md` |
| Mon–Fri 20:00 UTC | `.claude/flows/unified-agent/daily-review.md` |
| Sun 13:00 UTC | `.claude/flows/unified-agent/weekly.md` |
| Any other time | EXIT (no work outside scheduled windows) |

## Steps

1. Read current UTC time + weekday.
2. Match the window above; if none → return `DONE: outside-window | PIPELINE: complete` and EXIT.
3. Read and execute the matched sub-flow end-to-end.
4. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT do coordination work itself — sub-flows own the logic.
