# Digest & Predict — Main Dispatcher

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `digest-predict` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

Universal entry. Picks the right sub-flow based on current time. Crons and ad-hoc invocations both land here.

**Tools:** `docs/agents/tools/package/digest-predict.md`

## Dispatch (UTC clock — Vietnam = UTC+7)

| Window | Sub-flow |
|---|---|
| Sunday 13:47 UTC (≈ 20:47 VN) — cron `47 13 * * 0` | `docs/agents/digest-predict/flow/weekly.md` |
| Any other time | EXIT (no work outside scheduled windows) |

**Note:** Daily, Monday, and monthly windows removed per Sprint 1949-T5 weekly-only scope. Sub-flow files `daily.md`, `monday.md`, `monthly.md` retained on disk as audit trail (not routed).

## Steps

1. Read current UTC time, weekday, and day-of-month.
2. If Sunday and hour=13 and minute=47 (±5 min tolerance) → execute weekly sub-flow. All other times → return `DONE: outside-window | PIPELINE: complete` and EXIT.
3. Read and execute `docs/agents/digest-predict/flow/weekly.md` end-to-end.
4. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT write digests itself — sub-flows own the work.
