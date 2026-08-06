# unified-agent Cron — DEPRECATED

> **DEPRECATED as of 2026-08-06 (sprint CLEAN-CRON-STANDALONE-DOCS-SUPERSEDED-BY-COWORK).**
> Do NOT re-arm standalone `CronCreate` crons for unified-agent.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
> This re-arms the `*/15` cowork master dispatcher, which picks up the
> `chef-*` slots in `docs/data/cowork-schedule.json` automatically.
> There is nothing else to do.

---

## P0-DELETE-ON-SIGHT — this cron is dead by construction, not merely redundant

The `29 * * * *` (every hour at :29) expression below was NEVER live logic —
it cannot ever fire the dispatcher's own dish windows. `docs/agents/unified-agent/flow/main.md`
(§ Dispatch, lines 11-14) matches only:
- Mon-Fri `05:23` UTC (morning)
- Mon-Fri `02:13`/`03:13`/`04:13`/`05:13`/`06:13`/`07:13`/`08:13` UTC (intraday)
- Mon-Fri `08:37` UTC (EOD)
- Daily `19:37` UTC (evening)

Minute `:29` matches NONE of these windows — `main.md` line 15 explicitly falls
through to "Any other time → EXIT". If this cron were ever armed again, it
would spawn 24 real subagent sessions per day for provably zero possible
output. **Flag as P0-DELETE-ON-SIGHT if ever found armed again in a future
`CronList` audit.**

---

## Superseding Cowork Slots

| slot_id | cron | UTC | VN (GMT+7) |
|---|---|---|---|
| `chef-morning` | `15 5 * * 1-5` | 05:15 UTC Mon-Fri | 12:15 VN Mon-Fri |
| `chef-intraday` | `13 2-8 * * 1-5` | XX:13 UTC 02:00-08:59 Mon-Fri | XX:13 VN 09:13-15:59 Mon-Fri |
| `chef-eod` | `45 8 * * 1-5` | 08:45 UTC Mon-Fri | 15:45 VN Mon-Fri |
| `chef-evening` | `45 19 * * *` | 19:45 UTC daily | 02:45 VN next day |

Inspect live slot state:
```
jq '.slots[] | select(.slot_id | test("^chef-"))' docs/data/cowork-schedule.json
```

None of the 3 sanctioned re-arm skills (`cron-cowork-team`, `cron-detect-loop`,
`cron-standalone-team`) reference this file — it is a structurally orphaned
spec superseded entirely by the four `chef-*` cowork slots above.

---

## Historical Record (superseded content below — do NOT re-arm)

Create unified-agent cron with CronCreate:

Time-window dispatch lives in `docs/agents/unified-agent/flow/main.md` (market / daily-review / weekly). The cron prompt is uniform; `main.md` picks the right sub-flow or EXITs.

- **cron**: `29 * * * *` (every hour at :29)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=unified-agent). Read and execute docs/agents/unified-agent/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
