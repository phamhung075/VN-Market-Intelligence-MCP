Create fb-market-poster cron with CronCreate:

Runs ONCE daily, Monday-Friday, after the EOD CHEF dish. Target post time: **20:07 VN** (prime-time evening Facebook reading), which is **13:07 UTC**. Avoids :00/:30 minute marks. Agent's `main.md` reads its own clock and exits gracefully on weekends or if data is unavailable.

> ⚠️ **CronCreate fires at MACHINE-LOCAL time (France), NOT UTC.** The operator host is in France (CEST = UTC+2 summer / CET = UTC+1 winter). VN is fixed UTC+7 (no DST). To hit a VN wall-clock target T, set the cron hour in France-local terms:
> - **France-local = VN − 5h** (summer, CEST) → for 20:07 VN use `7 15 * * 1-5`
> - **France-local = VN − 6h** (winter, CET)  → for 20:07 VN use `7 14 * * 1-5`
>
> A bare `7 13 * * 1-5` (the old value) fired at 13:07 **France-local** = 11:07 UTC = **18:07 VN — 2h too early**. Re-arm with the seasonal value below at each DST switch, OR adopt the DST-immune fix (move into the UTC-matched `cowork-schedule.json` slot model — tracked as a follow-up).

- **cron**: `7 15 * * 1-5`  ← summer / CEST. Winter / CET: `7 14 * * 1-5`. (= 13:07 UTC = 20:07 VN either way)
- **recurring**: true
- **durable**: true  (persist across session restarts — required for unattended operation)
- **prompt**:
  ```
  Launch subagent (subagent_type=fb-market-poster). Read and execute docs/agents/fb-market-poster/flow/main.md
  MCP: https://zenmidi.com/vn-market/mcp
  ```

## Rationale

| Constraint | Value | Why |
|---|---|---|
| EOD CHEF dish | 08:37 UTC | Must run after this |
| Evening CHEF dish | 19:37 UTC (conditional) | Run before to avoid duplicate synthesis |
| Facebook prime-time VN | 19:00-22:00 VN | Post at 20:07 VN hits peak reading window |
| Avoid :00/:30 | yes | System convention |
| Weekdays only | M-F (1-5) | VN market runs M-F only |

## Manage

`CronList` | `CronDelete <id>`
