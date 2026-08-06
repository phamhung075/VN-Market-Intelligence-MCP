---
# Fleet cron skill dispatcher for BCTC refine orchestration (BCTC-AGENTIC-REFINE Option-Y)
# Schedule: '0 9,14,20 * * *' UTC (09:00, 14:00, 20:00 — all outside OFF-HOSE 02:00-08:59 Mon-Fri)
# This skill is a one-liner; the orchestrator logic lives in the refine_bctc_md flow.
---

# refine-bctc Cron — DEPRECATED

> **DEPRECATED as of 2026-08-06 (sprint CLEAN-CRON-STANDALONE-DOCS-SUPERSEDED-BY-COWORK).**
> Do NOT re-arm this standalone `CronCreate`/skill-dispatcher cron for refine_bctc_md.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
> This re-arms the `*/15` cowork master dispatcher, which picks up the
> `refine-bctc-slot-1` through `refine-bctc-slot-4` slots in
> `docs/data/cowork-schedule.json` automatically. There is nothing else to do.

---

## Superseding Cowork Slots

| slot_id | cron | UTC | VN (GMT+7) |
|---|---|---|---|
| `refine-bctc-slot-1` | `0 9 * * *` | 09:00 UTC daily | 16:00 VN |
| `refine-bctc-slot-2` | `0 14 * * *` | 14:00 UTC daily | 21:00 VN |
| `refine-bctc-slot-3` | `0 11 * * *` | 11:00 UTC daily | 18:00 VN |
| `refine-bctc-slot-4` | `30 16 * * *` | 16:30 UTC daily | 23:30 VN |

Inspect live slot state:
```
jq '.slots[] | select(.slot_id | test("^refine-bctc-"))' docs/data/cowork-schedule.json
```

None of the 3 sanctioned re-arm skills (`cron-cowork-team`, `cron-detect-loop`,
`cron-standalone-team`) reference this file — it is a structurally orphaned
spec superseded entirely by the four cowork slots above.

---

## Historical Record (superseded content below — do NOT re-arm)

run docs/agents/refine_bctc_md/flow/main.md

## Manage
`CronList` | `CronDelete <id>`
