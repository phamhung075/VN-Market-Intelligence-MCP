# Digest & Predict — Main Dispatcher

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `.claude/tools/package/digest-predict.md`

## Dispatch (UTC clock — Vietnam = UTC+7)

| Window | Sub-flow |
|---|---|
| Daily 15:30 UTC (≈ 22:30 VN) | `.claude/flows/digest-predict/daily.md` |
| Monday 00:30 UTC (≈ 07:30 VN Mon) | `.claude/flows/digest-predict/monday.md` |
| Sunday 13:00 UTC | `.claude/flows/digest-predict/weekly.md` |
| 1st of month 13:00 UTC | `.claude/flows/digest-predict/monthly.md` |
| Any other time | EXIT (no work outside scheduled windows) |

**Precedence** when multiple match same instant: monthly > weekly > monday > daily.

## Steps

1. Read current UTC time, weekday, and day-of-month.
2. Apply precedence; if no window matches → return `DONE: outside-window | PIPELINE: complete` and EXIT.
3. Read and execute the matched sub-flow end-to-end.
4. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT write digests itself — sub-flows own the work.
