# tran-ngoc-bau Cron — DEPRECATED

> **DEPRECATED as of 2026-08-06 (sprint CLEAN-CRON-STANDALONE-DOCS-SUPERSEDED-BY-COWORK).**
> Do NOT re-arm standalone `CronCreate` crons for tran-ngoc-bau.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
> This re-arms the `*/15` cowork master dispatcher, which picks up the
> `tnb-audit` slot in `docs/data/cowork-schedule.json` automatically.
> There is nothing else to do.

---

## Superseding Cowork Slot

| slot_id | cron | UTC | VN (GMT+7) |
|---|---|---|---|
| `tnb-audit` | `13 20 * * *` | 20:13 UTC daily | 03:13 VN next day |

Inspect live slot state:
```
jq '.slots[] | select(.slot_id=="tnb-audit")' docs/data/cowork-schedule.json
```

None of the 3 sanctioned re-arm skills (`cron-cowork-team`, `cron-detect-loop`,
`cron-standalone-team`) reference this file — it is a structurally orphaned
spec superseded entirely by the cowork slot above.

---

## Historical Record (superseded content below — do NOT re-arm)

Create tran-ngoc-bau cron with CronCreate:

- **cron**: `13 20 * * *` (daily 20:13 UTC = 03:13 VN next day — moved from `17 */4 * * *` by Sprint 1950-T4 HOTFIX)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=tran-ngoc-bau). Read and execute docs/agents/tran-ngoc-bau/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Manage
`CronList` | `CronDelete <id>`
