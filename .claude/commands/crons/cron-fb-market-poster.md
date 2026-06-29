# fb-market-poster Cron — DEPRECATED

> **DEPRECATED as of 2026-06-28 (sprint FB-COWORK-FOLD / TASK_1996-1999).**
> Do NOT re-arm standalone `CronCreate` crons for the fb-market-poster.
> Scheduling is now owned by the cowork team dispatcher.
>
> **Re-arm path:** `/cron-cowork-team`
> This re-arms the `*/15` cowork master dispatcher, which picks up the two
> `fb-poster` slots in `docs/data/cowork-schedule.json` automatically.
> There is nothing else to do.

---

## Current Schedule — Cowork Slots

The fb-market-poster fires through two slots defined in `docs/data/cowork-schedule.json`:

| slot_id | cron | UTC | VN (GMT+7) | days |
|---|---|---|---|---|
| `fb-daily` | `15 9 * * 1-5` | 09:15 UTC | 16:15 VN | Mon-Fri |
| `fb-weekend` | `13 13 * * 6,0` | 13:13 UTC | 20:13 VN | Sat-Sun |

Both slots fire `docs/agents/fb-market-poster/flow/main.md` via the cowork dispatcher.

Inspect live slot state:
```
jq '.slots[] | select(.slot_id | test("^fb-"))' docs/data/cowork-schedule.json
```

---

## Why DST Is No Longer A Concern

The old standalone `CronCreate` fired on the France-local machine clock, requiring
manual re-arm at each DST switch (France CEST/CET shifts ±1h; VN is fixed UTC+7).

The cowork matcher (`scripts/agents-flow/cowork-match-slots.js`) compares every
slot against `getUTCHours()` and `getUTCDay()` — pure UTC arithmetic, no
France-local clock involved. The slots fire at the correct VN wall-clock time
year-round with no seasonal re-arm burden.

---

## Why Weekend Minute Changed :07 → :13

The original cron targeted minute `:07` for the weekend post. The cowork master
dispatcher wakes on `*/15` boundaries only (`:00`, `:15`, `:30`, `:45`). A slot
set to minute `:07` would never match a `*/15` wake tick — it would be silently
missed every week.

`fb-weekend` is set to `:13` — the nearest valid 15-min boundary minute within
the VN prime-time window. Result: 20:13 VN vs the original 20:07 VN (6-minute
shift only).

---

## Preserved Rationale (implemented in the cowork slots)

| Constraint | Value | Implemented as |
|---|---|---|
| EOD CHEF dependency | 08:45 UTC (`chef-eod` slot) | `fb-daily` `depends_on: chef-eod 08:45 UTC + 30min` → fires 09:15 UTC |
| Facebook prime-time VN | 19:00-22:00 VN | `fb-daily` 16:15 VN (post-market); `fb-weekend` 20:13 VN |
| Avoid :00 / :30 minute marks | yes | :15 and :13 used |
| VN market Mon-Fri only | yes | `fb-daily` cron `1-5` |
| Weekend post for weekly context | Sat-Sun | `fb-weekend` cron `6,0` |

---

## Publish-Once Dedup Guard

A dedup lock is implemented in `fb-market-poster` flow STEP 0a:
`task_claim(key="fb-post:YYYY-MM-DD", ttl=86400)`.
Even if the dispatcher wakes and matches the slot twice, only the first successful
claim publishes; the second exits immediately — no double-post.

---

## Do NOT Use These Commands

`CronCreate` / `CronDelete` for fb-market-poster are retired.
The two standalone durable crons that previously existed are no longer re-armed.
Any residual entries can be removed via `CronDelete <id>` but must NOT be recreated.
