# Market Watcher — Main Dispatcher

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `.claude/tools/package/market-watcher.md`

## Dispatch (UTC clock)

| Window | Sub-flow | mode |
|---|---|---|
| Mon–Fri 02:00–08:30 UTC (market hours) | `.claude/flows/market-watcher/cycle.md` | `market` |
| Mon–Fri 01:00–02:00 UTC OR 08:31–15:55 UTC (prepost window, excl. market hours and EOD ±5 min) | `.claude/flows/market-watcher/cycle.md` | `prepost` |
| Mon–Fri 16:00 UTC (±5 min) | `.claude/flows/market-watcher/eod.md` | — |
| Any other time | EXIT (no work outside market + EOD window) | — |

## Steps

1. Read current UTC time.
2. Match the window above (evaluate market row first, then prepost, then EOD, then EXIT); if none → return `DONE: outside-window | PIPELINE: complete` and EXIT.
3. Run Step 0 smoke probe: `call_tool(server="vn-market", tool="get_system_status")`. On failure → `send_telegram(channel=bug, "[market-watcher] Step 0 smoke probe FAILED")` → EXIT.
4. Read and execute the matched sub-flow end-to-end, passing `mode` (e.g. `mode=prepost`) as a parameter so cycle.md can apply the correct threshold floor.
5. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT do market-watching work itself.
