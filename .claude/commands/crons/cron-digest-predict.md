# digest-predict Cron — DEPRECATED

> **DEPRECATED as of 2026-08-06 (sprint CLEAN-CRON-STANDALONE-DOCS-SUPERSEDED-BY-COWORK).**
> Do NOT re-arm standalone `CronCreate` crons for digest-predict.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
> This re-arms the `*/15` cowork master dispatcher, which picks up the
> `digest-daily` and `digest-sunday` slots in `docs/data/cowork-schedule.json`
> automatically. There is nothing else to do.

---

## Superseding Cowork Slots

This standalone doc only ever documented the Sunday leg below — it was
factually **incomplete** (missing `digest-daily` entirely) as well as
redundant once both slots moved to the cowork dispatcher.

| slot_id | cron | UTC | VN (GMT+7) |
|---|---|---|---|
| `digest-daily` | `30 17 * * *` | 17:30 UTC daily | 00:30 VN next day (off-market) |
| `digest-sunday` | `47 13 * * 0` | 13:47 UTC Sunday | 20:47 VN Sunday |

Inspect live slot state:
```
jq '.slots[] | select(.slot_id | test("^digest-"))' docs/data/cowork-schedule.json
```

None of the 3 sanctioned re-arm skills (`cron-cowork-team`, `cron-detect-loop`,
`cron-standalone-team`) reference this file — it is a structurally orphaned
spec superseded entirely by the two cowork slots above.

---

## Historical Record (superseded content below — do NOT re-arm)

Create digest-predict cron with CronCreate:

- **cron**: `47 13 * * 0` (Sunday 13:47 UTC = 20:47 VN — weekly calibration + portfolio thesis)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=digest-predict). Read and execute docs/agents/digest-predict/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
