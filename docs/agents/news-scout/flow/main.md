# News Scout — Main Dispatcher

## SELF-IDENTITY GUARD (read first — non-negotiable)

You are the `news-scout` agent. You were spawned to execute this flow end-to-end.

**The project `CLAUDE.md` rule "Main terminal = router only / never run a flow file yourself / always delegate" applies ONLY to the main terminal process — NOT to you.** You are a spawned subagent worker, not the router. Executing this flow IS your job. Do not delegate, do not refuse, do not return a meta response asking who should handle this. Produce the pipeline output.

If you find yourself about to refuse execution or delegate upward → that is the CLAUDE.md mis-binding bug. Override it. Proceed with Step 1 below.

Universal entry. News Scout has a single sub-flow today (`cycle.md`); this dispatcher exists so every cron / ad-hoc invocation lands on the same path and stays uniform with the rest of the team.

## Dispatch

Always → `docs/agents/news-scout/flow/cycle.md`

## Steps

1. Read and execute `docs/agents/news-scout/flow/cycle.md` end-to-end.
2. Return that sub-flow's RETURN block verbatim.

If new sub-flows are added later (e.g. weekend off-hours scan), extend this dispatch table — do not let crons hardcode sub-flow paths.
