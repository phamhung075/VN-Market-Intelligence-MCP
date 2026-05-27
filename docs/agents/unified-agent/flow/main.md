# Unified Agent (Chef) — Main Dispatcher

Universal entry. Picks the right sub-flow based on current UTC time. Crons and ad-hoc invocations both land here.

**Tools:** `docs/agents/tools/package/unified-agent.md`

## Dispatch (UTC clock)

| Window | Dish type | Sub-flow |
|---|---|---|
| Mon–Fri 05:23 UTC | Morning Dish (guaranteed) | `docs/agents/unified-agent/flow/chef.md` |
| Mon–Fri 02:13 / 03:13 / 04:13 / 05:13 / 06:13 / 07:13 / 08:13 UTC | Intraday convergence scan (conditional) | `docs/agents/unified-agent/flow/chef.md` |
| Mon–Fri 08:37 UTC | EOD Dish (guaranteed) | `docs/agents/unified-agent/flow/chef.md` |
| Daily 19:37 UTC | Evening Preview (guaranteed) | `docs/agents/unified-agent/flow/chef.md` |
| Mon–Fri 01:00 UTC | Prediction review | `docs/agents/unified-agent/flow/prediction.md` |
| Any other time | EXIT | — |

**Dish type** is passed as `$DISH_TYPE` env to `chef.md`. Values: `morning` | `intraday` | `eod` | `evening`.

## Steps

1. Read current UTC time + weekday.
2. Match the window above; if none → return `DONE: outside-window | PIPELINE: complete` and EXIT.
3. Set `$DISH_TYPE` based on matched window.
4. Read and execute the matched sub-flow end-to-end.
5. Return that sub-flow's RETURN block verbatim.

This dispatcher MUST NOT do synthesis work itself — `chef.md` owns all 8 recipe steps.
